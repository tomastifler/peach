import { expect, it, vi } from 'vitest';

import { UserscriptStatus, userscriptVersionSupported } from '../../src/react/settings/userscript-status';
import { useUserscriptProbe } from '../../src/react/settings/userscript-probe';
import { linkNamed, mount } from './render';

vi.mock('../../src/react/settings/userscript-probe', () => ({ useUserscriptProbe: vi.fn() }));
const release = { version: '0.8.0', minimum_version: '0.6.0', install_url: '/peach.user.js' };

async function render(version: string) {
  vi.mocked(useUserscriptProbe).mockReturnValue({
    frame: { current: null }, attempt: 0, status: { version, paired: true }, retry: vi.fn(),
  });
  return mount(<UserscriptStatus enabled release={release} />);
}

it('兼容但低于最新版的脚本提供更新链接和可更新状态', async () => {
  const host = await render('0.7.0');
  expect(host.textContent).toContain('可更新');
  expect(host.textContent).toContain('用户脚本 v0.8.0 可更新。');
  expect(host.textContent).not.toContain('需更新');
  expect(linkNamed('更新用户脚本', host)?.getAttribute('href')).toBe(release.install_url);
  expect(host.querySelector('[data-copy-key="userscript.available.message"]')).not.toBeNull();
});

it('低于最低兼容版本的脚本标明需更新和最低版本', async () => {
  const host = await render('0.5.0');
  expect(host.textContent).toContain('需更新');
  expect(host.textContent).toContain('请更新至 v0.6.0 或更高版本。');
  expect(linkNamed('更新用户脚本', host)).not.toBeNull();
});

it.each(['0.8.0', '0.9.0'])('版本 %s 满足当前发行版时保持连接状态', async (version) => {
  const host = await render(version);
  expect(host.textContent).toContain('已连接');
  expect(linkNamed('更新用户脚本', host)).toBeNull();
});

it('按版本分段比较兼容范围', () => {
  expect(userscriptVersionSupported('0.10.0', '0.9.0')).toBe(true);
  expect(userscriptVersionSupported('0.8.0', '0.8.1')).toBe(false);
});
