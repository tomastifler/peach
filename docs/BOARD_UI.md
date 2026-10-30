# BoardUI Adaptation

## 无图头像与浮卡子页

2026-10-27 复核：无图头像的圆盘、首字母和默认人像按同一组件检查。背景使用主文字色 10% 混入承载面的中性色，不能直接取与行背景相同的 `background-primary-default` 或 `background-tertiary-default`；前景使用 `text-primary`，不套用禁用色、三级文字色或整体透明度。24px 头像复用 Avatar `sm` 的 12/16、600 字阶，默认人像图形为 16px；照片、首字母和缺省图标保持相同外框。此处取代下文历史参考中无图头像的「次文字色首字」采用项。

正常、悬停和选中行中的无图头像都需检查深浅主题：首字母与头像底色至少 4.5:1，承载身份含义的人像图形至少 3:1；圆盘也应能从承载面辨认。规则依据 [WCAG 文字对比度](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) 与[非文字对比度](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)。尺寸相同、使用了语义 token 或背景有色差均不能代替前景对比度核对。复用源组件时须同时带入 Peach 的暗色适配，不只复制组件结构和上游默认值。

表格默认采用 Body Medium 14/20、500，状态文字采用 Body Regular 14/20、400；单元格内边距为 10px 12px。只有明确选择紧凑档才使用完整的 Body 2 字阶 13/18，不能拼出 13/20 等混合档。小型浮卡的标题为 Title 2 Medium 20/26，正文 14/20，辅助说明 12/16；正文内边距 20px，分组间距 16px，图文和操作组间距 8px。字阶包含字号、行高和字重，不能只核字号。表头与「待加入」等正常状态均需可读，不能按禁用文字处理；用户脚本的表头使用主文字色，状态使用次文字色，历史取证中的三级文字色不直接套入暗色小浮卡。

同一浮卡内的设置、批量选择属于子页：标题左侧返回，恢复进入前的主界面状态与焦点；关闭整个浮卡的 `×` 只留在主界面。返回设置不保存草稿，返回批量选择停止后续提交，已提交任务继续处理。原生 Escape 与返回保持相同语义。

## 设置分组与页签选中层

侧栏底部按明暗、配色、设置排列，展开时横排、收起时竖排，视觉顺序与键盘焦点顺序一致。

设置弹层的外观选项、光晕配色、自定义颜色与导航顺序各有独立卡片。设置行保留 BoardUI 的左侧 12px 内缩、右侧通栏分隔线；配置页的相邻行组由共享样式补齐边界。

JAV 与索引页、顶部管理导航、关注管理、复核分类、配置分区和搜索补全类别共享上游 `PillTabList` 的选中层，同时保留 Peach 的路由、tab 语义和方向键。React Aria 的装饰层通过 Portal 挂在集合宿主内，普通按钮直接使用同一组件。减少动态效果时关闭选中层过渡。当前源码、适配差异、实时几何与注册表核对结果见[设置与页签取证](reference-snapshots/boardui-settings-tabs.md)。

任务问题列表默认收起，展开后使用与 CodeBlock 同色的限高容器及共享覆盖式滚动条。来源列表的单条错误保留原位文本展开；详情动作用常规字重。光晕颜色行使用中性行状悬停面，色板复用同一份覆盖式滚动条。

框内分组标题保留上下留白；框外标题的紧凑间距仅用于独立卡片布局。颜色行的悬停与展开反馈面横向铺满卡片、纵向覆盖相邻分隔线，内容与分隔线仍从左侧 12px 起算。边框保持占位，状态切换不改变行高。关注来源与 JAV 订阅源的暂停状态使用 `Chip` 的 `gray` 变体，主文字色随主题切换；创作者卡片末行的反馈面使用 8px 底部圆角，与外框 16px 圆角及 8px 留白保持同心。

设置弹层的玻璃导航投影裁在左栏内。右栏标题的阴影只在正文滚过顶部留白后显示，回到顶部、切换分区或重新打开时收起；减少动态效果时立即切换。

## 目录浏览

