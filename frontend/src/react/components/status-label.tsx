import type { HTMLAttributes } from 'react';
import { Chip } from '@/components/base/badges/chip';

export type StatusTone = 'success' | 'progress' | 'warning' | 'error' | 'neutral';
export const STATUS_COLORS = {
  success: 'lime', progress: 'blue', warning: 'yellow', error: 'rose', neutral: 'neutral',
} as const;

/** Stable results and configuration states use labels; connection states are handled by ConnectionStatus. */
export function StatusLabel({ tone = 'neutral', ...props }: Omit<HTMLAttributes<HTMLSpanElement>, 'color'> & { tone?: StatusTone }) {
  return <Chip data-status-tone={tone} variant="caption" color={STATUS_COLORS[tone]} {...props} />;
}
