import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import type { PluginOption } from 'vite';

export const browserArtifacts = fileURLToPath(new URL('../../build/sentry/browser', import.meta.url));
const publicDist = fileURLToPath(new URL('../../web/dist', import.meta.url));
const debugIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/** Chunks other than the fixed-name entries: `<artifact name>.<name>-<hash>.js`, matching the shape the server allows (ADR-0118). */
const chunkPattern = (bundleName: string) => new RegExp(`^${bundleName}\\.[A-Za-z0-9_-]+\\.js$`);

/** A JavaScript file and its map share the officially injected Debug ID. */
function assertDebugId(directory: string, name: string): void {
  const javascript = readFileSync(resolve(directory, name), 'utf8');
  const map = JSON.parse(readFileSync(resolve(directory, `${name}.map`), 'utf8'));
  const debugId = javascript.match(/\/\/# debugId=([a-f0-9-]+)\s*$/i)?.[1];
  if (!debugId || !debugIdPattern.test(debugId) || map.debug_id !== debugId || !map.sourcesContent?.length) {
    throw new Error(`The JavaScript, source map and Debug ID of ${name} must match`);
  }
}

/** Production JavaScript and maps share the officially injected Debug ID; the public directory only accepts JS and CSS.
 *  Chunks left by the previous build are deleted first: their names carry hashes, and if not deleted they would stay in `web/dist/` and be tracked by Git. */
export function browserSymbols(bundleName: 'peach-app' | 'peach-pages', destination = process.env.PEACH_FRONTEND_OUT_DIR || publicDist): PluginOption[] {
  return [
    sentryVitePlugin({
      authToken: '', org: '', project: '', silent: true,
      telemetry: false,
      release: { name: '', inject: false, create: false, finalize: false, setCommits: false, deploy: false },
      sourcemaps: { disable: 'disable-upload' },
    }),
    {
      name: 'peach-publish-browser-assets',
      enforce: 'post',
      writeBundle: {
        sequential: true,
        handler(options, bundle) {
          const directory = resolve(options.dir || browserArtifacts);
          const entry = `${bundleName}.js`;
          const chunks = Object.values(bundle)
            .filter(output => output.type === 'chunk' && output.fileName !== entry)
            .map(output => output.fileName);
          const pattern = chunkPattern(bundleName);
          const strays = chunks.filter(name => !pattern.test(name));
          if (strays.length) throw new Error(`chunk names do not match the shape the server allows: ${strays.join(', ')}`);
          for (const name of [entry, ...chunks]) assertDebugId(directory, name);
          const target = resolve(destination);
          if (target === directory) throw new Error('The public artifact directory must be separate from the private source map directory');
          mkdirSync(target, { recursive: true });
          for (const name of readdirSync(target)) if (pattern.test(name)) rmSync(resolve(target, name));
          for (const name of [...chunks, entry, `${bundleName}.css`]) {
            copyFileSync(resolve(directory, name), resolve(target, name));
          }
        },
      },
    },
  ];
}
