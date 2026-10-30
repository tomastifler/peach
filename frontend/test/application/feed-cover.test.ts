import { expect, it, vi } from 'vitest';

import { advanceImageFallback } from '../../src/card-art/image-fallback';
import { feedNewCoverHtml } from '../../src/application/feed.js';

// 封面片段只读条目字段，其余域控制器换成空壳，免得装载整套应用。
vi.mock('../../src/application/catalog.js', () => ({ catalogState: {} }));
vi.mock('../../src/application/preferences.js', () => ({ preferencesState: {}, wireDrag: () => {} }));
vi.mock('../../src/application/entity.js', () => ({ pushEntityPage: () => {} }));
vi.mock('../../src/application/effects', () => ({ applicationEffects: {} }));

const render = (item: Record<string, unknown>) => {
  const host = document.createElement('div');
  host.innerHTML = feedNewCoverHtml(item);
  return host;
};

it('未入库新作的官方封面经 Peach 代理取图，页面不出现图床地址', () => {
  const host = render({ code: 'ABC-001', has_cover: false,
    cover_url: 'https://awsimgsrc.dmm.co.jp/pics_dig/digital/video/abc00001/abc00001pl.jpg' });
  const image = host.querySelector('img')!;
  expect(image.getAttribute('src')).toBe('/cover-image?code=ABC-001');
  expect(host.innerHTML).not.toContain('dmm.co.jp');
});

it('代理取不到封面时换成「封面未取得」占位，不留裂图', () => {
  const host = render({ code: 'ABC-001', has_cover: false, cover_url: 'https://pics.dmm.co.jp/digital/video/abc00001/abc00001pl.jpg' });
  expect(advanceImageFallback(host.querySelector('img'))).toBe('drop');
  expect(host.querySelector('img')).toBeNull();
  expect(host.querySelector('span.nopic')?.textContent).toBe('封面未取得');
});

it('没有可代理的地址或番号时直接显示无封面，不发请求', () => {
  for (const item of [{ code: 'ABC-001', cover_url: '' }, { code: '', cover_url: 'https://pics.dmm.co.jp/a.jpg' }]) {
    const host = render({ ...item, has_cover: false });
    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelector('[data-feed-cover-state="missing"]')?.textContent).toBe('无封面');
  }
});
