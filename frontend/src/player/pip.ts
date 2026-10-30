import type { VjsPlayer } from './types';

interface PipButton extends HTMLElement {
  disabled: boolean;
  activate(media: unknown): Promise<unknown>;
}
interface WebkitVideo extends HTMLVideoElement {
  webkitSetPresentationMode?: (mode: string) => void;
  webkitPresentationMode?: string;
}

/** Keep the official picture-in-picture action, adding a stable placeholder, ready state and failure feedback. */
export function mountPlayerPipControl(player: VjsPlayer, button: HTMLElement | null,
  label: (text: string) => void, failure: (text: string) => void): void {
  const video = player.el().querySelector<WebkitVideo>('video');
  if (!video || !button) return;
  const pip = button as PipButton;
  const supported = (!!document.pictureInPictureEnabled && typeof video.requestPictureInPicture === 'function')
    || typeof video.webkitSetPresentationMode === 'function';
  pip.toggleAttribute('data-peach-pip-supported', supported);
  let unavailable = '';
  const setLabel = (text: string) => { pip.setAttribute('label', text); label(text) };
  const sync = () => {
    const active = document.pictureInPictureElement === video || video.webkitPresentationMode === 'picture-in-picture';
    const ready = video.readyState > 0 && video.videoWidth > 0 && !video.disablePictureInPicture;
    pip.disabled = !supported || !!unavailable || (!ready && !active);
    pip.setAttribute('aria-disabled', String(pip.disabled));
    pip.setAttribute('aria-pressed', String(active));
    setLabel(unavailable || (active ? 'Exit picture-in-picture' : ready ? 'Picture-in-picture' : 'Picture-in-picture (video loading)'));
  };
  const activate = pip.activate;
  pip.activate = async media => {
    try {
      return await activate.call(pip, media);
    } catch (cause) {
      if (player.isDisposed()) return;
      const name = cause instanceof DOMException ? cause.name : '';
      const message = name === 'InvalidStateError' ? 'The video is not ready yet; try picture-in-picture again shortly'
        : name === 'NotAllowedError' ? 'The browser did not allow picture-in-picture; click again to turn it on'
          : name === 'NotSupportedError' || name === 'SecurityError' ? 'This browser does not support picture-in-picture'
            : 'This browser cannot open picture-in-picture';
      if (name === 'NotSupportedError' || name === 'SecurityError') { unavailable = message; sync() }
      else setLabel(message);
      failure(message);
    }
  };
  const events = ['loadedmetadata', 'emptied', 'enterpictureinpicture', 'leavepictureinpicture', 'webkitpresentationmodechanged'];
  events.forEach(event => video.addEventListener(event, sync));
  sync();
  player.on('dispose', () => { events.forEach(event => video.removeEventListener(event, sync)); pip.activate = activate });
}
