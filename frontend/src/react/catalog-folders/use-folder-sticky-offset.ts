import { useLayoutEffect } from 'react';

/** 目录栏的吸顶边界跟随首页筛选浮层的实际高度。 */
export function useFolderStickyOffset(active: boolean, target?: HTMLElement) {
  useLayoutEffect(() => {
    if (!active) return;
    const host = target ? document.getElementById('index') : document.getElementById('catalogFilter');
    let observed: Element | null = null;
    let frame = 0;
    const resize = new ResizeObserver(() => schedule());
    const measure = () => {
      frame = 0;
      const filter = host?.querySelector<HTMLElement>('[data-catalog-frame],[data-entity-filter-glass]') ?? null;
      if (filter !== observed) {
        resize.disconnect();
        observed = filter;
        if (filter) resize.observe(filter);
      }
      const top = filter ? parseFloat(getComputedStyle(filter).top) :
        parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topH'));
      const offset = (Number.isFinite(top) ? top : 0) + (filter?.getBoundingClientRect().height ?? 0) + 16;
      document.body.style.setProperty('--folder-sticky-top', `${offset}px`);
      const treeTop = (target ?? document.getElementById('catalogFoldersTree'))?.getBoundingClientRect().top ?? offset;
      const viewport = visualViewport;
      const bottom = viewport ? viewport.offsetTop + viewport.height : innerHeight;
      const main = document.getElementById('main');
      const bottomPadding = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0;
      const notice = document.querySelector('[data-demo-notice]')?.getBoundingClientRect();
      const edge = Math.min(bottom - bottomPadding, notice?.top ?? bottom);
      document.body.style.setProperty('--folder-available-height', `${Math.max(0, edge - Math.max(treeTop, offset) - 16)}px`);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure) };
    const mutation = new MutationObserver(schedule);
    if (host) mutation.observe(host, { childList: true, subtree: true });
    addEventListener('resize', schedule);
    addEventListener('scroll', schedule, { passive: true });
    visualViewport?.addEventListener('resize', schedule);
    visualViewport?.addEventListener('scroll', schedule);
    measure();
    return () => {
      resize.disconnect();
      mutation.disconnect();
      cancelAnimationFrame(frame);
      removeEventListener('resize', schedule);
      removeEventListener('scroll', schedule);
      visualViewport?.removeEventListener('resize', schedule);
      visualViewport?.removeEventListener('scroll', schedule);
      document.body.style.removeProperty('--folder-sticky-top');
      document.body.style.removeProperty('--folder-available-height');
    };
  }, [active, target]);
}
