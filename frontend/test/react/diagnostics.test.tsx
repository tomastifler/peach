import { notifyManager, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { queryClient } from '../../src/react/query';
import { DiagnosticsPage } from '../../src/react/diagnostics/diagnostics-page';
import { DIAGNOSTICS_KEY, type DiagnosticReport } from '../../src/react/diagnostics/diagnostics';
import { buttonNamed, click, fetchMock, mount, settle } from './render';

notifyManager.setScheduler(notify => notify());
afterEach(() => queryClient.clear());
const data = (): DiagnosticReport => ({ version: 'test', status: 'warning', checks: {
  media_mounts: { label: '媒体挂载', status: 'warning', reason: '来源不存在', action: '检查媒体目录', target: '/settings/library', details: {} },
  security: { label: '访问安全', status: 'warning', reason: '密码未开启', action: '开启密码', target: '/settings/library', details: {} },
  data_root: { label: '数据目录', status: 'failed', reason: '没有权限', action: '调整权限', target: null, details: {} },
}, library: { issue_at: null, groups: {
  duration: { label: '缺时长', count: 2, status: 'ok', truncated: false, items: [
    { id: 1, code: 'ABC-123', title: '作品甲', name: '甲.mp4', path: 'R:\\Media\\甲.mp4', location: 'local', duration: null, size: 1024 },
    { id: 2, code: null, title: '作品乙', name: '乙.mp4', path: 'R:\\Media\\乙.mp4', location: 'local', duration: null, size: 2048 },
  ] },
  cover: { label: '缺封面', count: 0, status: 'ok', truncated: false, items: [] },
} }, sources: [{ source: 'javdb', label: 'javdb', status: 'unknown', reason: '当前解析状态未取得', last_success_at: null, cooldown_until: null }] });
async function open(report = data()) {
  queryClient.setQueryData(DIAGNOSTICS_KEY, report);
  const props = { navigate: vi.fn(), configure: vi.fn(), openItem: vi.fn(), receipt: vi.fn() };
  const host = await mount(<QueryClientProvider client={queryClient}><DiagnosticsPage {...props} /></QueryClientProvider>);
  return { host, props };
}
it('诊断跳到具体配置分栏，系统权限项只显示动作', async () => {
  const { host, props } = await open();
  await click(buttonNamed('Open Library & import', host));
  await click(buttonNamed('Open Network & access', host));
  expect(props.configure.mock.calls).toEqual([['Library & import'], ['Network & access']]);
  const root = [...host.querySelectorAll('h3')].find(node => node.textContent === '数据目录')!.parentElement!.parentElement!;
  expect(root.textContent).toContain('调整权限');
  expect(root.querySelector('button')).toBeNull();
  expect(host.textContent).toContain('当前解析状态未取得');
});
it('展开作品表格并复制可识别信息；零结果有独立空态', async () => {
  const clipboard = vi.fn<(text: string) => Promise<void>>(async () => {});
  vi.stubGlobal('navigator', { clipboard: { writeText: clipboard } });
  const { host, props } = await open();
  await click(host.querySelector('summary'));
  await click(buttonNamed('作品甲', host));
  expect(props.openItem).toHaveBeenCalledWith(1);
  await click(buttonNamed('Copy current list', host));
  await settle();
  expect(clipboard.mock.calls[0][0]).toContain('作品甲\tABC-123\t甲.mp4\tLocal\tR:\\Media\\甲.mp4');
  expect(clipboard.mock.calls[0][0]).toContain('作品乙\t\t乙.mp4\tLocal\tR:\\Media\\乙.mp4');
  expect(host.textContent).toContain('Unidentified');
  expect(props.receipt).toHaveBeenCalledWith('List copied');
  expect(host.querySelector('[data-empty-state]')?.textContent).toContain('List is empty');
});
it('请求失败保留原因和重试入口', async () => {
  vi.stubGlobal('fetch', fetchMock(403, { detail: '请在运行 Peach 的电脑上打开系统诊断' }));
  const props = { navigate: vi.fn(), configure: vi.fn(), openItem: vi.fn(), receipt: vi.fn() };
  const host = await mount(<QueryClientProvider client={queryClient}><DiagnosticsPage {...props} /></QueryClientProvider>);
  await settle();
  expect(host.textContent).toContain('Could not load diagnostics');
  expect(host.textContent).toContain('请在运行 Peach 的电脑上打开系统诊断');
  expect(buttonNamed('Check again', host)).not.toBeNull();
});
it('异常检查位于首区，其他检查可展开且没有重复条目', async () => {
  const report = data();
  report.checks.database = { label: '数据库', status: 'ok', reason: '可读取', action: '', target: null, details: {} };
  const { host } = await open(report);
  const priority = host.querySelector('section[aria-label="Needs attention · 3 items"]');
  expect(host.querySelector('section')).toBe(priority);
  expect([...priority!.querySelectorAll('h3')].map(node => node.textContent)).toEqual(['媒体挂载', '访问安全', '数据目录']);
  for (const check of Object.values(report.checks)) {
    expect([...host.querySelectorAll('h3,h4')].filter(node => node.textContent === check.label)).toHaveLength(1);
  }
  const summary = [...host.querySelectorAll('summary')].find(node => node.textContent === 'Other checks · 1 items');
  expect(summary?.getAttribute('aria-expanded')).toBe('false');
  await click(summary!);
  expect(summary?.getAttribute('aria-expanded')).toBe('true');
  expect(summary?.parentElement?.textContent).toContain('数据库');
});
it('恢复动作的名称与实际目标一致', async () => {
  const report = data();
  report.checks.security.target = '/settings/network';
  report.checks.ffmpeg = { label: '媒体工具', status: 'warning', reason: '缺少 FFmpeg', action: '安装工具', target: '/settings/maintenance', details: {} };
  report.checks.tasks = { label: '后台任务', status: 'warning', reason: '有任务失败', action: '查看原因', target: '/tasks', details: {} };
  const { host, props } = await open(report);
  await click(buttonNamed('Open Network & access', host));
  await click(buttonNamed('Open Maintenance & updates', host));
  await click(buttonNamed('View tasks', host));
  expect(props.navigate.mock.calls).toEqual([['/settings/network'], ['/settings/maintenance'], ['/tasks']]);
});

it('诊断报告下载成功生成文件；失败原因保留在入口旁', async () => {
  const create = vi.fn(() => 'blob:report');
  const revoke = vi.fn();
  vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke });
  const clickFile = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  const fetch = vi.fn().mockResolvedValue(new Response(new Blob(['zip']), { status: 200 }));
  vi.stubGlobal('fetch', fetch);
  const { host } = await open();
  await click(buttonNamed('Download diagnostics report', host));
  await settle();
  expect(fetch).toHaveBeenCalledWith('/api/diagnostics/bundle', { credentials: 'same-origin' });
  expect(create).toHaveBeenCalledTimes(1);
  expect(clickFile).toHaveBeenCalledTimes(1);
  expect(document.querySelector('a[download]')).toBeNull();
  fetch.mockResolvedValueOnce(new Response('', { status: 503 }));
  await click(buttonNamed('Download diagnostics report', host));
  await settle();
  expect(host.textContent).toContain('Diagnostics report download failed (HTTP 503)');
  expect(buttonNamed('Download diagnostics report', host)).not.toBeNull();
});
