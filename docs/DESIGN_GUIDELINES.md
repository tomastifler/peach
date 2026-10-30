# Peach design guidelines

本文件用于设计和审阅页面、控件、媒体查看器与任务反馈。组件选择与 token 见 [组件契约](UI_COMPONENT_CONTRACTS.md)，执行与验收见 [Web UI 技能](../.claude/skills/peach-web-ui/SKILL.md)，BoardUI 的采用范围见 [BoardUI 适配](BOARD_UI.md)。这些准则指导后续实现，不表示所有页面已逐项验收。

Open Claude UI provides supplementary reference for this file. The adopted scope and source gaps are in [Reading and trade-offs](reference-snapshots/open-claude-ui.md); its description of Claude's official implementation is third-party self-description, and Peach adopts only the principles that explain its own needs. Actual parameters obey the project's existing tokens, component contracts, and local acceptance.

## 1. Build hierarchy with content

- First separate regions with whitespace, headings, alignment, and existing surface colors. Closed borders are for the edges of independent objects, input controls, or overlays; the body text, toolbar, and secondary groups inside one container usually use whitespace or a one-way divider.
- "A single outer frame" is the default judgment for reducing repeated decoration. The borders needed by independent editable fields, accessible focus rings, and data tables are kept per the component contract.
- Keep the existing object boundaries of independent task, creator, and metric cards. Before adopting a reference principle, name the specific reading or operation problem and compare using the same data; reducing the number of cards is not in itself grounds for improvement.
- Normal, hover, selected, focus, and busy states keep control geometry stable. When a border takes part in layout, reserve the same width; focus uses the existing outline／ring and does not change size by thickening the border.
- Check body text, secondary text, dividers, and overlays separately in light and dark. Subtle surface contrast must keep controls and focus recognizable; color, weight, radius, and shadow all reuse Peach's semantic tokens.

Bad example: the title details' shell, summary, action bar, and every paragraph of explanation each wrapped in a closed card. Good example: the details keep the shell, the summary is laid out naturally, the action bar uses whitespace or one divider, and independent fields keep their own input borders.

## 2. Let typography fit the content

- 时间、数量、进度等持续变化的读数使用等宽数字，单位与精度稳定；标签、姓名与正文继续使用对应文本样式。
- 按内容选择换行和截断：标题与说明保留语义阅读，路径、文件名、URL 等资源标识使用已有中间省略；需要复核的完整值有明确查看或复制入口。
- 长字符串在真正承载它的内容区安全换行，flex／grid 子项允许收缩。按钮、徽标和短标签不能因容器挤压变成单字竖排。
- 与文字同行的图标（带文字按钮的前置图标、署名、标签、导航、站标）用 `--icon-inline`（`1.2em`），跟所在文字字号缩放。依据是实测：14px 正文里汉字墨迹约 13px，雪碧图笔画约占 24 画框的 75%，`1.2em` 的画框让两者等高。`cap` 只量拉丁大写（14px 时约 10px），中文界面不用它定图标尺寸。
- 单独的图标（纯图标按钮、封面上的播放与快进、状态圆点、头像、色球）不跟文字走，按所在控件的尺寸档取固定值。侧栏导航收起成图标列时仍用 `--icon-inline`，展开与收起之间图标大小不变。
- 指向站外的链接（来源页、官网、资料站、说明文档、另一台 Peach 的写入端）一律新标签页打开，`rel="noopener noreferrer"`，用 `<a>` 或链接按钮，不用按钮加 `window.open`，保证能中键打开和复制地址。带文字的外链在文字后跟外链字形（React 侧 `RiExternalLinkLine`，HTML 字符串用 `icon('external-link', 'ui-externalmark')`，尺寸都是 `--icon-inline`），设置页现成的写法是 `ExternalLink`；只有站标或品牌图标的链接不加。Peach 换端口、完成首次设置后回到自身入口仍在当前页跳转，外部播放器协议链接也不开新页。外链字形只表示「离开 Peach」，站内跳转不用它。
- 图标与文字按当前字体的实际基线核验；数字缩放、固定负偏移与可变字体轴只在取得实际字体和像素证据时调整。保持项目已有中文字体回退与手机输入字号判据。

## 3. Adapt to the component's available width

- Page layout is decided by the viewport; reusable components that can be embedded in a sidebar, details, or overlay are decided by their own container width. Take breakpoints at the boundary where content fits, and do not copy the screen widths of external products.
- When a toolbar tightens, in order: reduce auxiliary information, shorten labels that remain understandable, and move secondary actions into the existing menu; the primary action, the current selection, and the recovery entry stay reachable.
- Hide text only when the icon's meaning is clear and it has an accessible name. For mutually exclusive options keep the visible name of the current one; a row that cannot be compressed clearly uses local horizontal scroll or wrapping.
- Verify the same component in a narrow container within a wide page, plus desktop, phone, long Chinese text, long resource names, and enlarged text. When the necessary content of each column does not fit in a split layout, switch to a single column or the existing overlay.

