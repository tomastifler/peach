import type { ButtonHTMLAttributes } from 'react';
import { spinnerHtml } from '@peach/legacy/ui';
import { spriteGlyph } from './sprite-glyph';
import './rating-stars.css';

const Star = spriteGlyph('star');

/** 五星读数与评分按钮共用图形、颜色和命中区。 */
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
        title={star === current ? '再点一次取消评分' : `${star} 星`}
        aria-label={star === current ? `取消评分（当前 ${star} 星）` : `评为 ${star} 星`}
        {...busyAttrs?.(star)} aria-disabled={busyStar ? true : undefined} aria-busy={busyStar === star || undefined}
        onClick={() => { if (!busyStar) onRate(star) }}>
        {busyStar === star ? <span dangerouslySetInnerHTML={{ __html: spinnerHtml('正在保存评分') }} /> : <Star />}
      </button>
      : <span key={star} data-rate={star} data-on={String(score >= star)}>
        <span data-rating-icon=""><Star />
          {/* oxlint-disable-next-line shadcn/no-inline-styles -- 星形填充宽度表示评分的小数比例 */}
          <span data-rating-fill="" style={{ width: `${Math.max(0, Math.min(1, score - star + 1)) * 100}%` }}><Star /></span>
        </span>
      </span>)}
  </span>;
}
