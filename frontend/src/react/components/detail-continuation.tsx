import type { ReactNode } from 'react';

/** 详情底部：当前作品的分集队列与后续推荐共享一行。 */
export function DetailContinuation({ queue, children, queueCards }: { queue: ReactNode; children: ReactNode; queueCards?: number }) {
  return <div data-detail-continuation="" data-queue-cards={queueCards == null ? undefined : Math.min(3, queueCards)}>{queue}{children}</div>;
}