## 4. Input and focus first

- During input method composition, Enter, arrow keys, and Escape serve the candidate words first; search, submit, and suggestion menus must not take over by mistake. Use composition events and native `isComposing`; when compatibility truly requires it add a `keyCode === 229` check, and verify with Chinese and Japanese input.
- Escape is handled by the current interaction layer: first exit the input candidates, suggestion menu, or drag, then handle the outer dialog. Intercepting the outer close must not interfere with the input method finishing its own operation.
- A group of mutually exclusive options uses the corresponding Tabs／radio contract; after arrow-key navigation the option is visible within its own scroll area, and Tab can leave the group. Menus skip unavailable items, and empty lists and dynamically removed items have a clear focus destination.
- Modal layers reuse the native dialog or React Aria focus management; on entry give a meaningful focus, and on close return it to the trigger if it still exists. When the trigger is gone, return to a reasonable entry in the current region.
- Secondary actions that appear on hover are also reachable on keyboard focus and on touch; hidden or collapsed content leaves no Tab stops behind.

## 5. Keep the user's reading position

- Appended content, background refresh, and local state changes do not seize the scroll position. Keep following only when the user is already following the latest content; active wheel, touch, or keyboard browsing releases following immediately.
- Task logs that need to auto-follow offer a "Jump to latest" entry. The cooldown and bottom tolerance are for filtering programmatic scrolls, and must not forcibly pull a reading person back to the bottom when the timer ends.
- An edge fade only hints that there is still content in that direction; when there is no overflow or the scroll has reached the edge, remove the corresponding fade. Keep visible room for the first and last text, focus rings, and actions, and recompute when content or container size changes.
- A multi-stop opacity curve is an optional visual approach for fades, and its strength and distance must be verified on Peach's themes and media backgrounds; scroll state and unmount cleanup continue to be handled by the existing Scroller／overlay scrollbar.

## 6. Gestures are interruptible and recoverable

- Distinguish click from drag with an explicit displacement threshold. After a drag starts, show the dragged object and the real drop position; when the drag completes, the object's click action is not triggered again.
- Pointer capture, `pointercancel`, lost capture, Escape, and unmount all have cleanup paths. Cancelling returns to the starting state; reordering also provides a keyboard or touch alternative entry.
- Geometry during a drag follows the pointer directly, and only the snap after release uses the existing motion. An interrupted motion continues from the currently visible state, avoiding restarting the whole displacement.
- The minimum size, collapse, and expand entries of a resizable split are decided by the real content. Dragging across an iframe must verify event continuity; a transparent overlay that does not receive events cannot serve as evidence of event shielding.
- Optimistic display is used only for preferences or order that can be restored exactly; when persistence fails, restore a consistent state and keep the reason. The result of ledger writes and irreversible actions is decided by the server.

## 7. Media viewing keeps space and cost continuous

- Zoom anchors at the mouse pointer position or the gesture center, so the detail being viewed stays nearby. The zoom limit and the definitions of original size and fit-to-window continue to use the existing lightbox contract.
- Coordinate computation uses a consistent image and viewport space, distinguishing the original fitted size from the transformed display size; dragging is computed as start position plus displacement, avoiding accumulating the same displacement.
- A shared-element transition from thumbnail to large image is used only when the source, target, and media identity are clear, and computes the actual image display extent, cropping, and radius. When the source is unmounted, the API is unavailable, or reduced motion is on, open and close directly and restore focus.
- Lightbox, carousel, and playback reuse Swiper, MediaCarousel, the stage, and the shared player. The preload range is decided by source cost and the local cache; hidden media does not play because of preloading, and closing and switching stop media per the existing lifecycle.

## 8. Feedback comes from real state

- 操作区域先显示对象、范围和当前状态，细节按需展开。待执行、运行、等待来源、成功、失败、取消和部分完成保持各自语义；授权提示只在真实权限边界需要时出现。
- Spinner、Loading Dots、Skeleton、Progress、Toast 与持久错误按组件契约选择。已知总量显示真实读数，估算明确标明；动画计时与模拟响应不能产生成功结论。
- 失败保留输入、对象和原因，并给出当前可行的恢复动作。自动重试只用于已有策略允许的操作，界面显示服务端实际等待状态；刷新或打开面板不额外启动重试。
- 折叠详情不改变任务的运行状态。流式输出可以保持区域结构稳定，用户仍能收起不必持续阅读的日志；不因为任务运行就强制展开所有内容。
- 增量内容只更新受影响区域，异步结果绑定当前请求与对象，保留阅读位置和选择；不为每个新增片段重建整个内容区。

