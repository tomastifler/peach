import { ColumnResizer } from 'react-aria-components';
import { Button } from '@/components/base/buttons/button';
import { SelectionPopover } from './selection-popover';
import type { TablePreferences } from './table-column-preferences';

export function TableColumnControls({ preferences, label = '表格' }: { preferences: TablePreferences; label?: string }) {
  const columns = preferences.columns.filter(column => !column.required);
  return <div role="group" aria-label={`${label}列设置`} className="flex flex-none gap-2">
    <SelectionPopover label={`${label}显示列`} triggerLabel="显示列" actionLayout="fullWidth"
      items={columns.map(column => ({ id: column.id, label: column.label, selected: preferences.visibility[column.id] !== false }))}
      onChange={(id, on) => preferences.change(current => ({ ...current, [id]: on }))}
      actions={[
        { label: '显示全部列', onPress: () => preferences.change(Object.fromEntries(columns.map(column => [column.id, true]))) },
        { label: '恢复默认显示', onPress: () => preferences.change({}) },
      ]} />
    <Button variant="secondary" size="medium" onClick={preferences.reset}>重置列宽</Button>
  </div>;
}

export function TableColumnResizer({ preferences, id }: { preferences: TablePreferences; id: string }) {
  const column = preferences.columns.find(column => column.id === id)!;
  return preferences.canResize(id) ? <ColumnResizer aria-label={`调整${column.label}列宽`} /> : null;
}
