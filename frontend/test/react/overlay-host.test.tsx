import { UNSAFE_PortalProvider } from 'react-aria';
import { expect, it, vi } from 'vitest';

import { ModalFrame } from '../../src/react/components/modal-frame';
import { overlayHost, topOverlay } from '../../src/react/components/overlay-host';
import { mountRoot } from './render';

function stage(): HTMLDialogElement {
  const dialog = document.createElement('dialog');
  dialog.open = true;
  document.body.append(dialog);
  return dialog;
}

it('真实模态弹层末尾有焦点哨兵时仍取得对话框，卸载后没有弹层', async () => {
  const dialog = stage();
  const host = overlayHost(dialog);
  const root = await mountRoot(
    <UNSAFE_PortalProvider getContainer={() => host}>
      <ModalFrame isOpen onOpenChange={vi.fn()} width="form" label="资源">
        <button type="button">关闭</button>
      </ModalFrame>
    </UNSAFE_PortalProvider>,
  );
  const layer = host.querySelector<HTMLElement>('[role="dialog"]');
  expect(layer).not.toBeNull();
  expect(host.lastElementChild?.hasAttribute('data-focus-scope-end')).toBe(true);
  expect(topOverlay(dialog)).toBe(layer);
  await root.unmount();
  expect(topOverlay(dialog)).toBeNull();
});

it('多层弹层按实际角色节点取末层，忽略两侧的焦点哨兵', () => {
  const dialog = stage();
  const host = overlayHost(dialog);
  host.innerHTML = '<span hidden data-focus-scope-start></span><div role="dialog"></div><span hidden data-focus-scope-end></span><span hidden data-focus-scope-start></span><div role="listbox"></div><span hidden data-focus-scope-end></span>';
  const list = host.querySelector<HTMLElement>('[role="listbox"]')!;
  expect(topOverlay(dialog)).toBe(list);
  list.remove();
  expect(topOverlay(dialog)).toBe(host.querySelector('[role="dialog"]'));
});

it('只查当前详情的弹层宿主，不接管页面其他对话框', () => {
  const dialog = stage();
  const other = document.createElement('div');
  other.setAttribute('role', 'dialog');
  document.body.append(other);
  expect(topOverlay(dialog)).toBeNull();
  overlayHost(dialog);
  expect(topOverlay(dialog)).toBeNull();
});
