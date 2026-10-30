/* 低频页 chunk 的装载（ADR-0118）：打开页面时装不上而服务还在，说明旧入口指着已删除的 chunk，整页重载一次；
 * 同一会话 30 秒内不重载第二次，服务连不上不重载，空闲预热失败不重载。 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let reload: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.resetModules();
  sessionStorage.clear();
  reload = vi.fn();
  vi.stubGlobal('location', { ...window.location, reload });
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() });

const missing = () => Promise.reject(new TypeError('Failed to fetch dynamically imported module'));

it('装上之前 get() 抛错，装上之后同步拿到模块，第二次打开不再装载', async () => {
  const { routeChunk } = await import('../src/react/router/route-chunk');
  const load = vi.fn(async () => ({ Page: 'page' }));
  const chunk = routeChunk(load);
  expect(() => chunk.get()).toThrow('页面代码还没装载');
  await chunk.preload();
  await chunk.preload();
  expect(chunk.get()).toEqual({ Page: 'page' });
  expect(load).toHaveBeenCalledTimes(1);
});

it('打开时装不上而服务可达就重载一次，30 秒内再失败不重载，失败的那次不记住、下次重试', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })));
  const { routeChunk } = await import('../src/react/router/route-chunk');
  const load = vi.fn(missing);
  const chunk = routeChunk(load);
  await expect(chunk.preload()).rejects.toThrow('dynamically imported module');
  expect(reload).toHaveBeenCalledTimes(1);
  expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe('/healthz');
  await expect(chunk.preload()).rejects.toThrow('dynamically imported module');
  expect(load).toHaveBeenCalledTimes(2);
  expect(reload).toHaveBeenCalledTimes(1);
});

it('服务连不上时不重载，错误交给页面', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }));
  const { routeChunk } = await import('../src/react/router/route-chunk');
  await expect(routeChunk(missing).preload()).rejects.toThrow('dynamically imported module');
  expect(reload).not.toHaveBeenCalled();
});

it('空闲预热逐个装载，失败不重载，留到打开时再试', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })));
  vi.stubGlobal('requestIdleCallback', (callback: () => void) => { queueMicrotask(callback); return 0 });
  const { routeChunk, warmRouteChunks } = await import('../src/react/router/route-chunk');
  const broken = vi.fn(missing);
  const fine = vi.fn(async () => ({ ok: 1 }));
  routeChunk(broken);
  const chunk = routeChunk(fine);
  warmRouteChunks();
  await vi.waitFor(() => expect(fine).toHaveBeenCalledTimes(1));
  expect(broken).toHaveBeenCalledTimes(1);
  expect(chunk.get()).toEqual({ ok: 1 });
  expect(reload).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
