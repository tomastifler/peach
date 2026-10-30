import { useLayoutEffect, useRef, type HTMLAttributes, type PropsWithChildren } from 'react';
import { setCollapseRegionOpen } from '../../ui-kit/collapse';
import './collapse-region.css';

/** 内容内边距放在子层，折叠高度才能收至零；正文保持挂载并在收起时退出焦点顺序。 */
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

/** 保留同一枚箭头，开合状态由触发器 aria-expanded 驱动。 */
export function CollapseChevron(props: { className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }) {
  return <svg {...props} aria-hidden data-collapse-chevron="" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><use href="#i-chevron-down" /></svg>;
}
