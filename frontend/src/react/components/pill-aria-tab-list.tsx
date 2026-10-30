import { useState } from 'react';
import { TabList, type TabListProps } from 'react-aria-components';
import { PillTabList } from './pill-tabs';
import { useHorizontalScroller } from './use-horizontal-scroller';

/** 选项集合与装饰层分别挂载；路由、选中项与键盘语义由调用方维护。 */
export function PillAriaTabList<T extends object>({ scrollable = true, ...props }: TabListProps<T> & { scrollable?: boolean }) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const ref = useHorizontalScroller<HTMLDivElement>(setContainer, scrollable);
  return <>
    <TabList {...props} ref={ref} data-pill-nav="" />
    <PillTabList container={container} />
  </>;
}
