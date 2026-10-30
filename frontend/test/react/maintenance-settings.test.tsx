import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import * as legacyUi from '@peach/legacy/ui';

import type { ConfigurationData, ReleaseState } from '../../src/react/bundle';
import {
  AutomaticUpdates, MaintenanceSettings, TutorialSettings, UninstallSettings,
} from '../../src/react/settings/maintenance-settings';
import { ReleaseUpdates } from '../../src/react/settings/release-updates';
import { actionOrder, buttonNamed, choose, click, fetchMock, mount, section, sentBody, settle, submit, switches } from './render';

const automatic = { mode: 'off', interval_hours: 24, available: true, download_available: true };
const release: ReleaseState = {
  current_version: '0.9.0', latest_version: null, channel: '测试版', installation: 'Standalone test build',
  state: 'unchecked', message: 'Not checked yet', release_url: 'https://github.com/peach-mitao/peach/releases',
};
const uninstall = { available: true, full_available: true, message: '', data_root: 'fixture', directories: ['fixture', 'fixture/cache'] };

it('分区依次是运行信息、Installation guide、卸载；缺依赖的那条运行信息带下载链接，系统诊断入口在运行信息底栏', async () => {
  const data: ConfigurationData = {
    editable: true, notice: '', revision: 'r', media_dirs: [], library_count: 0, port: 9123,
    automatic_updates: automatic, updates: release, uninstall,
    facts: [
      { term: 'Version', value: '0.7.25' },
      { term: 'FFmpeg', value: '未找到 FFmpeg', download_url: 'https://ffmpeg.org/download.html', download_label: '下载 FFmpeg' },
    ],
  };
  const host = await mount(<MaintenanceSettings data={data} receipt={vi.fn()} reopenTutorial={vi.fn()} />);
  expect([...host.firstElementChild!.children].map((node) => node.getAttribute('aria-label')))
    .toEqual(['Runtime info', 'Setup tutorial', 'Uninstall Peach']);
  const facts = section(host, 'Runtime info')!;
  expect([...facts.querySelectorAll('dt')].map((dt) => dt.textContent)).toEqual(['Version', 'FFmpeg']);
  const link = facts.querySelector('a[href="https://ffmpeg.org/download.html"]');
  expect(link?.getAttribute('target')).toBe('_blank');
  expect(link?.textContent).toBe('下载 FFmpeg');
});

describe('Auto-update', () => {
  it('两颗开关互相约束，服务端成功后才回执，关闭也能保存', async () => {
    const fetcher = fetchMock(200, automatic);
    vi.stubGlobal('fetch', fetcher);
    const receipt = vi.fn();
    const host = await mount(<AutomaticUpdates initial={automatic} receipt={receipt} />);
    expect(switches(host)[1]!.disabled).toBe(true);
    await click(switches(host)[0]);
    expect(switches(host)[1]!.disabled).toBe(false);
    await click(switches(host)[1]);
    await choose(host.querySelector('[aria-haspopup="listbox"]'), 'Weekly');
    await submit(host.querySelector('form'));
    await settle();
    expect(sentBody(fetcher)).toEqual({ mode: 'download', interval_hours: 168 });
    expect(receipt).toHaveBeenCalledWith('Settings saved');
    await click(switches(host)[0]);
    await submit(host.querySelector('form'));
    await settle();
    expect(sentBody(fetcher, 1)).toEqual({ mode: 'off', interval_hours: 168 });
    expect(receipt).toHaveBeenCalledTimes(2);
  });

  it('源码运行锁住自动下载，检查频率那一行不带说明，失败原因留在分区里且不报成功', async () => {
    vi.stubGlobal('fetch', fetchMock(400, { detail: '设置正在保存' }));
    const receipt = vi.fn();
    const host = await mount(<AutomaticUpdates initial={{ ...automatic, mode: 'check', download_available: false }} receipt={receipt} />);
    expect(switches(host)[1]!.disabled).toBe(true);
    const interval = [...host.querySelectorAll('p')].find((p) => p.textContent === 'Check frequency');
    expect(interval?.nextElementSibling).toBeNull();
    await submit(host.querySelector('form'));
    await settle();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('设置正在保存');
    expect(receipt).not.toHaveBeenCalled();
  });
});

