import { Checkbox } from '@/components/base/checkbox/checkbox';

interface SelectableTable {
  getFilteredRowModel(): { flatRows: SelectableRow[] };
  getPaginatedRowModel(): { flatRows: SelectableRow[] };
  toggleAllRowsSelected(selected: boolean): void;
  toggleAllPageRowsSelected(selected: boolean): void;
}
interface SelectableRow { getCanSelect(): boolean; getIsSelected(): boolean }

function selection(table: SelectableTable, page: boolean) {
  const rows = (page ? table.getPaginatedRowModel() : table.getFilteredRowModel()).flatRows.filter(row => row.getCanSelect());
  const count = rows.filter(row => row.getIsSelected()).length;
  return { all: rows.length > 0 && count === rows.length, some: count > 0 && count < rows.length };
}

/** 部分选中才显示半选；再次点击全选框会取消对应范围。 */
export function TableSelectionHeader({ table, label, page = false, disabled = false }: {
  table: SelectableTable; label: string; page?: boolean; disabled?: boolean;
}) {
  const { all, some } = selection(table, page);
  return <Checkbox slot={null} aria-label={label} isDisabled={disabled} isSelected={all} isIndeterminate={some}
    onChange={() => {
      const on = !selection(table, page).all;
      if (page) table.toggleAllPageRowsSelected(on);
      else table.toggleAllRowsSelected(on);
    }} />;
}
