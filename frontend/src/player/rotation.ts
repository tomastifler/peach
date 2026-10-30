import type { VjsPlayer } from './types';
import { playerMemory } from './memory';

/** 旋转原生画面；控制条保持正向，尺寸跟随播放器及媒体元数据。 */
export function mountPlayerRotation(player: VjsPlayer, video: HTMLVideoElement) {
  let angle = 0, touched = false;
  const memory = playerMemory(player);
  const root = player.el();
  const container = root.querySelector('media-container') || root;
  const properties = ['width', 'height', 'inset', 'left', 'top', 'transform', 'object-fit'] as const;
  const original = properties.map(property => [property, video.style.getPropertyValue(property)] as const);
  const restore = () => original.forEach(([property, value]) => {
    if (value) video.style.setProperty(property, value); else video.style.removeProperty(property);
  });
  const sync = () => {
    restore();
    if (!angle) return;
    video.style.objectFit = 'contain';
    const width = container.clientWidth, height = container.clientHeight;
    if (angle % 180 && width > 0 && height > 0) {
      video.style.width = `${height}px`; video.style.height = `${width}px`;
      video.style.inset = 'auto'; video.style.left = '50%'; video.style.top = '50%';
      video.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;
    } else {
      video.style.transform = `rotate(${angle}deg)`;
    }
  };
  const observer = new ResizeObserver(sync);
  memory.restore(saved => {
    if (!touched && !player.isDisposed() && saved.rotation !== undefined) { angle = saved.rotation; sync() }
  });
  observer.observe(container);
  video.addEventListener('loadedmetadata', sync);
  video.addEventListener('resize', sync);
  player.on('dispose', () => {
    observer.disconnect();
    video.removeEventListener('loadedmetadata', sync);
    video.removeEventListener('resize', sync);
    restore();
  });
  return { angle: () => angle, set: (next: number) => {
    touched = true; angle = next; sync(); void memory.save({ rotation: angle }).catch(() => {});
  } };
}
