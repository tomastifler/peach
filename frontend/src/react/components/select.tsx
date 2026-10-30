/* BoardUI 下拉加一段浅色前缀。工具栏和重复块里的下拉没有字段标签，只看选中值说不清在选什么，
 * 前缀写在框内值的前面（「排序」「来源」「媒体库」），读屏仍按 `aria-label` 读。上游副本不改，
 * 前缀经 `renderValue` 放进值区；值区自带 5px（`sm` 4px）间距，前缀再补一段，与值隔开 8px（`sm` 6px）。 */
import type { ReactNode } from 'react';
import type { SelectValueRenderProps } from 'react-aria-components';
import { Select as BoardSelect, type SelectProps as BoardSelectProps } from '@/components/base/select/select';

export { SelectItem } from '@/components/base/select/select';

export interface SelectProps<T extends object> extends BoardSelectProps<T> {
  /** 框内值前面的浅色名称，只给看的人，不进无障碍名称。 */
  prefix?: ReactNode;
}

export function Select<T extends object>({ prefix, renderValue, size, ...props }: SelectProps<T>) {
  if (prefix === undefined || prefix === null) return <BoardSelect {...props} size={size} renderValue={renderValue} />;
  const gap = size === 'sm' ? 'me-0.5' : 'me-0.75';
  // React Aria 调值区渲染函数时带着 `defaultChildren`（选中项自己的内容），上游的参数类型没写它。
  const value = (values: SelectValueRenderProps<T>): ReactNode => (
    <>
      <span aria-hidden className={`shrink-0 text-text-tertiary ${gap}`}>{prefix}</span>
      {typeof renderValue === 'function' ? renderValue(values)
        : renderValue ?? (values as SelectValueRenderProps<T> & { defaultChildren?: ReactNode }).defaultChildren}
    </>
  );
  return <BoardSelect {...props} size={size} renderValue={value} />;
}
