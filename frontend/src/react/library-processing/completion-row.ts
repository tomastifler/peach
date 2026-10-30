/* 缺图提示要等数据才知道出不出现。本机记住上次列表是否带这一行，等待态按它预留同样高度，数据到达时表格位置不变。 */
const KEY = 'peach.catalog.completion-row';

export function completionRowRemembered(): boolean {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}

export function rememberCompletionRow(shown: boolean): void {
  try { if (shown) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY) } catch { /* 当前页面照常显示。 */ }
}

/** 预留行与提示条同高：一行正文加默认档按钮，上下各 8px 内边距。 */
export const COMPLETION_ROW_SKELETON_HTML = '<i data-completion-skeleton class="skeleton-sheen"></i>';
