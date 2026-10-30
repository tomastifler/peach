/* Each video shares one read and commits serially by identity; all settings are saved in the subtitle manifest file. */
import { api } from '@peach/legacy/core';
import type { CaptionStyle } from './subtitle-style';
import type { VjsPlayer } from './types';

export interface PlayerMemoryValue {
  selected: string | null;
  tracks: { key: string; name: string; src: string }[];
  rotation?: number;
  rate?: number;
  caption_style?: Partial<CaptionStyle>;
}
export type PlayerMemoryPatch = Partial<Omit<PlayerMemoryValue, 'tracks'>> & {
  track?: { key: string; name: string; text: string };
};
const pending = new Map<string, Promise<unknown>>();
const sessions = new WeakMap<VjsPlayer, PlayerMemory>();

class PlayerMemory {
  private cleanup = new AbortController();
  private reading: Promise<PlayerMemoryValue> | undefined;
  private listeners = new Set<() => void>();
  private restorers = new Set<(value: PlayerMemoryValue) => void>();
  private restored: PlayerMemoryValue | undefined;
  private unsaved: PlayerMemoryPatch = {};
  private url: string;
  error = '';

  constructor(player: VjsPlayer) {
    const identity = player.peachPlaybackKey || (player.peachItem?.id ? `item:${player.peachItem.id}` : '');
    this.url = identity ? `/api/player/memory?video=${encodeURIComponent(identity)}` : '';
    player.on('dispose', () => { this.cleanup.abort(); this.listeners.clear(); this.restorers.clear() });
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener) };
  }
  private changed() { if (!this.cleanup.signal.aborted) this.listeners.forEach(listener => listener()) }
  restore(apply: (value: PlayerMemoryValue) => void) {
    this.restorers.add(apply);
    if (this.restored) apply(this.restored);
    else void this.load().catch(() => {});
  }
  load() {
    if (!this.url) return Promise.resolve({ selected: null, tracks: [] } as PlayerMemoryValue);
    return this.reading ||= (async () => {
      await pending.get(this.url)?.catch(() => {});
      const value = await api(this.url, { signal: this.cleanup.signal }) as PlayerMemoryValue;
      if (!this.cleanup.signal.aborted) {
        this.restored = value; this.restorers.forEach(apply => apply(value)); this.changed();
      }
      return value;
    })().catch(error => {
      this.reading = undefined;
      if (!this.cleanup.signal.aborted) { this.error = 'Playback memory not loaded; try again'; this.changed() }
      throw error;
    });
  }
  save(value: PlayerMemoryPatch) {
    if (!this.url) return Promise.resolve();
    const task = (pending.get(this.url) || Promise.resolve()).catch(() => {}).then(async () => {
      const patch = { ...this.unsaved, ...value,
        ...(value.caption_style ? { caption_style: { ...this.unsaved.caption_style, ...value.caption_style } } : {}) };
      try {
        const response = await fetch(this.url, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch), keepalive: !patch.track });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error || body?.detail || 'Playback memory not saved; try again');
        }
        this.unsaved = {}; this.error = '';
      } catch (error) {
        this.unsaved = patch;
        this.error = error instanceof Error ? error.message : 'Playback memory not saved; try again';
        throw error;
      } finally { this.changed() }
    });
    pending.set(this.url, task);
    void task.finally(() => { if (pending.get(this.url) === task) pending.delete(this.url) }).catch(() => {});
    return task;
  }
  async retry() {
    try {
      if (Object.keys(this.unsaved).length) await this.save({ ...this.unsaved });
      else { this.reading = undefined; await this.load(); this.error = ''; this.changed() }
    } catch { /* Keep the reason and retry entry in place */ }
  }
}

export function playerMemory(player: VjsPlayer) {
  let memory = sessions.get(player);
  if (!memory) { memory = new PlayerMemory(player); sessions.set(player, memory) }
  return memory;
}

/** Playback speed is only written when the user picks it; after the media source changes, the same video's settings are restored. */
export function mountPlaybackRate(player: VjsPlayer, video: HTMLVideoElement) {
  const memory = playerMemory(player);
  let rate = Number(player.playbackRate()) || 1, touched = false;
  const apply = () => {
    video.defaultPlaybackRate = rate;
    if (Number(player.playbackRate()) !== rate) player.playbackRate(rate);
  };
  memory.restore(saved => {
    if (!touched && !player.isDisposed() && saved.rate !== undefined) { rate = saved.rate; apply() }
  });
  video.addEventListener('loadedmetadata', apply);
  player.on('dispose', () => video.removeEventListener('loadedmetadata', apply));
  return {
    current: () => rate,
    set(next: number) {
      touched = true; rate = next; apply();
      void memory.save({ rate }).catch(() => {});
    },
  };
}
