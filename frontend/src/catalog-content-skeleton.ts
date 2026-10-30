import { skeletonHtml } from './ui-kit/skeleton';
import { catalogView } from './react/catalog-grid/catalog-view';
import { catalogTableSnapshot } from './react/catalog-grid/catalog-table-columns';
import { esc } from './core';
import { COMPLETION_ROW_SKELETON_HTML, completionRowRemembered } from './react/library-processing/completion-row';

/** 列表骨架一格的内容，壳与列表岛共用：名称格是缩略图、头像和标题署名两行，其余列一条短条。 */
export function catalogListSkeletonCellHtml(column: string): string {
  return column === 'name'
    ? '<span data-list-skeleton-name><i class="skeleton-sheen"></i><b class="skeleton-sheen"></b><span><i class="skeleton-sheen"></i><i class="skeleton-sheen"></i></span></span>'
    : '<i data-list-skeleton-bar class="skeleton-sheen"></i>';
}

/* 壳的列表骨架直接套真实表格的外框与 `bui-table` 类：工具栏一行、表头写真实列名、列宽按本机列偏好，
 * 列表岛接管后在真实表格里画同样的骨架行，数据到之前不换结构。 */
function catalogListSkeletonHtml(label: string): string {
  const columns = catalogTableSnapshot();
  const flexible = columns.some(column => column.width === null);
  const minimum = columns.reduce((sum, column) => sum + (column.width ?? column.min), 0);
  const cols = columns.map(column => column.width === null ? '<col>' : `<col style="width:${column.width}px">`).join('')
    + (flexible ? '' : '<col>');
  const head = columns.map(column => `<th>${esc(column.label)}</th>`).join('') + (flexible ? '' : '<th></th>');
  const row = `<tr>${columns.map(column => `<td>${catalogListSkeletonCellHtml(column.id)}</td>`).join('')}${flexible ? '' : '<td></td>'}</tr>`;
  return `<div class="peach-react catalog-skeleton" data-skeleton="catalog/list" role="status" aria-busy="true" aria-label="${esc(label)}">`
    + '<div data-list-skeleton aria-hidden="true"><div data-list-skeleton-tools><i class="skeleton-sheen"></i></div>'
    + (completionRowRemembered() ? COMPLETION_ROW_SKELETON_HTML : '')
    + `<div data-board-data-table><div class="w-full overflow-x-auto"><table class="bui-table bui-table-sm" style="table-layout:fixed;min-width:${minimum}px">`
    + `<colgroup>${cols}</colgroup><thead><tr>${head}</tr></thead><tbody>${row.repeat(6)}</tbody></table></div></div></div></div>`;
}

/** 馆藏与资料页按当前列表偏好使用同一份作品等待态。 */
export function catalogContentSkeletonHtml(label: string, cardRatio: number): string {
  if (catalogView() === 'list') return catalogListSkeletonHtml(label);
  return skeletonHtml(label, { variant: 'cards', className: 'catalog-skeleton postercard-skeleton', cardRatio });
}
