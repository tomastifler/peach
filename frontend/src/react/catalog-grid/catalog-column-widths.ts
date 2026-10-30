import { useTablePreferences } from '../components/table-column-preferences';
import { CATALOG_COLUMN_VISIBILITY_KEY, CATALOG_COLUMN_WIDTHS_KEY, catalogColumns } from './catalog-table-columns';

export { columnSizes, defaultColumnVisibility } from './catalog-table-columns';

export function useCatalogTablePreferences() {
  return useTablePreferences('catalog', catalogColumns, { widths: CATALOG_COLUMN_WIDTHS_KEY, visibility: CATALOG_COLUMN_VISIBILITY_KEY });
}
