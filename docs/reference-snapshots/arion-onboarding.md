# Arion 首次使用流程

本页是视频观察与固定提交源码的人工取证笔记，不登记为 `docs/reference-sources.json` 中的上游快照，因为交互观察与设计推导不属于可重抓的静态文件。

- 取证日期：2026-10-25。
- 视频：[Steven Lynn 发布帖](https://x.com/Stv_Lynn/status/2114270956218892747)。通过已登录的内置浏览器播放，观察到润色方式、云端模型和听写按键页面。
- 源码：[onboarding.go](https://github.com/AstraFoundry/Arion/blob/9bdd6161af041fa156fb21dd994c749f16059196/apps/desktop/ui/pages/onboarding/onboarding.go)，固定提交 `9bdd6161af041fa156fb21dd994c749f16059196`。
- 许可：[AGPL-3.0](https://github.com/AstraFoundry/Arion/blob/9bdd6161af041fa156fb21dd994c749f16059196/LICENSE)。本次参考交互与布局，不复制其素材或 Go 实现。

## 证据

**实测（画面与源码）**：左右分栏，左侧场景随当前步骤变化；右侧顶部显示紧凑进度，内容区域居中，返回与继续固定在底部。窗口常量为 840 × 560，左栏 320，右栏内边距 44，字段内容宽 420。前进和返回使用不同方向的 28 px 入场位移，初次进入为 10 px 纵向位移；退场缩放为 0.98。

**推导**：左栏约占窗口宽度的 38%，是辅助理解当前动作的视觉区域。固定按钮区使内容长度改变时操作位置保持稳定。

**Peach 的设计选择**：四步为欢迎、媒体目录、访问范围、确认。桌面左栏为 36%，手机将场景收为顶部横幅；常用设置直接显示，正文独立滚动。返回保留输入；服务器校验失败进入对应步骤。欢迎页使用单色 Peach SVG 剪影，确认页和设置完成态使用原版 Peach 标识，左下角文案分别说明私人媒体空间与确认后的处理。设备页沿用宣传视频中的 Apple Product Bezels，来源及屏幕定位见 [场景素材](../../resources/setup/README.md)。屏幕内容为抽象媒体库示意。转场支持减少动态效果设置。

上游使用 Go 与 mygo 原生 UI，并非 React 组件库；Peach 沿用 React、BoardUI 表单控件及已有提交接口，没有新增运行时依赖。
