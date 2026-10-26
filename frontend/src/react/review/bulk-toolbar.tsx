/* 复核筛选与批量动作：分组方式、分类筛选、全选本页留在吸顶栏，所选项目的判定动作
 * 使用首页同款底部悬浮框。
 *
 * 分组方式和筛选项按**整条队列**算，卡片只画当前这一页：筛选里的计数说的是队列，不是
 * 这一屏。筛选条高度保持不变，勾选项目时不会把下滑后吸顶的内容往下推。 */
import { RiCheckDoubleLine } from '@remixicon/react';

import { Button } from '@/components/base/buttons/button';
import { Select, SelectItem } from '@/components/base/select/select';
import { SelectionDock } from '../components/selection-dock';
import type { DecisionStatus, ReviewGroup, ReviewGrouping, ReviewRow } from './review';
import { commonReviewSources } from './review';

export interface BulkToolbarProps {
  groupOptions: [ReviewGrouping, string][];
  groupBy: ReviewGrouping;
  onGroupBy(next: ReviewGrouping): void;
  groups: ReviewGroup[];
  filter: string;
  onFilter(next: string): void;
  /** 当前这一页上的行，全选就是全选它们。 */
  pageKeys: string[];
  selected: ReadonlySet<string>;
  onSelected(next: Set<string>): void;
  /** 选中的那些行，用来算共同来源。 */
  selectedRows: ReviewRow[];
  metadata: boolean;
  /** 所选项目里还能不能按下「通过所选」。 */
  approvable: boolean;
  busy: boolean;
  feedback: string;
  onUnifySource(source: string): void;
  onRun(status: Extract<DecisionStatus, 'approved' | 'rejected'>): void;
}

export function BulkToolbar(props: BulkToolbarProps) {
  const {
    groupOptions, groupBy, onGroupBy, groups, filter, onFilter, pageKeys, selected, onSelected,
    selectedRows, metadata, approvable, busy, feedback, onUnifySource, onRun,
  } = props;
  const shown = pageKeys.filter((key) => selected.has(key));
  const allShown = shown.length > 0 && shown.length === pageKeys.length;
  const sources = commonReviewSources(selectedRows);
  const needsSource = metadata && selectedRows.some((row) => (row.candidates?.length || 0) > 1);
  const sourceLabel = sources.length ? 'Choose a source for all' : 'Selected items share no common source';

  const toggleAll = () => {
    const next = new Set(selected);
    for (const key of pageKeys) { if (allShown) next.delete(key); else next.add(key) }
    onSelected(next);
  };

  return (
    <>
      <div role="group" aria-label="Review filter" data-review-filter data-glass-pane=""
        className="sticky top-topbar z-10 flex flex-wrap items-center gap-2 p-3">
        <Select aria-label="Filter grouping" size="sm" selectedKey={groupBy}
          onSelectionChange={(key) => { if (key !== null) onGroupBy(String(key) as ReviewGrouping) }}>
          {groupOptions.map(([key, name]) => <SelectItem key={key} id={key}>{name}</SelectItem>)}
        </Select>
        {/* 只有一组时没什么可筛的：一个「全部分类」的下拉读起来像坏了。 */}
        {groups.length > 1 ? (
          <Select aria-label={groupBy === 'field' ? 'Filter field category' : 'Filter current category'} size="sm"
            selectedKey={filter || '*'}
            onSelectionChange={(key) => { if (key !== null) onFilter(String(key) === '*' ? '' : String(key)) }}>
            <SelectItem id="*">All categories</SelectItem>
            {groups.map((group) => (
              <SelectItem key={group.key} id={group.key}>
                {`${group.title} · ${group.rows.length}`}
              </SelectItem>
            ))}
          </Select>
        ) : null}
        <Button variant="secondary" size="small" leadingIcon={RiCheckDoubleLine}
          aria-pressed={allShown} disabled={busy || !pageKeys.length} onClick={toggleAll}>
          {allShown ? 'Clear current selection' : filter ? 'Select all in category' : 'Select all on page'}
        </Button>
      </div>

        <SelectionDock label="Review selected items" visible={selected.size > 0} count={`${selected.size} selected`}>
          {needsSource ? (
            <Select aria-label="Choose a source for all" size="sm" selectedKey=""
              isDisabled={busy || !sources.length}
              onSelectionChange={(key) => { if (key !== null && key !== '') onUnifySource(String(key)) }}>
              <SelectItem id="">{sourceLabel}</SelectItem>
              {sources.map((source) => <SelectItem key={source} id={source}>{source}</SelectItem>)}
            </Select>
          ) : null}
          <Button variant="primary" size="small" disabled={busy || !selected.size || !approvable}
            onClick={() => onRun('approved')}>Approve selected</Button>
          <Button variant="danger" size="small" disabled={busy || !selected.size}
            onClick={() => onRun('rejected')}>Reject selected</Button>
          <Button variant="ghost" size="small" disabled={busy}
            onClick={() => onSelected(new Set())}>Deselect</Button>
          {feedback
            ? <p role="status" className="w-full text-body-2-regular text-text-secondary">{feedback}</p>
            : null}
        </SelectionDock>
    </>
  );
}
