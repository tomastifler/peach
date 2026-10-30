/* 检查执行期间，断口周围的四条短线闪烁。 */
import './link-check-icon.css';

export function LinkCheckIcon({ className }: { className?: string }) {
  return <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
    strokeLinecap="round" strokeLinejoin="round" className={className} data-link-check-icon="">
    <path d="m18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71" />
    <path d="m5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71" />
    <g data-link-check-rays=""><path d="M8 2v3" /><path d="M2 8h3" /><path d="M16 19v3" /><path d="M19 16h3" /></g>
  </svg>;
}
