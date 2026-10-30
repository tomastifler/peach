/* 弹层该挂到哪个容器里。
 *
 * The default one is at the end of `body` (`overlayContainer` in `providers.tsx`), which is enough for full-page islands.
 * The detail popup is not: the stage opens a native `<dialog>` with `showModal()`, and top-layer elements rank above every z-index
 * - an overlay placed on `body` is completely covered by the detail page, no z-index can beat the top layer, and being covered looks
 * on screen exactly like "the overlay was not drawn". So overlays are mounted into the already-open dialog; if none is found, `body` is used.
 * The stage provides this container uniformly at its own level (`UNSAFE_PortalProvider` in `stage.tsx`), so overlays,
 * dropdowns and popovers in the details need not each wrap their own layer.
 *
 * token、Preflight 与焦点规则都作用在 `.peach-react` 上，所以容器自己带这个类。
 * 每个 dialog 复用同一个容器，弹层关掉之后它留在那儿，下一次不必再建。
 */
function hostIn(parent: HTMLElement): HTMLElement {
  const existing = parent.querySelector<HTMLElement>(':scope > [data-react-overlays]');
  if (existing) return existing;
  const host = parent.ownerDocument.createElement('div');
  host.className = 'peach-react';
  host.dataset.reactOverlays = '';
  parent.append(host);
  return host;
}

/** `node` 所在的那一层该用的弹层容器。 */
export function overlayHost(node: Element | null | undefined): HTMLElement {
  const document = node?.ownerDocument ?? globalThis.document;
  const modal = node?.closest('dialog[open]');
  return hostIn((modal as HTMLElement | null) ?? document.body);
}

const LAYER = '[role="dialog"],[role="listbox"],[role="menu"]';

/** The dialog, list or menu of the topmost overlay layer inside `modal`; `null` when no layer is open.
 *  The container also holds non-overlay nodes such as focus-scope sentinels, so take the first one from the back that is a layer or contains one. */
export function topOverlay(modal: HTMLElement): HTMLElement | null {
  const host = modal.querySelector(':scope > [data-react-overlays]');
  for (let node = host?.lastElementChild; node; node = node.previousElementSibling) {
    const layer = node.matches(LAYER) ? node as HTMLElement : node.querySelector<HTMLElement>(LAYER);
    if (layer) return layer;
  }
  return null;
}

/** The site-wide Toast stack (`#toasts`) follows modal dialogs in and out: pass the open dialog to move it inside, pass `null` to put it back in `body`.
 *  When the stack stays on `body` it is completely covered by the top-layer detail popup, so a receipt is sent but cannot be seen; moved into the dialog it sits above it,
 *  and does not land in the inert area outside the modal dialog, so "Undo" can still be clicked. Before the dialog is unmounted it must be put back,
 *  otherwise the stack leaves the document along with the dialog. */
export function adoptToasts(modal: HTMLDialogElement | null): void {
  const host = document.getElementById('toasts');
  const parent = modal?.open ? modal : document.body;
  if (host && host.parentElement !== parent) parent.append(host);
}
