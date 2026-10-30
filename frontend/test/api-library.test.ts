import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiGet, apiSend } from '../src/api';
import { api } from '../src/core';

describe('媒体库查询范围', () => {
  const fetchMock = vi.fn(async (_url: string, _options?: RequestInit) => new Response('{}', { headers: { 'Content-Type': 'application/json' } }));
  beforeEach(() => {
    sessionStorage.clear();
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { sessionStorage.clear(); vi.unstubAllGlobals() });

  for (const [name, get] of [['React', apiGet], ['应用', api]] as const) {
    it(`${name}：目录、搜索和筛选逐次读取当前媒体库`, async () => {
      sessionStorage.setItem('peach.library', '本地 & A');
      await get('/api/items?q=影片&offset=48#results');
      expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('/api/items?q=影片&offset=48&library=%E6%9C%AC%E5%9C%B0%20%26%20A#results');
      sessionStorage.setItem('peach.library', 'cloud');
      await get('/api/facets?');
      expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('/api/facets?library=cloud');
      sessionStorage.removeItem('peach.library');
      await get('/api/items?limit=1');
      expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('/api/items?limit=1');
    });

    it(`${name}：显式范围和其他端点保留调用方参数`, async () => {
      sessionStorage.setItem('peach.library', 'selected');
      for (const path of ['/api/items?library=other', '/api/items?library=', '/api/facets?%6cibrary=other',
        '/api/item?id=1', '/api/items-extra', '/api/libraries', 'https://example.test/api/items']) {
        await get(path);
        expect(fetchMock.mock.calls.at(-1)?.[0]).toBe(path);
      }
    });
  }

  it('写操作保留调用方范围与请求体', async () => {
    sessionStorage.setItem('peach.library', 'selected');
    await api('/api/items', { method: 'POST', body: '{}' });
    await apiSend('/api/items', { id: 1 });
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual(['/api/items', '/api/items']);
    expect(fetchMock.mock.calls.map(call => [call[1]?.method, call[1]?.body])).toEqual([
      ['POST', '{}'], ['POST', '{"id":1}'],
    ]);
  });
});

describe('响应体读取期间取消请求', () => {
  afterEach(() => { vi.unstubAllGlobals() });

  for (const method of ['GET', 'POST'] as const) {
    it(`${method} 保留取消原因`, async () => {
      const controller = new AbortController();
      const cancelled = new DOMException('已中止', 'AbortError');
      let rejectBody!: (reason: unknown) => void;
      const body = new Promise<never>((_resolve, reject) => { rejectBody = reject });
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: () => body })));
      const pending = method === 'GET'
        ? apiGet('/api/duplicates', controller.signal)
        : apiSend('/api/batch', { ids: [1] }, 'POST', controller.signal);
      const rejected = expect(pending).rejects.toBe(cancelled);
      controller.abort(cancelled);
      rejectBody(cancelled);
      await rejected;
    });
  }
});