On 2026-10-17 the public [Tree View](https://www.boardui.com/components/tree-view), [Breadcrumb](https://www.boardui.com/components/breadcrumb), and Direction registry sources were obtained. The SHA-256 and per-file verification of the three entries are recorded in `frontend/src/react/boardui/ORIGIN.md` and `UPSTREAM.sha256`; the raw JSON is kept in this working tree's `build/boardui-registry/`. The source is MIT-licensed, with no new runtime dependencies.

Tree View uses the upstream directory icons, hierarchy lines, 32px compact rows, keyboard navigation, and controlled expansion directly; Breadcrumb uses the upstream ancestor buttons and current item. Peach keeps the performers and studios at the top of the home page, the glass filter, sorting, cards, and detail view, and places a 224px directory column on the left of the main content; below 1100px it collapses into a directory popover opened on demand. The breadcrumb, subfolder entries, and usage settings sit above the works area. The usage form uses the existing Select, Input, Checkbox, ModalFrame, and the shared confirmation box; while removal is being confirmed the usage popover is unmounted, and on cancel the form is restored, so two focus managers never overlap. Directory browsing follows the nearest-level explicit rule with source withdrawal; for scope see [Directory Browsing](DIRECTORY_BROWSING.md).

The official component docs and registry sources were obtained; the official live browser example timed out on open, so interactive visual measurement was not obtained. Peach's desktop and phone behavior was accepted using a temporary synthetic library.

The sticky boundary of the directory column is computed from the actual height and top position of the filter overlay and updates as the window and filter content change; the in-tree scroll height reserves the filter bar and the bottom gap. In dense mode, Mix and work cards share the same 7px top stacking margin, with cover bottom edges aligned.

Folder mode uses the upstream IconButton and, within the sort control group on the right, adapts the 30px transparent button and glass selected surface of the follow page; the Remix icon keeps its filled path. Cards and list use the shared segmented control, and the current browser keeps the chosen display mode. The list is driven by TanStack Table over the existing BoardUI Table, reusing DataTableFrame, sorting, and pagination controls, with straight lines between rows; selection plugs into the library's existing bulk bar. The default is 20 titles per page, the server sorts and paginates the full filtered result, and selection is kept across pages. The implementation follows [TanStack server-side pagination](https://tanstack.com/table/latest/docs/framework/react/guide/pagination) and [sorting](https://tanstack.com/table/latest/docs/framework/react/guide/sorting), checked on 2026-10-17.

On narrow screens, the filter bars of the home, profile, and follow pages scroll horizontally as a full row; work and follow cards are sized to their actual text and tags, and an empty tag area takes no row. Note arranges body and actions by container width, and the completion hint has two layers: the description plus a detail link with a right arrow, and the completion button on the next line. The glass material follows the existing implementation.

Filter bar buttons are unified to the 30px height of the viewglide segmented control, and icon-only keys are 30×30px. The favorites entry, shuffle, and the explore page's profile update reuse the same BoardUI IconButton wrapper, with a blue action surface, 16px icon, and the same hover and busy states.

## Task Records, Diagnostics, and Follow Overview

数据表、订阅源和别名表共享工具栏分组：标题与计数同组，列设置、排序与业务动作整组换行。列设置的两枚按钮、排序框与方向键各自保持成组。分页范围与分页操作分组排列，操作组在独占一行仍放不下时继续换行；页码可在中间列折行，上一页与下一页保持同行。作品列表与关注卡片复用相同的分组原则，全选与收起保持成组。

批量操作浮窗通过 ResizeObserver 测量高度，页面滚动区按浮窗高度、底部间距与控件间隔预留空间；浮窗换行后，底部分页与下拉仍可滚到可点击的位置，关闭浮窗后释放预留空间。

任务中心的一轮任务使用独立卡面，失败时卡框使用错误色，结束原因保留正文色。运行进度、后继任务明细、例行任务折叠、历史分页和轮询共用现有数据状态。

System diagnostics first presents warning, failed, and unknown checks, while normal and unconfigured items stay in the "Other checks" collapsed area. The library health list and the source sessions are each kept. Recovery buttons name the media library, network and access, maintenance and updates, or task center, and use the targets provided by the diagnostic report.

追更与订阅源检查的问题详情保留本轮来源名称、站点和失败原因，并提供来源管理入口。旧记录只在任务号匹配时读取完成检查点补齐详情；未取得明细时明确说明。媒体修复只为本次跟踪完成的任务发送回执，成功使用短暂通知，缺少工具的提示可以关闭。

关注管理的六项概览使用填充卡，关注列表使用外层填充卡、创作者卡与底部汇总条。标题与读数组合排列，操作区按实际可用宽度整组换行；操作区独占一行仍放不下时，内部控件继续换行，骨架复用同一布局。来源勾选、展开、检查、排序、分页、表格视图与批量操作沿用共用组件。添加关注时，输入法合成期间不请求建议或发起查找；查找失败保留输入和原因，可直接重试。字体、颜色与控件均复用 BoardUI token。

These pages are checked against the [design guidelines](DESIGN_GUIDELINES.md) for independent objects, input, and real status feedback. Desktop and phone were accepted using the actual build output; the layout and interaction evidence archive is at `<private verification records>`.

## Favorites Window and Component Catalog

On 2026-10-14 the official skill `2026.10.8` was installed and the actual source of the public registry was obtained. The `avatar` JSON SHA-256 is `614f2a384e2d44c0a15df8e3fc42c1648ccd7101f1c8be98911087641ab28aec`; the source was copied verbatim and verified by `UPSTREAM.sha256`. The `settings-modal` JSON SHA-256 is `620866f68751335b9cbd7f5812850ed8f5e3ede04f88c3acb3e8a5fb36e9ecfe`. The favorites window uses Peach's settings popover with a 274px category column, 614px panel height, the shared close control, and an independently scrolling body; React Aria provides the shell and focus management, and on phones the category column scrolls horizontally.

Favorites reads entity images, studio marks, avatars of representative works, and local proxies of bound online sources; when candidates run out, an object icon is shown. The entry is a 32px neutral star button beside the readout of the filter strip; the popover navigation reuses liquid glass, ViewGlide, and overlay scrollbars, and the entry itself has no sliding glass. Entity categories and saved filters each have their own tab, and Marked and Watch later sit at the bottom of the navigation. On narrow screens the category and body scroll separately.

The same pass checked `tabs` (`7b89651220b86041aa0db74cf6be6b9b77de24045344bd7fc9627e62f1d98857`), `carousel` (`5a8506c353b8ace96bf51171168cf1617ca775c45e22362de07dba990e79a1a9`), and `tree-view` (`72b06e3187ae7738bd1eabd46bc15ebe1d2d49be768e44306b266d91206eeb9c`). Favorites uses type filtering, and the existing media carousel includes video, thumbnails, and dots; page Tabs, tree hierarchy, or replacing the media carousel are not introduced. All of these components are free and have no Pro consumers; the official Pro source was not obtained. The raw JSON and production cover response evidence are kept in `<private verification records>`.

This document records how Peach's UI aligns with BoardUI: for each control, which public upstream evidence was taken (registry SHA-256, date of retrieval), what Peach copied, where it deliberately deviates, and why. Where a code comment says "registered in docs/BOARD_UI.md", the evidence is here. Evidence that could not be obtained is marked "not obtained", never replaced with guesses.

## Empty-State Action Entry Points

When a page has no data, tell the user where to go next, rather than just writing "Nothing yet".

Empty states reuse `emptyStateHtml`, with the action centered below the description, wrapping on narrow screens. The empty states of the follow list and follow updates provide a primary "Add follow" button; the follow entries in the library, tags, and entity index also go directly to `/follow-manage?tab=add`. The follow management area is written to the address bar, so refresh and back restore the corresponding area. When the library has a primary "Add content" button, the follow entry is a secondary button.

Statistics empty states provide matching entries: content tags and tag sources go to data management to complete metadata, watch history goes to the library, and storage sources go to configuration to add a media directory. Statistics section actions use secondary buttons.

A follow source row keeps checkbox, name, source status, check time, and actions on one line; when the card is no wider than 600px the year is omitted, and at 460px or less the hour and minute are omitted, with the full time kept in the description of the focusable time field. Select-all and collapse in the creator heading stay on one line; select-all uses Lucide 1.40.0's `check-check` double-check icon, shown icon-only when the card is 460px or narrower, and the action name follows the select-all state. The list skeleton reuses the official region attributes, toolbar, bulk actions, and creator cards, and each source uses the same five-column layout.

The empty-state sweep covers the library and entity index, follow updates and management, statistics, taste, playlists, task center, HD targets, duplicate files, review, junk files, and trash. Filtered no-result states keep the existing filter-recovery entry; the actions for playlists, manual aliases, taste collection, and review frame extraction are already offered in the adjacent form or toolbar. Empty task records, HD targets, no duplicate files, no review candidates, junk files, and trash are normal states and do not require the user to start a task or create content. Local empty results in source search, detail recommendations, and charts keep their descriptions.

## Creator Aliases and Scan Actions

This section covers which upstream evidence the follow management page's alias table, follow list pagination, and scan buttons each took.

The creator alias area provides, in order, "Add alias manually", a pending-merge list, and a saved list. Finding follow sources asks F95zone first; after login it reads the other platform handles on the first-post card of the matched thread, then looks the handles up on the remaining sources; when a result carrying a handle is checked for registration, the handle is stored directly as an alias of the search term and does not enter pending merge. The follow setting "Initial collection history range" defaults to the last 30 days, with 7 days, 90 days, or unlimited as options; it excludes older content by publish time while undated entries are kept; if fewer than 30 entries fall in range, the most recent entries outside the range are added, and if the first page is not enough it pages backward (at most 5 pages), the boundary moving to the earliest entry taken in. Each new source fixes the boundary at its first collection, and retries and automatic updates keep it; existing sources are not processed retroactively, and manual history paging first fills back what the first page skipped, then pages forward. List statistics include all imported unseen entries.

On 2026-09-13 [Table](https://www.boardui.com/components/table) and [Data Table](https://www.boardui.com/components/data-table) were checked. The live table uses `role="grid"`, with 14px cells and 10px 12px padding; the page CSS deployment id is `dpl_QqDLotDUMyvoaXmnBoPEK5tSk8mc`. The SHA-256 of the official `https://www.boardui.com/r/table.json` is `fc12a8f2f4012d9e983e0b9bbb10f9fe3288d74046566d2623d60e7056c50d88`.

On 2026-09-20 the live DOM and computed styles of Data Table were read again: sortable column headers use a 24px solid downward triangle, rotated 180 degrees for ascending; compact row height is 45px; selected rows use `background-secondary-default` and unselected rows are transparent; row separators stay visible in both light and dark. The follow table uses the same set of states, and the React `listbox` is registered with the site's existing overlay scrollbar rather than drawing a second scrollbar.

The creator alias tables reuse the existing Table and the Data Table frame shared with the follow list; pending merge is split into columns for selection, canonical creator, platform alias, basis, and actions, and saved aliases form a separate table; the canonical creator column reuses the author avatar of follow sources. The two name columns take 18% each and the basis takes the remaining width; each row is checkable, the header supports select-all and indeterminate, and the top right provides a "Merge selected" button with a count and "Merge all". One-by-one merge, manual add, and removal are supported. Bulk merge first lists the ownership relations, and on failure keeps unfinished items for retry. Peach's two tables use the `table` entry (built on React Aria) copied verbatim into `frontend/src/react/boardui/`, with the existing alias API; pending merge and saved each have only a few rows, so sorting and pagination are not needed and `@tanstack/react-table` is not wired in.

On 2026-09-13 [Table pagination](https://www.boardui.com/components/table) was measured: previous/next are at the two ends, page numbers centered, buttons 32px high with 8px radius and 14px font, front and back button padding 6px 8px, and 8px spacing in the pagination area. After clicking next, the current page becomes 2; the SHA-256 of the official `/r/pagination.json` is `cbbb09ecb86b3f93d4c923f02d272a7086db624ab69eaf5768f036b7458435f8`. Peach reuses the existing `pagination.ts` and Board styles, keeps the Lucide arrows and Chinese labels, and on phones the page numbers take their own second row.

The follow list's default view paginates by whole creator groups, and the table paginates by sorted sources; each page is 10, 20, 50, or 100, default 20, with the size preference saved on this machine. Switching sort, layout, or size returns to the first page, the page number is written to the address, and an out-of-range page falls to the last page. The default view supports expand/collapse all; selection is kept across pages and views, and select-all-on-page only affects this page's sources. The bottom bulk actions reuse the manual review's `selectiondock`, count, and cancel-selection pattern, offering check, enable, pause, delete; bulk requests use all selected sources. The scrolling table establishes a local positioning boundary so that hidden header text does not stretch the phone page. The loading skeleton reserves card or table structure according to the chosen layout.

Scan and collection reuse the Split Button appearance and shared menu positioning. The scan entry of `ProcessingActions` defaults to "Scan and complete metadata", and its menu includes the same primary action, complete metadata and previews, scan only, generate local previews only, and collect online metadata only; the missing-image entry defaults to "Complete metadata and previews" with a dropdown offering the two sub-items. Icons use the existing Remix Icon `RiDatabase2Line`, `RiHardDrive2Line`, `RiGlobalLine`, standing for metadata, local disk, and external source respectively, with no new dependency.

新入库范围在「扫描与采集」卡片内使用独立任务行：标题、BoardUI `Chip` 数量、范围说明与处理按钮同组，与概述之间用分隔线区分。待处理数量大于零时使用蓝色状态标记，零部时保持中性并说明下一步。桌面操作靠右，手机操作独占一行；运行中保留数量，处理入口等待当前任务结束。

隔离内存样例已验证全部合并、来源筛选、手动添加与菜单键盘焦点。1280px 桌面和 390×844 手机页面无横向溢出；待合并表格在自身区域横向滚动，已保存表格与添加表单在手机换行。

## Narrow-Screen Filter Box Scrolling

At 760px and below, the shared filter box of the home page and entity profile page leaves the top with the page when scrolling down and returns to sticky when scrolling up. Direction must accumulate 8px before switching, using the existing `--board-motion` transition on the top constraint, with the document placeholder unchanged; with reduced motion the switch is instant. At the top of the page, with keyboard focus, during input, and with an open menu, the filter stays visible; desktop remains sticky. Native sticky plus scroll events are enough for this interaction, so no dependency is added; browser visual acceptance was not obtained.

## Narrow-Screen Search Glass Motion

On 2026-09-11 [liquid-gooey spring.ts](https://github.com/Jakubantalik/Libraries/blob/422180dd7a5ac646c85deedc65500c4a74339127/packages/liquid-gooey/src/spring.ts) was checked, MIT, source SHA-256 `9dc0d5e9dd269000d95743572320039404982803d1b2da9977e717b5956d5481`.

The morph evidence comes from `LiquidItem.tsx` at the same revision: `morph.shape` describes size change as elastic deformation, overshoot, and soft-gel settle; `observer.ts` (SHA-256 `5e44c076e50ceb707572cd7b4e083f835a5d454cc21fb405f5c7dd3ff3ef4865`) drives position, size, and radius separately. Morph acceptance means seeing the outline itself change; clipping and opacity cannot produce this effect and do not count as evidence.

Peach uses the existing 313ms glass spring (stiffness 1700, damping 46, mass 1) to turn the icon's real rectangle into the search box, with the outline bulging mid-way and settling back; the reverse continues from the currently visible rectangle. Keyframes are confined to the viewport, the glass stays visible throughout, and text is not scaled horizontally. The size animation acts only on the absolutely positioned search layer, and the suggestion panel appears after the animation ends; start and end share the same 36px height and the top bar's center line. The buttons on the right are, in order, search, immersive, multi-select.

No dependency was added; the upstream was not replicated as a full search component. Upstream search interaction and browser measurement were not obtained: this retrieval did not go through the browser channel and only read the source.

## Data Cleanup Subpages

This section covers which Board templates the five subpages (review, HD targets, duplicate files, junk files, trash) referenced and how far each was adopted.

On 2026-09-09 the built-in browser read the component catalog and the eight templates in the Dashboard sidebar. The live CSS deployment id is
`dpl_3cjHNDgN6SsY8bTxSfXGACCCc8Zp`, and the style assets are `0pj0_xn8e6w4j.css`,
`0i-yg_o67~u3a.css`, `0z54_bq~~57b~.css`.

| Current reference | Actual observation and scope adopted |
| --- | --- |
| `/components` | Checked the full catalog of Foundations, Base, Blocks, Charts, Templates; catalog coverage does not mean every component state was accepted one by one |
| `/components/segmented-control` | Single-select slider, arrow-key movement, Space to select; suited to short local view choices |
| `/components/tabs` | Underline panel switching versus PillTab local filter distinction; Peach's ten review categories use vertical categories, keeping panel association and keyboard operation |
| `/components/data-table` | Result count, filter, per-row actions, partial-selection state, layered pagination; reuses Peach's existing selection and pagination logic |
| `/components/stat-cards` | Two structures: compact stats and a bottom comparison bar; the subpages only have the current task readout, so no trends without real data are introduced |
| `/templates/dashboard` | Breadcrumb, title actions, stats, and result toolbar row; radio track padding 4px, radius 10px |
| `/templates/marketing` | Category filter and result table are independent; the local filter structure is adopted |
| `/templates/calendar` | Month navigation and date grid; the five subpages do not adopt a calendar |
| `/templates/finance` | Summary metrics layered above the transaction result table; the result title and action-area ownership are adopted |
| `/templates/medical-profile` | Subject info, metrics, and reminders in separate zones; review keeps the subject, evidence, and action zones |
| `/templates/ai-chat` | Project sidebar and local Code, Changes, Browser switching; local switching is not treated as second-level page navigation |
| `/templates/ai-image-generation` | Gallery, Styles, and image grid; the preview-first card structure is adopted |
| `/templates/ai-profile` | Identity summary and metric cards; data panels unrelated to file cleanup are not introduced |

The templates were read page by page against the live DOM.
Pro templates serve only as public appearance and information-hierarchy references. The implementation uses verbatim-copied BoardUI source, shared HTML controls, and Board tokens, with no new dependency.

The scope is `/review`, `/quality-goals`, `/duplicates`, `/junk-files`, `/trash`.
The data management entry remains card navigation. Review categories are arranged vertically on desktop and wrap automatically on narrow screens; grouping, candidates, bulk actions, and pagination reuse the existing implementation.
Duplicate groups provide file previews and comparison of size, duration, and location; HD versions, junk files, and trash share the preview-card layout.

Peach uses Board's visuals and component semantics while keeping Vite, FastAPI, and existing media behavior. Board's public implementation depends on React Aria and, per ADR-0031, is copied verbatim as a React subtree into `frontend/src/react/boardui/`; legacy pages not yet migrated are adapted by shared HTML controls and native keyboard behavior.

## Control Mapping

The table below maps Peach's existing controls one-to-one to Board controls; check here first when looking for "which upstream this control should follow".

| Peach / Geist semantics | Board counterpart | How implemented |
| --- | --- | --- |
| Toggle, boolean switch | Switch | 42×24 track, 18px thumb, inset mark; keeps checkbox and switch semantics |
| Switch, exclusive segments | Segmented Control | Single-select radio, selected background inside the track; arrow keys keep native behavior |
| Button / Icon Button | Button / Icon Button | Primary action in blue, dangerous actions keep the danger color; icon-only buttons clear default padding |
| Input / Input prefix and suffix | Input adornment | Unit at the end inside the box, with a separator background; standalone numeric input keeps an accessible name |
| Numeric range description | Invalid + HintText | Validates the legal range; on error a small hint anchored to the field is shown and disappears after correction |
| Select | Select | Keeps the implemented list keyboard, focus, and menu positioning, using Board sizes and surfaces |
| Checkbox / Radio | Checkbox / Radio | Keeps native states and selection scope; shares color and focus |
| Tabs / page navigation | Tabs | Management navigation underline; configuration and settings divided by content |
| Fieldset | Card body and action area combination | Title inside the box, action area uses an adjacent shade, no box within a box |
| Modal | Settings Modal / Dialog | Settings with left sections and right title and independent scroll; business confirmations keep consequences and error recovery |
| Toast | Notification surface + Sonner stack | Brief action receipt, comparison below |
| Note / Banner | Field feedback / Announcement | Data errors and recovery actions stay where they occur |
| Tooltip | Tooltip | Keeps meaning and keyboard focus visibility |
| Table | Table / Data Table | Keeps selection, sorting, batch processing, and real data |
| Tag / Badge | Chip / Badge | Tag and status semantics kept apart, keeps the actionable scope |
| Sidebar / Drawer | Sidebar collapse and expand | One button controls the same navigation, mobile uses an overlay |
| Metrics strip | Stat Cards | Icon, primary readout, shaded bottom bar; keeps the statistics view switch, no up/down when there is no historical comparison |
| Taste ranking / dimensions | Bar List / Radar Chart | Standalone SVG and ranking bars, radar drawn only with at least three valid dimensions |
| Source count distribution | Radial Chart | Standalone distribution ring, sharing the current query result with source details |
| Spinner / Skeleton / Progress | Existing equivalent feedback | No fabricated progress, keeps business request timing |
| Scroller / Collapse | Overflow scroll / expanding group | Keeps keyboard, overflow, and expand behavior |
| Video player, photo lightbox, immersive queue | No direct replacement | Keeps dedicated interaction, only unifies the surrounding cards and controls |

## Design Boundaries

Constraints that always hold when changing the UI:

- `web/board.css` is a visual layer laid over `web/css/`, loaded with the page, with no switch. Read the two together:
  the base for size, color, and layout lives in `web/css/`, board.css only overrides, and selector weight must outrank the base.
- "Increase contrast" turns off transparency and refraction; the system reduce-transparency preference also uses solid colors. Refraction acts only on the navigation background and does not distort text.
- Setting titles and controls sit on the same row on desktop and wrap on phones when width is insufficient. A unit and its value belong in the same input box; features that can be turned off show a switch, and the value is hidden when off.
- The save key on settings pages is uniformly called "Save configuration", with the receipt "Configuration saved"; action keys such as save, check, add, refresh use the BoardUI `Button` `primary` (the default, blue background with white text). `secondary` is only for panel trigger keys and "Cancel", and irreversible actions use `danger` (`frontend/test/settings-buttons.test.ts`).
- Illegal values are not saved; after search history is turned off, search history is neither read nor recorded, and after related recommendations are turned off, that module is not requested.
- Board's free source is used under the MIT terms declared on the official site; Pro charts and templates do not use paid source. The project's own charts do not claim to come from Pro, nor promise Pro update entitlements.
- Remix Icon is pinned to 4.9.1 and registered under the Remix Icon License v1.0 inside the package; the Apache 2.0 stated on the official site does not stand in for the actual package license. Confirmed icons are kept, and candidates are reviewed in `<private verification records>`.

## Reference Evidence

On 2026-09-08 the official public registry was read; the raw files are in `<private verification records>`.

| Source | SHA-256 |
| --- | --- |
| https://www.boardui.com/r/input.json | ac1e66c9ed15f9db2750dd528bc894c856ac84e79f72ff4acb96f14b1ab9c249 |
| https://www.boardui.com/r/switch.json | 3412c1910b2fa7f5d17404bf50bd2503e9ca097cf9d741366379cf18e09ebeb6 |
| https://www.boardui.com/r/segmented-control.json | 62300be25310fef31962ddc237818739a2efd0d0143dd0832f3d1a2166c28e38 |
| https://www.boardui.com/r/button.json | 89cc2c176d1d94d481bbfc6e34f233ccf109c10d319533cc7c1e98923b6e7d69 |

Input's upstream error message sits below the field and is linked via `errorMessage`; the anchored small hint is a Peach difference specified by the user. The settings layout comes from the public `settings-modal.json`: 871×614, 274px navigation, 32px content margin, 24px outer radius. Each settings group sits on one gray card (16px radius, 12px left padding), and the settings popover's switch rows are the same kind of card as on the configuration page; blocks inside the card (media directories, CloudDrive tiers) use a white background with a separator-colored outline, not the same color as the outer card. The raw settings reference is saved in the same directory as `boardui-full/settings-reference.json`.

## Typography, Animation, and Progress

This section first states the site-wide type scale, motion, and progress conventions, then registers per-page control comparisons by date.

Body 14/20, secondary text 13/18, caption 12/16, headings layered as 24/34, 20/26, 18/26; editable inputs on phones are 16px with 40px controls, to avoid input zoom. The outer space taken by the input focus ring is counted in the index title row's margin.

The desktop sidebar is 60/260px wide, with buttons and navigation sharing one container; width and label transparency/blur use 300ms `cubic-bezier(.4,0,.2,1)`. The settings panel uses 300ms `cubic-bezier(.32,.72,0,1)`, scale .85→1, blur 4→0; the phone drawer slides in horizontally. Below the settings title is a 40px fade, shown over 200ms after scrolling. Row separators within groups are kept, and lines are not wrapped around every stat card. Player dragging, time progress, immersive slicing, and the like have no Board equivalent and keep media semantics; with the system reduced-motion setting, decorative animation is turned off.

Agent Progress's public demo uses timed steps. Peach's jobs advance by server-side state and use their own circular count progress, never treating a timer as completion nor pretending that a per-title looping stage is a whole batch of completed steps. A total of 9 kinds of entry were checked:

| Entry | Progress convention |
| --- | --- |
| Scan and collection | Current stage text + number of videos processed |
| Link check | Checked / total |
| Dead link cleanup | Shared background job count progress |
| Resource scan | Completed sources / total sources |
| Resource cleanup | Shared background job count progress |
| Follow update | Completed sources / total sources |
| Taste collection | Shared background job count progress |
| Add follow | Shared background job count progress |
| Version update | Already has download, verify, and install stages; owned by the version branch |

Charts checked the public behavior of Stat Cards, Bar List, Radar, Radial, Contributions, Heatmap, and Sankey. Library statistics use the current snapshot; browsing history generates a weekday/hour heatmap and daily activity cells from de-duplicated real visit times, supporting 7, 30, 90, 365 days and all time. `last_played` does not stand in for a full playback event sequence. Creator flow uses the actual association counts between source sites and creator leads; non-exclusive taste tags do not enter the funnel or flow diagrams.

Slider, Notification, Tooltip, Carousel, Checkbox, Chip, Dropdown, Link Button, and Button Group have had their official public registry obtained, with files in `board-reference` in the acceptance directory. Range controls keep native keyboard operation, Checkbox supports partial selection, notification hover and focus pause the timer, and image viewing reuses Swiper's zoom and keyboard navigation. Rankings show five items by default and expand the current ranking data through a bottom fade and a button.

The Pro source of Radial Chart Card, Bar List Card, Heatmap, and Sankey was **not obtained**; the current versions are Peach adaptations implemented from public documentation, not installed Pro components. The ring chart connects library and cloud-drive counts and supports loading, focus, and selection feedback; Sankey uses d3-sankey's mature layout computation, keeping source colors, flow focus, and value linkage.

Additional public reference file SHA-256:

| Registry | SHA-256 |
| --- | --- |
| sidebar.json | b3fb5a01f2b334062a0645b71a6c55eec6874da90842270259ff0b1cdc67e42b |
| auth-card.json | cf4159a700769519867f150acbfafd6f3345b9990fd5b6b76c7609407f413cf2 |
| settings-modal.json | eb01742ca56daa473f042244176cd697fc20010ab18f680e3a3a8012d69f6c5b |
| typography.json | 5b7eca25350829755eb15cb474ab009fd1f8b929e62d54182f648b4f2e97bf8e |
| stat-cards.json | 3a140eeb9ab4ebc327e0e585f6cd6e4331be3e68694e72ec6aab80fd5adf705c |

### Follow List Table View (2026-09-08)

共享数据表的主要名称列默认承接剩余宽度；馆藏、关注来源、JAV 订阅、创作者别名、文件已丢失的记录、链接检查与诊断清单共用这套列宽偏好。手动调整后保存像素宽度，重置列宽恢复自适应，列显示独立保存。名称、路径、地址与结果正文以单元格可用宽度折行或省略；路径与地址随列宽重算中间省略，完整原文保留在提示和无障碍名称中。文件已丢失的记录根据有无替代文件给操作列分配默认宽度；窄屏在表格内横向滚动。

取证来源是 https://www.boardui.com/components/data-table 的实时 DOM 与样式表：`_next/static/chunks/0n0ugaibgw__p.css`（SHA-256 `a856db5e9e1a58b2e32b7bfa6d7f1cab69dd09e4bd7ac22fc455dd10b525cf27`）里的 `.bui-table` 规则，以及公开注册表 `r/table.json`（`fc12a8f2f4012d9e983e0b9bbb10f9fe3288d74046566d2623d60e7056c50d88`）和 `r/data-table.json`（`613299eca0f448460a546f7959feab8dab19fbfd6e18670f7216ff304a1e3574`）。

On 2026-09-16 these three were re-fetched: `r/table.json` and `r/pagination.json` are byte-for-byte unchanged, and `r/data-table.json` is now `7bb73a6cd099b9b16390e5fe00f8ba2d55b5ef96c1e8f90a056168cd2e3235e6` (24531 bytes), the upstream having changed it itself. What Peach copied into the tree is the `table` entry, while `data-table` is only read, not copied (reason in `frontend/src/react/boardui/ORIGIN.md`), so this drift does not affect the hashes of the copied files.

| Upstream measurement | Peach table view |
| --- | --- |
| `th`/`td` padding `--spacing`×3 / ×2.5, measured 10px 12px; `vertical-align:middle` | Same values |
| Type scale `text-body-medium`, measured 14/20, 500; header `--color-text-tertiary`, body `--color-text-primary` | Same values; the Board layer uses the same-named tokens, the legacy layer uses `--muted`/`--ink` |
| Table sits on a `--color-background-primary-default` surface; header on `--color-background-secondary-default`, with one `--color-separator-border` line above and below | Same values. The outer frame does not use the author card's `--ground`: the Board layer sets it to secondary, the same color as the header |
| `tbody tr` has only a bottom line, hover does not change the background (measured `rgba(0,0,0,0)`) | Same values |
| Row focus `data-focus-visible` inset 2px focus ring | Not adopted: Peach rows are not focusable, focus lands on the controls in the cells |
| `bui-table-sm` compact tier (10px 6px, `text-body-2-medium`) and the footer Normal/Compact segmented control | Not adopted: the view switch is itself the density choice |
| Select-all checkbox in the first header cell, with indeterminate | Not adopted: select-all is tied to the bulk actions in the selection bar above the list, avoiding two select-all boxes |
| Pagination Previous/Next at the bottom | Adopted: the table paginates by sorted sources; page count and page number rules are in "Creator Aliases and Scan Actions" |
| Sortable headers carry a `ChevronSortDown` glyph | The same `ChevronSortDown`; sortable headers plug into the toolbar's existing sort |
| Table `min-w-[1000px]`, outer `overflow-x-auto` | `min-width:760px`, outer horizontal scroll, columns do not collapse on narrow screens |

The upstream page does not expose the selected-row style (after a checkbox is checked, `tr` has no `data-selected`): Peach lays an 8% blue background on selected rows without a blue line. An extra `.ftableframe` layer outside the table handles the border and rounded corners, and `.ftablewrap` only handles horizontal scroll: both ends fade by scroll position to say "there is more that way", and when the mouse rests on the table the vertical wheel turns horizontal, wired the same as the review page's tab strip; the border stays on the outer layer so it does not fade with the content. All five header columns are clickable, and the dimensions are the same union as the toolbar dropdown: author and last check compare by author group, while source, site, and status compare by individual source.

### Follow List Frame, Source Rows, and Checkboxes (2026-09-08)

The evidence source is the public registry `r/checkbox.json` and `r/checkbox-card.json` (`checkbox-glyph.tsx`, `checkbox-card.tsx`), plus `check-draw`, `--shadow-checkbox-selected`, `--shadow-xs`, and the token definitions in the site stylesheet `0n0ugaibgw__p.css` (SHA-256 `a856db5e9e1a58b2e32b7bfa6d7f1cab69dd09e4bd7ac22fc455dd10b525cf27`).

| Upstream | Peach |
| --- | --- |
| CheckboxCard: 10px radius, 1px `border-button-default`, pl 16 / pr 20 / py 12, hover `background-primary-hover` 150ms, whole card clickable | Each source row of the follow list; checkbox on the left (the right of a Peach row has the check and remove action keys); the selected row keeps the focus-ring color border, while upstream only lights the checkbox |
| Checkbox 16px, 4px radius; unselected `border-checkbox-default` (light neutral-300, dark neutral-700) + `shadow-xs`; hover border to neutral-400/500, background unchanged | `.ui-pcheck` same values; the legacy layer's hover background change is overridden by the Board layer |
| Selected blue-500→600 gradient + `inset 0 2px 0 0 #ffffff40, inset 0 0 0 1px accent-500`; hover gradient raised to 400→500 | Same values, gradient taken from `--board-blue` |
| Check mark 2px round-capped, `pathLength=1`, `check-draw` 200ms cubic-bezier(.65,0,.35,1) drawn from zero; shown directly with reduced motion | The check is the sprite's `check`, which cannot take pathLength, so dasharray is written with the real path length 23; otherwise same values |
| On the page, cards sit on the primary surface | The whole follow list is one `--ground` card (the same one as "Add follow"), author cards are the primary surface, and source rows are the CheckboxCard; that way the hover primary-hover is not the same color as the background |
| Segmented Control dark: track neutral-925, thumb neutral-800 | Peach's dark page itself is deeper, so the track stays tertiary (#262626) and the thumb lifts the main text color 14%; this group replaces the "not obtained" item "Segmented slider dark mode" above |
| Avatar `avatar-neutral-background`: light neutral-300, dark `background-primary-default` | The two home rows and identity avatars keep mixing 10% of the main text color into the background: in dark the upstream value is the same color as the card background, and the avatar would lose its boundary |

The media library icon picker in the same batch: the cells and the trigger button use the same 20px, 2-stroke glyph, centered in the same 20px box; the 42 candidates run seven per row, with groups for subject, identity, scene, and medium; a cloud-drive library not otherwise chosen shows the source's site mark (server-side `media_libraries.libraries` already lands a single-source library on that source), while a local path has no recognizable source, is written "Default", and shows a disk.

### Dropdown Menu Open/Close Motion (2026-09-08)

The evidence source is `components/base/dropdown/menu-styles.ts` in the public registry `r/dropdown.json` (SHA-256 `e91198d2f1eb131570a0aab53685a4c2c724365d17aecbc5d2113e561152b0b6`): `MENU_POPOVER_SURFACE` says `transition duration-150 ease-out`, and `data-[entering]` and `data-[exiting]` are both `opacity-0 scale-95 blur-[2px]`; the scale origin follows `data-[placement]`: bottom uses `origin-top-left`, top uses `origin-bottom-left`, left/right use `origin-right`/`origin-left`. The same recipe is shared by Select and Dropdown.

| Upstream | Peach |
| --- | --- |
| 150ms ease-out, opacity, scale .95, and 2px blur in and out together | Same values, two keyframe sets `board-menu-in`/`board-menu-out` |
| React Aria attaches data attributes during entering/exiting | Entry starts in CSS from `:not([hidden])`; exit adds `leaving`, and `dismissMenu` waits for `animationend` before hiding |
| Origin follows placement | `wireAnchoredMenu` writes `data-placement` (bottom/top/right); the sidebar add-page listbox opens upward, with the origin fixed at the bottom edge |
| Only two kinds of panel, Dropdown and Select | All dropdowns site-wide use the same one: anchored menu, Select, context card, media library menu, search suggestions, player context menu, sidebar add-page, tag picker |
| Not obtained: the concrete values of `shadow-dropdown` and `--color-border-button-default` | The panel's border and shadow keep the existing Board-layer writing |

The legacy Geist layer gets no animation; with the system reduced-motion setting the global rule turns it off, and when `dismissMenu` reads `animation-name:none` it hides directly.

### Toast, Note, and Notification Comparison (2026-09-08)

The evidence source is `components/base/notification/notification.tsx` in the public registry `r/notification.json` (SHA-256 `92d9e93d7c89f5cdfd79b5f05c14f3663f5aa9fd7bb6bf68729aa0b6e6bb714e`): card `p-4 pr-11`, `rounded-2xl`, `border-border-button-default`, `bg-background-primary-default`, `shadow-dropdown`; 40px circular status icon; title `text-body-medium`, description `text-body-regular text-text-secondary`; close key `top-3 right-3`; 3px blue countdown bar; exit `opacity 0 / y 8 / scale .96 / blur 3px`, 180ms ease-out; entry only when `introDelay` is passed; viewport stack `min(400px,100vw-24px)`, 12px spacing, position changes via spring.

| Peach today | Handling | Basis |
| --- | --- | --- |
| Toast (action receipt, undo) | The stack uses [Sonner](https://sonner.emilkowal.ski/) (`frontend/src/react/toaster.tsx`): enter/exit, stacking, hover expand, swipe dismiss, and hover pause of the timer follow it; surface, line, and shadow take the dimensions of the Notification above, with the popover tier's corner radius, and no status circle or countdown bar is drawn | Sonner specified by the user; the receipt's surface is the same kind of popover as menus and the tutorial card |
| Toast body and action | A single paragraph of body, at most one "Undo", using Sonner's action key; the undo result is written back to the same entry by the same id | Peach's receipts are a single sentence |
| Toast position | Bottom right; when the install tutorial card is on screen, the stack's bottom edge is lifted above the card's top edge | Both sit at the bottom right, so the receipt does not cover the tutorial |
| Success color | The check uses the primary color | The values of the `notification-success-*` tokens were not obtained |
| Note (persistent feedback beside fields and task panels: read failure, task status, completion summary, over-broad permissions) | Kept, not switched | Notification is a stack floating at the viewport corner that disappears on its own; these must stay where they occur, and failures also need a retry entry |
| Banner (page-level problems and recovery actions) | Kept, not switched | The upstream registry has no source for Announcement, not obtained |
| Tooltip | Kept | Already has the Board Tooltip counterpart |

### Taste, Review, Home, and Detail Control Alignment (2026-09-08)

New evidence: the public registry `r/tabs.json` (SHA-256 `feab9789b17008436597b51e52b90de5cff6180924f2a7c8bef14a2136d3a240`, containing `tabs.tsx` and `pill-tab.tsx`), `r/avatar.json` (`614f2a384e2d44c0a15df8e3fc42c1648ccd7101f1c8be98911087641ab28aec`), `r/chip.json` (`d2b0dd38146325acada58fbc241d13fcd633bb5407ce1ef457e752023fe282de`), kept in `<private verification records>` together with the already-registered `segmented-control.json` and `sidebar.json`. `avatar-group`, `bar-list-card`, and `radar-chart-card` return 404 in the registry and were not obtained.

| Location | Upstream | Peach |
| --- | --- | --- |
| 口味维度、复核分类的标签条 | Tabs：1px 基线、2px 蓝线随选中项 `transform`／`width` 各 200ms 滑动；选项 px 10 / py 8、Body 1，选中蓝字 Medium；计数徽标 Caption Medium、px 4 / py 1、4px 圆角 | 复核页的 `.reviewtabs` 接进同一份 `wireBoardTabs`；两处按上游字号与间距重排，计数徽标沿用上游两态 |
| 口味页「浏览器记录／Peach 内部」 | Segmented Control：tertiary 轨道 p 4 / r 10、选项 px 10 / py 4 / r 6、滑块 200ms | `.insightswitch` 接进 `wireBoardSegments`，原生 radio 不变 |
| 排序行的版式切换 | 同上，高度 36px | 压到 30px 与同一行的排序键、换批键齐平：主动保留的差异 |
| 分段滑块的暗色 | `segmented-control-selected` 暗色值未取得 | 主文字色 14% 混进轨道色；暗色里轨道与 primary 同值，滑块必须比轨道亮一档 |
| 排名条、雷达图 | 上游 Pro 图表源码未取得 | React 版直接显示终值，没有入场动画：整块由 island 异步挂载，挂上的那一刻已经在视口里，从零长一遍变成页面读完之后才开始动 |
| 排名行悬停与展开键 | PillTab 悬停 `background-primary-hover` 200ms | 悬停改为主文字色 6% 薄底 + 200ms：暗色 primary-hover 太跳、亮色看不见；展开键同一层 |
| 三个面板标题（口味总结、浏览器画像、数据源） | Heading 20/26 | 同一档，React 版用 `text-title-2-medium`；内边距统一 20（卡面走 `cardClass()` 的 `p-5`，三档内边距收成一档） |
| 复核「跳过」 | Chip blue：亮 200/800、暗 950@60%/300 | 采用；`error`／`primary` 不变 |
| 交集条上已生效的筛选 | Chip subtle + neutral：`px-1.5 py-1`、Body 1 Medium、tertiary 底配次文字色，不描边 | 主动偏离：全站标签以详情面板那颗为基底统一，所以这一颗也走 `--tag-radius`（这套里是 8px）+ 一圈 `--line` + 28px 移除键，只有填充取 `--picked` 说明它已生效。上游 Chip 只标状态，Peach 的每一颗都要能就地撤掉，同一个词还要在卡片、详情面板、筛选条上认得出是同一样东西 |
| 侧栏名单的展开键 | 无对应（上游侧栏不截断名单） | 取排名卡那枚展开药丸的身量；再按一下收的是整组，不是把名单退回另一个断点 |
| 侧栏收起键 | 36px、`rounded-2lg`、`foreground-icon-secondary`，收起时与品牌相隔 10px | 采用，图标沿用 Peach 的 `panel-left` |
| 详情页门挡 | 无对应 | 铺满播放器格不留黑；播放器格只圆左上角（右贴侧栏、下接「接着看」），窄屏与影院模式圆上面两角 |
| 没有图的身份头像 | Avatar neutral 的暗色默认背景与 primary 面相同 | 采用范围与前景对比度见「无图头像与浮卡子页」，不能仅复用上游默认背景 |
| 首页女优与厂牌两排 | 无 Avatar Group；PillTab gray + Avatar sm（24px） | 见 2026-09-09 那一节：女优竖排人像格、厂牌 40px 灰 Pill |
| 管理页标题 | 无对应 | 只在 812px 窄列页面居中，别处与面包屑同一左边线 |
| 沉浸模式 | 无对应 | 随机流在入口筛掉脱盘来源的片子 |

### Ranking List, Review Floating Box, Bulk Bar, and Sidebar Switcher (2026-09-08)

The evidence source is the live DOM of boardui.com: `/components/bar-list-card` and the home sidebar (`aside` 260px / 60px collapsed). Registry entries other than `r/bar-list-card.json` and `r/sidebar.json` were not obtained.

| Location | Upstream | Peach |
| --- | --- | --- |
| Ranking row | Row 36px, radius 8, no hover class; fill bar `absolute inset-y-0 left-0` radius 8, `chart-6` at 14% opacity, only width and color transition at 500ms | Row and fill bar radius 8, fill 15% (utility-class step), row hover background removed (hover background stacked with the fill bar looks dirty); row height kept at 44 to hold two lines of text; the fill bar is an SVG with `preserveAspectRatio="none"` covering the whole row, width written on the `rect`, not via inline style, and no transition |
| "Show N more" | 40×20 pill, centered 4px from the bottom, `border-button-default` outline, primary background, xs shadow, 14px arrow, hover primary-hover 150ms; collapsed rows are simply not rendered, with no fade | Same size and color; keeping the 48px fade is a deliberate difference; when the expand key is pressed, the list height goes through the shared Collapse's `.2s ease-in-out` (a deliberate difference, upstream has no height animation; a fast-then-slow curve grows the part in the viewport in the very first frame, so the expansion would show no animation), the transition is attached only for that press, and height changes caused by switching dimension tabs land immediately without jitter; when collapsing, the expand key is pinned under the pointer frame by frame, and since the card is often at the page bottom, the viewport pullback caused by shortening completes in one direction, not first up then rolling back |
| Delete key of the data source card | Icon key on the site `size-9 rounded-2lg text-foreground-icon-secondary`, only color transitions | 36px, radius 10, transparent background, hover a thin 6% main-text-color background plus `--drop` text, `transform:none` |
| Metric card hover | No counterpart | `--surface` and `--ground` are both white in light, so it changes to a 6% main-text-color mix |
| Management page title | No counterpart | Title, breadcrumb, and lead ignore layout classes and are always aligned to 1120 (subpages such as review, HD versions, duplicate files have no layout class), and the review page container has the same width |
| Primary button | Button 36px, Body Medium | `.primary` also enters the 36px / radius 10 / Body Medium box; the review bottom toolbar is pressed to `--control-h` as a whole, and the primary button follows |
| Controls on gray cards | Primary white-background control on a secondary background | Configuration page dropdowns, inputs, icon trigger keys, and the follow page's add box are all white background |
| Notification status circle | Notification uses lucide icons | Warning state changes to `circle-alert` (the hand-drawn `i-alert` leaves only a dot at 20px); Note keeps 12px above and below |
| Review page floating | No counterpart | The tab strip stays in place and the toolbar floats by itself; when the group bar sits directly beneath it, the two bars form one flat-bottomed glass frame (top 20 0 0 / bottom 0 0 20 20, the same `--glass-fill`, separated only by a 20px gap); both bars extend 16px outward and are padded back so the controls and cards share the same left edge |
| Detail page close key | Reference YouTube: the key on the player is a black background even in light | 60% black background with white text, 20% white halo on hover; with a white background in light, the white halo would not show hover |
| Data management skeleton | No counterpart | The scan card's "Collect sources" and "Scan and complete metadata" are in place from the skeleton on, and swapping in content only makes them clickable |
| Bulk bar | No counterpart | When hiding bulk keys, prevent Board's `inline-flex` from overriding `[hidden]`, otherwise three extra keys appear when going from the junk page back to the home page; "Move to trash" uses the error button with the same red gradient, with unified wording on the home and junk pages |
| Media library menu | A side popup menu sits 8px outside the sidebar's right edge | When collapsed the trigger is only 32px, and the menu starts from the sidebar's right edge so it does not cover the sidebar |
| Video grid | No counterpart outside bar-list-card | The frame around the grid is removed and cards sit directly on the page |
| Social media marks | No counterpart | Instagram and X share the same ink-colored disc, with glyphs from Phosphor instagram-logo |
| Sidebar switcher | 32px round avatar + name + double arrow, `gap-2`, hover draws a 2px ring 6/5px outside the button; the collapse key is only a 20px-high icon with no background | The database mark goes into a 32px `tertiary` disc, with hover and expanded state sharing one ring; the collapse key is 20×20 right-aligned when expanded and 36×20 above the mark when collapsed, 10px apart, with the 62px header matching the upstream height |

### Home Two Rows, Follow Bulk Bar, Review Pagination, and Data Management Page (2026-09-09)

The evidence sources: the public registry `r/pagination.json` (`pagination.tsx`), `r/stat-cards.json` (PlainStatCard in `stat-cards.tsx`), `r/avatar.json` (`avatar.tsx`), and the live DOM of `/templates/dashboard` and `/templates/finance`. For these three JSONs only the body was read, and the SHA-256 was not obtained. The other views switchable on the template's left (calendar, medical-profile, ai-chat, ai-image-generation, ai-profile) are calendar, profile, chat, and image generation pages with no counterpart among Peach's pages and were not adopted.

| Location | Upstream | Peach |
| --- | --- | --- |
| Home performers row | Avatar only goes up to lg 36px, no vertical portrait cell | Vertical cell: 48px round avatar on top (the upstream `size-12` tier), name in Caption below, cell width 76, radius 12, no outline; hover primary-hover, selected tertiary background |
| Home studios row | PillTab gray | 40px gray Pill scaled up one tier: 28px round mark on the left, name on the right, radius 12. The tag row is 30px outlined pills, and studios are told apart by size, round mark, and borderlessness |
| Follow page bulk bar | No counterpart | The bulk bar only has per-row actions like save and skip; selection relies on the "Select all / Deselect all" at the start of each row |
| Review queue pagination | Pagination: nav aligned to both ends with `gap-2`; Previous/Next are 32px secondary small keys (radius 8, padding 6/8, with arrows); page numbers `size-8 rounded-lg` Body Medium, current page border-button outline + primary background + xs shadow and marked `aria-current="page"`, others secondary text color, hover secondary-hover; both sides fold into "…" each keeping one neighbor page; not rendered with one page; no transition | Size and color copied; pagination is done in the frontend, 20 cards per page, limiting the number of cards rendered at once; arrows use the sprite's `chevron-left/right`, text "Previous / Next"; grouping and filtering are computed over the whole queue and only this page's cards are drawn; switching category/group/filter returns to page 1 |
| Data management page | dashboard/finance templates: a row of plain stat cards on top (132px, radius 16, secondary background, p 16; 32px icon cell + 20px glyph; label Body Medium secondary text color; readout title-1-medium 24/34; `grid-cols-2 lg:grid-cols-4 gap-4`), with chart cards and data tables below | Five readout cards in one row (within 1120), folding to two columns and then one column when narrower; the whole card is an entry button, hover lifts a 6% main-text-color background (upstream cards are not clickable); the Caption line below the readout is the breakdown from the same payload; scan and collection and media repair each take a whole row, description on the left and button on the right; the result readouts of resource sync use the same card set, a row for sources and a row for pending permanent deletion / empty folders / cache, each split evenly |

### Review Card Candidates, Unlisted Genre, and Skeleton (2026-09-11)

Radio card reuses the `r/checkbox-card.json` (`checkbox-card.tsx`) obtained on 2026-09-08, with no new evidence:
the upstream has only CheckboxCard, and the Radio version is the same card with a different control type.

| Location | Upstream | Peach |
| --- | --- | --- |
| Metadata candidate | CheckboxCard: whole card clickable, 10px radius, 1px `border-button-default`, hover primary-hover, selected keeps the focus-ring color border | A group of candidates is `role="radiogroup"`, each card clickable as a whole with the dot on the right; the upper half of the card is the value given by this source and the lower half is the evidence row, the evidence sunk one shade with a `border-top`, because when the two segments are the same color you cannot tell which sentence is the value and which is the support |
| Candidate card title | No counterpart | The card first writes which field it is asking about (`<name> · performer`), with the source and evidence note below; if the title wrote only the subject, truncation by an ending ellipsis would hide what this candidate is meant to replace |
| Unlisted genre | No counterpart | Below the candidate card hangs a `--surface` listing area: original text on the left, Chinese tag input in the middle, "List" and "Not content" on the right. It decides "what this word counts as from now on", which is not the same thing as the candidate card's "what this record says", so it is not mixed into the candidate column |
| Glass frame edge | No counterpart | The toolbar and group bar each draw an `inset` ring of `--glass-rim`/`--glass-low`, with the seam edge undrawn (no bottom edge above, no top edge below), so the two together still form one ring. In dark, this glass has the same black as the page, and without the ring it would be just a black square |
| Review skeleton | Skeleton is only a placeholder shape | The skeleton uses the class names of the final containers directly (`.review-workspace`, `.reviewcontrols`, `.reviewbulktoolbar`, `.reviewlist`), with columns, column widths, and card height all given by the review page's own rules; `renderInitialSurfaceLoading()` writes `data-surface` before drawing, otherwise a deep-link cold start would first lay out the default layout and then jump. Category names are static text shown directly, and only the counts and the three toolbar controls are placeholders |
| Floating frame in the skeleton | No counterpart | The skeleton has no group bar to connect to, so the toolbar seals itself: all four corners rounded, all four edges outlined, and not sticky, because `updateReviewSticky` has nothing to measure until the data arrives |

### 复核卡片现行组合（2026-10-27）

资料字段使用独立的 BoardUI Select，不要求先按字段分组。来源依据为中性 secondary Button 与 CollapseRegion，不使用带悬停下划线的 LinkButton。文本差异使用 mark，并复用黄色背景及文字语义 token；共同文字保持原样，来源选择与写入值不受高亮影响。

复核候选已改用官方 `RadioCard` 与 `RadioGroup`，替代前述基于 CheckboxCard 的早期组合。源码摘要、复用与差异见[复核卡片取证](reference-snapshots/boardui-review-cards.md)。外层使用管理页填充卡，字段徽章保持中性；当前值、来源选择及可展开依据共用一个正文滚动区。底部复用 Fieldset 操作带，忽略为中性文字键，通过保留蓝色主动作。来源依据的展开独立于单选和资料提交。

### 艺人／厂牌资料页与关注页（2026-09-12）

Evidence is in `<private verification records>`: `tabs.json` (SHA-256
`feab9789b17008436597b51e52b90de5cff6180924f2a7c8bef14a2136d3a240`, 13612 B), `avatar.json`
(`614f2a38…b28aec`), `chip.json` (`d2b0dd38…e282de`), `badge.json` (`264755bb…9aec6`).
The three registry entries `card`, `page-header`, and `profile-card` return 404 and were not obtained: the profile card's shape reuses the `.fsec` of the follow management page obtained on 2026-09-08, with no guesses added.

| Location | Upstream | Peach |
| --- | --- | --- |
| Profile card | Not obtained (card/profile-card 404); card shape reuses `.fsec`: secondary background, 18px radius, no outline, card foot `--board-card-foot` | React island `entity-hero` (`frontend/src/react/entity-hero/`): avatar sized by the number of rows in the identity column (160px when both the external-link row and the watch row are present, otherwise 120px), with three identity lines beside it: name Title 3 (24/32, 500), aliases · video count · agency, external links as 36px / 10px-radius secondary Buttons; co-starring artists go into the strip at the card foot `[data-entity-foot]`, which is a note about this person, not body content; an agency's roster is body content and goes in the Tabs tier. On narrow screens the card is unchanged, only the body cell inside the card becomes a single centered column with a 96px avatar, and the external-link row scrolls sideways without wrapping |
| Video / photo / artist switch | `tabs.tsx` is the form of page-level navigation; this group stays on the filter overlay and does not take Tabs | A group of round media keys at the far left of the overlay (`mediaViewButtonsHtml`, `aria-pressed`), where the selected one is marked by the round glass `viewglide-round` sliding over, with a glass block each for the four watch states; after a vertical bar come the watch states, then after another bar the tags. The underline Tabs of `boardTabsHtml()` are only for the index page's address switching |
| Profile page filter bar | No counterpart | React island `entity-filter`: media round keys, four watch states, and tags in three segments from coarse to fine, `aria-label` "Media and tags"; in photo and roster views the watch states, tags, and intersection bar collapse, the vertical bar is hidden, and the round keys stay |
| Profile page photo tier | No counterpart; segmenting by work was chosen by the user against a preview (ADR-0068 revision) | A photo key appears when there are local images or sample shots by catalog number, and the number on the key is the sum of both. The wall is in the React island `entity-body`. Sample shots are segmented one work at a time from newest to oldest release date: the segment header `[data-photo-group]` is a row with the catalog number (`--fs-md`, main text color, monospace), the title (truncated if long), and "Source Samples · release date · count" at the right end, with this work's own `[data-photo-wall]` below; after the segments comes the local image wall, with a "Local images · N" segment header when sample shots exist; the readout "Photos · N · Samples M · K works", with the first part omitted when there are only sample shots, and no shuffle either. Paging counts only local images. When a sample cell cannot be fetched, only the `<img>` is dropped and the cell keeps an empty `--sunk` background, held at 3:2 in the masonry; the lightbox detail reads "Source · n / N · size" (ADR-0068) |
| Profile page online tier | No counterpart; the user asked to follow the follow page | When a creator is bound to a follow author an "Online" view is provided, and when there are no local works it opens on online content by default. The video/image switch and follow status, source, tags, and sorting reuse the follow page; the body reuses `FollowCard` and the photo wall. The address records `media=online`, and in-page filtering, pagination, and scroll are kept after closing the detail (ADR-0096) |
| Follow page | No counterpart (upstream has no update feed page) | Aligned with the home page, not a separate set; avatar rows, topic round-mark framing, filter overlay, and sorting are in the "Follow Page" subsection below |
| Skeleton for the two pages | Skeleton is only a placeholder shape | Both write out the `.board-filter-frame` outer frame and the `data-filter-row` of the upper and lower rows in full, otherwise the seconds of waiting show two separately rounded overlays; the profile page skeleton uses the real class names `.entityprofile`/`.ui-entityidentity`, and the filter strip row uses `data-skeleton-tier="pill"` to lay down pills |
| External link icons | `avatar.tsx` has only round; no counterpart for the site-mark tier | The site round marks and social media marks `[data-link-icon]` in the profile card's external-link buttons get no underlay color and are collapsed into rounded squares with `--badge-radius`, the same shape as the 20px icon slot; external links are always `target="_blank" rel="noreferrer"` |
| Artist / studio / agency indexes (`/performers`, `/studios`, `/agencies`, `/creators`) | No counterpart for the index grid; card shape takes `stat-card` (secondary background, 16px radius, p16 reduced to p12), name Body Medium 14/20 500, count Caption | `.icell` is one card, hover lifts 6% of the main text color; the large-image layout has avatars with 10px radius and left-aligned text; "Load more" is a 36px / 10px-radius secondary Button. Studios and agencies are two addresses, switched by the underline Tabs of `boardTabsHtml()` in the row under the page header (`data-index-kind`, with object icons), not a filter. `/performers` additionally has a local/online tier (`data-performer-scope`, sharing `INDEX_SCOPES` and `scopeTabsHtml()` with the tags page): the online tier reads `/api/follow/authors`, several sources of one person are merged into one row by alias, and the count uses the same basis as the follow page's readout (by number of entries, not release groups). Those with a profile open the creator profile page, those without go to `/follow?author=`, and readouts that share a name with a local creator and await user confirmation carry "Pending confirmation" and open that person's profile page (ADR-0096); the address carries `?scope=online` and a deep link lands directly on that tier |
| Tags page (`/tags`) | No counterpart for the alphabet; group cards take the `stat-card` shape, rows take bar-list's 36px / 8px | Local/online is page-level Tabs (`data-tag-scope`); switching tiers only redraws `#indexBody`, since the page header, search box, and that overlay exist synchronously, and laying a skeleton over them would erase controls already on screen and redraw them. The type pills, readout, jump by initial, and tag-cloud/alphabet switch are folded into the home page's glass overlay `tagFilterFrameHtml()`: the upper row is `.tagcategories` pills with type color dots, the lower row is the readout + `.alphajump` + `iconSwitchHtml`; the overlay lives in `#indexFilters`, whose parent is only as tall as the overlay so sticky would be stuck, and `display:contents` takes it out of the box tree. In the alphabet, `.ui-alphagroup` is one card per initial, with a `.ui-board-tab-count` badge hung beside the initial, and `scroll-margin-top` yields to the sticky overlay |

#### Follow Page

The follow page has no counterpart upstream (an update feed page), and is aligned with the home page as a whole, not a separate set.

Avatar rows:

- The two rows on top mirror the home page's two rows: the author row `.followauthors` corresponds to performers, being `.av` of a 48px avatar plus name; the topic row `.followworks` corresponds to studios, being `.brandpill` of a 28px round mark plus name. The two rows share the same rules in board.css with the home page, and the skeleton also lays each its own tier (`data-skeleton-tier` takes `av` and `brandpill`).
- Topics collect works recorded by sources as copyright and characters recorded as character. Generations of the same series are merged into one (`_WORK_SERIES` prefixes plus `_WORK_ALIASES` aliases), and the disambiguation parentheses at the end of a character only affect display.
- Publishers, platforms, festivals, and placeholder words are removed by `_NON_WORK_TAGS` plus the company suffix pattern `_COMPANY_TAG_RE`; races and placeholder words recorded as character are removed by `_NON_CHARACTER_TAGS`. Display names capitalize the first letter of each word (`_work_label`), and words whose source already wrote their casing are kept as is.
- The sampling of the author, topic, and tag rows always goes through `followRandomOrder`, picked randomly by the seed of this visit and shuffled on each entry, the same as the home page's two rows: taking the first 24 by count would forever expose only the same twenty-odd of some eighty topics.

Topic round-mark image selection (`/work-icon?work=`):

- The server takes the topic identity and ranks five candidates in the ledger by "carries `3d`, high score", and goes down taking the first cover whose face is large enough. It takes the site's high-definition tier: in a 250px thumbnail a face is only a dozen pixels, which cannot be detected.
- "Face large enough" is the two lines of `_usable_face`, and both must pass before stopping, otherwise the next one is looked at:
  - Share `_WORK_ICON_FACE_SHARE` (`FACE_PX_IN_STORE ÷ ICON_SIDE`, the face box width taking 6.6% of the image's long side) requires a large enough face in the round mark. A YuNet detection alone cannot rule out wide-shot false detections, so low-share candidates continue to the next one.
  - Pixels `FACE_PX_IN_STORE` (34px) limit the ability to enlarge: the page must not upsample when zooming to the face, and the number of face pixels in the source image decides the usable size. A low-resolution thumbnail may fail this requirement even if its share qualifies.
- When this library's few are not enough, go ask the site once (`work_icon_search_urls`): use `sort:score` to ask for the 8 hottest and append them after this library's, first asking only for those with `3d`, and if that tag has not one, ask once more with no form restriction. A topic in the library often has only one or two entries, not necessarily with a frontal face, while on the site there are thousands of posts under the same tag.
- The tag spelling takes the most commonly used original word among the existing rule34xxx source entries. The normalized topic name may not be usable for site search.
- Going online is lazy: if this library can pick out a face, not one byte goes online. If credentials cannot be obtained, the site errors, or the network is down, it is always treated as no candidate, the round mark falls back to the initial, and no 500 is returned.
- If after all that none qualifies, it is handled as "no head": fall back to the first image obtainable, write no face record, and the page lays out the whole cover at the stylesheet's default framing. Such topics mostly truly cannot give a frontal face (backs of heads under hair, non-human protagonists, only wide shots on the site); rather than enlarging the biggest patch of skin into an unrecognizable circle, show a full-body shot, so that at least you can tell which work it is.

Storage and framing:

- After checking the image host, black borders left by the source image itself are cropped by `trim_letterbox`. The criterion is that both the average brightness and the brightest pixel of the row are low: looking only at the average would take the dark area of a night scene as a black border, and looking only at the max would be blocked by a single noise pixel. If less than four tenths remain after cropping, the criterion is deemed to have mistaken something and no crop is done.
- The image is stored locally at the side length computed by `icon_side`; the page cannot pass it in the address; when it cannot be chosen it falls back to the initial.
- The stored side length is set by "how many pixels the page needs when zoomed all the way", not by the round mark's 28px, because when scaled to 256px the face box is only 19-30px, which is exactly the sticking point. Each one is computed separately: the smaller the face is in the image, the larger the stored side length (`FACE_PX_IN_STORE` = 28px circle × double-density screen × face at most six tenths). The lower bound is `ICON_SIDE` (512px); a distant full-body image would demand two thousand pixels by this rule, and `MAX_ICON_SIDE` (1024px) brakes there: a face any smaller is accepted as unenlargeable, since a round mark is not worth two hundred KB.
- The framing is written by the server in `.face.json` beside the image, the fifth position of the facet row brings it back to the page, goes through the avatar's `facePos` to land as `object-position`, and is then enlarged by `frontend/src/card-art/face-frame.ts` according to the face box.
- On a 28px circle, the proportional tier (32%) gives a face of only 9px, taken over by the `MIN_FACE_PX` pixel lower bound; on the 48px author avatar it computes below 32%, so it still uses the proportion.
- When the face center is near the image edge, the displacement of pulling it to the frame center would expose blank, so it is clamped back to the edge; therefore "centering" itself also counts as a reason to enlarge (`centred`), braked by `FACE_CEILING` (the face box taking 60% of the frame, the whole head just filling it). Where no face is detected it falls back to `50% 25%` in the stylesheet.

Filter overlay, sorting, and image wall:

- The filter bar and readout are folded into the same `FilterGlassRows` overlay.
- At the far left of the upper row are the two video/image media round keys, the same shape as the profile page group, with the round glass `GLIDE_ROWS.media` (the profile page's group is in the `entity-filter` island, with the same `[data-view-glide="round"]` material). After a vertical bar come the four states (All, Unseen, Saved, Ignored, with no counts), the same control as the home page's four views, sharing that sliding glass (`GLIDE_ROWS.views` also recognizes `.followviews`). Source icons and tags scroll horizontally in the right half, and the source type is colored only when selected.
- The readout in the lower row is written like the home page, "N updates · showing M", with the right end being the group of shuffle and sort keys: shuffle (switches to `sort=rand&seed=`, shuffling the whole batch by seed, the seed written into the address), then three sort tiers: update time / popularity / duration. While shuffle waits for data, the home page's outlined busy state is also drawn (the readout row carries `aria-busy`).
- The image wall has one more 30px-square "images only" icon switch, with the Lucide `captions-off` glyph, so as not to clash with the image glyph of the media tier. When on, it sits on the filter bar's sliding glass (`GLIDE_ROWS.imagesonly`), the same material and the same dimensions as the layout segmented control beside it: the segmented control's track on the overlay has no padding, and options are 30px squares with 8px radius.
- Sorting belongs to the server (`/api/follow?sort=&dir=&seed=`): pagination is on the server, and the browser only gets the current few pages. `FollowStore.group()` unconditionally sorts by `newest_at` descending at the end, so both the entry level and the release group level must be re-sorted by the same ruler (`_sorted_items` and `_sorted_groups`).
- Active filters spread directly below the overlay, using the home page's intersection filter bar (the `Combo` component: the `[data-entity-combo]` container plus `[data-combo-chip]` chips plus "Clear all"). Putting it above would push the sticky glass and the two avatar rows down together; below it only pushes the list, which has to be redrawn anyway.
- Operations that only change content, such as changing sort or clicking an author avatar, redraw only the list: `.followlist` is replaced with `pageSkeletonHtml`'s card skeleton, and the overlay, two avatar rows, and intersection bar stay in place.
- "Manage follows" at the right end of the page header is a secondary button; "Check for updates" to its right is the only primary button on this screen (not shown when there are no sources, the blue belonging to "Add follow" in the empty state). The readout is not repeated beside "Load more" at the bottom.
- Each `<img>` in the image wall carries `width`/`height`, holding space at its intrinsic ratio before the image lands, so columns do not reflow on load. The size is a field on the entry (the images within a manifest each carry a pair), with three equal-rank sources that only fill gaps: given by the source API (fanbox imageMap, rule34.xxx dapi), obtained by a backfill script asking the file header, and written back after the UI loads (`data-learn-dims` → `POST /api/follow/image-dims`). Cards with neither are held at 1:1 and not guessed.

## First-Run Setup Auth Card

The controls of the three pages for first launch, login, and error (`frontend/src/react/pages/`) are all BoardUI components, and the outer frame is
`pages/auth-card.tsx`; the login and error pages carry no lead-in.

Auth Card is a composition absent from the registry: on the page background `background-full`, a centered `background-secondary-default` card with one `separator-border`, 24px radius, at most 560px wide, 32px padding,
reduced to 20px on narrow screens. The card header is a 40px site mark, a `title-2` heading, and a lead-in of one line of secondary text. The layering is the same as the configuration page's settings area:
inputs and segmented tracks inside the card are tertiary, folder rows and secondary buttons are primary, one shade brighter than the card surface in both light and dark;
in dark, primary and tertiary are both neutral-800, and the input inside a folder row stands up through the resting-state border line from `base.css`.

All buttons use BoardUI `Button`/`IconButton` medium: choose folder and remove are icon-only secondary (36×36,
20px icon), add media library is a secondary with a leading icon, and finish setup is primary (36px high, 10px radius).
The input and icon button in a path row are both 36px high and are no longer enlarged separately. Busy state and duplicate prevention go through `busyProps`, the same set as the configuration page.
The access password is a BoardUI `Switch` medium (42×24px track, 18px thumb), and when off the two password boxes are not rendered.
"Listen address" is a two-segment radio (`SegmentedRadioGroup`, keeping `role="radiogroup"`), with LAN on the left.

Between the four groups of media library, access password, advanced settings, and after-setup there is 24px of space plus a `separator-border` horizontal line,
and the first group follows the card header directly without a line; browser history is a subgroup within "after setup", likewise separated by a horizontal line. First-level group headings
use `body-semibold` in the main text color; field labels use BoardUI `Label`; descriptions use `body-2-regular` in secondary text color,
a whole-form line and submission failures use `ErrorText` (`text-error-primary` of the same size, `role="alert"`); a field error
replaces the hint below the box, wrapped in `role="alert"` and attached to the box via `aria-describedby`, with only one on the page, and the box turns danger color along with
`aria-invalid`.

## Post-Install Tutorial

The first-run setup form is only responsible for collecting configuration. After successful submission, the normal entry enters the home page with `?onboarding=1`; when history import is chosen
it first goes to the taste page, but the same browser keeps the pending-task marker. The tutorial adopts BoardUI
NotificationViewport's fixed bottom-right position, 400px width, 16px card radius, border, and dropdown shadow; internally it adopts
Announcement's icon-title-action structure and RareUI Task List's 24px circular status slot, completion strike-through fade-out, and moving completed items
to the end. A dedicated status endpoint aggregates the library, collection source credentials, browser history, follow sources, the corresponding follow credentials, and the review queue,
and manual ticking is not allowed; each item can be skipped individually, with a short-lived undo. The floating window can collapse to show only the title, completion progress, and the expand key;
it is shown continuously on every Peach page, disappears automatically after all tasks are completed or skipped, and requires no extra confirmation;
when switching pages the existing floating window is kept and the task state is refreshed silently, and the card is not rebuilt if the state has not changed;
the task link and "Skip" each have an independent hover area; on link hover the background switches instantly and the two inset straight-line separators above and below are hidden,
with no cross-row fade, the separator using a button border color still recognizable in the dark theme, and the right arrow using the secondary text color. The pinned revision, SHA, and differences are in
[post-install tutorial evidence](reference-snapshots/rareui-boardui-post-setup-tutorial.md).

Evidence method: the upstream primary has a hover state, but it hangs on a pseudo-element (the original rule text was obtained on 2026-09-12). The three reading methods below cannot read it, with the same blind spot:

- Reading `className` does not show it: the hover is not a Tailwind `hover:` class but is written in the stylesheet.
- Real mouse hover and reading computed does not show it either: what is read is the element's own `background-image`, while what changes is the `::before`'s `opacity`, and `getComputedStyle(el)` without a second argument cannot reach that layer.
- The primary row in the registry `/r/button.json` indeed has only `bg-button-primary text-text-white shadow-xs`, because all three tiers grow inside the class `.bg-button-primary`.

So when an evidence conclusion involves "some state has no style", both pseudo-elements must be read explicitly before judging.

The original rule text of `.bg-button-primary` (measured 2026-09-12): the class itself has `isolation:isolate` plus
`background-image:var(--gradient-button-primary-default)`; `::before` is `inset:0`,
`z-index:-1`, `pointer-events:none`, `border-radius:inherit`, laying
`var(--gradient-button-primary-hover)`, `opacity:0`, `transition:opacity var(--button-transition-ms) ease`
(that token is .15s), and `:hover:not(:disabled):not([aria-disabled=true])::before` raises it to 1;
`:active` swaps in `var(--gradient-button-primary-active)` and presses that layer back to 0; `:disabled` swaps in
`--gradient-button-primary-disabled` and `::before{display:none}`. All three gradients are 180deg with two stops,
arranged by shade: default `accent-500→600`, hover `400→500`, active `600→700`, measured pixels
400=`#3392ff`, 500=`#2b7fff`, 600=`#155dfc`, 700=`#1447e6`. Other computed: `height:36px`,
`padding:8px`, `border:0px`, `border-radius:10px`, `box-shadow:rgba(0,0,0,.05) 0 1px 2px`,
`color:#fff`, `font:500 14px/20px Inter`.

Peach copies this set of surfaces, including the `::before` cross-fade and `border:0`. Adding a transparent border would, under
`box-sizing:border-box`, squeeze the content box by 2px, and since `background-origin` is padding-box, the gradient would be compressed to
34px and stretched back to 36px, shifting the color stops one pixel from the upstream. The three tier tokens are `--board-blue`, `--board-blue-hover`,
`--board-blue-active`, which together with the rules live in one place only, `web/board.css`; the primary buttons of the three entry pages are
BoardUI Buttons in the page bundle, reading BoardUI's own gradient tokens.

Peach has two deliberate differences at this tier: `padding` takes `8px 12px` instead of the upstream's `8px` on all four sides, since Chinese characters are
wider than Latin ones and with equal spacing on four sides the characters touch the edges; the upstream `active` 0.98 scale (`transform .42s`) is not followed,
since swapping the gradient on press is already readable.

Checkbox motion evidence (2026-09-10): in the project-saved `board-reference/checkbox.json`,
`checkbox-glyph.tsx` uses a 16px SVG, `pathLength=1`, and `animate-check-draw`.
The live `/components/checkbox` CSS confirms 200ms `cubic-bezier(.65,0,.35,1)`,
`stroke-dashoffset` from `1px` to `0`; with reduced motion the full check line is shown immediately.
150ms is only responsible for the background, border, and shadow transitions and cannot substitute for the stroke-drawing animation.
Setup uses the same check line shape, blue gradient, and these two sets of state rules.

On 2026-09-10 the built-in browser checked `/components/auth-card`, reusing the already-registered
`boardui-auth-card.json`: centered title, logo, form, and bottom primary button, 24px radius,
24/32px padding, and a light shadow. Peach's media source form adopts a 560px cap; it keeps directory add/remove,
source selection, optional password, advanced settings, scanning, and history import. At 390px it is a single column with no horizontal overflow.
The check used a standalone read-only preview: no real configuration submitted, no scan started.

## Verification Records

Results checked for the sidebar, media library, color and type scale, and narrow-screen layout, and the corresponding test coverage.

The sidebar adopts the AI chat public variant's group headings, expanded leaf items, and trailing counts; the group arrow is on the right, the heading is 36px high, and expansion reuses the shared Collapse. The media library entry adapts the public `DashboardUserMenu`: 265px panel, 16px radius, 10px padding, 8px to the right on desktop and expanding below on phones, with a 150ms ease-out fade-in, scale .95, and 2px blur. A separate button controls sidebar expansion; the media library icon opens the selection panel, and when the panel is expanded the entry shows an outline. The home page uses the Peach logo in a 20px slot, calibrating the visible outline and text start by transparent margins, and the collapsed button is a 36px square. Media library and navigation icons are unified at 20px and 1.7px stroke, with no icon background. Settings are fixed at the bottom, side by side with the light/dark switch; when collapsed the light/dark switch shows only the target theme icon. The theme animation references the public `https://www.boardui.com/r/theme-toggle.json`: 200ms thumb and 820ms soft-edged spread, easing `cubic-bezier(.16,1,.3,1)`, switching directly with reduced motion.

The media library uses `[media.libraries]` to name declared paths, with paths of the same name forming one library; `[media.library_icons]` stores optional icons, and the automatic mode shows a local disk or a cloud drive icon provided by this machine by source. Library selection limits the work list and filter items; source IDs, mount mappings, and ledger paths keep their business meaning. Statistics, taste, and maintenance tasks aggregate across the whole deployment. Previews are read-only and do not save real configuration.

Colors map by [Board Color](https://www.boardui.com/components/color) roles for text, background, border, and interaction; the type scale follows [Typography](https://www.boardui.com/components/typography), using body 14/20, compact 13/18, caption 12/16, headings 20/26, and page title 32/44. Inter Variable is bundled locally. Statistics, taste, follow management, and configuration use skeletons of matching structure; other pages reuse Board styles of the entity, poster, and grid skeletons. The follow default view and table view share author grouping, sorting, and multi-select; in the default view the in-card row height of an author card is 64px and authors can collapse, in the table view one row is one source and headers are sortable; bulk delete uses a confirmation box with an explicit count, with selection and enabled state independent; the recently watched title is single-line with middle ellipsis and links to the video detail.

The detail page uses side-by-side watch progress cards and independent action buttons; Esc first exits the detail, then collapses the sidebar. Sorting on the home and entity pages stays horizontally scrollable, and the shuffle button keeps the animated SVG, using a neutral Board button.

Neither desktop nor 390×844 allows horizontal page overflow, covering settings, home, detail, statistics, taste, data management,
follow management, configuration, review, tags, and agency index. At 390×844 inputs are 16px and settings numeric controls are 40px high;
after the sidebar collapses, the container and content are both 60px and the horizontal scroll track is hidden; on phones the expand button is inside the drawer, 12px from the top.
The settings close icon's center offset is 0; icon-only controls do not override the toolbar's business show/hide.
With increased contrast the navigation `backdrop-filter` is `none`, and this state must be exitable.
`tests/` and `frontend/test/` cover illegal values not saved, restore on close, restoring asynchronously read values, chart values,
library name and icon submission, group expansion memory, page skeletons, ranking expansion and flow focus, icon draft cancel, segmented switching,
and the demo state not requesting task endpoints.

## Control and State Preview

Evidence and state rules for shared controls such as segmented switch, checkbox card, icon popover, glass, and progress feedback.

On 2026-09-08 the public `checkbox-card.json`, `date-picker.json`, and
`segmented-control.json` were obtained through strict certificate verification and saved in this machine's `<private verification records>`.
The segmented switch reuses native radio, the selected plate moves 200ms by actual position and size, and the settings theme keeps the system option.
Checkbox Card separates whole-card selection from an independent action button; pause uses a yellow Chip. The media library icon popover adopts
DatePicker's inner panel, candidate draft, and cancel/apply structure, and the candidates do not include cloud drive brand icons.
The statistics ring shows the final value directly, and only the highlighted segment's intensity goes through a transition; there is no entry animation,
for the same reason as the ranking bar and radar chart row.
Resource sync first does a read-only check for stale records, empty folders, and cache, and only when there are candidates shows the solid red "Clean up stale entries"; permanent deletion goes through the shared confirmation box's danger tier, and when part is not handled a warning-tier Toast is reported.

The filter bar switches to random via "Shuffle" and updates the seed; the default random is still chosen in browse settings. Light glass forms a color difference with pale blue-gray and warm light spots, the spot radii being 32%/38% of the canvas. The media library selection popover reuses the glass material and the existing menu open/close. On narrow screens a 16px gap is kept between settings navigation and body; browser visual acceptance of these styles was not obtained.

Internal body navigation reuses `LinkButton`, with the right arrow using the local shared icon; no background, no outline, 4px between icon and text, 20px icon, hover underline. The source is the public registry https://www.boardui.com/r/link-button.json of https://www.boardui.com/components/link-button , obtained 2026-09-11, SHA-256 `05eb37b3cf1334c153e0702de05fe4989e4359c9c74d5ba55cc552a58e4629bd`. Peach's blue token is kept, with no new dependency. External links keep the external-link icon and blue text; Note uniformly carries a pale background with icon and text vertically centered. Cover collection feedback lists the local and candidate sizes or the actual failure reason, and does not substitute network guesses for the source result.

Search glass uses native `blur(22px)`, keeping the base color, glow, and outline. During the theme spread snapshot, each glass surface takes the glow with the current theme's solid color, and after the animation ends or is skipped, live background sampling resumes; the media library top-level popover uses the same rule. After leaving the page, the SVG filters and size observers of removed panels are cleaned up. Browser visual acceptance was not obtained.

已知总量的任务只显示一套进度与处理数量，未知总量才显示加载圆点。扫描、关注检查、链接检查和资源扫描共用这一规则。
骨架的显示门槛同时约束容器、后代与伪元素；隐藏阶段不单独绘制微光。筛选骨架复用就绪控件的尺寸、间距、图标与当前选项，等待接管时使用 `inert`，数据操作按钮保留原生禁用状态。
媒体库入口与侧栏按钮在主包加载前按保存的状态就位；组件接管时复用这些原生节点。
复核卡片在接近视口时初始化滚动条，屏幕外卡片暂缓布局；819 条记录的页面滚动至 2400px 时只初始化 6 张卡片。

The follow list's right toolbar is arranged as check all, view, sort, expand state, with the expand state shown only in the default view. In table view each row has a checkbox at its start, the default view's "Select this page" sits above the list, and cross-page selection is kept. Select-all uses the stacked check, and deselect uses the hollow stacked check; review grouping and this-page selection reuse this set of state icons. The review group button sits to the right when sticky, with spacing kept between type and title.
When a collection source explicitly has no metadata or cover entry, a neutral record is kept and it is not counted as a failure or an automatic retry set; timeouts, network, and read errors keep error feedback. Collection details use the shared Collapse, and resource links use the normal text color.
