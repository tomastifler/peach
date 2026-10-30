import { useState } from 'react';
import { TabList, type TabListProps } from 'react-aria-components';
import { PillTabList } from './pill-tabs';
import { useHorizontalScroller } from './use-horizontal-scroller';

/** The option collection and the decoration layer are mounted separately; routing, the selected item and keyboard semantics are maintained by the caller. */
export function PillAriaTabList<T extends object>({ scrollable = true, ...props }: TabListProps<T> & { scrollable?: boolean }) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const ref = useHorizontalScroller<HTMLDivElement>(setContainer, scrollable);
  return <>
    <TabList {...props} ref={ref} data-pill-nav="" />
    <PillTabList container={container} />
  </>;
}
