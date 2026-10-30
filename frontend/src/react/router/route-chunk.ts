/* Low-frequency page code is split into independent per-page chunks (ADR-0118): the route table's first-screen data stage loads in parallel with API requests, and the page is drawn synchronously once everything is in.
 *
 * Does not use `React.lazy`: the page must be drawn with `flushSync` in the same task once `openManagedRoute` has everything, and a lazy component's first render
 * always throws a thenable once, which amounts to drawing one extra blank frame. Here `get()` is only called after `preload()` has landed.
 *
 * A load failure when opening a page may mean the server has switched to a new build and the chunk the old entry points to is gone: if the service is still alive, reload the whole page once to pick up the new entry,
 * reloading only once within a short time in the same session; if the server is unreachable the error is thrown as usual and handed to the page's error boundary. An idle-preload failure does not reload; it is retried when the page is opened. */

export interface RouteChunk<M> {
  /** Loads this page's module when the page is opened. A failed attempt is not remembered and is retried the next time it is opened. */
  preload(): Promise<M>;
  /** The loaded module; throws if it is not loaded yet. */
  get(): M;
}

const warmers: (() => Promise<unknown>)[] = [];
const RELOAD_KEY = 'peach.chunkReloadAt';
const RELOAD_WINDOW_MS = 30_000;

async function recoverStaleBuild(): Promise<void> {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < RELOAD_WINDOW_MS) return;
    const health = await fetch('/healthz', { cache: 'no-store', credentials: 'same-origin' });
    if (!health.ok) return;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    location.reload();
  } catch {
    // Server unreachable or storage unavailable: do not reload; the error goes to the caller.
  }
}

export function routeChunk<M>(load: () => Promise<M>): RouteChunk<M> {
  let loaded: { module: M } | null = null;
  let pending: Promise<M> | null = null;
  const attempt = (): Promise<M> => pending ??= load().then(
    (module) => { loaded = { module }; return module },
    (error: unknown) => { pending = null; throw error },
  );
  warmers.push(attempt);
  return {
    preload: () => attempt().catch(async (error: unknown) => { await recoverStaleBuild(); throw error }),
    get: () => {
      if (!loaded) throw new Error('Page code is not loaded yet');
      return loaded.module;
    },
  };
}

/** Loads all low-frequency pages immediately. Places that call the route table's `page()` directly without the first-screen data stage (component tests) wait for it first. */
export function loadRouteChunks(): Promise<void> {
  return Promise.all(warmers.map(warm => warm())).then(() => {});
}

/** Once the first screen is stable, loads all low-frequency pages one by one while the browser is idle, so the first visit to these pages no longer waits for code. Environments without
 *  `requestIdleCallback` do not preload and load as usual on open. */
export function warmRouteChunks(): void {
  const idle = globalThis.requestIdleCallback;
  if (typeof idle !== 'function') return;
  const queue = [...warmers];
  const next = () => {
    const warm = queue.shift();
    if (warm) idle(() => { void warm().catch(() => {}).finally(next) }, { timeout: 10_000 });
  };
  if (document.readyState === 'complete') next();
  else window.addEventListener('load', next, { once: true });
}
