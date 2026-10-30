/** Native scrolling uses the browser's duration and curve, and jumps straight to the position when reduced motion is on. */
export const routeScrollBehavior = (): ScrollBehavior =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';

/** Once page content and fonts are ready, position in a layout frame; no longer scroll if navigation has changed. */
export async function scrollToAnchor(hash: string, isCurrent: () => boolean): Promise<void> {
  let id: string;
  try { id = decodeURIComponent(hash.slice(1)) } catch { return }
  if (!id) return;
  await document.fonts?.ready;
  await new Promise<void>(resolve => { requestAnimationFrame(() => { requestAnimationFrame(() => resolve()) }) });
  if (!isCurrent()) return;
  const target = document.getElementById(id);
  if (target?.getClientRects().length) target.scrollIntoView({ block: 'start', behavior: routeScrollBehavior() });
}
