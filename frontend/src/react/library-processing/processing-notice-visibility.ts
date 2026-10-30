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

/** Only controls the job notice for the current browser tab; job queries and run state are independent. */
export function setProcessingNoticeVisible(jobId: string, visible: boolean): void {
  fallback = `${visible ? 'shown' : 'hidden'}:${jobId}`;
  try { sessionStorage.setItem(KEY, fallback) } catch { /* Keep the current page's choice when storage is unavailable. */ }
  listeners.forEach(listener => listener());
}

export function useProcessingNoticeVisibility(jobId: string) {
  const choice = useSyncExternalStore(subscribe, snapshot, () => '');
  return { hidden: choice === `hidden:${jobId}`, requested: choice === `shown:${jobId}` };
}
