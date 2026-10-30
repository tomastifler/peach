import { useCallback, useEffect, useState } from 'react';
import { TAG_PAGE_SIZE } from '../../tag-skeleton';

/** 筛选对应独立页码；换页保留选择，换筛选回到首页。 */
export function useTagPagination(filter: string) {
  const [state, setState] = useState({ filter, pageIndex: 0, pageSize: TAG_PAGE_SIZE });
  const pageIndex = state.filter === filter ? state.pageIndex : 0;
  const pagination = { pageIndex, pageSize: state.pageSize };
  const onChange = useCallback((next: typeof pagination) => setState({ ...next, filter }), [filter]);
  return { pagination, onChange };
}

export function useTagPageBounds(total: number | undefined, pagination: { pageIndex: number; pageSize: number }, onChange: (next: typeof pagination) => void) {
  const { pageIndex, pageSize } = pagination;
  useEffect(() => {
    if (total === undefined) return;
    const last = Math.max(0, Math.ceil(total / pageSize) - 1);
    if (pageIndex > last) onChange({ pageIndex: last, pageSize });
  }, [total, pageIndex, pageSize, onChange]);
}
