import type { ButtonHTMLAttributes } from 'react';
import { spinnerHtml } from '@peach/legacy/ui';
import { spriteGlyph } from './sprite-glyph';
import './rating-stars.css';

const Star = spriteGlyph('star');

/** The five-star readout and the rating buttons share the graphic, color and hit area. */
export function RatingStars({ value, onRate, busyStar, busyAttrs }: {
  value: number;
  onRate?(star: number): void;
  busyStar?: number;
  busyAttrs?(star: number): ButtonHTMLAttributes<HTMLButtonElement>;
}) {
  const score = Math.max(0, Math.min(5, value));
  const current = Math.round(score);
  return <span data-rating-stars="" aria-hidden={onRate ? undefined : true}>
    {[1, 2, 3, 4, 5].map(star => onRate
      ? <button key={star} type="button" data-rate={star} data-on={String(star <= current)}
        title={star === current ? 'Click again to clear the rating' : `${star} stars`}
        aria-label={star === current ? `Clear rating (currently ${star} stars)` : `Rate ${star} stars`}
        {...busyAttrs?.(star)} aria-disabled={busyStar ? true : undefined} aria-busy={busyStar === star || undefined}
        onClick={() => { if (!busyStar) onRate(star) }}>
        {busyStar === star ? <span dangerouslySetInnerHTML={{ __html: spinnerHtml('Saving rating') }} /> : <Star />}
      </button>
      : <span key={star} data-rate={star} data-on={String(score >= star)}>
        <span data-rating-icon=""><Star />
          {/* oxlint-disable-next-line shadcn/no-inline-styles -- the star fill width represents the fractional part of the rating */}
          <span data-rating-fill="" style={{ width: `${Math.max(0, Math.min(1, score - star + 1)) * 100}%` }}><Star /></span>
        </span>
      </span>)}
  </span>;
}
