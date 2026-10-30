/* Whether the missing-image notice appears is only known once data arrives. This machine remembers whether the last list had this row, and the waiting state reserves the same height, so the table does not move when data arrives. */
const KEY = 'peach.catalog.completion-row';

export function completionRowRemembered(): boolean {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}

export function rememberCompletionRow(shown: boolean): void {
  try { if (shown) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY) } catch { /* The current page displays as usual. */ }
}

/** The reserved row matches the notice bar's height: one line of body text plus a default-size button, with 8px padding above and below. */
export const COMPLETION_ROW_SKELETON_HTML = '<i data-completion-skeleton class="skeleton-sheen"></i>';
