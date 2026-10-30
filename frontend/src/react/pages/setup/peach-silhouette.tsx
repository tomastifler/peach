/** Peach 原版标识外轮廓的单色矢量稿，颜色跟随容器。 */
export function PeachSilhouette({ variant }: { variant: 'brand' | 'welcome' }) {
  return <svg data-setup-mark={variant} viewBox="0 0 1024 1024" fill="currentColor" aria-hidden="true" focusable="false">
    <path d="M274 178C263 155 255 133 250 114C330 67 432 79 502 164C557 72 666 20 774 61C769 105 754 147 730 179C861 202 950 324 956 477C969 682 812 855 512 977C211 851 54 674 68 475C76 321 144 215 274 178Z" />
  </svg>;
}
