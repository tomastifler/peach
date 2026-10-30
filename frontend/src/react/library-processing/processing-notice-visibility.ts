import { useSyncExternalStore } from 'react';

const KEY = 'peach.library-processing.visibility';
const listeners = new Set<() => void>();
let fallback = '';

function snapshot(): string {
  try { return sessionStorage.getItem(KEY) || '' }
  catch { return fallback }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener) };
}

/** 只控制当前浏览器页签的任务提示；任务查询与运行状态独立。 */
export function setProcessingNoticeVisible(jobId: string, visible: boolean): void {
  fallback = `${visible ? 'shown' : 'hidden'}:${jobId}`;
  try { sessionStorage.setItem(KEY, fallback) } catch { /* 存储不可用时保留当前页面的选择。 */ }
  listeners.forEach(listener => listener());
}

export function useProcessingNoticeVisibility(jobId: string) {
  const choice = useSyncExternalStore(subscribe, snapshot, () => '');
  return { hidden: choice === `hidden:${jobId}`, requested: choice === `shown:${jobId}` };
}
