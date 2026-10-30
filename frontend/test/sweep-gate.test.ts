import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.resetModules(); document.body.replaceChildren(); });

it('等图的框在视口外停扫，露面满十秒还没到换成静止占位，到手后撤掉标记', async () => {
  vi.useFakeTimers();
  let sight: (entries: Partial<IntersectionObserverEntry>[]) => void = () => {};
  const observed = new Set<Element>();
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: typeof sight) { sight = callback; }
    observe(target: Element) { observed.add(target); }
    unobserve(target: Element) { observed.delete(target); }
  });
  const { gateSweep, releaseSweep, SWEEP_STALL_MS } = await import('../src/ui-kit/sweep-gate');
  const box = document.createElement('span'); document.body.append(box);
  gateSweep(box);
  expect(observed.has(box)).toBe(true);
  sight([{ target: box, isIntersecting: false }]);
  expect(box.dataset.sweep).toBe('idle');
  // 在屏幕外待多久都不算超时。
  vi.advanceTimersByTime(SWEEP_STALL_MS * 2);
  expect(box.dataset.sweep).toBe('idle');
  sight([{ target: box, isIntersecting: true }]);
  expect(box.dataset.sweep).toBeUndefined();
  vi.advanceTimersByTime(SWEEP_STALL_MS - 1);
  expect(box.dataset.sweep).toBeUndefined();
  vi.advanceTimersByTime(1);
  expect(box.dataset.sweep).toBe('stalled');
  releaseSweep(box);
  expect(box.dataset.sweep).toBeUndefined();
  expect(observed.has(box)).toBe(false);
});
