/* 每个页面夹具独立持有字幕记忆，刷新沿用同一份内容。 */
import type { Page } from 'playwright-core';
import type { PlayerMemoryValue } from '../src/player/memory';

export async function mockSubtitleMemory(page: Page) {
  const memories = new Map<string, PlayerMemoryValue>();
  const content = new Map<string, string>();
  await page.route(/\/api\/(?:subtitles|player)\/memory/, async route => {
    const request = route.request(), url = new URL(request.url()), video = url.searchParams.get('video')!;
    if (url.pathname.includes('/track/')) return route.fulfill({ contentType: 'text/vtt', body: content.get(`${video}:${url.pathname}`)! });
    const value = memories.get(video) || { selected: null, tracks: [] };
    if (request.method() === 'PUT') {
      const body = request.postDataJSON();
      if ('selected' in body) value.selected = body.selected;
      if ('rotation' in body) value.rotation = body.rotation;
      if ('rate' in body) value.rate = body.rate;
      if (body.caption_style) value.caption_style = { ...value.caption_style, ...body.caption_style };
      if (body.track) {
        const { key, name, text } = body.track;
        const src = `/api/subtitles/memory/track/${encodeURIComponent(key)}?video=${video}`;
        content.set(`${video}:${new URL(src, url.origin).pathname}`, text);
        value.tracks = [...value.tracks.filter(row => row.key !== key), { key, name, src }];
      }
      memories.set(video, value);
    }
    return route.fulfill({ json: value });
  });
}
