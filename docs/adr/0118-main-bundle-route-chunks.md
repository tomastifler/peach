# ADR-0118：主包按低频页面拆出带哈希的 chunk

- 状态：已采纳
- 日期：2026-10-23
- 关系：修订 [ADR-0022](0022-frontend-vite-preact-strangler.md)「文件名固定不带哈希」与 [ADR-0031](0031-frontend-react-boardui-tailwind.md)「主界面模块不外置、不分割」两句，其余照旧；[ADR-0076](0076-evilcharts-recharts-charts.md) 里「多出来的体积每个页面都要付」随之不再成立

## 背景

主界面 `web/dist/peach-app.js` 是一份 3.8 MB（gzip 约 1 MB）的单文件，统计与口味页的图表引擎、配置页、数据管理、复核、关注管理等低频页面都在首屏解析执行。首页冷加载的第一个长任务 0.75–1.31 s，其中相当一部分是这些用不上的代码。

固定文件名不带哈希的理由出自 ADR-0022：引用产物的 `web/app.js` 不经过构建，改不了那里的路径。主界面已经由 React Application 启动，`web/index.html` 只引用入口 `peach-app.js` 一个文件，这条理由只约束入口，不约束入口自己动态导入的文件。产物进 Git、运行时不需要 Node、`/dist/` 要会话三条照旧成立。

## 决策

**一、入口固定名，低频页拆成带内容哈希的 chunk。** 入口仍是 `peach-app.js`，服务端 ETag 复验。路由表里的低频页面（JAV、统计、口味、复核、数据管理、重复文件、高清版、采集来源、配置与诊断、任务、关注管理、播放列表）由 `frontend/src/react/router/route-chunk.ts` 的 `routeChunk(() => import(...))` 动态导入，产物名 `peach-app.<名字>-<哈希>.js`，平铺在 `web/dist/`。首页目录、资料页、索引页、详情舞台、侧栏与设置面板等首屏和常驻部分留在入口。

**二、首屏用得到的模块留在入口。** 库模式默认 `preserveEntrySignatures: 'strict'`，入口不许多出导出，入口与 chunk 共用的模块会被拆成几十份公共 chunk，首屏变成一串瀑布请求。构建放开为 `allow-extension`，并用 `codeSplitting.groups` 把 `$initial`（入口静态可达）的模块收回入口：入口没有任何静态导入，chunk 从 `./peach-app.js` 导入共用模块，React、Query、历史与控件各只有一份实例。入口给 chunk 的导出保留源码名（`minifyInternalExports: false`，入口多 6.9 KB）：压成单字母时入口任何改动都会让导出名整体错位，全部 chunk 跟着换哈希。

**三、页面的代码与首屏数据并行取，取齐后同步画。** 路由的 `prefetch` 同时等 chunk 与接口，两样都落地才进入 `openManagedRoute` 的同步画页；不用 `React.lazy`，它第一次渲染总要挂起一次，等于多画一帧空白。首屏稳定后浏览器空闲时逐个预热全部 chunk，第一次进入低频页不再等代码。

**四、服务端放行形态，不放行名单。** `/dist/{name}` 在四个固定名之外只认 `peach-app\.[A-Za-z0-9_-]+\.js`（`diagnostic_browser.BUNDLE_CHUNK_NAME`），文件不在就 404；chunk 回 `Cache-Control: private, max-age=31536000, immutable`。它们要会话才能取，所以只许浏览器自己缓存。页面包 `peach-pages.js` 免登录，仍是单文件。

**五、旧入口指着已删除的 chunk 时重载一次。** 生产站实时读主检出的 `web/`，合入新构建后旧 chunk 就不在了。打开页面时 chunk 取不到、而 `/healthz` 可达，整页重载一次拿新入口；同一会话 30 秒内只重载一次，空闲预热失败不重载。

**六、构建与发布链路按目录处理。** 发布插件逐个核对入口与 chunk 的 Debug ID，先删 `web/dist/` 里上一次的 chunk 再复制；source map 上传、错误上报的文件名白名单、源码改字的产物发布都按同一形态认 chunk。样式仍是一份 `peach-app.css`（`cssCodeSplit: false`），低频页模块带的样式排在首屏样式之后，层叠顺序只在两者选择器互不相交时与单文件时一致。

## 后果

- 入口 3.80 MB → 2.62 MB（gzip 996 KB → 719 KB），首屏请求数不变：入口之外的 28 个 chunk（共 1.23 MB）一律按需或在空闲时取。真实小样本上交替各测 5 轮的中位数：首页冷加载第一个长任务 772 → 690 ms，load 1010 → 876 ms；预热后进入低频页与改前持平，没预热就进入多 10–45 ms。
- 每次构建只有内容变了的 chunk 换名；`web/dist/` 的提交里会出现 chunk 的增删，提交时连同删除一起暂存。`tests/test_frontend_build.py` 核对 `web/dist/` 的 chunk 与产物引用一一对应。
- 低频页模块里的样式不能靠排在首屏样式前面取胜；需要覆盖首屏样式时提高选择器特异性。
- 视频墙（`catalog-grid-page.tsx` 静态引用）与设置面板（常驻组件，`configureSettingsPanel` 与组件同模块）仍在入口。
