/* 编辑与确认沿用 formModal / confirmModal，表单字段复用 BoardUI。 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { confirmModal, formModal } from '@peach/legacy/ui';
import { Input } from '@/components/base/input/input';
import { Select, SelectItem } from '../components/select';
import { apiSend } from '../../api';
import { queryClient } from '../query';
import { showToast } from '../toaster';

export type TagId = number | string;
export type TagScope = 'local' | 'online';
export interface ManagedTag { entity_id?: number; id?: string; k: string; n: number; hidden: boolean; blocked?: boolean; aliases: string[]; cat?: string; favorite?: boolean }
export const managedTagId = (tag: ManagedTag): TagId => tag.id ?? tag.entity_id!;
export type Operation = 'rename' | 'merge' | 'hide' | 'restore' | 'repair' | 'block' | 'unblock';
export interface Command { operation: Operation; ids: TagId[]; name?: string; target_id?: TagId; scope?: TagScope }
interface Plan { token: string; name?: string; assets: number; overlap: number; tags: ManagedTag[] }
export const TAG_ACTION_LABELS: Record<Operation, string> = {
  rename: '重命名标签', merge: '合并标签', hide: '隐藏标签', restore: '恢复标签', repair: '整理重复标签',
  block: '屏蔽内容', unblock: '恢复内容',
};

export const previewTagOperation = (command: Command, signal?: AbortSignal) =>
  apiSend<Plan>('/api/tag-management/preview', command, 'POST', signal);

export async function confirmTagOperation(command: Command, plan: Plan, signal?: AbortSignal) {
  if (signal?.aborted) return false;
  const names = plan.tags.map(tag => `「${tag.k}」`).join('、');
  const consequence = command.operation === 'merge' || command.operation === 'repair'
    ? `合并 ${plan.tags.length} 个标签，涉及 ${plan.assets} 个资源，重叠关联 ${plan.overlap} 个。旧名称保留为别名。此操作无法直接撤销。`
    : command.operation === 'rename' ? `${names}将更名为「${plan.name || command.name}」，涉及 ${plan.assets} 个资源。旧名称保留为别名。`
      : command.operation === 'block' ? `屏蔽带有${names}任一标签的内容及其其它版本，涉及 ${plan.assets} 个资源。可在「已屏蔽内容」中恢复。`
        : command.operation === 'unblock' ? `解除${names}的内容屏蔽，涉及 ${plan.assets} 个资源。`
          : `${command.operation === 'hide' ? '隐藏' : '恢复'} ${plan.tags.length} 个标签，涉及 ${plan.assets} 个资源。${command.operation === 'hide' ? '可在“已隐藏”中恢复。' : ''}`;
  const done = await confirmModal({ title: TAG_ACTION_LABELS[command.operation], body: consequence,
    confirmLabel: TAG_ACTION_LABELS[command.operation], onConfirm: () => apiSend('/api/tag-management', { ...command, token: plan.token }, 'POST', signal) });
  if (!done.confirmed || signal?.aborted) return false;
  await queryClient.invalidateQueries();
  showToast(`tag-management-${Date.now()}`, { html: `已${TAG_ACTION_LABELS[command.operation]}`, alert: false, timeout: 6000, action: null });
  return true;
}

type FormDialog = ReturnType<typeof formModal>;
export function TagEditor({ operation, selected, close, done, scope = 'local' }: {
  operation: 'rename' | 'merge'; selected: ManagedTag[]; close(): void; done(): void; scope?: TagScope;
}) {
  const initial = useRef({ operation, selected, close, done, scope });
  const draft = useRef({ name: selected[0]?.k || '', target_id: selected[0] ? managedTagId(selected[0]) : 0 });
  const [view, setView] = useState<{ host: Element; dialog: FormDialog } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const given = initial.current;
    const dialog = formModal({ title: TAG_ACTION_LABELS[given.operation], confirmLabel: '预览影响范围', confirmDisabled: true,
      body: '<div class="peach-react" data-tag-editor-fields></div>',
      onConfirm: async () => {
        const command: Command = { operation: given.operation, ids: given.selected.map(managedTagId), ...(given.scope === 'online' ? { scope: given.scope } : {}),
          ...(given.operation === 'rename' ? { name: draft.current.name.trim() } : { target_id: draft.current.target_id }) };
        const plan = await previewTagOperation(command, controller.signal);
        return { command, plan };
      } });
    setView({ host: dialog.dialog.querySelector('[data-tag-editor-fields]')!, dialog });
    void dialog.done.then(async result => {
      if (controller.signal.aborted) return;
      if (result.confirmed) {
        const prepared = result.result as { command: Command; plan: Plan };
        if (await confirmTagOperation(prepared.command, prepared.plan, controller.signal)) given.done();
      }
      if (!controller.signal.aborted) given.close();
    });
    return () => { controller.abort(); dialog.close() };
  }, []);
  return view ? createPortal(<TagFields operation={initial.current.operation} selected={initial.current.selected} dialog={view.dialog}
    update={value => { draft.current = value }} />, view.host) : null;
}

function TagFields({ operation, selected, dialog, update }: {
  operation: 'rename' | 'merge'; selected: ManagedTag[]; dialog: FormDialog;
  update(value: { name: string; target_id: TagId }): void;
}) {
  const [name, setName] = useState(selected[0]?.k || '');
  const [target, setTarget] = useState<TagId>(selected[0] ? managedTagId(selected[0]) : 0);
  useEffect(() => {
    update({ name, target_id: target });
    dialog.confirmButton.disabled = operation === 'rename' && (!name.trim() || name.trim() === selected[0]?.k);
  }, [name, target, dialog, operation, selected, update]);
  return operation === 'rename' ? <Input autoFocus aria-label="标签名称" value={name} onChange={setName} maxLength={80} />
    : <Select aria-label="保留的标签" prefix="保留" selectedKey={String(target)} onSelectionChange={key => {
      const row = selected.find(tag => String(managedTagId(tag)) === String(key)); if (row) setTarget(managedTagId(row));
    }}>
      {selected.map(row => <SelectItem key={managedTagId(row)} id={String(managedTagId(row))}>{row.k}</SelectItem>)}
    </Select>;
}
