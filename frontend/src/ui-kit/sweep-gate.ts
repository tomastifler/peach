/* The skeleton shimmer sweeps only while it is visible.
 *
 * The shimmer is a `::after` animation on `transform` (`web/css/09-skeleton.css` in `skeleton-sweep`).
 * A lazy-loaded image that stays off-screen never arrives, so the shimmer on its frame keeps sweeping: the home strip, the people index and the dozens of cells beyond one screen on the follow page
 * each invalidate animation styles every frame. Here a shared intersection observer marks the frame as `data-sweep`:
 * not in the viewport is `idle` (the stylesheet pauses the animation), and once visible it waits in the viewport for a full `SWEEP_STALL_MS` and if the image has still not arrived it is
 * `stalled` (the stylesheet removes the animation and lays only a static placeholder surface). When the image arrives or cannot be fetched the caller calls `releaseSweep`. */

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
      // Timing starts only once it is visible: a lazy-loaded image queued off-screen has not started downloading, so it cannot count as timed out.
      if (!stallTimers.has(box)) stallTimers.set(box, setTimeout(() => {
        stallTimers.delete(box);
        if (box.isConnected) box.dataset.sweep = 'stalled';
      }, SWEEP_STALL_MS));
    }
  });
  return sight;
}

/** Start watching a frame with a shimmer: paused off-screen, and swapped for a static placeholder if it waits too long after becoming visible. */
export function gateSweep(box: Element): void {
  observer()?.observe(box);
}

/** The frame's content arrived or is confirmed unavailable: stop watching and remove the marker. */
export function releaseSweep(box: Element): void {
  sight?.unobserve(box);
  clearTimeout(stallTimers.get(box));
  stallTimers.delete(box);
  if ((box as HTMLElement).dataset?.sweep) delete (box as HTMLElement).dataset.sweep;
}
