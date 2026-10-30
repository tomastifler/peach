/* 媒体目录的行：配置页「这台电脑」与首启页共用。
 *
 * Each row is an outlined card: the path box, "Choose folder", the remove key when there are several rows, and below them two rows grouped by meaning, each cell with a label above:
 * first how this folder is read (source, reading policy), then which library it appears as (owner, name; the settings page also has an icon). Adding and removing rows,
 * 按行错误、新行接焦点与选择文件夹的忙态归 `useFolderRows`；弹系统对话框那一请求由调用方注入，这里不认识任何端点，首启页的独立
 * 页面包因此不必带上主界面的请求封装。 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { RiDeleteBinLine } from '@remixicon/react';
import { MEDIA_SOURCE_ICONS } from '@peach/legacy/ui';

import { IconButton } from '@/components/base/buttons/icon-button';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { Label } from '@/components/base/input/label';
import { Select, SelectItem } from '@/components/base/select/select';
import { cx } from '@/utils/cx';

import { ErrorText, Help, SourceMark } from './section';
import { busyProps } from './busy-props';
import { CLOUD_LOCATIONS, MEDIA_SOURCE_OPTIONS, type SourceCost } from '../../core/media-sources';

/** 「选择文件夹」弹系统对话框去挑，全站用雪碧图的 `folder-search`；`folder-open` 归「打开位置」，
 * Remix Icon 里没有这一枚。 */
export function FolderSearchIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" className={className}>
      <use href="#i-folder-search" />
    </svg>
  );
}

export type SourceOption = readonly [kind: string, name: string];

export const MEDIA_SOURCES: readonly SourceOption[] = MEDIA_SOURCE_OPTIONS;

export const sourceMark = (location: string) => MEDIA_SOURCE_ICONS[location] || 'database';
export const isCloudSource = (location: string) => CLOUD_LOCATIONS.includes(location);

/** One cell in a row: a block-level label above and the control below. The label is written only for sighted people; the control's accessible name comes from its own numbered
 *  `aria-label` , and the label text is part of it, so screen readers and voice input can also find it by what they see. */
export function FolderField({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={cx('flex min-w-0 flex-col gap-1', className)}>
      <Label elementType="span" aria-hidden>{label}</Label>
      {children}
    </div>
  );
}

/** A row of fields. Side by side when wide enough, wrapping cell by cell when narrow; aligned to the top, so with equal-height labels the controls line up too, and an error message under one cell only grows downward. */
export function FolderFieldLine({ children }: { children: ReactNode }) {
  return <div className="flex w-full flex-wrap items-start gap-2">{children}</div>;
}

export function MediaReadPolicy({ index, cost, error, onChange }: {
  index: number; cost: SourceCost | ''; error?: string; onChange(cost: SourceCost): void;
}) {
  return <div data-media-read-policy={index} className="flex w-full flex-col gap-1 @lg:w-32">
    <Label elementType="span" aria-hidden>Reading policy</Label>
    <Select aria-label={`Media reading policy ${index + 1}`} placeholder="Choose reading policy" isRequired
      validationBehavior="aria" isInvalid={Boolean(error)} selectedKey={cost || null}
      onSelectionChange={(key) => { if (key === 'free' || key === 'metered') onChange(key); }}>
      <SelectItem id="free">Normal reads</SelectItem>
      <SelectItem id="metered">Proxy protection</SelectItem>
    </Select>
    {error ? <ErrorText>{error}</ErrorText> : null}
  </div>;
}

export function MediaReadPolicyHelp() {
  return <Help>When the reading policy is "Proxy protection", automatic video reads are restricted.</Help>;
}

export interface FolderRowValue { path: string; location: string }

/** 行状态。`pickFolder` 拿当前路径作对话框起点，返回选中的路径，取消返回 null；
 * 失败抛出的原因经 `describe` 变成写在这一行下面的那句话。 */
