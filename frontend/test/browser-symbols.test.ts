// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { SentryCli } from '@sentry/cli';
import { build } from 'vite';
import { afterEach, expect, it } from 'vitest';
import { browserSymbols } from '../scripts/sentry-build';
import { prepareBrowserUpload } from '../scripts/upload-sourcemaps';

const fixtures: string[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    if (!fixture.startsWith(realpathSync(tmpdir()))) throw new Error('临时目录必须属于系统临时目录');
    rmSync(fixture, { recursive: true, force: true });
  }
});

it('官方构建生成可复现 Debug ID，私有 map 可还原源码位置，公开目录只含正式文件与本次的 chunk', async () => {
  const root = realpathSync(mkdtempSync(resolve(tmpdir(), 'peach-symbols-')));
  fixtures.push(root);
  const directory = resolve(root, 'artifacts');
  const shipped = resolve(root, 'public');
  writeFileSync(resolve(root, 'fixture.ts'), 'import "./fixture.css";\nexport function fail() { throw new TypeError("symbolication fixture"); }\n'
    + 'export const later = () => import("./later.ts");\n');
  writeFileSync(resolve(root, 'later.ts'), 'export const value = "later chunk";\n');
  writeFileSync(resolve(root, 'fixture.css'), '.fixture { color: red; }\n');
  const compile = async (name: 'peach-app' | 'peach-pages') => {
    await build({
      // 公开目录就叫 `public`，不关掉 publicDir 的话 Vite 会把它整个抄回私有目录。
      configFile: false, root, logLevel: 'silent', publicDir: false,
      plugins: browserSymbols(name, shipped),
      build: {
        outDir: directory, emptyOutDir: false, sourcemap: 'hidden', minify: 'oxc',
        lib: { entry: resolve(root, 'fixture.ts'), formats: ['es'], fileName: () => `${name}.js`, cssFileName: name },
        rollupOptions: { output: {
          assetFileNames: `${name}.[ext]`, chunkFileNames: `${name}.[name]-[hash].js`,
          ...(name === 'peach-pages' ? { codeSplitting: false } : {}),
        } },
      },
    });
  };
  await compile('peach-app');
  const first = readFileSync(resolve(shipped, 'peach-app.js'), 'utf8');
  const chunk = readdirSync(shipped).find(name => /^peach-app\.later-[\w-]+\.js$/.test(name));
  expect(chunk).toBeDefined();
  expect(first).toContain(`import("./${chunk}")`);
  writeFileSync(resolve(shipped, 'peach-app.stale-Old00000.js'), 'previous build');
  await compile('peach-app');
  expect(readFileSync(resolve(shipped, 'peach-app.js'), 'utf8')).toBe(first);
  await compile('peach-pages');
  expect(readdirSync(shipped).sort()).toEqual(['peach-app.css', 'peach-app.js', chunk, 'peach-pages.css', 'peach-pages.js']);
  expect(first).not.toContain('sourceMappingURL');
  const mapPath = resolve(directory, 'peach-app.js.map');
  const map = JSON.parse(readFileSync(mapPath, 'utf8'));
  expect(map.sourceRoot).toBeUndefined();
  expect(map.sources.every((source: string) => !/^(?:[a-z]:|\/)/i.test(source))).toBe(true);
  expect(map.debug_id).toMatch(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
  expect(first).toContain(`//# debugId=${map.debug_id}`);
  const token = first.indexOf('TypeError("symbolication fixture")');
  expect(token).toBeGreaterThan(0);
  const before = first.slice(0, token).split('\n');
  const output = execFileSync(SentryCli.getPath(), [
    'sourcemaps', 'resolve', mapPath, '--line', String(before.length), '--column', String(before.at(-1)!.length),
  ], { encoding: 'utf8' });
  expect(output).toContain('fixture.ts');
  expect(output).toContain('symbolication fixture');
  const env = { SENTRY_AUTH_TOKEN: 'test-only', SENTRY_ORG: 'fixture', SENTRY_PROJECT: 'fixture' };
  expect(prepareBrowserUpload(env, directory, shipped)).toEqual([
    'sourcemaps', 'upload', '--validate', '--strict', '--wait', '--url-prefix', 'app:///', directory,
  ]);
  writeFileSync(resolve(shipped, 'peach-app.js'), 'mismatched bundle');
  expect(() => prepareBrowserUpload(env, directory, shipped)).toThrow('分发产物不一致');
  writeFileSync(resolve(shipped, 'peach-app.js'), first);
  writeFileSync(mapPath, JSON.stringify({ ...map, debug_id: 'invalid' }));
  expect(() => prepareBrowserUpload(env, directory, shipped)).toThrow('匹配的 source map');
  // 这条用例在测试里跑一整遍正式构建：拆出 chunk 后每个都要核对 Debug ID，Linux runner 上实测 45 秒。
}, 120_000);

it('上传入口在没有明确环境配置时拒绝启动 CLI', () => {
  expect(() => prepareBrowserUpload({})).toThrow('SENTRY_AUTH_TOKEN');
  expect(() => prepareBrowserUpload({ SENTRY_AUTH_TOKEN: 'test-only' })).toThrow('SENTRY_ORG');
  expect(() => prepareBrowserUpload({ SENTRY_AUTH_TOKEN: 'test-only', SENTRY_ORG: 'fixture' })).toThrow('SENTRY_PROJECT');
});
