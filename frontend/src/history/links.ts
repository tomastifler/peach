import { isOverlayPath, overlayTarget } from './overlay';
import { routeMetaOf } from './route-meta';

/** 当前标签页里尚未处理且已登记的站内页面链接。 */
export function navigationLinkPath(event: MouseEvent): string | null {
  if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return null;
  const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
  if (!link || link.hasAttribute('download') || (link.target && link.target.toLowerCase() !== '_self')) return null;
  const href = link.getAttribute('href')?.trim();
  if (!href) return null;
  const baseTarget = document.querySelector<HTMLBaseElement>('base[target]')?.target;
  if (!link.hasAttribute('target') && baseTarget && baseTarget.toLowerCase() !== '_self') return null;
  let url: URL;
  try { url = new URL(link.href, window.location.href) } catch { return null }
  if (url.origin !== window.location.origin || (href.startsWith('#') && isOverlayPath(url.pathname))) return null;
  const route = routeMetaOf(url.pathname);
  if (href.startsWith('#') && !route?.section) return null;
  if (!overlayTarget(url.pathname, url.search) && !route) return null;
  return url.pathname + url.search + url.hash;
}