export function useFolderRows<T extends FolderRowValue>({ initial, blank, pickFolder, describe, focusAfterPick = false }: {
  initial: () => T[];
  blank: () => T;
  pickFolder: (initial: string) => Promise<string | null>;
  describe: (cause: unknown) => string;
  /** 选完把焦点交回这一行的路径框（首启页）；配置页留在选择键上。 */
  focusAfterPick?: boolean;
}) {
  const [rows, setRows] = useState(initial);
  const [errors, setErrors] = useState<string[]>([]);
  const [focusRow, setFocusRow] = useState<number | null>(null);
  const [picking, setPicking] = useState<number | null>(null);
  const pickingNow = useRef(false);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  // 新加的一行直接接过焦点：添加之后下一步一定是往里打路径。
  useLayoutEffect(() => {
    if (focusRow === null) return;
    inputs.current[focusRow]?.focus();
    setFocusRow(null);
  }, [focusRow]);

  const edit = (index: number, patch: Partial<T>) =>
    setRows((list) => list.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const setRowError = (index: number, message: string) => setErrors((list) => {
    const next = [...list];
    while (next.length <= index) next.push('');
    next[index] = message;
    return next;
  });
  const add = () => {
    setFocusRow(rows.length);
    setRows((list) => [...list, blank()]);
  };
  const remove = (index: number) => {
    setRows((list) => list.filter((_, i) => i !== index));
    setErrors((list) => list.filter((_, i) => i !== index));
  };

  // 对话框开着的时候这一行的选择键置忙；取消什么也不改，打不开时原因写在这一行下面。
  const pick = async (index: number) => {
    if (pickingNow.current) return;
    pickingNow.current = true;
    setPicking(index);
    try {
      const path = await pickFolder(rows[index]?.path ?? '');
      if (path) {
        edit(index, { path } as Partial<T>);
        setRowError(index, '');
      }
      if (focusAfterPick) setFocusRow(index);
    } catch (cause) {
      setRowError(index, describe(cause));
    } finally {
      pickingNow.current = false;
      setPicking(null);
    }
  };

  const inputRef = (index: number) => (element: HTMLInputElement | null) => { inputs.current[index] = element; };
  return { rows, edit, add, remove, errors, setErrors, picking, pick, inputRef };
}

/** 一行描边卡。`label` 是路径框的无障碍名，`children` 排进路径下面那一格。`error` 原样放进路径框
 * 下的提示，调用方可以传一段带 `role="alert"` 的节点让读屏播报。`status` 排在路径框右侧，
 * 配置页用它标这个文件夹此刻在不在线。 */
export function FolderRow({ label, path, onPath, error, inputRef, picking, onPick, onRemove, status, children }: {
  label: string;
  path: string;
  onPath: (path: string) => void;
  error?: ReactNode;
  inputRef: (element: HTMLInputElement | null) => void;
  picking: boolean;
  onPick: () => void;
  onRemove?: () => void;
  status?: ReactNode;
  children: ReactNode;
}) {
  /* 一组文件夹常共用很长的前缀，窄框里露开头的话每行都是同一段；不在编辑时露末段，
     分得出是哪一个文件夹。全文在 title 里。 */
  const box = useRef<HTMLInputElement | null>(null);
  const showTail = () => {
    const input = box.current;
    if (input && input.ownerDocument.activeElement !== input) input.scrollLeft = input.scrollWidth;
  };
  useLayoutEffect(() => {
    if (box.current) box.current.title = path;
    showTail();
  }, [path]);
  const attach = (element: HTMLInputElement | null) => {
    box.current = element;
    inputRef(element);
  };
  return (
    <div data-folder-row className="@container flex flex-col gap-2 rounded-2lg border border-separator-border bg-background-primary-default p-3">
      <div className="flex items-start gap-2">
        <Input className="min-w-0 flex-1" aria-label={label} placeholder="Media folder path"
          value={path} onChange={onPath} ref={attach}
          onBlur={() => requestAnimationFrame(showTail)}
          validationBehavior="aria" isInvalid={Boolean(error)} hint={error || undefined} />
        {status ? <div className="flex h-9 shrink-0 items-center">{status}</div> : null}
        <IconButton icon={FolderSearchIcon} aria-label="Choose folder" onClick={onPick} {...busyProps(picking)} />
        {onRemove ? <Button variant="danger" iconOnly leadingIcon={RiDeleteBinLine} aria-label="Remove this folder" onClick={onRemove} /> : null}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        {children}
      </div>
    </div>
  );
}

/** Media source dropdown, each item with a site mark; the local disk is the sprite's `hard-drive`. The label above reads "Source",
 * and the accessible name comes from the numbered `aria-label`. */
export function SourceSelect({ index, value, onChange, options = MEDIA_SOURCES }: {
  index: number;
  value: string;
  onChange: (location: string) => void;
  options?: readonly SourceOption[];
}) {
  return (
    <FolderField label="Source" className="w-full @lg:w-60">
      <Select className="w-full" aria-label={`Media source ${index + 1}`} selectedKey={value}
        onSelectionChange={(key) => { if (key !== null) onChange(String(key)); }}>
        {options.map(([kind, name]) => (
          <SelectItem key={kind} id={kind} textValue={name}><SourceMark mark={sourceMark(kind)} />{name}</SelectItem>
        ))}
      </Select>
    </FolderField>
  );
}
