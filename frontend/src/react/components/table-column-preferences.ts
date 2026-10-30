import { useMemo, useState } from 'react';
import type { ResizableTableContainerProps } from 'react-aria-components';
import type { ColumnVisibilityState, OnChangeFn } from '@tanstack/react-table';

export interface ColumnSize { width: number; min: number; max: number; flex?: boolean }
export interface TableColumnSpec {
  id: string; label: string; width?: number; min?: number; max?: number; required?: boolean; visible?: boolean; flex?: boolean;
}

function read(key: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch { return {} }
}
function persist(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* The current page keeps the selection. */ }
}

export function useTableColumnWidths(key: string, sizes: Record<string, ColumnSize>) {
  const bounded = (value: Record<string, unknown>): Record<string, number | '1fr'> => Object.fromEntries(Object.entries(sizes).map(([id, size]) => {
    const width = value[id];
    return [id, typeof width === 'number' && Number.isFinite(width) ? Math.max(size.min, Math.min(size.max, width)) : size.flex ? '1fr' : size.width];
  }));
  const [widths, setWidths] = useState(() => {
    const saved = read(key);
    // Historical preferences contain the default pixel values for the whole table; the default identity width is adaptive, while customized widths are kept.
    for (const [id, size] of Object.entries(sizes)) if (size.flex && saved[id] === size.width) delete saved[id];
    return bounded(saved);
  });
  const resize: NonNullable<ResizableTableContainerProps['onResize']> = values => {
    setWidths(current => bounded({ ...current, ...Object.fromEntries(values) }));
  };
  const save: NonNullable<ResizableTableContainerProps['onResizeEnd']> = values => {
    const next = bounded({ ...widths, ...Object.fromEntries(values) });
    setWidths(next); persist(key, next);
  };
  const reset = () => {
    setWidths(bounded({}));
    try { localStorage.removeItem(key) } catch { /* The current page uses the default column widths. */ }
  };
  return { widths: bounded(widths), resize, save, reset };
}

export function useTableColumnVisibility(key: string, ids: string[], required: string[], defaults: ColumnVisibilityState = {}) {
  const valid = (value: Record<string, unknown>): ColumnVisibilityState => ({ ...defaults, ...Object.fromEntries(ids
    .filter(id => !required.includes(id) && typeof value[id] === 'boolean').map(id => [id, value[id] === true])) });
  const [visibility, setVisibility] = useState(() => valid(read(key)));
  const change: OnChangeFn<ColumnVisibilityState> = updater => {
    const next = valid(typeof updater === 'function' ? updater(visibility) : updater);
    setVisibility(next); persist(key, next);
  };
  return { visibility, change };
}

/** Each table uses its own preferences; the identity and checkbox columns are kept, and hidden columns can still be sorted. */
export function useTablePreferences(id: string, columns: TableColumnSpec[], keys?: { widths: string; visibility: string }) {
  const sizes = useMemo(() => Object.fromEntries(columns.map(column => [column.id, {
    width: column.width ?? 180, min: column.min ?? 96, max: column.max ?? (column.flex ? 2000 : 800), flex: column.flex,
  }])), [columns]);
  const sizing = useTableColumnWidths(keys?.widths ?? `peach.table.${id}.widths.v1`, sizes);
  const visible = useTableColumnVisibility(keys?.visibility ?? `peach.table.${id}.visibility.v1`,
    columns.map(column => column.id), columns.filter(column => column.required).map(column => column.id),
    Object.fromEntries(columns.filter(column => column.visible === false).map(column => [column.id, false])));
  const flexible = columns.some(column => column.flex && visible.visibility[column.id] !== false && sizing.widths[column.id] === '1fr');
  return { ...sizing, ...visible, columns, spaceWidth: flexible ? 0 : '1fr' as const,
    // The adaptive column only takes the extra space, and on narrow screens it does not shrink below the default width; only after manual adjustment may it go down to the minimum width.
    columnProps: (column: string) => sizing.widths[column] === '1fr'
      ? { width: '1fr' as const, minWidth: sizes[column]!.width, maxWidth: undefined }
      : { width: sizing.widths[column], minWidth: sizes[column]!.min, maxWidth: sizes[column]!.max },
    canResize: (column: string) => sizes[column]!.max > sizes[column]!.min,
  };
}
export type TablePreferences = ReturnType<typeof useTablePreferences>;