## 9. Motion serves the operation

- Use motion to explain position, selection relationships, and hierarchy changes; high-frequency controls give feedback as fast as possible. Reuse the existing Motion and CSS tokens, and verify parameters with real distances, reverse operations, and continuous input.
- Reduced motion covers both CSS and JavaScript animation; continuous pulses, Canvas, and per-character blur do not carry the only state information. Hiding and unmounting stop this region's animation, and the operation can still be completed when a transition API fails or is missing.
- Text and tables put clear reading first. Ambient light, success bounce, notification sounds, and the like are adopted only with a clear product purpose and a user setting; media volume and notification sounds are managed separately.

## 10. 控件写明在选什么

- 看值就知道在选什么的控件不写名字：图标键、名称框、每一项都自带说明的下拉（「每页 20 部」「最近 30 天」）。排序下拉的「时长」「评分」单看说不清，按下一条加前缀。
- 单独一个表单字段：名字放在控件上方（`FolderField`、`SettingsRow`、`FieldLabel`）。
- 工具栏或重复块里一行并排、单看值说不清的下拉：名字写进触发键，作为值前的浅色前缀（`frontend/src/react/components/select.tsx` 的 `Select` 的 `prefix`，自制触发键同样用 `text-text-tertiary` 前缀）。这样重复的块不必每块多一行标签。
- 弹层顶部的标题只给格子型选择器（图标、色球）：格子里没有文字，需要标题说明在选什么。列表下拉外面已经写了名字，弹层里不再写一遍。

坏例：媒体库标题行的下拉只显示「自动补全」，点开才看到「选择处理方式」；「移到媒体库」上方有标签，弹层又写「移到哪个媒体库」。好例：`处理方式 自动补全 ▾`、`来源色 ● 翠绿`，「移到媒体库」只保留上方标签。

## 11. 控件高度分四档

不是全站一种高度，而是同类、挨在一起的控件同一档。四档在 `:root` 定义，BoardUI 尺寸与之对应：

| token | 高度 | BoardUI | 用在哪里 |
| --- | --- | --- | --- |
| `--control-h-inline` | 28px | Chip、分段器与页签的内芯 | 正文和卡片里的标签、标签删除、标题旁的小工具、评分点击区；不单独成一行工具栏 |
| `--control-h-compact` | 32px | `size="small"`、Select `sm` | 表格行操作、分页、卡片悬浮动作、卡内次级操作、筛选条 |
| `--control-h` | 36px | 默认尺寸、Select `md` | 表单字段和同组按钮、保存配置、页面与分区操作、表格工具栏、分段器与页签外框、侧栏和设置导航 |
| `--control-h-large` | 40px | 顶栏 `.ib` | 顶栏搜索与图标键、播放器控制条、首页厂牌胶囊 |

同一行混用时：

- 有输入框或下拉的行，按钮和图标键跟它们同档；表单行默认 36px。图标键与同行的文字按钮同档。
- 分段器、按钮组、页签组按外框对齐：外框取这一行的档，内芯取下一档（36 配 28）。
- 同一个动作在同一页只用一档；卡内的次级操作和行操作取紧凑档。
- 标签、角标、评分、头像不参与这一行的对齐；行内档不和紧凑及以上的档放在同一条工具栏里。拿不准时向上取一档。

坏例：媒体库卡里一排 36px 的下拉下面跟着 32px 的「添加文件夹」；设置页凭据卡的「保存配置」是 32px，别处都是 36px。验收时在浏览器里按行收集可见控件的高度，同一行出现两档以上的同类控件就是问题。

## 验收问题

| Where to check | Questions that must be answerable |
| --- | --- |
| 区域与控件 | 边界是否表达独立语义？状态切换是否改变尺寸？焦点与暗色文字是否可辨？不点开能否看出每个下拉在选什么？同一行的同类控件是否同一档高度？ |
| 容器与文本 | 宽页面中的窄面板能否使用？长中文、长路径和放大文字是否仍可阅读？ |
| 输入与键盘 | 输入法确认会不会提交或关窗？Tab 能否进出？关闭后焦点去了哪里？ |
| 滚动与手势 | 新内容是否抢走阅读位置？拖动取消能否恢复？隐藏控件是否仍可聚焦？ |
| 媒体 | 放大是否保留细节位置？缺图与转场失败是否可恢复？预载是否触发额外播放或无界回源？ |
| 状态与动效 | 终态来自哪份结果？失败保留什么？快速反向操作、减少动态效果与卸载是否完整？ |

Pick behavior or layout acceptance from the table according to the actual change, using the project's unified test entry. When only these guidelines are edited, check the docs, the source lock, and the context gate; when a page adopts one of the principles, verify the corresponding real behavior and visuals.
