import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import * as legacyUi from '@peach/legacy/ui';
import { queryClient } from '../../src/react/query';
import { BrowserSources } from '../../src/react/taste/browser-sources';
import { act } from 'react';
import { BrowserIcon, browserIconId } from '../../src/react/components/browser-icon';
import { mountRoot } from './render';
import { actionOrder, buttonNamed, click, mount } from './render';

afterEach(() => { queryClient.clear(); vi.restoreAllMocks() });

const browser = { id: 'chrome', name: 'Chrome', path: 'C:\\Chrome\\User Data', enabled: true, available: true, profiles: 2 };
const open = () => mount(<QueryClientProvider client={queryClient}>
  <BrowserSources browsers={[browser]} sources={[]} range="90d" />
</QueryClientProvider>);

it('浏览器来源显示对应品牌，Chromium 与 Chrome 使用各自图标', async () => {
  const host = await open();
  expect(host.querySelector('[data-taste-source="browser"] img')?.getAttribute('src')).toBe('/browser-icon/chrome');
  for (const [name, expected] of [['Google Chrome','chrome'], ['Chromium','chromium'], ['Opera_Gx','opera-gx'],
    ['360Chromex','360chromex'], ['2345','2345'], ['115','115'], ['Aside','aside'], ['Zen Browser','zen']]) {
    expect(browserIconId(name)).toBe(expected);
  }
});

it('自定义未知名称和图像加载失败使用通用标识，更换来源后可以加载新图', async () => {
  const view = await mountRoot(<BrowserIcon name="Chrome" />);
  await act(async () => { view.host.querySelector('img')!.dispatchEvent(new Event('error')) });
  expect(view.host.querySelector('img')).toBeNull();
  expect(view.host.querySelector('svg')).not.toBeNull();
  await view.rerender(<BrowserIcon name="Firefox" />);
  expect(view.host.querySelector('img')?.getAttribute('src')).toBe('/browser-icon/firefox');
  await view.rerender(<BrowserIcon name="我的便携浏览器" />);
  expect(view.host.querySelector('img')).toBeNull();
});

it('添加浏览器的表单取消在左、添加在右', async () => {
  const host = await open();
  await click(buttonNamed('添加浏览器', host));
  expect(actionOrder(host.querySelector('form'))).toEqual(['取消', '添加']);
});

it('删除浏览器来源会删掉已导入的历史，确认弹层用危险样式', async () => {
  const modal = vi.spyOn(legacyUi, 'confirmModal').mockResolvedValue({ confirmed: false });
  const host = await open();
  await click(host.querySelector('[aria-label="删除 Chrome"]'));
  expect(modal.mock.calls[0]?.[0]).toMatchObject({ title: '删除 Chrome', confirmLabel: '删除浏览器来源', danger: true });
});
