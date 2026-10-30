import { useLayoutEffect, useRef, type HTMLAttributes, type PropsWithChildren } from 'react';
import { setCollapseRegionOpen } from '../../ui-kit/collapse';
import './collapse-region.css';

/** Content padding goes on the child layer so the collapsed height can reach zero; the body stays mounted and leaves the focus order when collapsed. */
export function CollapseRegion({ open, children, ...props }: PropsWithChildren<{ open: boolean } & HTMLAttributes<HTMLDivElement>>) {
  const body = useRef<HTMLDivElement>(null), primed = useRef(false);
  useLayoutEffect(() => {
    const node = body.current;
    if (!node) return;
    if (!primed.current) {
      primed.current = true; node.hidden = !open; node.inert = !open;
      node.classList.add('ui-fcollapse'); node.classList.toggle('ui-fcollapse-settled', open);
    } else setCollapseRegionOpen(node, open);
  }, [open]);
  return <div {...props} ref={body}>{children}</div>;
}

/** Keep the same arrow; the open/closed state is driven by the trigger's aria-expanded. */
export function CollapseChevron(props: { className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }) {
  return <svg {...props} aria-hidden data-collapse-chevron="" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><use href="#i-chevron-down" /></svg>;
}
