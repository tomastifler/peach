import type { ComponentType } from 'react';
import { useFocusVisible } from 'react-aria';
import { RiArrowDownLine, RiArrowUpLine } from '@remixicon/react';

type Icon = ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;

/** Two icons stay mounted and share the ui-kit's state-swap transition; it can also be controlled by the direct child button's data-icon-state. */
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

/** The BoardUI button keeps the same leadingIcon, and the direction state belongs to the button. */
export function SortDirectionIcon({ className }: { className?: string }) {
  return <IconSwap a={RiArrowUpLine} b={RiArrowDownLine} className={className} />;
}
