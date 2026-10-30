/* Main UI build: the Application, routes, resident components, first-screen pages and shared state are bundled into the entry peach-app.js.
 * The entry uses a fixed file name and is referenced by index.html; the server validates content with an ETag and requires the cache to be revalidated every time.
 * Low-frequency pages are dynamically imported by the route's `routeChunk` and split into chunks with a content hash, `peach-app.<name>-<hash>.js`, which the server caches as long-lived immutable files
 * (ADR-0118). Modules the first screen needs stay in the entry, and chunks import them from the entry, so each module has only one instance.
 * 模块别名直接指向唯一源码，浏览器仅在启用开发取证时请求独立的 agentation 模块。 */
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { browserArtifacts, browserSymbols } from './scripts/sentry-build.ts';

const source = (name: string) => fileURLToPath(new URL(`./src/${name}`, import.meta.url));

export default defineConfig({
  plugins: [tailwindcss(), ...browserSymbols('peach-app')],
  resolve: { alias: {
    'next/link': source('react/components/board-navigation-link.tsx'),
    '@peach/legacy/core': source('core/index.ts'), '@peach/legacy/ui': source('ui-kit/index.ts'),
    '@peach/legacy/jav-title': source('core/jav-title.ts'), '@peach/legacy/tags': source('core/tags.ts'),
    '@peach/legacy/ui-sounds': source('ui-kit/sounds.ts'), '@peach/legacy/middle-truncate': source('ui-kit/middle-truncate.ts'),
    '@peach/card-art': source('card-art/index.ts'), '@peach/appearance': source('appearance/index.ts'),
    '@peach/query': source('query/index.ts'), '@peach/history': source('history/index.ts'), '@peach/shell': source('shell/index.ts'),
    '@/registry': source('react/evilcharts/registry'), '@/lib/utils': source('react/charts/cn.ts'), '@': source('react/boardui'),
  } },
  // 库模式不替换 `process.env.NODE_ENV`。`QueryClient`（`@tanstack/query-core`）随这份产物发出，它的开发期
  // 告警按这个值判断，不替换的话浏览器里读到一个不存在的 `process`，整个模块加载失败。
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: browserArtifacts,
    // The private directory keeps JavaScript and source maps; the publish plugin copies only JS and CSS to `web/dist/`.
    emptyOutDir: true,
    target: 'es2022',
    cssTarget: ['chrome111','edge111','firefox128','safari16.4','ios16.4'],
    // Vite 8 的内核是 rolldown，压缩走 oxc；写 'esbuild' 会落到已废弃的转译插件上。
    minify: 'oxc',
    sourcemap: 'hidden',
    // Styles are still a single peach-app.css: the cascade order relative to the old stylesheets is decided by index.html and does not change with page loading.
    cssCodeSplit: false,
    lib: {
      entry: 'src/react/bootstrap.tsx',
      formats: ['es'],
      fileName: () => 'peach-app.js',
    },
    rollupOptions: {
      external: ['/dev/agentation.js'],
      // Library mode defaults to `strict`: the entry may not have extra exports, so modules shared by the entry and chunks would have to be split into dozens of common chunks,
      // turning the first screen into a waterfall of requests. With extension allowed, shared modules stay in the entry and chunks import from the entry.
      preserveEntrySignatures: 'allow-extension',
      output: {
        // Chunks share the entry's prefix and are laid flat in `web/dist/`: the server recognizes only this form, with no path separator in the name.
        chunkFileNames: 'peach-app.[name]-[hash].js',
        codeSplitting: { groups: [{ name: 'main', tags: ['$initial'] }] },
        // The entry's exports for chunks use the names in the source: if they were minified to single letters, any change in the entry would shift all export names,
        // and every chunk's content and hash would change with it, so one small change would replace all chunks in `web/dist/`.
        minifyInternalExports: false,
        assetFileNames: 'peach-app.[ext]',
      },
    },
  },
});
