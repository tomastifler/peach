import { useMemo } from 'react';
import { diffChars } from 'diff';

/** Differences only affect display; source text, whitespace and Unicode characters are preserved and do not take part in the request to adopt details. */
export function ComparisonText({ value, reference }: { value: string; reference?: string }) {
  const parts = useMemo(() => reference
    ? diffChars(reference, value).filter(part => !part.removed)
    : [{ value, added: false }], [value, reference]);
  return <>{parts.map((part, index) => part.added
    ? <mark key={index} data-review-difference=""
        className="rounded-sm bg-status-yellow-background text-status-yellow-text">{part.value}</mark>
    : <span key={index}>{part.value}</span>)}</>;
}
