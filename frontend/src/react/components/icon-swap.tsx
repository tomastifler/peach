import type { ComponentType } from 'react';
import { useFocusVisible } from 'react-aria';
import { RiArrowDownLine, RiArrowUpLine } from '@remixicon/react';

type Icon = ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;

/** 两枚图标保持挂载，共用 ui-kit 的换态过渡；也可由直属按钮的 data-icon-state 控制。 */
export function IconSwap({ a: First, b: Second, state, className }: {
  a: Icon; b: Icon; state?: 'a' | 'b'; className?: string;
}) {
  const { isFocusVisible } = useFocusVisible();
  return <span aria-hidden className={`iconswap ${className || ''}`} data-icon-swap="" data-icon-state={state}
    data-motion-instant={isFocusVisible || undefined}>
    <span data-icon="a"><First className="size-full" /></span>
    <span data-icon="b"><Second className="size-full" /></span>
  </span>;
}

/** BoardUI 按钮保留同一个 leadingIcon，方向状态归按钮。 */
export function SortDirectionIcon({ className }: { className?: string }) {
  return <IconSwap a={RiArrowUpLine} b={RiArrowDownLine} className={className} />;
}
