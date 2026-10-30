/* Page-wide sharing of the library list: the shell's library switcher fetches `/api/libraries` once per load and hands it over here,
 * so card source colors and list-row library names read this copy directly instead of each making its own request. Source colors follow the server configuration
 * (`media.library_catalog`, ADR-0116); this machine only caches the last colors, so first-paint cards have color without waiting for the API. */

export interface LibraryRow {
  id: string; name: string; icon?: string; color?: string; policy?: string;
  roots?: { root_id?: string; location: string }[];
}

const CACHE_KEY = 'peach.library-colors.v1';
let rows: readonly LibraryRow[] | null = null;
const listeners = new Set<(rows: readonly LibraryRow[]) => void>();

/** The colors the server last gave, `{library_id: accent key}`, used only for first paint. */
export function cachedLibraryColors(): Record<string, string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    return value && typeof value === 'object' ? value as Record<string, string> : {};
  } catch {
    return {};
  }
}

export function publishLibraries(next: readonly LibraryRow[]): void {
  rows = next;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(next.filter(row => row.color).map(row => [row.id, row.color]))));
  } catch { /* If it cannot be stored, next time the first paint waits for the API before coloring. */ }
  listeners.forEach(listener => listener(next));
}

export function publishedLibraries(): readonly LibraryRow[] | null {
  return rows;
}

export function onLibraries(listener: (rows: readonly LibraryRow[]) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener) };
}
