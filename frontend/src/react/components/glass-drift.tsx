/* 玻璃面上漂移的那两团反光。画法与轨迹在 `web/board.css` 的 `[data-glass-drift]`：两倍大的画布靠
 * `transform` 走，宿主自己那两层背景光斑随之收起。只在带 `[data-glass-pane]` 等玻璃材质的宿主里
 * 显示；放在宿主子元素的最后，不改动前面那些子元素的 `:first-child` 之类的匹配。 */
export function GlassDrift() {
  return <span data-glass-drift="" aria-hidden="true"><span data-drift="b"><span /></span><span data-drift="a"><span /></span></span>;
}
