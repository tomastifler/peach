/* BoardUI dropdown with a light-colored prefix added. Dropdowns in toolbars and repeated blocks have no field label, and the selected value alone does not say what is being chosen,
 * so the prefix is written before the value inside the box ("Sort", "Source", "Library"), while screen readers still read the `aria-label`. The upstream copy is not modified,
 * the prefix is placed into the value area via `renderValue`; the value area has its own 5px (`sm` 4px) spacing, and the prefix adds a bit more, separating it from the value by 8px (`sm` 6px). */
import type { ReactNode } from 'react';
import type { SelectValueRenderProps } from 'react-aria-components';
import { Select as BoardSelect, type SelectProps as BoardSelectProps } from '@/components/base/select/select';

export { SelectItem } from '@/components/base/select/select';

export interface SelectProps<T extends object> extends BoardSelectProps<T> {
  /** The light-colored name before the value in the box, only for sighted users, not part of the accessible name. */
  prefix?: ReactNode;
}

export function Select<T extends object>({ prefix, renderValue, size, ...props }: SelectProps<T>) {
  if (prefix === undefined || prefix === null) return <BoardSelect {...props} size={size} renderValue={renderValue} />;
  const gap = size === 'sm' ? 'me-0.5' : 'me-0.75';
  // React Aria calls the value-area render function with `defaultChildren` (the selected item's own content), which upstream's parameter type does not declare.
  const value = (values: SelectValueRenderProps<T>): ReactNode => (
    <>
      <span aria-hidden className={`shrink-0 text-text-tertiary ${gap}`}>{prefix}</span>
      {typeof renderValue === 'function' ? renderValue(values)
        : renderValue ?? (values as SelectValueRenderProps<T> & { defaultChildren?: ReactNode }).defaultChildren}
    </>
  );
  return <BoardSelect {...props} size={size} renderValue={value} />;
}
