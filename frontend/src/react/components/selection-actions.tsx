import type { ReactNode } from 'react';
import { RiArrowRightLine } from '@remixicon/react';
import { Button } from '@/components/base/buttons/button';
import { LinkButton } from '@/components/base/buttons/link-button';
import { cx } from '@/utils/cx';

export type SelectionAction = { label: string; disabled?: boolean } & (
  { onPress(): void; href?: never } | { href: string; onPress?: never }
);

/** 短操作并排，长操作各占整行；文字保持一行。 */
export function SelectionActions({ actions, layout = 'inline', prefix, onNavigate }: {
  actions: readonly SelectionAction[];
  layout?: 'inline' | 'fullWidth';
  prefix?: ReactNode;
  onNavigate?(): void;
}) {
  return <div data-selection-actions="" data-action-layout={layout}
    className={cx('flex gap-2', layout === 'inline' ? 'flex-nowrap items-center' : 'flex-col')}>
    {prefix}
    {actions.map(action => action.href !== undefined
      ? <LinkButton key={action.label} size="small" href={action.href} trailingIcon={RiArrowRightLine}
          className={layout === 'inline' ? 'shrink-0' : 'w-full'}
          disabled={action.disabled} onClick={onNavigate}>{action.label}</LinkButton>
      : <Button key={action.label} variant="ghost" size="small" disabled={action.disabled}
          className={layout === 'inline' ? 'shrink-0' : 'w-full'}
          onClick={action.onPress}>{action.label}</Button>)}
  </div>;
}
