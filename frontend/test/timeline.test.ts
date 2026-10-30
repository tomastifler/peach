import { afterEach, describe, expect, it, vi } from 'vitest';
import { timelineFrame } from '../src/player/timeline';
import { mountPlayerSeekPreview } from '../src/player/controls';
import type { VjsPlayer } from '../src/player/types';

afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren() });

describe('时间轴索引', () => {
  it('按预览自身的非均匀时间选择帧，并保留未覆盖区间', () => {
    const source = { frames: 3, interval: 0, cues: [[0, 3.5], [3.5, 7], [10, 15]] as [number, number][] };
    expect([0, 3.4, 3.5, 7, 9, 10, 15, 16].map(time => timelineFrame(time, source)))
      .toEqual([0, 0, 1, null, null, 2, 2, null]);
  });
  it('按固定间隔选择接触印相中的帧', () => {
    const source = { frames: 120, interval: 10 };
    expect([0, 9, 10, 999, 1000, 1500].map(time => timelineFrame(time, source)))
      .toEqual([0, 0, 1, 99, 100, 119]);
  });
  it('无效索引和时刻返回空值', () => {
    expect(timelineFrame(-1, { frames: 2, interval: 10 })).toBeNull();
    expect(timelineFrame(Infinity, { frames: 2, interval: 10 })).toBeNull();
    expect(timelineFrame(0, { frames: 0, interval: 10 })).toBeNull();
    expect(timelineFrame(0, { frames: 2, interval: 0 })).toBeNull();
    expect(timelineFrame(1, { frames: 1, interval: 0, cues: [[2, 4]] })).toBeNull();
  });
  it('预览控件使用准确来源，在空隙与图片失败时读取已有缓存', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      source: 'webvtt', frames: 2, interval: 0, columns: 1, rows: 1, cues: [[0, 3], [8, 12]],
      fallback: { source: 'peach', frames: 3, interval: 10, columns: 10, rows: 10 },
    }), { headers: { 'Content-Type': 'application/json' } })));
    const root = document.createElement('div');
    root.innerHTML = '<div class="vjs-control-bar"><div class="vjs-progress-control"></div></div>';
    document.body.append(root);
    const progress = root.querySelector<HTMLElement>('.vjs-progress-control')!;
    progress.getBoundingClientRect = () => ({ width: 300, left: 0 } as DOMRect);
    const player = { el: () => root, duration: () => 30, on: () => {} } as unknown as VjsPlayer;
    mountPlayerSeekPreview(player, { id: 42, duration: 30, width: 1920, height: 1080 });
    await new Promise(resolve => setTimeout(resolve, 0));
    const image = root.querySelector('img')!;
    const move = (x: number) => progress.dispatchEvent(new PointerEvent('pointermove', { clientX: x, pointerType: 'mouse' }));
    move(90);
    expect(image.getAttribute('src')).toBe('/timeline?id=42&s=1&source=webvtt');
    expect(image.style.width).toBe('100%');
    move(200);
    expect(image.getAttribute('src')).toBe('/timeline?id=42&s=0&source=peach');
    expect(image.style.left).toBe('-200%');
    move(90);
    image.dispatchEvent(new Event('error'));
    move(90);
    expect(image.getAttribute('src')).toBe('/timeline?id=42&s=0&source=peach');
    image.dispatchEvent(new Event('error'));
    move(90);
    expect(image.getAttribute('src')).toBe('/poster?id=42&c=2');
  });
});
