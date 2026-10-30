import { expect, it, vi } from 'vitest';
import { PortSettings } from '../../src/react/settings/port-settings';
import type { ConfigurationData } from '../../src/react/bundle';
import { click, fetchMock, mount, sentBody, settle, submit, type } from './render';
const data: ConfigurationData = { editable: true, notice: '', revision: 'rev-1',
  media_dirs: ['D:\\Media'], media_sources: [{ location: 'local', root: 'D:\\Media', path: 'D:\\Media' }],
  library_count: 1, port: 9123, facts: [] };
it('保存端口保留已保存的媒体目录与来源映射', async () => {
  const fetcher = fetchMock(200, { saved: true, revision: 'rev-2', url: 'http://127.0.0.1:9124/' });
  vi.stubGlobal('fetch', fetcher);
  const receipt = vi.fn();
  const host = await mount(<PortSettings data={data} receipt={receipt} />);
  await type(host.querySelector<HTMLInputElement>('#configPort'), '9124');
  await submit(host.querySelector('form'));
  await settle();
  expect(sentBody(fetcher)).toEqual({ revision: 'rev-1', media_dirs: data.media_dirs,
    media_sources: data.media_sources, port: '9124', scan_now: false });
  expect(receipt).toHaveBeenCalledWith('已保存配置');
  expect(host.querySelector('a')?.getAttribute('href')).toBe('http://127.0.0.1:9124/settings/network');
});

it('局域网地址和备用地址分别可复制，复制失败可以选中文本', async () => {
  const copy = vi.fn().mockRejectedValue(new Error('clipboard unavailable'));
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: copy } });
  const host = await mount(<PortSettings data={{ ...data, network: {
    editable: true, host: '0.0.0.0', mdns_name: 'peach', scope: 'lan',
    local_url: 'http://127.0.0.1:9123/', lan_url: 'http://peach.local:9123/', ip_url: 'http://192.0.2.10:9123/',
  } }} receipt={vi.fn()} />);
  const inputs = [...host.querySelectorAll<HTMLInputElement>('input[readonly]')];
  expect(inputs.map(input => input.value)).toEqual([
    'http://127.0.0.1:9123/', 'http://peach.local:9123/', 'http://192.0.2.10:9123/',
  ]);
  const copyButtons = [...host.querySelectorAll<HTMLButtonElement>('button')].filter(button => button.textContent === '复制地址');
  await click(copyButtons[1]); await settle();
  expect(copy).toHaveBeenCalledWith('http://peach.local:9123/');
  expect(host.textContent).toContain('复制失败，请选中地址复制。');
});

it('本机模式隐藏手机地址并保存访问范围', async () => {
  const fetcher = fetchMock(200, { saved: true, url: 'http://127.0.0.1:9123/' });
  vi.stubGlobal('fetch', fetcher);
  const host = await mount(<PortSettings data={{ ...data, network: {
    editable: true, host: '127.0.0.1', mdns_name: 'peach', scope: 'local',
    local_url: 'http://127.0.0.1:9123/', lan_url: '', ip_url: '',
  } }} receipt={vi.fn()} />);
  expect(host.textContent).toContain('当前只允许这台电脑访问');
  expect(host.querySelector('#configMdnsName')).toBeNull();
  await submit(host.querySelector('form')); await settle();
  expect(sentBody(fetcher).host).toBe('127.0.0.1');
  expect(sentBody(fetcher)).not.toHaveProperty('mdns_name');
});
it('端口校验失败保留输入，错误显示在字段旁', async () => {
  vi.stubGlobal('fetch', fetchMock(400, { errors: { port: '端口范围无效' } }));
  const receipt = vi.fn();
  const host = await mount(<PortSettings data={data} receipt={receipt} />);
  await type(host.querySelector<HTMLInputElement>('#configPort'), '1');
  await submit(host.querySelector('form')); await settle();
  expect(host.querySelector('#configPort')?.getAttribute('aria-invalid')).toBe('true');
  expect(host.textContent).toContain('端口范围无效');
  expect(host.querySelector<HTMLInputElement>('#configPort')?.value).toBe('1');
  expect(receipt).not.toHaveBeenCalled();
});

it('从本机切换到局域网可以设置名称，保存时提交完整网络配置', async () => {
  const fetcher = fetchMock(200, { saved: true, url: 'http://127.0.0.1:9123/' });
  vi.stubGlobal('fetch', fetcher);
  const host = await mount(<PortSettings data={{ ...data, network: {
    editable: true, host: '127.0.0.1', mdns_name: 'peach', scope: 'local',
    local_url: 'http://127.0.0.1:9123/', lan_url: '', ip_url: '',
  } }} receipt={vi.fn()} />);
  await click(host.querySelector('input[type="radio"][value="0.0.0.0"]'));
  await type(host.querySelector<HTMLInputElement>('#configMdnsName'), 'peach-phone');
  expect(host.textContent).toContain('http://');
  expect(host.textContent).toContain('.local');
  expect(host.textContent).toContain('保存并重启后显示手机连接地址');
  await submit(host.querySelector('form')); await settle();
  expect(sentBody(fetcher)).toMatchObject({ host: '0.0.0.0', mdns_name: 'peach-phone', port: '9123' });
});

it('服务管理的网络设置只显示地址', async () => {
  const host = await mount(<PortSettings data={{ ...data, network: {
    editable: false, host: '0.0.0.0', mdns_name: 'peach', scope: 'lan',
    local_url: 'https://peach.local/', lan_url: 'https://peach.local/', ip_url: '',
  } }} receipt={vi.fn()} />);
  expect(host.querySelector('form')).toBeNull();
  expect(host.querySelector('#configPort')).toBeNull();
  expect(host.textContent).toContain('访问范围、名称与端口由服务启动配置管理。');
});
