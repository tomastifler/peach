import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import type { PluginOption } from 'vite';

export const browserArtifacts = fileURLToPath(new URL('../../build/sentry/browser', import.meta.url));
const publicDist = fileURLToPath(new URL('../../web/dist', import.meta.url));
const debugIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/** 入口固定名之外的 chunk：`<产物名>.<名字>-<哈希>.js`，与服务端放行的形态一致（ADR-0118）。 */
const chunkPattern = (bundleName: string) => new RegExp(`^${bundleName}\\.[A-Za-z0-9_-]+\\.js$`);

/** 一份 JavaScript 与它的 map 共用官方注入的 Debug ID。 */
function assertDebugId(directory: string, name: string): void {
  const javascript = readFileSync(resolve(directory, name), 'utf8');
  const map = JSON.parse(readFileSync(resolve(directory, `${name}.map`), 'utf8'));
  const debugId = javascript.match(/\/\/# debugId=([a-f0-9-]+)\s*$/i)?.[1];
  if (!debugId || !debugIdPattern.test(debugId) || map.debug_id !== debugId || !map.sourcesContent?.length) {
    throw new Error(`${name} 的 JavaScript、source map 和 Debug ID 必须匹配`);
  }
}

/** 正式 JavaScript 与 map 共用官方注入的 Debug ID；公开目录只接收 JS 和 CSS。
 *  上一次构建留下的 chunk 先删掉：名字带哈希，不删就会一直留在 `web/dist/` 里被 Git 跟踪。 */
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
          if (strays.length) throw new Error(`chunk 名字不合服务端放行的形态：${strays.join('、')}`);
          for (const name of [entry, ...chunks]) assertDebugId(directory, name);
          const target = resolve(destination);
          if (target === directory) throw new Error('公开产物目录必须与私有 source map 目录分开');
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
