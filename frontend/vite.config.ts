/* 主界面构建：Application、路由、常驻组件、首屏页面与共享状态打进入口 peach-app.js。
 * 入口用固定文件名，由 index.html 引用；服务端以 ETag 校验内容并要求每次重新验证缓存。
 * 低频页面由路由的 `routeChunk` 动态导入，拆成带内容哈希的 `peach-app.<名字>-<哈希>.js`，服务端按长期不变缓存
 * （ADR-0118）。首屏用得到的模块留在入口，chunk 从入口导入它们，同一模块只有一份实例。
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
    // 私有目录保留 JavaScript 与 source maps；发布插件只把 JS 与 CSS 复制到 `web/dist/`。
    emptyOutDir: true,
    target: 'es2022',
    cssTarget: ['chrome111','edge111','firefox128','safari16.4','ios16.4'],
    // Vite 8 的内核是 rolldown，压缩走 oxc；写 'esbuild' 会落到已废弃的转译插件上。
    minify: 'oxc',
    sourcemap: 'hidden',
    // 样式仍是一份 peach-app.css：层叠顺序与旧样式表的先后由 index.html 决定，不随页面装载变化。
    cssCodeSplit: false,
    lib: {
      entry: 'src/react/bootstrap.tsx',
      formats: ['es'],
      fileName: () => 'peach-app.js',
    },
    rollupOptions: {
      external: ['/dev/agentation.js'],
      // 库模式默认 `strict`：入口不许多出导出，入口与 chunk 共用的模块只能另拆成几十份公共 chunk，
      // 首屏变成一串瀑布请求。放开扩展后共用模块留在入口，chunk 从入口导入。
      preserveEntrySignatures: 'allow-extension',
      output: {
        // chunk 与入口同前缀、平铺在 `web/dist/`：服务端只认这一种形态，名字里没有路径分隔符。
        chunkFileNames: 'peach-app.[name]-[hash].js',
        codeSplitting: { groups: [{ name: 'main', tags: ['$initial'] }] },
        // 入口给 chunk 的导出用源码里的名字：压缩成单字母的话，入口里任何改动都会让导出名整体错位，
        // 每个 chunk 的内容与哈希跟着变，一次小改动换掉 `web/dist/` 里全部 chunk。
        minifyInternalExports: false,
        assetFileNames: 'peach-app.[ext]',
      },
    },
  },
});
