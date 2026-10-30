/* 骨架微光只在看得见的时候扫。
 *
 * 微光是 `::after` 上一条 `transform` 动画（`web/css/09-skeleton.css` 的 `skeleton-sweep`）。
 * 懒加载的图在屏幕外一直不来，框上的微光就一直扫：首页横条、人物索引、关注页一屏外的
 * 几十格，每帧都有一次动画样式失效。这里用一个共用的交叉观察器把框标成 `data-sweep`：
 * 不在视口里是 `idle`（样式表暂停动画），露面后在视口里等满 `SWEEP_STALL_MS` 图还没到就是
 * `stalled`（样式表撤掉动画、只铺静止的占位面）。图到手或取不到时调用方 `releaseSweep`。 */

export const SWEEP_STALL_MS = 10_000;

const stallTimers = new WeakMap<Element, ReturnType<typeof setTimeout>>();
let sight: IntersectionObserver | null = null;

function observer(): IntersectionObserver | null {
  if (sight || typeof IntersectionObserver !== 'function') return sight;
  sight = new IntersectionObserver(entries => {
    for (const { target, isIntersecting } of entries) {
      if (!target.isConnected) { releaseSweep(target); continue; }
      const box = target as HTMLElement;
      if (box.dataset.sweep === 'stalled') continue;
      if (!isIntersecting) {
        box.dataset.sweep = 'idle';
        clearTimeout(stallTimers.get(box)); stallTimers.delete(box);
        continue;
      }
      delete box.dataset.sweep;
      // 露面才开始计时：屏幕外排队的懒加载图还没开始下载，不能算它超时。
      if (!stallTimers.has(box)) stallTimers.set(box, setTimeout(() => {
        stallTimers.delete(box);
        if (box.isConnected) box.dataset.sweep = 'stalled';
      }, SWEEP_STALL_MS));
    }
  });
  return sight;
}

/** 开始照看一个带微光的框：屏幕外暂停，露面后等太久换成静止占位。 */
export function gateSweep(box: Element): void {
  observer()?.observe(box);
}

/** 框里的内容到了或确定取不到：停止照看并撤掉标记。 */
export function releaseSweep(box: Element): void {
  sight?.unobserve(box);
  clearTimeout(stallTimers.get(box));
  stallTimers.delete(box);
  if ((box as HTMLElement).dataset?.sweep) delete (box as HTMLElement).dataset.sweep;
}