describe('Check for updates', () => {
  it('标明应用更新包体积和工具补下载条件', async () => {
    const host = await mount(<ReleaseUpdates initial={{ ...release, state: 'available', latest_version: '1.0.0',
      package_kind: 'update', asset_size: 12 * 1048576 }} />);
    expect(host.textContent).toContain('App update package · 12.0 MB');
    expect(host.textContent).toContain('if a tool is missing, damaged or changed in version, the required tool package is downloaded separately');
    expect(host.textContent).not.toContain('首次安装');
    expect([...host.querySelectorAll('a')].some((a) => a.textContent === 'Full installer package')).toBe(false);
  });

  it('尚未检查的状态只显示一次，最新版本保持未取得', async () => {
    vi.stubGlobal('fetch', fetchMock(200, { state: 'idle', progress: 0 }));
    const host = await mount(<ReleaseUpdates initial={release} />);
    expect(host.textContent?.split('Not checked yet')).toHaveLength(2);
  });

  it('刷新后接着已准备好的更新，弹一次重启确认，确认前不发重启', async () => {
    vi.useFakeTimers();
    const modal = vi.spyOn(legacyUi, 'confirmModal');
    const fetcher = fetchMock(200, { state: 'restarting', progress: 0 });
    vi.stubGlobal('fetch', fetcher);
    const host = await mount(<ReleaseUpdates initial={release} initialJob={{ state: 'ready', progress: 100, version: '0.10.0' }} />);
    expect(host.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('100');
    expect(modal).toHaveBeenCalledTimes(1);
    expect(modal.mock.calls[0]?.[0]).toMatchObject({
      title: 'Update ready', body: 'Peach 0.10.0 will be installed after restart.', confirmLabel: 'Restart now', cancelLabel: 'Later',
    });
    expect(fetcher).not.toHaveBeenCalled();
    await act(async () => { await modal.mock.calls[0]?.[0].onConfirm?.(); });
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['/api/configuration/update-restart']);
  });

  it('显式查询更新，连点只发一次，失败后可重试且焦点留在原处', async () => {
    const host = await mount(<ReleaseUpdates initial={release} />);
    const updates = section(host, 'Check for updates')!;
    const check = buttonNamed('Check for updates', updates)!;
    expect(updates.textContent).toContain('Current version0.9.0');
    const fetcher = fetchMock(200, { ...release, latest_version: '0.10.0', state: 'available', message: '有新版本可下载。' });
    vi.stubGlobal('fetch', fetcher);
    check.focus();
    await act(async () => { check.click(); check.click(); });
    await settle();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/configuration/updates');
    expect(updates.textContent).toContain('Latest version0.10.0');
    expect(updates.querySelector('[role="status"]')?.textContent).toContain('Update available');
    expect(buttonNamed('Download and install', updates)).not.toBeNull();
    expect(actionOrder(check.parentElement)).toEqual(['Website', 'GitHub', 'View release page', 'Check for updates', 'Download and install']);
    expect([...updates.querySelectorAll('a')].map((link) => [link.textContent, link.getAttribute('href')]))
      .toEqual([
        ['Website', 'https://peach.video/#download'],
        ['GitHub', 'https://github.com/peach-mitao/peach'],
        ['View release page', 'https://github.com/peach-mitao/peach/releases'],
      ]);
    expect(updates.textContent).not.toContain('暂无法更新');
    expect(document.activeElement).toBe(check);
    vi.stubGlobal('fetch', fetchMock(503, { detail: 'Connection failed.' }));
    await click(check);
    await settle();
    expect(updates.querySelector('[role="alert"]')?.textContent).toBe('Connection failed.');
    expect(updates.textContent).not.toContain('0.10.0');
    expect(check.disabled).toBe(false);
  });

  it('已是最新就不再提示可用更新，也不给安装键', async () => {
    const current = await mount(<ReleaseUpdates initial={{ ...release, latest_version: '0.9.0', state: 'current', message: '已是最新测试版。' }} />);
    expect(current.textContent).not.toContain('Update available');
    expect(current.textContent).toContain('已是最新测试版。');
    expect(buttonNamed('Download and install', current)).toBeNull();
  });
});

it('卸载默认保留数据，勾选完全卸载后确认文案点名要删的东西，受理后锁住', async () => {
  const modal = vi.spyOn(legacyUi, 'confirmModal');
  const fetcher = fetchMock(200, { message: 'Peach 将在几秒后退出并卸载。' });
  vi.stubGlobal('fetch', fetcher);
  const host = await mount(<UninstallSettings uninstall={uninstall} receipt={vi.fn()} />);
  const area = host.querySelector('#uninstallPeach')!;
  expect(area.textContent).toContain('original media files are kept');
  const full = area.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  expect(full.checked).toBe(false);
  expect([...area.querySelectorAll('details p')].map((p) => p.textContent)).toEqual(['fixture', 'fixture/cache']);
  // 每条路径自己带一颗打开键：要删的是哪几个目录，看一眼比照着路径再翻一遍快。
  expect([...area.querySelectorAll('details button[aria-label="Show in file explorer"]')]).toHaveLength(2);
  await click(buttonNamed('Uninstall Peach', area));
  expect(modal.mock.calls[0]?.[0]).toMatchObject({ title: 'Uninstall Peach', danger: true, confirmLabel: 'Uninstall Peach' });
  expect(String(modal.mock.calls[0]?.[0].body)).toContain('Settings, local database, watch history and cache are kept');
  expect(fetcher).not.toHaveBeenCalled();
  await click(full);
  await click(buttonNamed('Uninstall Peach', area));
  const options = modal.mock.calls[1]![0];
  expect(String(options.body)).toContain('credentials and cache');
  await act(async () => { await options.onConfirm?.(); });
  expect(sentBody(fetcher)).toEqual({ delete_data: true, confirmation: '卸载 Peach' });
  expect(area.querySelector('[role="status"]')?.textContent).toBe('Peach 将在几秒后退出并卸载。');
  expect(buttonNamed('Uninstall Peach', area)?.disabled).toBe(true);
});

describe('Installation guide', () => {
  it('按下去调遗留层那一半，成功后发回执', async () => {
    const reopenTutorial = vi.fn(async () => {});
    const receipt = vi.fn();
    const host = await mount(<TutorialSettings receipt={receipt} reopenTutorial={reopenTutorial} />);
    await click(buttonNamed('Reopen tutorial', host));
    expect(reopenTutorial).toHaveBeenCalledTimes(1);
    expect(receipt).toHaveBeenCalledWith('Setup tutorial reopened');
  });

  it('写入失败时原因留在原位，不发回执', async () => {
    const receipt = vi.fn();
    const host = await mount(
      <TutorialSettings receipt={receipt} reopenTutorial={vi.fn(async () => { throw new Error('数据库写入失败') })} />,
    );
    await click(buttonNamed('Reopen tutorial', host));
    await settle();
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('数据库写入失败');
    expect(receipt).not.toHaveBeenCalled();
  });
});
