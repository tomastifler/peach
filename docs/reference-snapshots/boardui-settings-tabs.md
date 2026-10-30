# BoardUI 设置与页签取证

本文件是人工取证笔记，不作为 `docs/reference-sources.json` 中可变来源的 `snapshot` 登记，因为实时界面的 DOM 与交互结果不属于可重抓的静态快照。固定副本与逐文件哈希见 `frontend/src/react/boardui/UPSTREAM.sha256`；Peach 的 PillTab 适配位于 `frontend/src/react/components/pill-tab.tsx`。其上游原始文件 SHA-256 为 `0b35654d05f8daa7ea899c9e7a098f694a630842ec0e9b1a40b41dcc7a1e5f70`，许可证为 MIT。

2026-10-21 从官方 HTTPS 注册表取回源码，并在官方页面查看实时 DOM、计算样式与切换结果。

| 来源 | 注册表 SHA-256 |
| --- | --- |
| [Settings Modal](https://www.boardui.com/r/settings-modal.json) | `620866f68751335b9cbd7f5812850ed8f5e3ede04f88c3acb3e8a5fb36e9ecfe` |
| [Tabs](https://www.boardui.com/r/tabs.json) | `7b89651220b86041aa0db74cf6be6b9b77de24045344bd7fc9627e62f1d98857` |
| [Segmented Control](https://www.boardui.com/r/segmented-control.json) | `6b783664a645c84aa92bdcb3b73abfe4d1ee57f39f97a6dedb5da1318a6e78c1` |

## 实测

- [Settings Modal](https://www.boardui.com/components/settings-modal) 的设置卡为 16px 圆角、secondary 表面，设置行左端距卡片 12px，右端距卡片 0px，行底线为 1px。最后一行不画底线。标题与卡片分开，独立内容使用独立卡片。
- [Tabs](https://www.boardui.com/components/tabs) 的蓝色与灰色 PillTab 共用 `PillTabList` 选中背景。切换 Changes → Browser 后，背景从 `translateX(0px)` 移至 `translateX(104px)`；计算样式为 transform、width、height 各 300ms，曲线为 `cubic-bezier(0.34,1.2,0.64,1)`。
- PillTab 使用 `aria-pressed`，负责局部视图。页面 Tabs 使用 React Aria 的 tablist、tab 与 tabpanel 语义。
- 这次 Settings Modal 与 Tabs 注册表的哈希，与 `docs/BOARD_UI.md` 中 2026-10-14 登记的一致。本地固定的 SettingsRow 副本与当前上游相比，差异包含模板本地化及 RTL 逻辑方向类；LTR 行几何一致。

## Peach 的采用范围

配色与自定义颜色各用独立设置卡，导航顺序使用单独分组。设置弹层、配置行与只读行保留左端内缩、右端通栏的线；相邻组件行组共享一条边界线，操作栏为全宽线。

页面页签复用上游 `PillTabList` 的测量与过渡实现，保留原有地址、方向键与 tab 语义，灰色选中面使用 Peach 已有中性色。减少动态效果时关闭过渡。React Aria 集合通过外部宿主与 Portal 挂载选中背景，装饰层不参与选项集合；原生按钮直接使用相同组件。固定副本保持不变，适配放在 Peach 目录，无新增依赖。

方向继承文档与显式 `dir`，测量使用实际 `offsetLeft`；基础导航不依赖 React Aria 的语言 Provider。React Aria 集合适配单独放在页面模块中，保持基础导航与页面包的依赖边界。

实际消费者覆盖 JAV 与索引页、顶部管理导航、关注管理分区、复核分类、配置分区及搜索补全类别。桌面纵向与手机横向共用同一测量逻辑。普通分段控件已有独立的共享选中面；设置弹层的玻璃导航仍沿用既有玻璃动效。

Peach 的玻璃侧栏、业务分类与媒体配色参数属于产品差异；上游的套餐、账号资料、插件和存储示例不作为 Peach 设置项迁入。模板本地化与 RTL 不属于当前中文 LTR 界面的缺失功能。
