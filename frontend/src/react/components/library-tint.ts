/* Library source color: the color is bound to `library_id`, stored in the configured `media.library_catalog` (ADR-0116), and by default there is no tint.
 * Cards and list rows only carry `data-library`, and a style sheet injected here supplies `--library-color`,
 * so each card need not re-render on its own.
 *
 * The library list comes from `library-catalog`: the shell fetches it once per load and no extra request is sent here; only where the shell is absent (tests,
 * standalone islands) and a library name must be shown does this fetch on its own. On first paint, colors are laid out from the last color cached on this machine.
 * Color values are not written separately: each tier takes the `--color-accent-500` of the `[data-accent-ball=…]` group, the same source as the settings panel's color balls. */
import { useSyncExternalStore } from 'react';
import { MEDIA_SOURCE_ICONS } from '@peach/legacy/ui';
import { apiGet } from '../../api';
import { cachedLibraryColors, onLibraries, publishLibraries, publishedLibraries, type LibraryRow } from '../../library-catalog';

export interface LibraryTint { id: string; name: string; icon: string; location: string; color: string }

let tints: ReadonlyMap<string, LibraryTint> = new Map();
let requested = false;
const listeners = new Set<() => void>();

function accentValue(key: string): string {
  const probe = document.createElement('span');
  probe.setAttribute('data-accent-ball', key);
  probe.hidden = true;
  document.body.append(probe);
  const value = getComputedStyle(probe).getPropertyValue('--color-accent-500').trim();
  probe.remove();
  return value;
}

function paint(next: ReadonlyMap<string, LibraryTint>) {
  tints = next;
  let sheet = document.getElementById('peach-library-tints');
  if (!sheet) {
    sheet = document.createElement('style');
    sheet.id = 'peach-library-tints';
    document.head.append(sheet);
  }
  sheet.textContent = [...tints.values()].filter(tint => tint.color)
    .map(tint => `[data-library="${CSS.escape(tint.id)}"]{--library-color:${accentValue(tint.color)}}`).join('\n');
}

function publish(next: ReadonlyMap<string, LibraryTint>) {
  paint(next);
  listeners.forEach(listener => listener());
}

// The icon name is swapped for a shape from the same table as the sidebar library switcher: source names take the source mark, and the rest are sprite glyphs.
const fromRows = (rows: readonly LibraryRow[]) => new Map(rows.map(row => [row.id, {
  id: row.id, name: row.name, icon: MEDIA_SOURCE_ICONS[row.icon || ''] || row.icon || 'database',
  location: row.roots?.[0]?.location || '', color: row.color || '',
}]));

let seeded = false;
function seed() {
  if (seeded) return;
  seeded = true;
  onLibraries(rows => publish(fromRows(rows)));
  const known = publishedLibraries();
  if (known) { paint(fromRows(known)); return }
  const colors = Object.entries(cachedLibraryColors()).filter(([, color]) => color);
  if (colors.length) paint(new Map(colors.map(([id, color]) => [id, { id, name: '', icon: 'database', location: '', color }])));
}

function load() {
  if (requested || publishedLibraries()) return;
  requested = true;
  void apiGet<{ libraries?: LibraryRow[] }>('/api/libraries')
    .then(body => publishLibraries(body.libraries || []))
    .catch(() => { requested = false });
}

/** When the settings page changes a color, try it on this page first; after saving, the color given by the server takes over. */
export function previewLibraryColor(id: string, color: string) {
  const current = tints.get(id) ?? { id, name: '', icon: 'database', location: '', color: '' };
  publish(new Map([...tints, [id, { ...current, color }]]));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener) };
}

/** Read the source color by `library_id`. Places that show a library name and site mark pass `names`; only when the shell gave no list is `/api/libraries` fetched once. */
export function useLibraryTints({ names = false }: { names?: boolean } = {}): ReadonlyMap<string, LibraryTint> {
  seed();
  if (names) load();
  return useSyncExternalStore(subscribe, () => tints, () => tints);
}
