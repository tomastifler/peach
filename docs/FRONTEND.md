# Frontend layer

This page covers the frontend build, the mount contract, and page migration. Enter by task:

1. Changing an existing page: install dependencies, build, and verify from [Development loop](#development-loop).
2. Adding a React page: wire it into the route tree following [Migrating the next page](#migrating-the-next-page).
3. Looking up module responsibilities: see [Directories and outputs](#directories-and-outputs) and [Mount contract](#mount-contract).

Peach 按 [ADR-0031](adr/0031-frontend-react-boardui-tailwind.md) 接入 React + Tailwind + BoardUI。主界面由 `frontend/src/react/bootstrap.tsx` 启动 `Application`，应用域控制器负责骨架、容器和页面助手，React 路由树负责客户端导航、页面与详情内容。主界面的入口是 `peach-app.js` 与 `peach-app.css`，低频页面按路由拆成带内容哈希的 chunk（[ADR-0118](adr/0118-main-bundle-route-chunks.md)），控制器与组件引用同一源码图。

There is one immutable constraint: **there is no Node at runtime**. The Python service, the PyInstaller bundle, and the macOS
checkout all read `web/` directly, so build outputs are committed to Git and no CDN is used.

## Directories and outputs

| Path | What it is |
| --- | --- |
| `frontend/src/react/bootstrap.tsx`、`application.tsx` | 主界面启动入口与 Application 生命周期；配置共享状态、挂载路由树、启动应用域控制器并在卸载时清理 |
| `frontend/src/api.ts` | 带 `AbortController` 的取数封装 |
| `frontend/src/management.ts` | 数据管理首屏 Fieldset 与网盘能力显隐 |
| `frontend/src/appearance/` | 外观与版式设置（`@peach/appearance`）：偏好 store、主题、强调色、密度、卡片版式与光晕配色。别名直接解析到本目录，控制器与组件读写同一实例 |
| `frontend/src/core/` | DOM 取元素、请求、转义、格式化与路由常量（`index.ts`）、标签显示名（`tags.ts`）、番号标题（`jav-title.ts`）。`@peach/legacy/*` 是源码别名，主包直接包含唯一实现 |
| `frontend/src/ui-kit/` | 共享控件与模板：滚动条、Collapse、锚定菜单、Select、来源站标、读数动效、骨架、横滚、开关、拉条、确认框、音效与中段截断。`@peach/legacy/ui` 直接解析到 `index.ts`；独立页面包仅打入用到的控件 |
| `frontend/src/onboarding/` | 安装后教程状态（`post-setup-tutorial.ts`）：本地键、签名与请求代际，控制器直接引用共享源码 |
| `frontend/src/application/` | 按职责拆分的应用适配：目录、关注、实体、索引、布局、导航、媒体与全局动作。`initializeApplication` 按启动次序连接控制器，副作用由生命周期管理 |
| `frontend/src/react/pages/` | 独立页面包：`index.tsx` 是 `vite.pages.config.ts` 的构建入口，按挂载点的 `data-page` 画 SPA 外壳之外的三张页：首启（`setup/`）、登录（`login/`）与错误页（`error/`）。`auth-card.tsx` 是它们共用的外框 |
| `frontend/src/react/` | 路由页面、常驻组件与组件；`entry.tsx` 是内部命令式适配，`application-residents.ts` 连接常驻组件，`bundle.d.ts` 声明内部接口，`boardui/` 逐字复制上游源码 |
| `frontend/src/query/` | 全站唯一 TanStack Query 客户端（`@peach/query`）与共享来源查询。Application 的 `fetchQuery`、页面 `prefetch` 和 Providers 读同一实例；`media-sources.ts` 声明 `/api/sources` 与查询键 |
| `frontend/src/react/query.ts` | React 子树里取那一个客户端的入口，转出 `@peach/query` |
| `frontend/src/history/` | 全站唯一浏览器历史（`@peach/history`），与路由树共用 React Router 的 `createBrowserHistory`。地址经 `shellNavigate` 写入；覆盖条目在 `usr` 中记录背景，启动不读取背景 |
| `frontend/src/shell/` | 目录口径、选择集、详情来处与一次性请求的共享单例。控制器与组件直接引用活绑定；整体换值用 `writeShell`，原地修改后用 `notifyShell` 通知订阅者 |
| `frontend/src/react/router/` | 客户端导航：`<Router>` 接管那一份历史，后退前进由它自己处理；每条路径的页面（管理区、播放列表页、关注页、目录网格、索引页、资料页与沉浸）、覆盖组的详情与队列，以及首页筛选条、新作行、处理横幅与搜索下拉这四个页面内组件由它画（`managed-routes.tsx`）；页面组按条目记的背景匹配，覆盖组按真实地址匹配详情与队列 |
| `frontend/src/catalog-bars.ts` | 首页筛选栏与侧栏的两份聚合：`['facets', 口径]` 与 `['tops', 参数, 口径]`，续页 `['tops', 参数]`，30 秒复用，状态页名单为空时退回全库口径；壳的 `getBarsData` 只算参数串 |
| `frontend/src/react/components/` | Peach 自己的组合件（说明条、进度、空态、等待点），BoardUI 注册表里没有对应条目的那些 |
| `frontend/src/react/taste/` | 口味页：`taste.ts` 是契约与几何算法，`charts.tsx` 是雷达／名次条／热力／桑基，`taste-page.tsx` 是整页 |
| `frontend/test/` | vitest 用例与遗留模块的桩；`test/react/` 直接挂组件，`*-routes.test.tsx` 走路由树的开收契约 |
| `web/dist/peach-app.js`、`peach-app.css` | 主界面入口，**进 Git**，固定文件名，由 `web/index.html` 引用；服务端通过 `/dist/{name}` 提供，ETag 复验 |
| `web/dist/peach-app.<名字>-<哈希>.js` | 低频页面的 chunk，**进 Git**，由入口动态导入；服务端只认这一种形态，按长期不变缓存。每次构建先删上一批，提交时连同删除一起暂存 |
| `web/dist/peach-pages.js`、`peach-pages.css` | 首启、登录与错误页的独立构建产物，**进 Git**，固定文件名。主包构建后追加构建（`emptyOutDir: false`）；只有这两份产物允许免登录读取 |

The first-run page (`GET /` when unconfigured), the login page (`GET /login`), and the error page hit by browser navigation are
three standalone pages outside the SPA shell. For all three the server returns the same thin shell (`web_entry.page_shell()`): the theme pre-read
script, Inter, `/dist/peach-pages.css`, and the mount point `#peach-page`, with `data-page` set to `setup`, `login`,
or `error`; variables only the server knows are written as escaped `data-*` on the mount point (`next`, `invalid`, and
`error` for the login page; `status` and `detail` for the error page), and the first-run page additionally carries three sprite glyphs used by its form. The whole page is drawn by the page bundle
`/dist/peach-pages.js` using BoardUI, so all three pages need scripts: with scripts disabled only a blank page remains.

- The first-run page's questions come from `GET /api/setup/questions` and submission goes through `POST /api/setup`; for the shape see
  "Internal flow of first-run setup" in `docs/OPERATIONS.md`.
  First-run setup and the configuration page share the media directory row and only show directories readable by the device running Peach; Docker fills in in-container directories. The page does not show an internal-path input. A request may omit `root`, and the server fills in the database path; existing rows still carry their original `root`, and the correspondence is preserved when media directories are edited.
- The login page is a native `<form method="post" action="/login">` with fields `token`, `next`, and, when checked,
  `days=30`. When `POST /login` rejects (wrong token, 429, 400), an HTML request gets the login page back with the error shown in place, the status code
  unchanged; other requests get JSON.
- The error page picks its title by `status` (one sentence each for 403, 404, and 409, plus one generic sentence for the rest); 404 shows no description and only a single
  "Back to home" action.
- All three pages use native scrollbars and do not mount the overlay scrollbar.

The page bundle stands on its own: it does not load the main bundle `peach-app.js`, does not create a Query client,
and uses bare `fetch` for requests. There are three reasons: an unconfigured machine has no database yet, and the main UI's setup immediately hits `/api/items`;
first-run happens only once, so it should not change the main bundle loaded every day or split out a shared chunk; and the login page must be drawn when there is no session, so the login-free surface adds only these two artifacts and does not drag in the main UI bundle. Controls shared with the configuration page (media directory row, password and confirm fields, busy-state attributes) live in
`frontend/src/react/settings/`, and each side bundles them into its own package. In the page bundle `@peach/legacy/ui` falls through by alias to
`pages/legacy-ui.ts`, which bundles only the source badge and the collapse source into the standalone package.

Style layer: `pages.css` and the main UI's `styles.css` share `base.css` (dark variant, Inter, shadow tokens, the
`.peach-react` container baseline, and the resting-state input border), and Preflight is likewise scoped to `.peach-react`; the thin shell puts this class on `<body>`, so popovers that land in body are also in scope.
`styles.css` excludes the page bundle with `@source not "./pages"`, so the utility classes for the three pages go only into `peach-pages.css`.
Light/dark reads `peach.settings.v1` from `localStorage` and writes both `data-theme` and the `.dark` class on `<html>`.
The completed state in the standalone bundle redirects to the entry after `RESTART_REDIRECT_MS` (`frontend/src/react/restart-redirect.ts`, the same number as the redirect after
saving on the configuration page).

### Configuration page

The page for changing folders and ports after configuration is entirely React (`frontend/src/react/settings/`, entry `configuration-page.tsx`). `/configuration` is the only editing page and sits in the management menu; the media library picker, the stats page, and first-run configuration guidance all point to it.

- 结构：一条窄列里排「通用 / 媒体 / 下载 / 网络与访问 / 维护」五组，每组一个 `h2.ui-configgroup` 小标题，没有内容的组连标题一起省略。页面自己画顶上那排页签（`.ui-board-local-nav`，`role="tablist"`，方向键与 Home／End 在整排里走），一组一格，一次只显示选中的那一组；页签条和整页同一次提交画出，第一帧就在。
- 数据契约是 `/api/configuration`（`src/peach/routes_configuration.py`）。端点字符串只在 `frontend/src/configuration-endpoints.ts` 声明一次，整页和设置弹层的摘要卡读同一个 `queryKey`。
- 第一帧必须同步：壳挂完这一页紧接着按地址里的 `#peachProxy` 滚到那一块，所以路由树用 `flushSync` 画第一帧，往后的更新照常异步。`.ui-configpage` 的第一层依次是页签条、各组的小标题与面板；每组的根节点就是那一格 `role="tabpanel"`，选中的那一组带 `ui-board-group-active`。
- 跳到某一组：React 页面（统计页「添加媒体」、诊断页、关注管理的凭据入口）直接链到这一组的地址 `/settings/<组>`，页面按地址定第一帧选中哪一格；遗留层的空库提示与媒体库选单「管理媒体库」把组名记进壳单例 `configurationRequestedSection`，壳打开这一页时作为 `open.section` 交进去、页面画上之后清空。
- 设置弹层「这台电脑」一格只挂 `configuration-summary`（`configuration-summary.tsx`）：媒体库数、端口、更新状态和「打开配置页」，不放可编辑的控件（ADR-0050）。媒体库数取 `/api/configuration` 的 `library_count`，由服务端按 `media_libraries.libraries` 分组数好，页面不自己归并。
- 相邻的两处不在这页：媒体修复是数据管理页 React 子树里的一张卡（`frontend/src/react/media-repair/`），订阅源是关注管理页的「订阅源」页签（`follow-manage/feed-sources.tsx`，读 `/api/feeds`）。
- 服务端检查部署方式和请求来源：桌面服务由托盘管理且请求来自本机；Docker 服务由容器入口管理，允许经过登录验证的本机或私有网络请求，拒绝携带代理转发头的管理请求。`/healthz` 按调用方返回 `configurable`，页面据此显示配置入口；入口隐藏不能替代服务端访问检查。
- 表单校验的原因由服务端按字段给（400 的 `errors`），页面写回原位，不在前端复制判定。
- 浏览器直接导航撞上 `HTTPException` 时，`api.py` 的处理器按 `Accept` 回一张 HTML 错误页（`routes_pages.error_page`，薄壳由页面包画），`/api/` 下和非导航请求仍回 JSON。

### Index pages

The five index pages `/performers`, `/creators`, `/studios`, `/agencies`, and `/tags` are entirely React (`frontend/src/react/index/`, entry `index-page.tsx`), drawn into `#index` by the route tree.

- The address bar is the single source of truth. The index element reads `q`, `scope`, `view`, and `category` from the address and passes them to the page as initial values via `openManagedRoute`; when the page switches tier it only changes its own state and hands off to the shell via `ShellActions.routeIndex`, which writes the address back with `shellNavigate` and claims it, without remounting. Back/forward to a different search takes a new page-open sequence number and reopens from the address. Entering from the sidebar always returns to local, alphabet, all types.
- The local roster and vocabulary read `/api/index`, and the online tier reads `/api/follow/authors` and `/api/follow/tags`, with keys built in `frontend/src/react/follow/online-vocab.ts`, belonging to the follow side. All four are `useInfiniteQuery`, "Load more" fetches the next page; while typing a filter, the previous result is kept until the new one arrives, with no skeleton laid down.
- The HTML inside the circular frame is assembled by `avatarInner` in `card-art/markup.ts` and passed in via the shell's `personAvatar`; the rules for placing the image at natural size, filling the background, and collapsing to initials are in `[data-person-ring]` in `web/css/01-base.css`, and the one that measures the image is the `load` listener that `installCardArt()` attaches to the document.
- The top-bar selection key belongs to the shell, and selection mode is recorded in the store of `@peach/shell`: the index element subscribes to it and pushes it to the drawn local tab; when it is turned off, the page clears the selection. None of the three keys on the selected-tags action bar writes the ledger, and "Show results" returns to the catalog filtered by the selected tags.
- The skeleton before data arrives is written into `#index` by the index element, with the template in `frontend/src/index-skeleton.ts` (the body part is `indexSkeletonHtml` in `ui-kit/skeleton.ts`), and the header skeleton uses the same set of text as the page. The row of identity categories for local performers already looks final in the skeleton; the vocabulary and skeleton both live in `frontend/src/identity-filter.ts`, shared by the page and the skeleton template.

### Entity pages

The five kinds of entity page `/performers/:name*`, `/studios/…`, `/creators/…`, `/series/…`, and `/agencies/…` are the same React page (`frontend/src/react/entity-page/`), registered in `ENTITY_ROUTES` under patterns like `/performers/*` and drawn into `#index` by the route tree on match; the kind and name are read from the address by the element (first `decodeURIComponent`, then match, and a slash in the name swallows all remaining segments).

- The profile card, filter popover, new-releases row, and body are four blocks of the same page. The entity page element lays out the frame (the loading skeleton's shape is still drawn by the shell via `ShellActions.entity.loading`, since it depends on the catalog's shape list and card ratio), swaps it into `#index` through the `place` of `openManagedRoute` at the moment the first screen is complete, the page draws into the profile card slot, and then portals into the other three blocks: the popover's sticky-top behavior needs its parent box to be `#index`, and the new-releases row is a legacy-layer card that does not go into `.peach-react`.
- The address bar is the single source of truth for filters and the media view. When the page changes a filter it calls `actions.route`, the shell's `routeEntityPage` writes the address and then pushes the new `filters` / `media` back via `updateManagedRoute`; layout, selection state, and display settings are pushed by `pushEntityPage`. When back/forward lands on a different filter at the same position, only the new value is pushed, without remounting; refresh refetches by incrementing `revision`.
- The filter bar's context is pushed by `currentBarsContext()`: while a work detail is open it uses the one recorded by `openItem`, while an entity page is drawn in `#index` it follows that page's props, and otherwise it uses the home one.

### Playlists page

The `/playlists` list page is entirely React (`frontend/src/react/playlists/`, entry `playlists-page.tsx`), registered in `BROWSE_ROUTES` and drawn into `#stats` by the route tree; after opening one, `/playlists/:playlist/:item` is still the legacy layer's `openPlaylist`. This page is not in `isManagedPath`, and every jump inside the page goes through the shell.

- It reads `/api/playlists`, and the first-screen `prefetch` states `staleTime: 0`: a Mix just saved on the home page must be visible on arrival. Create, rename, and delete all POST `/api/playlist`, and after writing the list key is refetched; the cache is not patched from the response.
- Delete first goes through the legacy layer's `confirmModal`, GETs the content by `?id=` before deleting, and undo rebuilds one from the original content and source; if it cannot be fetched, no undo is offered. The wording of receipts and undo failures belongs to `actionReceipt`.
- While the page is drawn, the shell asks for a re-read (the top bar "Shuffle"), and the shell increments `playlistsRevision` of `@peach/shell`; the page only refetches, without remounting. Returning from the play queue, back/forward, and entering from the sidebar each open the whole page once.
- Each list is the shared Mix card `components/mix-card.tsx`: paper edge, black-background cover, glass badge, stacked avatars, with the geometry written in `[data-mix-*]` in `styles.css`; the hover page-flip is `components/use-stack-flip.ts` (the follow page's card stack uses it too), with timing pinned in `use-stack-flip.test.tsx`, and the flip gates (multi-select, occlusion, reduced motion, while scrolling) are passed in by the shell via `ShellActions.canFlip`.
- The rename dialog, avatar change, and cover crop share the shell of `components/modal-frame.tsx`; the `form` variant at 540px matches `.ui-geist-modal` in `ui-kit/modal.css`.

### Follow page

The `/follow` list page is entirely React (`frontend/src/react/follow-feed/`, entry `follow-feed-page.tsx`), registered in `BROWSE_ROUTES` and drawn into `#stats` by the route tree. It is not in `isManagedPath`; the element in `frontend/src/react/router/pages/follow.tsx` opens it on match; the seed re-roll on re-entry is written into the store by the shell, and the element refetches according to the store's generation.

- The address bar is the single source of truth for filters. When the page changes filter, sort, or shuffle it calls `actions.route`, the shell's `routeFollowFeed` writes the address and claims it, and then `pushFollowFeed` pushes the new `view` / `seed` into the drawn page with `updateManagedRoute`: the generation is unchanged and there is no remount. The criterion is that `managedEntry` of `#stats` records `/follow`.
- Helpers and actions are objects in the shell, one each with stable identity (cards compare by reference), passed in with the open, not through `ShellActions`. The list page's UI names for tags and the cards import directly from `@peach/legacy/tags`.
- Skeleton fade-out: the follow page element hands its own `reveal` through `place`; in the write of `revealSkeleton` it only empties the host, and the page draws in the same task right after, so by the time the skeleton fades out the whole page is already underneath.
- The deep link `/follow/item/:id` opens in the stage: the shell's `renderForDetail` only vacates the list area and draws it when returning to the list; `followDetailActions`, `openFollowDetail`, and `closeFollowDetail` decide between closing in place and reopening by whether "the list page is still drawn".

### Library grid

The catalog (`/` and its filtered states, `/trash`), the entity page's works area, and the detail page's "Up next" all draw the same grid (`frontend/src/react/catalog-grid/`). The work card is `components/media-card.tsx`, and the Mix card uses the `components/mix-card.tsx` from the playlists page. The three ways of fetching data are split by `mode`:

- `catalog` 登记在 `CATALOG_ROUTES`，由路由树画进 `#grid`。表按页面分键：目录各路径与回收站都用 `/` 打开，槽里的路径说的是画着哪一页、不是地址；`CATALOG_PATHS` 只进 `<Routes>` 的声明，不进 `isManagedPath`。筛选态是壳的 `state`，打开时连同版式、选择态、助手与动作整份交进来；之后壳的 `paintGridPage` 看 `#grid` 的 `managedEntry`：画着就经 `updateManagedRoute` 推新筛选与 `revision`，查询换键重取、不重挂；首屏还在途就重开一次。冷启动经 `place` 交 `revealRoutedPage`，骨架淡出与整页同批交接。读数行 `#count` 的结构归壳，读数那一格、`#loadSentinel` 的自动续页、Mix 落位、竖屏带与分卷／版次折叠都在页面里。判据钉在 `test/react/catalog-routes.test.tsx`。
- 垃圾文件队列（`/junk-files`，`frontend/src/react/junk-queue/`）不是这张网格，是 `CATALOG_ROUTES` 的另一页，同样画进 `#grid`：打开前不取数，画上就铺自己那份骨架；换分类、换视图与处置后重读经 `updateManagedRoute` 推进来。它与目录网格换页时先由 `clearCatalogGrid` 收，计数行里归它的那一格随之同步撤掉，壳再往 `#count` 铺骨架。
- `entity` 由资料页正文 `entity-body`（`frontend/src/react/entity-body/`）直接渲染在它的作品视图里，不另挂岛：第一页随资料页首屏一起取来，续页由资料页按查询键取。同一块的另两个视图是名册（索引页的 `PeopleGrid`）与照片墙（样张分段在前、本地图片在后；直接打开 React 灯箱（`photo-lightbox/`），定位源文件调 `actions.revealSource`）。
- `items` 挂在 `#nrow` 上：壳手上已有那一批，岛只画卡。
- 馆藏表格由 `catalog-list-page.tsx` 渲染，默认依次显示名称、时长、分辨率、体积、星级评分和观看次数。「显示列」可开启番号、高潮计数、观看时间、入库时间和发行时间；全部列按身份、媒体规格、个人记录、时间信息排列。隐藏某列仍可按该字段排序。名称过长时省略显示，悬停可查看全文。拖动表头分隔线调整列宽；键盘操作时聚焦分隔线，按 Enter 进入调整，再用左右方向键改变宽度，按 Enter 或 Tab 结束。列宽与显示选择保存在当前浏览器；「重置列宽」恢复默认宽度，「恢复默认显示」恢复默认列。桌面和手机均在表格内横向滚动，不扩大页面宽度。
- 表格的表头和行分隔线铺满外框，右侧余量由独立空白列承接，保存的列宽保持不变。鼠标按住非控件区域可左右拖动所有数据表格，滚轮维持浏览器行为。馆藏表格只在手动开启多选后显示勾选框，底部「取消」清空选择并退出多选。评分与详情页共用 `RatingStars`：点击星星保存，再点当前星级取消；保存失败时在原单元格显示原因和「立即重试」（无障碍名称「立即重试评分」），成功回执提供撤销。
- 所有数据表格共用 `TableColumnControls`、`useTablePreferences` 和 `DataTableFrame`，提供显示列、恢复默认显示、重置列宽及鼠标／键盘调整列宽。各表单独保存浏览器偏好；身份列与勾选列保留，其余列可隐藏，排序菜单继续列出可排序字段。馆藏、关注来源、JAV 订阅源、两张别名表和数据管理表均使用这套组件。
- 关注来源与 JAV 订阅源的表头提供「全选本页」，再次点击取消本页选择。表格链接只占文字或图标本身的范围；管理表空白处用于选择行。关注卡片每条来源的站点图标放在行首，JAV 订阅源站点复用缓存的 `SiteLabel` 图标。
- 已保存别名的「修改统一名称」打开改名对话框，可输入名称或直接选用已有别名。`POST /api/follow/author-alias` 接受 `action: "rename"`、`canonical_key` 和 `canonical`；原名称保留为别名，关联的创作者名称及作品创作者字段在同一事务中同步。名称冲突或关联多个创作者档案时返回错误并回滚。
- 外置按钮控制的正文使用 `CollapseRegion`，原生详情使用 `Disclosure`；两者共用 `ui-kit/collapse.ts` 的高度过渡和反向点击保护。关注卡片、任务通知、教程及侧栏保留正文状态，箭头使用同一元素旋转；详情标题箭头共用 `CollapseChevron`。减少动态效果时遵守全站设置。
- 排序方向共用 `IconSwap` 的双图标结构与 `--motion-swap`，覆盖数据表、关注管理及实体／关注页排序；键盘操作即时更新。换批按钮保持同一枚 shuffle SVG，等待时继承共享描线参数；首页、实体和关注浮层共用这套忙态。JAV 详情的标题和元信息通过 `data-reveal-line` 接入 Stage 既有逐行揭示与清理。
- 版式、选中态与快进秒数经 `updateManagedRoute`（资料页作品区经 `pushEntityPage`）推进来：换版式只重画，已载入的分页原样保留。`selected` 每次推一个新的 `Set`。
- 卡上的悬停预览、封面取景与图片微光都在 `frontend/src/card-art/`：卡片直接调 `wireHover`／`releaseHover`（状态写在卡的 `data-previewing`／`data-longhover` 上）与 `relayoutCovers`，微光由 `installCardArt` 装的监听按 `PENDING_IMAGES` 认 `[data-media-art]>img`；壳只经 `configureHoverPreview` 告诉悬停预览多选态、打码与延迟。卡片的结构钩子全是 `data-media-*`；悬停预览插进封面格的 `video.hv`、`img.ui-hvframes` 与封套 `img.poster` 用自己的类名；`.ui-hvframes` 的样式在同目录的 `card-art.css`，另两样在 `12-cards.css`。
- 离场：去目录、回收站与垃圾文件以外的页面时由 `clearCatalogGrid` 收 `#grid` 那一页（`claimSurface` 只收 `#stats` 与 `#index`）；资料页正文随资料页由 `releaseManagedRoute` 收起；接着看是作品详情里的子组件，随舞台的内容一起卸。
- 屏外卡用 `content-visibility` 跳过封面与元信息区的渲染，不做虚拟列表。
- 单卡写操作都由用户点击触发：稍后看走 `actions.watchLater`，回收站卡的还原走 `actions.resourceOperation`，做完给撤销；彻底删除只在批量条上，先过 `confirmModal` 的危险档。

### Stage and player

Work detail and follow detail both open in the resident component `stage` (`frontend/src/react/stage/`), drawn by the route tree. The host `div[data-stage-host]` is a direct child of body, there is only one on the whole page, it is not replaced when the detail changes, and it is not wrapped in `.peach-react`; this surface owns `dialog#stage`, enter/exit transitions, the skeleton, the close key `#closeStage`, and the mini player `#miniplayer`, and the two details are its subcomponents, sharing the same Query cache with the pages.

- Application uses an imperative entry: `loadStage(host)` connects the resident component the first time a detail is opened, `configureStage` attaches the player, and then `openResidentSurface('stage', …)` builds the host, attaches it to the end of body in the same task that draws the mini player node, and hands out the handle only after it is drawn; from then on `stageApi()` is available synchronously, with the contract in `stage/stage-api.ts`. The origin (`detailReturnPath`, `followDetailReturnPath`, `detailOriginAnchor`), the address, and the top-bar context are maintained by the application domain.
- The handle writes this module's store and then notifies with `flushSync`: every paint in `open` (including in-place item swaps), `update`, and `dispose` is finished before returning, so skeleton measurement, `showModal`, title reveal, and the focus handed to the close key all see the structure just drawn. The `present` that the two details report to the shell when drawn is queued in a microtask: after receiving it the shell draws the sidebar and top bar, and the handles of those resident components also use `flushSync`, which cannot be drawn during the route tree's commit phase; if that item has already been swapped away or the stage has already been closed, it is not reported.
- When the stage throws, only the component is unmounted: the floating window and mini player nodes disappear with it, while the host and `data-detail-open` on body remain; afterward each member of the handle can still be called without throwing, and stays empty until refresh.
- Closing a detail pushes the origin: for one clicked into, it is the page where the card was clicked; swapping items within the same queue leaves it unchanged; closing a playlist returns to the list page and re-reads; back/forward entries take the background recorded on the entry (a follow detail keeps its filters too); refresh, a new tab, and a deep link landing on a detail do not read the entry, a work detail has the catalog grid drawn beneath it and closing returns to `/`, and a follow detail closes back to `/follow`.
- Focus: during the skeleton, focus stays on the dialog itself with no focus ring drawn, and when content arrives it is handed to the close key. Escape closes the innermost layer first (popovers such as the context menu and tag search consume it first), and only if nobody intercepts does it close the stage.
- The player is in `frontend/src/player/` and uses vendored Video.js. The entry `mountPlayer(video, options)` replaces the `<video>` in the media frame with Video.js and returns a teardown function; the detail only draws the media frame, and mounting is done by the stage's `attachStagePlayer`.
- The mini player and the stage share the same player instance: on leaving a detail the one currently playing moves into the mini player, and on expanding back to the same item it is reclaimed, not rebuilt. It is torn down with the stage on explicit close, when paused, when the mini player is turned off in settings, or when switched to a different item. The handoff criteria are pinned in `test/stage-player.test.ts`, and real Video.js behavior is in `e2e/stage.test.ts`.

### Sidebar and tag drawer

The scrolling layer inside the left drawer `#drawer` (`#drawerScroll`) is the resident component `sidebar` (`frontend/src/react/sidebar/`), drawn by the route tree: the navigation column, the sliding glass over the navigation (`use-view-glide.ts`, drawn onto `#drawer` via portal), and the filter groups that appear by context. The drawer itself, its open/close and scrim, the three keys on the bottom bar, and the brand and toggle keys belong to the shell.

- At startup the shell writes a skeleton (`sidebar-skeleton.ts`, with the same order and pressed state as the navigation the component draws), then `loadSidebar(sidebarHost())` registers into the resident table via `openResidentSurface('sidebar', #drawerScroll, place)`, and the host is `#drawerScroll` itself, not wrapped in `.peach-react`. `place` clears the skeleton in the same task that draws the first frame; after drawing it first calls `attached` (the shell moves the brand and toggle keys into the empty slot of the title row) and then hands out the handle, and from then on `sidebarApi()` is available synchronously, with the contract in `sidebar/sidebar-api.ts`. The overlay scrollbar is attached by the shell on `#drawerScroll`: the track and edge fade are mounted in `#drawer`, the scroll layer itself only gains a few attributes, style variables, and listeners, and all child nodes belong to the component.
- Content is pushed by the shell: `paintSidebar(patch)` merges `content`, `filters`, and `latest` and then calls `render`. The aggregates for the catalog and entity pages are swapped for `{kind:'catalog'}` in `buildBars`, and the content tags of the follow page and follow detail are pushed as `{kind:'follow'}` by `renderFollowDrawer`; when filters are changed in place `applyFilterStateInPlace` pushes only `filters`, and `refreshFacetCounts` pushes only `latest`. Click actions return to the shell's `navTo`, `commitContextFilter`, and the follow page's filters. `render` and `navChanged` write the store in the component module and then `flushSync`, so the drawing is done by the time they return.
- Navigation order reads `sidebarOrder` from the `appSettings` store: drag-sorting first lands in the store and then writes `/api/settings`; the settings panel changing the order also writes the same store, and the sidebar reorders on the spot upon notification. When the pressed state changes the shell's `paintNav` calls `navChanged`: it runs in the synchronous section of `route()`, so the glass receives the old position and the new position.
- The title row `[data-sidebar-head]` is an empty slot drawn by the component, and the brand and toggle keys are nodes the shell moved into it; the component draws no children into this slot, and redraws do not touch them.
- Styles are in `sidebar/sidebar.css` and recognize only `data-sidebar-*`; no className is written in the component. Behavior is in `test/react/sidebar.test.tsx`; the glass sliding that measures layout, dragging, per-page counts, and narrow-screen open/close are in `e2e/sidebar.test.ts`; the appearance of the current-item glass, title row spacing, duration slider, and narrow-screen scrim is read as computed values in `e2e/design-detail.test.ts`.

### Client-side navigation

React Router takes over history in Declarative mode (`frontend/src/react/router/`). The eleven management pages (stats, taste, review, data management, duplicates, high-quality versions, sources and credentials, configuration, activity, follow management, diagnostics), five index pages, and five kinds of entity pages are opened by the route tree on match, and `/resource-sync` and `/configuration#libraryProcessing` are rewritten to the data management page by elements using replace; the six catalog paths, the playlists page, and the follow page are likewise opened by the route tree on match; work detail, the four kinds of queues, and follow detail are sent into the stage by the overlay group on match, and immersive is opened by the `/immerse` element of the page group. The shell has no route table.

- There is only one history: `@peach/history` resolves directly to the shared source and ships with the main bundle, the shell's `route()` writes the address through `shellNavigate`, and the `navigator` of `<Router>` is the same object. The route tree is mounted on a container that is not in the document; the management page, playlists page, and follow page are drawn into `#stats` by portal, the index pages and entity pages are drawn into `#index`, and the catalog grid and junk queue are drawn into `#grid`.
- The actions of the screen an element opens are queued in a microtask after the commit phase: the handles of resident components such as the sidebar use `flushSync` internally to finish drawing on the spot, and the same root does not flush synchronously during the commit phase. Every path in the page group's `<Routes>` has an element attached, and `/immerse` is also in this group; it matches by the entry's `usr.backgroundLocation`, so whichever page a detail is overlaid on still matches that page, and the startup entry does not read the background. The overlay group matches `OVERLAY_PATHS` (detail, the four kinds of queues, follow detail) by the real address; the element sends that detail into the stage resident component and keys it by dispatch sequence number. Neither group reports "no route".
- A page's host follows the address: when an element mounts, it has the shell collapse other surfaces via `surfaceChanged`, then the element lays down this page's skeleton, then `openManagedRoute(path, open, {container, isCurrent, place})`. When an overlay element leaves, the stage is closed only if the destination is not an overlay address. It takes a generation, fetches the first screen first, and once complete, in the same task clears the skeleton and puts it into the `.peach-react` host (if `place` is given, it swaps the frame the shell laid out into the container and hands out the host), and the host is drawn on the spot with `flushSync`, so there is no blank frame between skeleton and body; opening the same path again is a new generation, and the page remounts and refetches. The three containers each record one entry and do not reclaim each other, and `releaseManagedRoute` names containers one by one: `claimSurface` clears `#stats` and `#index`, `showHomeSurfaces` clears only the `#index` entry, and `#grid` is cleared only by `clearCatalogGrid`; when an entity page is overlaid on a management page, the hidden management page stays alive as usual; the detail stage pushing `/item/:id` does not go through them, and the page stays beneath the stage. After opening, the shell's switches (selection key, entity page filter and layout changes) are merged into the drawn page via `updateManagedRoute(container, patch)`: the generation is unchanged, with no remount and no refetch, and they are queued into the next render as usual.
- `open` carries only values that can be computed just for that open (category and tab from the address, read-only state, onboarding flag, configuration page tab), computed by the element itself; the screens for receipts and switching that still belong to the shell go through the `ShellActions` the shell hands to `configureRouter(actions)`, delivered via Context. In-site jumps go through `navigate` (on the shell side `actions.navigate`, likewise not claimed), and after dispatch the corresponding element opens by page-open sequence number. When the shell wants to reopen the drawn index page or entity page (refetch after a batch operation, filter rollback, or the position clicked is exactly the one drawn), it increments the `pageOpens` counter of `@peach/shell` and the element reopens the whole page; a page change and a reopen within the same microtask are merged into one. Elements writing the address from an effect always queue it into a microtask with a liveness guard: the router root commits synchronously, and writing the address synchronously during the commit phase would produce a flushSync warning. The configuration page tab is handed to the shell first and then the address changes; it does not go into the address bar. The criteria are pinned in `test/react/managed-routes.test.tsx`.
- Each history change takes a `seq`. Page elements read the page-open sequence number via `useOpenEpoch()` and key by it: when the shell's `shellNavigate` writes the address it claims on the spot, and the page does not reopen; back/forward, `navigate` inside the React subtree, and the shell's `actions.navigate` take a new generation, and the page remounts and refetches. Overlay elements key by `seq` and take over that detail request; when the address is rewritten inside a detail the sequence number is claimed and it is not opened again. The queue-open intent is handed to the element via `queueOpens`, and the actual queue address is written only after the data is complete. `actions.navigate` writes the title the same way `route()` does and uses `shellNavigate(path, {claim: false})`. A `popstate` with an unchanged address also takes a new sequence number and a new generation.
- The router root commits synchronously: `PeachRouter` swaps in the new address with `flushSync` in the same call as the history change, so by the time `shellNavigate` and back/forward return, both `<Routes>` groups have already swapped matches and the previous page's elements have already been unmounted. Dispatch is not in this commit and is still queued in the microtask after it. The criteria are pinned in `test/react/router-sync.test.tsx`.
- The titles, sidebar identity (`section`), and top-bar "Shuffle" behavior (`refresh`) of the eleven management paths are registered in `ROUTE_META` of `@peach/history`: Application startup and the route elements both read this source directly. The shell's readers read it via `routeMeta(path)`; for the same identity the first one in registration order is taken, and data management is ordered ahead of duplicates and sources and credentials.
- Startup: after the shell finishes preparing sources, page structure, and runtime state, it advances `pageOpens`, and the route tree matches the first screen against the current address; the startup entry does not read the history background. Back/forward that happens before the Router mounts is matched once against the current address at mount time. The criteria are pinned in `test/react/router.test.tsx`.

Before a queue's first screen is complete, the open intent holds the cancellation right under the source navigation sequence number. A new non-overlay navigation (including a same-address POP) withdraws the intent, clears the pending address, and invalidates the stage generation; the intent microtask, the stage load, and the response callback all check the cancellation state. A successful first screen releases the cancellation right before writing the queue address, and switching items between overlay details does not close the new stage.

### Build output caching

Build outputs use fixed filenames, referenced by `web/index.html` and the standalone page thin shells. For `/dist/` and `/app.css` the server returns `Cache-Control: no-cache` and an ETag of mtime plus byte count; the browser revalidates every time and gets a 304 when the content is unchanged. `index.html` uses `no-store` to ensure the entry sees the current outputs.

## Stylesheet partitions

The stylesheet is split by UI area under `web/css/`, and `/app.css` concatenates them in filename order into one delivered file
(`stylesheet_response()` in `src/peach/routes_pages.py`). The split exists only so two changes land in different
files: with a single 2,700-line stylesheet, two branches each changing one spot almost inevitably collide. The page still fetches
only one `/app.css`: no twenty-odd blocking requests are added to the first screen, and the cascade order does not need to be written into `index.html`.

Two rules:

- **The two-digit prefix is the cascade order**, and the order `sorted()` produces is the order of effect. Adding a partition also requires changing
  `StylesheetPartitionTests.PARTITIONS` in `tests/test_web_ui.py`: which slot it is inserted into decides who overrides
  whom, which is a judgment call and should not be discovered casually by a glob.
- **Cuts may only fall at brace depth 0, outside comments**. When a rule or `@media` is cut in half, the concatenation is still entirely
  correct, and the problem is only visible when looking at each piece alone, so each partition's own braces and comments must be closed.

| Partition | Covers |
| --- | --- |
| `01-base.css` | Theme variables, palette, font sizes, Geist primitives, scrollbar |
| `02-topbar.css` | Top bar and the top three layers |
| `03-filterbar.css` | Resident filter layer, combo, page summary |
| `04-manage.css` | Stats page, playlists, review, metadata, data management fieldset |
| `05-insights.css` | Analytics / Speed Insights, and the taste page skeleton's sections and metric bars |
| `06-index.css` | Index page first-screen skeleton, entity page roster grid |
| `07-entity.css` | Entity profile header, external links, related people |
| `08-photos.css` | Page scroll lock while the lightbox is open, shared collapse |
| `09-skeleton.css` | Geist Skeleton and per-page skeleton variants |
| `11-identity.css` | Identity groups, performer and series links, duplicates, quality checklist, review comparison |
| `12-cards.css` | Cards the shell draws itself (junk files, new releases), hover preview layer, and density |
| `15-detail.css` | Source file management the shell draws (locating and directory reconciliation) |
| `16-settings.css` | Page scroll lock while the settings panel is open (the panel belongs to the resident component `settings-panel`) |
| `17-overlay.css` | Toast and review occlusion |
| `18-chips.css` | Origin selection and tag buttons for secondary actions in detail (sidebar filter tags belong to the resident component `sidebar`) |
| `19-immersive.css` | Load more, empty state, selection bar and batch bar, narrow-screen master list (immersive mode belongs to the resident component `immerse`) |
| `21-online.css` | Follow page skeleton and follow detail (the list belongs to the follow page drawn by the route tree) |
| `22-followmanage.css` | Follow management page |

## Development loop

How to see the effect of frontend changes, how to run tests, and what must be done before committing.

```bash
npm --prefix frontend ci        # first time or after dependencies change
npm --prefix frontend run dev   # vite build --watch, rebuilds web/dist on save
npm --prefix frontend run build # produce one official build, must be run before committing
```

There is no dev server: `index.html` belongs to the Python service, the page opens as usual from Peach's own port,
and watch mode only writes the outputs back to `web/dist/`. Refresh the page to see changes.

Tests and type checking still have a single entry point:

```bash
& .\scripts\test.ps1 -Scope web   # Windows; includes tsc, vitest, build output and contract assertions
./scripts/test.sh web             # macOS
```

vitest only strips types when transpiling and does no checking, so the `web` scope also runs `npm --prefix frontend run typecheck`.
When the local machine has no npm or `frontend/node_modules` is not installed, both are **explicitly skipped** and do not turn the test scope red;
in CI (`GITHUB_ACTIONS=true`) missing these counts as a failure, and the workflow is responsible for installing them. The check "was the build output built from the current source" cannot be verified locally (it cannot be rebuilt without Node),
and its gate is the `web-bundle` job in CI: after `npm run build`, `git diff --exit-code -- web/dist`.
**If you changed `frontend/src`, you must rebuild and commit `web/dist/` together**, otherwise CI will go red.

The same scope also has the real-browser smoke test `tests/test_web_e2e.py`: on a temporary Peach data directory it generates a 12-item synthetic demo library,
starts a loopback `peach serve --no-auth`, and then launches `node --test` in batches to run all cases under `frontend/e2e` (for scheduling see [docs/TESTING.md](TESTING.md)). The smoke cases are in
`frontend/e2e/smoke.test.ts`: for each main route at desktop and 390×844, it first waits for the target page body to appear (the route's own title,
plus the content area, index entries, or an explicit empty state), and then asserts: no page exceptions or `console.error`, no same-origin 4xx/5xx or failed requests,
`aria-busy` and `data-skeleton` disappear, no horizontal overflow, and no elements beyond the viewport. The body check cannot be omitted: if the page did not render at all,
the other assertions all still hold. A new route must state its body in `ROUTES`.
The browser is the local Google Chrome (`PEACH_E2E_CHROME` can specify it), and clips are encoded by ffmpeg; when npm,
`playwright-core`, ffmpeg, or Chrome is missing it is explicitly skipped locally and counts as a failure in CI. Browser CI is sharded by the `web-e2e` matrix;
for shards and platform scope, defer to [Testing and dependencies](TESTING.md) and the workflow. When a similar problem is found during UI acceptance,
add a case here first and then fix it.

Design decisions also have `frontend/e2e/design-*.test.ts` (split into files by page area, sharing `design-fixture.ts`), which read `getComputedStyle` to assert appearances the user has settled: React inputs carry no legacy focus ring,
the React subtree reads BoardUI's token raw values, persistent warnings are status color blocks, and under one card only the write button is the primary button. When a page moves to React, the old source-string assertions are removed per ADR-0031
in three categories: design decisions go here or into lint, behavior goes into vitest, and layout and runtime go into the smoke test.

Navigation is positioned by purpose: page sections are above the body; the category directory for configuration, review, and settings dialogs is on the left on desktop and moves above the body on narrow screens; chart dimensions and display modes use segmented controls near the content. The selected directory item uses a fill, and an unselected item on hover only brightens its text.
Configuration save uses the primary button; check, add, refresh, and cancel use the secondary button; remove uses the delete button. The install tutorial and system diagnostics entries use single-line settings; activity follow-up details can be expanded and collapsed, and in-progress and failed follow-ups are expanded by default.

`npm --prefix frontend run lint` checks the correctness rules, strict equality comparison, and accumulating spread in `src/`, `test/`, and `e2e/`; `== null` is kept for the semantics of matching both null and undefined. Design system rules apply only to `src/react/`, excluding the upstream copies of BoardUI and EvilCharts. Both the `web` scope and CI run it. When `no-restyle` reports
spacing or appearance on a BoardUI component, the fix is to wrap the component in a plain element, not to add an exception to the rule.
`src/react/boardui/` is add-only and never modified; `UPSTREAM.sha256` records the hash of each file at copy time, and `tests/test_frontend_build.py` compares against it.

## UI annotation

When pointing at a particular piece of the UI, use [Agentation](https://agentation.com) to click an element on the page, write your comment,
and copy out markdown to paste straight to the agent, instead of describing it in words like "that light spot in the sidebar". How much is copied is decided by Output Detail in the toolbar
Settings, set once and stored in this browser: the default Standard has only the selector;
Detailed adds the class and nearby text; Forensic adds the full DOM path with ids (such as
`main#main > div#libraryProcessingNotice > …`) and computed styles, and is the tier to use when handing it to an agent.

```powershell
npm --prefix frontend run build:agentation   # build once in the checkout where you want to use it
```

然后在页面地址后加 `?agentation=on`，仅在当前页面加载标注工具。刷新或重新打开页面时不会
自动加载；`?agentation=off` 也可用于关闭。浏览器中的持久开启标记在页面初始化时清理。

- The output is written to `build/agentation/peach-agentation.js` and served from `/dev/agentation.js`, with the same token as `/dist/`.
  It does not go into Git or the standalone bundles: Agentation is under the PolyForm Shield license, which permits only your own use and is not distributed with Peach,
  so it is not placed under `web/`, which gets packaged wholesale. In a checkout that has never built it, this route is a 404 and `Application` silently skips it.
- The output is built locally: after switching checkouts or upgrading dependencies, rerun it once, and a page refresh takes effect.
- Source file paths are not available in annotations: it relies on React's `_debugSource`, a field React 19 removed; component names were also mangled by
  the minification of `peach-app.js`. For a steadier handle to give the agent besides Tailwind class names, add
  `data-component` to the block (one of the attributes Agentation collects by default).
- Agentation's own global shortcuts are turned off to avoid conflicts with Peach's Esc and arrow keys; use only the toolbar buttons.
- The annotation tool is mounted in its own container; the adapter entry fills in names for the form fields of its Shadow DOM.
- Annotations sync to the local `agentation-mcp` (`http://localhost:4747`), and the agent uses its MCP tools to read,
  reply, and mark them handled directly, without copy-paste. The service is started by a Claude Code session that has registered it:
  `claude mcp add agentation -- npx -y agentation-mcp server`; only sessions opened after registration have this toolset.
  When the service is not running, annotations are still saved in the browser and uploaded once it is up; it only accepts requests from loopback origins, so other devices on the LAN cannot connect.
  If the browser asks whether to allow the page to access apps and services on the local machine, choose allow.

## Mount contract

Pages, in-page components within pages, and resident components already moved into the resident table are drawn only by the route tree (ADR-0031). The shell decides when to open and when to close, and props are computed by the shell and pushed in;
the React route tree (`RouterRoot`) is the only root, and portals each surface into the shell's containers according to the registrations in `frontend/src/history/managed.ts`.
Every item below exists to avoid two waiting states, or a page that is still polling after it has left.

```js
// Route elements reference the shared source directly: import { openManagedRoute } from '../../../history/managed'
await openManagedRoute('/playlists', props, {container: $('#stats'), isCurrent: () => surfaceCurrent(surface)});
await openManagedRoute('search', props, {container: $('#searchMenu'), isCurrent: () => true});
```

- The registration key is the "surface": pages use paths (`/stats`, `/performers/*`, `/`), in-page components use names (`catalog-filter`, `feed-new`,
  `library-processing`, `search`), and resident components also use names (`batch-dock`, `glow-picker`, `manage-header`, `immerse`,
  `settings-panel`, `sidebar`, `stage`); the three do not overlap. The route tree looks up the same set of tables in `managed-routes.tsx` by key, and each entry is
  `{prefetch, page}`; in-page components and resident components do not go into `<Routes>` or `ROUTED_PATHS`.
- Resident components are those that do not follow any one page, registered in the resident table `RESIDENT_ROUTES` and opened once by `loadXxx(host)` in `application-residents.ts` via
  `openResidentSurface(name, container, place?)` (immersive mode, the settings panel, and the stage on first open, the others at shell
  startup): there is no first-screen fetch, they always count as the current page, and the host is the resident node itself (`[data-batch-dock]`, `#boardGlowMenu`,
  `[data-manage-header]`, `[data-immerse-host]`, `[data-settings-host]`, `#drawerScroll`, `[data-stage-host]`); the component is drawn directly as its
  child, with the DOM the same as when each built its own root, and not wrapped in `.peach-react`. The shell still speaks through an imperative
  handle: the component subscribes to the store in its own module, the handle writes the store and then notifies with `flushSync`, so the drawing is done on return; `loadXxx` waits for this surface
  to be drawn before handing out the handle. When the host already contains the shell's startup skeleton (management area page header, sidebar), the `place` of `openResidentSurface` clears the skeleton in the
  same task that draws the first frame, and clicks on the skeleton before the handle is handed out belong to the shell; when the host is not in the shell's page (immersive mode, stage), `loadImmerse` and
  `loadStage` create `[data-immerse-host]` and `[data-stage-host]`, and `place` attaches them to the end of body in the same task that draws the first frame (immersive is a hidden outer frame, the stage is a hidden
  mini player). The handle of immersive,
  `open(startId)`, finishes the skeleton, list, and player paints before returning; the listeners for arrow keys, window resize, and page leave are attached to the module
  and are not unmounted with the component. The settings panel is loaded only the first time the gear is pressed: `loadSettingsPanel` creates a `[data-settings-host]`, `place` puts it
  at the end of `document.body`, and the route tree draws the collapsed panel in the same task, after which open/close only toggles `hidden`; `open(section)` writes the store
  and draws on the spot, with scroll lock, data fetching, and focus following right behind, and `isOpen()` reads the same store. Resident components are never torn down; only the error boundary unmounts their component,
  and the host always stays in the document.
- `openManagedRoute(key, props, options)` is async and **draws only after the data is fetched**. The shell has already laid down a skeleton, and if a page drew an empty container first
  and then spun on its own, the same entry would show two waiting states. It first collapses the previous surface in the same container, `prefetch(props, signal)` writes the first screen
  into the shared Query cache, and once complete, in the same task it swaps out the skeleton and puts the page into the `.peach-react` host (or the frame laid out by `options.place`),
  and the route tree draws on the spot with `flushSync`. While the route tree is not yet connected, opening first waits for the route tree to connect and then fetches. The search dropdown and home filter bar are registered during the Application startup phase, and the code for pages and resident components is already included in the main bundle.
- `options.isCurrent` is the page-change criterion. The shell judges the current page by "generation" rather than `AbortSignal` (`claimSurface` / `surfaceCurrent`),
  and when the user has left during data fetching this predicate decides not to draw. In-page components that cannot be left once opened (search dropdown, home filter bar) pass `() => true`;
  the criterion for resident components is fixed to always-true by `openResidentSurface`.
- `managedTaken(el)` answers whether this container belongs to the route tree: it is already drawn, or its first screen is still being fetched. The shell uses it to decide whether to open again; opening again while in flight
  aborts that trip and refetches. `managedEntry(el)` recognizes only a surface that is already drawn.
- When an item of state in the shell changes and the page should not remount, use `updateManagedRoute(el, patch)`: it merges `patch` into the props at open time,
  the generation is unchanged, and the page re-renders in place. A remount would replace half-typed text and the scroll position along with it. It is a no-op when not yet drawn.
- `releaseManagedRoute(el, …more)` aborts in-flight fetching, unmounts the page, and removes the host; the host of a resident component belongs to the shell, and only the component is unmounted. When collapsed
  before being drawn, the container holds the shell's skeleton, which does not belong to the route tree and is left as is.
- There are two gates on leaving. The first is the shell's common points: `claimSurface` is the common page-change point that all pages pass through, it clears `#stats` and `#index`,
  and also clears the processing banner (`#libraryProcessingNotice`) when leaving the catalog page; `showHomeSurfaces` is the common point before the index page and entity page redraw,
  and clears the `#index` page; the `#grid` page is cleared by `clearCatalogGrid` when leaving the catalog, and the home new-releases row is cleared by `clearHomeFeed`; the search
  dropdown is never cleared by the shell, and surfaces in the resident table are structurally never cleared. The leave path of most pages is a direct `innerHTML=`, which pushes the page out of the document while it stays alive, so clearing must be the responsibility of these
  common points rather than judged page by page. The second is `isCurrent`: by the time data fetching lands, the user may have left, and in that case nothing is drawn.
- A surface that throws: each surface is wrapped in its own error boundary (`SurfaceBoundary` in `router.tsx`, keyed by generation). When one surface's render
  throws, only that surface goes empty, `failManagedRoute` removes its registration and host, `managedTaken` returns false, pushing a patch is a no-op, and the shell
  reopens it the next time; if it throws on the first frame, `openManagedRoute` still returns true, and by the time it returns the registration has already been removed. The error is handed via the root's
  `onCaughtError` to `reportError`, once each time, and the boundary itself does not report again. No boundary is put on the root: the dispatch point and the two groups of `<Routes>`
  do not unmount with any one surface. A deterministic throw is reported again on every reopen; the search dropdown is opened only at shell startup, and after a throw it stays empty until refresh.
  When a resident component throws, only the component is unmounted and the host is not removed, and it likewise stays empty until refresh: `loadXxx` is a cached Promise and will not open a second time; afterward when the shell calls the handle
  it only writes to a store nobody subscribes to, without drawing, throwing, or reporting again, so a deterministic throw is reported only once. It does not auto-reopen on the next content push, because
  reopening has to wait for an async open, and at that point the handle would no longer draw synchronously.

The shared helpers `LOC`, `fmtDur`, `fmtSize`, `emptyStateHtml`, `noteHtml`, `javTitleHtml`, and `tagLabel` come directly from the single source in `core/` and `ui-kit/`. `@peach/legacy/*` is a source alias and does not correspond to a browser shim or an external artifact. Application actions (such as `srcBadge` and `openItem`) are handed to components by each domain's controller through a limited props/actions interface; cross-domain actions of the routing layer are delivered by `ShellActions`.

Two hard constraints hold across both layers:

- Database metadata must not be interpolated into inline JavaScript event attributes: an apostrophe in a real studio name directly causes a Firefox syntax error.
- Frontend API wrappers must check the HTTP status before returning JSON: when the ledger is conflict-read-only, write endpoints return `409` and error JSON, and treating that as an ordinary success object clears the selection and reloads, so the user only sees the entries come back unchanged. Batch disposal and detail feedback must keep the current selection and show the failure reason.

## How to write shared state

There is only one criterion: **does this data have a second reader**.

If not, use hooks. Expanded state, hover, and which page you flipped to belong to a single page, and lifting them up only turns something that
was local into something global.

If there is a second reader, make both readers read the **same `queryKey`** and do not build a separate copy of the state. The whole site has only one `QueryClient`, in
`src/query/client.ts` (watched by `tests/test_frontend_build.py`), and both the shell and the
React islands get it from `@peach/query`; what a page-level `prefetch` or the shell wrote in can be read directly by any component's
`useQuery`, and whichever comes first, it is the same number.
The ready-made example is the background task of scanning and harvesting: the card on `/data-cleanup` (container `#libraryProcessing`)
needs progress, results, and retry, while the banner at the top of the catalog page (container `#libraryProcessingNotice`) needs only a sentence and a
destination. The two containers are not adjacent and are each mounted by the legacy layer at its own timing, yet they read the same `LIBRARY_PROCESSING_KEY`:

```tsx
// src/react/library-processing/use-library-processing.ts -- both the card and the banner call it
const job = useQuery({
  queryKey: LIBRARY_PROCESSING_KEY,
  queryFn: ({ signal }) => fetchLibraryProcessing(signal),
  refetchInterval: (query) => pollInterval(query.state.data, watching),
});
```

When both are present, only one request goes out per cycle: the timers of the two observers are rescheduled together after each query update,
and concurrent `fetch` calls are merged by Query itself. Conversely, if each kept its own state, the polling on each side would run at its own rhythm, and the card
would say "Completed" while the banner still showed progress.

The five readout cards at the top of the data management page (`src/react/data-cleanup/`) are an example of the same criterion: "High-quality versions" needs only
`total`, but still reads the `QUALITY_GOALS_KEY` of the whole `/quality-goals` page; "Duplicates" reads the `DUPLICATES_KEY` of
the whole `/duplicates` page. The same number is always the same copy on both pages, no matter which page you enter first.
The review count does not read `REVIEW_KEY`: that one is the entire queue, and the `?counts=1` response has a different shape, so it is a different resource.
Each of the five cards has its own `useQuery`, and when one cannot be fetched it writes "Failed to load" on that card only.
**Readers in the legacy layer wait until the page they live on is migrated before being connected**, and no separate notification entry is opened on the build output for them.

The cards in the lower half of this page are each a background task or a single write: link checking and deletion, and resource-sync scanning and cleanup go through
`useBackgroundJob`, while organize preview and execution and the duplicates batch keep go through `useMutation`.
Actions that write the real ledger (resource-sync cleanup, `/api/batch`, organize execution and rollback, link deletion)
are all triggered by user clicks and first go through `confirmModal`; resource-sync cleanup permanently deletes stale records and empty folders and uses the danger tier.
Resource sync appears only when some source has a root directory configured, and its two task states are also prefetched on the first screen only then;
when going directly to `#resource-sync` (redirected from `/resource-sync`), the lazily fetched readouts above it are also awaited together,
so that it is not pushed down again after scrolling into place.

Endpoints and query keys are provided uniformly by the page's data module (such as `src/react/quality-goals/quality-goals.ts`). Component tests verify request counts, request bodies, and cache updates; cross-component sharing is provided by the same `QueryClient`.

Whether the first screen takes the cache depends on the route table: `/quality-goals` is `refresh:'reopen'`,
so a refresh is re-entering this page, and its `prefetch` gives no `staleTime` and refetches on every entry. Pages that update at a rhythm write
`refetchInterval` (the activity page 2 seconds / 10 seconds) and do not start a separate `setInterval`: polling follows the component,
and when the page changes the shell unmounts the root in `claimSurface`, and it stops by itself.

The stats page (`src/react/stats/`) is the other end of this criterion: the whole page has only the one key `STATS_KEY`, which reads what the ledger
looks like right now, with no background task and no polling. If the four readouts on one screen and the three panels below were fetched separately, one cell
would be new and another old. The four readout cards are also tabs (React Aria `Tabs`), because this page has no other primary
action and the readouts themselves are the entry; the ring inventory chart is drawn with SVG, `pathLength={100}` pins a full circle to 100, and colors take only
BoardUI's `chart-*` tier. Clicking a content tag means "go back to the catalog and filter by it"; swapping the whole page for the catalog still belongs to the legacy shell, and the page
only hands the tag key back (`onTag`).

The taste page (`src/react/taste/`) writes "view the same truth over a different range" into the key: `['taste', window]`, and changing the range
is changing the key, with the previous one kept on screen by `placeholderData: keepPreviousData`. The range is component state rather than URL:
it is not in the route table, the shell mounts the island by the single `/taste` route, and a refresh returns to the default "All". The server's `_get_taste` caches by
`taste:{window}` itself, a round trip on the demo library takes a dozen or so milliseconds, so this page sets no `staleTime`. Background recomputation is another
key `['taste','refresh']`, asked every two seconds while `running` and every ten seconds when idle, and the terminal state is recognized by the criterion in item 2 below.
The radar, rank bars, activity heatmap, and creator Sankey are all React components, with geometry landing on SVG attributes and colors taking only BoardUI's
`chart-*` tier.

## Migrating the next page

Whole pages belong to React (ADR-0031). First pick a page whose **container is not shared with others**; the pattern for writes and background tasks
is already settled, see item 2 below.

1. `frontend/src/react/<page>/<page>.ts`: endpoint constants, `queryKey`, data types, and pure conversion functions,
   plus a `prefetch<Page>(signal)` that wraps `apiGet` from `src/api.ts` with `queryClient.fetchQuery` and
   passes the signal through to the real `fetch`. Use only one `queryKey` for the same truth: if several segments on one screen are
   fetched separately, one segment would be new and another old. Only two copies with different rhythms get separate keys: on the sources and credentials page, the
   source list is edited by the user while the cover-fetching task status is advanced by the background; merged into one key, every two-second round of polling would redraw
   the card the user is filling in.
2. `frontend/src/react/<page>/<page>-page.tsx`: the component reads the same `queryKey` with `useQuery`,
   and to poll it writes `refetchInterval`, with the interval computed from the content last received, not a separate `setInterval`.
   Writes are `useMutation` and do not follow Query's cache rhythm: on success use `setQueryData` to swap the one
   entry the server returned into the list, rather than refetching the whole page, because the user may be filling in another card on the same screen; on failure only leave a one-line reason
   inside the card, leave the previous copy in the cache untouched, and do not clear what was just filled in. Mutually exclusive actions on the same card share one
   `isPending`, and before entering another action `reset()` the previous one's result, so the screen never shows two conclusions at once.
   Always follow background tasks with `useBackgroundJob` from `frontend/src/react/background-job.ts`, and do not
   assemble `useQuery` + `useMutation` + effect by hand in the page: toggling polling by `running`, not letting a stale terminal state read on the first screen
   pose as a new result, and swapping in this run's snapshot before re-reading at start are three timings fixed in the hook and verified one by one by
   `frontend/test/react/background-job.test.tsx` by stalling the re-read. The page hands over only the task key, the read and start
   functions, and `onFinish`; when what is cached is a whole card, also hand over `jobOf` / `withJob`.
3. `frontend/src/react/router/managed-routes.tsx`: register `{prefetch, page}` in the corresponding table, using a path for pages and
   a name for in-page components; the type of props handed in on open goes into the table in `router/shell-actions.ts`, and the shell opens via
   `openManagedRoute` (see [Mount contract](#mount-contract)).
4. Appearance follows BoardUI: entries that exist in the registry are copied verbatim into `src/react/boardui/`, with hashes recorded in
   `ORIGIN.md` and `UPSTREAM.sha256`; for those not in the registry (section titles, empty states, progress, note bars)
   use Peach's own composites under `src/react/components/`, and if a second page needs one, move it there rather than copying it.
   For tiers the utility classes lack, such as an `auto-fill` grid or fixed-pixel covers, add
   `@theme` or `@utility` in `styles.css`, and the class names are generated by Tailwind as usual; lint does not accept arbitrary values.
   For card faces use `cardClass()` from `components/card.tsx` and do not assemble an outlined card yourself:
   Board cards are always the `--ground` fill surface, and the result of each page assembling its own `rounded-2xl border border-separator-border` is a dozen-plus kinds of
   hollow shell for the same card. Readout cards and segmented controls likewise go through `stat-card.tsx` and `segmented.tsx`.
5. `frontend/test/react/<page>.test.tsx`: a fake fetch plus the mount helper from `test/react/render.tsx`,
   asserting structure, request counts, polling rhythm, and what is left behind on failure, with `queryClient.clear()` between cases.
   If there are writes, also assert the request body submitted, that no secret input remains on the page after success, and that the input is still there unchanged after failure;
   if there are background tasks, advance a fake clock to the terminal state and check that the receipt is sent only once and nothing is asked after unmount.
   Appearance decisions go into the `frontend/e2e/design-*.test.ts` of the corresponding area: `page.route` fabricates states that real data cannot supply,
   and assertions read `getComputedStyle`.
6. The page is wired into `react/router/`, and the helpers it needs reuse `core/`, `ui-kit/`, or an in-domain typed controller. Only application actions are passed in via props/actions; generic blocks use the composites in `components/`. Clean up the rules in `web/css/` and `web/board.css` that served only that page's body, keeping the skeleton and rules other readers still need.
7. Routes, menu entries, and skeletons are verified by component and browser tests. `tests/test_web_ui.py` keeps only generic style conventions, CSS partition cascade, and privacy boundaries, and does not compare implementation source page by page; text assertions already covered by behavior tests are removed outright.
8. Run `& .\scripts\test.ps1 -Scope web` (includes tsc, lint, vitest, and the real-browser smoke test),
   then `npm --prefix frontend run build` and commit `web/dist/` together.

The application skeleton and global shell keep using the partitions under `web/css/` that are still read. Main UI component and shared control styles are pulled into `peach-app.css` by `react/styles.css`.
Rules whose markup is produced only by `frontend/src` (including HTML assembled by `ui-kit` templates and skeletons) live in the css next to the component, with class names carrying the `ui-` prefix, imported via `react/styles.css` and loaded with `peach-app.css`; classes the shell also assembles and classes not yet moved remain in `web/css/` and `web/board.css`. Motion classes for in-place state changes are in `ui-kit/motion.css`. The player skin and subtitle appearance are loaded with the main UI styles from `player/player.css` and `player/subtitles.css`; the Video.js 10 control modules are loaded on demand by `player/videojs.ts`.
The styles of the React subtree are Tailwind v4 plus the BoardUI theme, with the output `peach-app.css`; the three constraints for it sharing a page with the old stylesheet
(utility classes are unlayered, only `src/react/` is scanned, Preflight is scoped to `.peach-react`) are written at the top of
`frontend/src/react/styles.css`, and the upstream files copied verbatim and not copied are listed in `frontend/src/react/boardui/ORIGIN.md`.
Preflight gives every img `max-width:100%`; for face avatars assembled by `card-art`, `avatarFrame` inlines the removal of this rule on the image,
so containers in islands that hold such avatars need not each write `max-width:none`. Covers and avatars with face frames are shown only after framing is done (`09-skeleton.css`).
The exceptions in `.oxlintrc.json` are also settled there: `ui-configpage`, `ui-configgroup`, and `ui-board-local-nav` are the configuration page's own class names,
the skeleton (`configuration-skeleton.ts`) and the React page output the same set of class names, with styles in `configuration-page.css` and `board-controls.css` next to the component, and this rule does not read those stylesheets; `swiper`, `swiper-wrapper`, `swiper-slide`, and
`swiper-zoom-container` are structural class names recognized by the Swiper core API (image lightbox), and without them the carousel's
container and each slide cannot be found; `mono` is the monospaced-digit font stack of `01-base.css`, not the same font group as Tailwind's `font-mono`;
`javedition` and the tones (`censored`, etc.) are the edition badge that catalog cards also use; `chip` is the tag button of `18-chips.css`, used by the shell's origin selection and reused by the buttons of the offline and online note blocks in the work detail (the sidebar's filter keys belong to the sidebar component and do not use this class); `geist-button` and `primary` are the
legacy buttons shared by the stage modal, also reused by "Add" and "Restore defaults" in the settings panel; `popmenu` is the box of the legacy popover menu,
and the open/close motion of `presentMenu` / `dismissMenu` keys off it, with both the settings panel's palette popover and the sidebar "Add" menu being it; `geist-input`
is the input of `01-base.css`, reused by the settings panel's numeric fields. These are reclaimed together when their owners (cards, popover menus, etc.) move to React.
The styles shared by the stage and the two details (cells, queue, mini player) are in `frontend/src/react/stage/stage.css`, immersive mode is in
`frontend/src/react/immerse/immerse.css`, and the player frame,
stats badges, and context menu are in `frontend/src/player/player.css`, all imported by `styles.css` and recognizing only `data-*`;
`shadow-dropdown` is the `--shadow-*` in the BoardUI theme,
and `no-raw-colors` recognizes only `--color-*` and treats it as an undeclared color.

## Dependency list

`frontend/package.json` and the root `package.json` are two files, each doing one job: the root manifest only registers the four packages manually
vendored into `web/vendor/` (video.js, swiper, lucide-static, healthicons),
and build dependencies must not be mixed in (`tests/test_dependency_policy.py` guards that manifest).
Both pin exact versions, and the lockfile goes into Git.

| Dependency | Why it is needed |
| --- | --- |
| `vite` | Build entry. Library mode emits a single ES module, and `external` + `output.paths` leave legacy modules outside |
| `typescript` | Types as contract: registry, props, and endpoint responses all rely on it to catch drift at compile time |
| `vitest` | Frontend test runner. It shares the same config resolution with Vite, so no second transpilation setup needs maintaining |
| `happy-dom` | vitest's DOM environment. Assertions are on real DOM structure; lighter than jsdom and starts faster |
| `playwright-core` | Browser driver for `frontend/e2e/`, driving only the local Chrome and downloading no browser. happy-dom has no layout, and facts like horizontal overflow and stuck waiting states can only be measured by a real browser; `@playwright/test` is not used, cases run on `node:test`, the same approach as docu.md (`test/helpers/browser-render-harness.ts` of `markdown-viewer/markdown-viewer-extension`) |
| `oxlint`, `@shadcn/lint` | `npm run lint`: Oxlint native rules cover source and tests, and six shadcn design rules check our own React source. Uses the TypeScript and Oxc plugins; the rule set is in `.oxlintrc.json`. `eslint` is installed as a peer of `@shadcn/lint` and is not the lint entry |
| `react`, `react-dom` | The frontend's only rendering layer. BoardUI source is React components with interaction built on React Aria; it is not run through a compatibility layer (ADR-0031). `flushSync` of `react-dom` also handles the configuration page's frame: right after the shell mounts, it scrolls to `#peachProxy` |
| `react-aria-components` | Interaction and accessibility semantics for BoardUI inputs, checkboxes, switches, dropdowns, and popovers: label association, keyboard operation, focus in and out, `aria-invalid` |
| `react-aria` | Only `UNSAFE_PortalProvider` is used: it attaches Popover and dropdown lists to a container at the end of `body` that likewise carries `.peach-react`, so popovers read the same tokens and Preflight as in-page |
| `@tanstack/react-query` | Data fetching and caching for React pages: page-level `prefetch` and `useQuery` in components share one cache, so "draw only after data is fetched" does not need to thread first-screen data through props; polling is written as `refetchInterval` and stops with the component on unmount |
| `@tanstack/query-core` | The `QueryClient` itself. Application and React pages reference the same client source directly, so there is only one at runtime; its version is pinned in sync with `@tanstack/react-query` |
| `react-router` | Declarative client-side navigation: Router, Routes, and the shared browser history are included in the main bundle, and addresses are dispatched through the single history object. `@remix-run/route-pattern` and `cookie-es` are its dependencies |
| `@tanstack/react-table` | v9 `useTable`, `tableFeatures`, and column helpers drive the follow list, JAV feed, and creator alias tables, registering only the pagination, row selection, and sorting state each table needs. Row identity is a business ID (`getRowId`); the follow list shares one checked set across pages and views, sorting acts on the **full set** and pagination only slices the last step; the alias table identifies rows by platform alias and canonical creator key |
| `tailwind-merge` | Removes conflicting utility classes when BoardUI's `cx()` merges class names |
| `@remixicon/react` | Icons built into BoardUI components |
| `tailwindcss`, `@tailwindcss/vite` | Generate `peach-app.css` from the class names actually used in `src/react/` |
| `@types/react`, `@types/react-dom` | Type checking for the React subtree |
| `agentation` | UI annotation toolbar for local development, built separately and not in the outputs or standalone bundles (see "UI annotation") |

主界面由 `vite.config.ts` 从 `src/react/bootstrap.tsx` 构建为 `peach-app.js` 与 `peach-app.css`。Application、路由树、常驻组件与共享状态同属一份源码图，`@peach/*` 直接解析到源码，不外置 React、Query、历史、shell 或 UI 模块。路由表里的低频页面经 `src/react/router/route-chunk.ts` 的 `routeChunk(() => import(...))` 拆出：首屏取数阶段与接口并行装载，取齐后同步画页，首屏稳定后空闲时预热；首屏用得到的模块由 `codeSplitting.groups` 的 `$initial` 收回入口，chunk 从 `./peach-app.js` 导入它们。新增低频页照这个写法接进路由表；`page()` 只在 `preload()` 落地后调用，组件测试直接读 `page()` 时先等 `loadRouteChunks()`。样式仍合成一份 `peach-app.css`，低频页模块带的样式排在首屏样式之后。开发取证工具 `/dev/agentation.js` 是独立的按需外部模块。

`npm run build` first builds the main UI and empties `web/dist/`, then appends the standalone page bundle with `vite.pages.config.ts`. The browser baseline is Chrome 111, Firefox 128, and Safari 16.4, with oklch emitted as is; values that change with the theme use `.dark` and custom properties, not `light-dark()`, and `react-color-scheme.test.ts` checks the output.

Vitest's module aliases also point to the shared source; `@peach/legacy/ui` can fall to `test/stubs/legacy-ui.ts` in component tests, and tests that need real controls reference `src/ui-kit/` directly. `tests/test_web_js.py` uses Node type stripping to verify the pure functions in `src/core/` and does not load the main bundle, which needs document.

`@testing-library/react` is not introduced: `createRoot` plus `querySelector` is enough
(the mount and input helpers are in `frontend/test/react/render.tsx`), and the assertions are on the real DOM anyway.
