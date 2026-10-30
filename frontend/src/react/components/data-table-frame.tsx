import { useEffect, useRef, type MouseEvent, type PropsWithChildren } from 'react';
import { attachOverlayScrollbar } from '@peach/legacy/ui';
import { wireTableScroller } from '../../ui-kit/scroll';
import { ResizableTableContainer } from 'react-aria-components';
import type { TablePreferences } from './table-column-preferences';
import './table-column-controls.css';

import { clickedBlank } from './row-click';

export interface DataTableFrameProps extends PropsWithChildren {
  /** 关注来源表需要额外的排序图标规则；外框与行状态仍由这个共享组件负责。 */
  follow?: boolean;
  preferences?: TablePreferences;
  /** 给了就是整行可选：点在某一行的空白处时以那一行的 `data-key`（React Aria 写在 `tr` 上的
   *  行 id）回调；点在行里的勾、键、链接上不算。 */
  onRowClick?(key: string): void;
}

/** BoardUI Table 的 Data Table 外框：主表面、完整边线、圆角与选中行反馈。 */
export function DataTableFrame({ children, follow = false, onRowClick, preferences }: DataTableFrameProps) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const viewport = host.current?.querySelector<HTMLElement>('.overflow-x-auto') ?? null;
    attachOverlayScrollbar(viewport);
    wireTableScroller(viewport);
  });
  const click = onRowClick ? (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const row = target.closest<HTMLElement>('[role="row"][data-key]');
    if (row && clickedBlank(event, row)) onRowClick(row.dataset.key!);
  } : undefined;
  return (
    <div ref={host} data-board-data-table data-resizable-table={preferences ? '' : undefined} data-follow-table={follow || undefined} onClick={click}>
      {preferences ? <ResizableTableContainer className="relative min-w-0" onResize={preferences.resize} onResizeEnd={preferences.save}>
        {children}
      </ResizableTableContainer> : children}
    </div>
  );
}
