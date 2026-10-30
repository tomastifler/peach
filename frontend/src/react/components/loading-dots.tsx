/* 后台任务仍在推进、但没有总量可言时的 Loading Dots（`peach-web-ui`）。
 *
 * 不用 Spinner：Spinner 只反馈用户刚刚点下的那一下。也不画没有分母的进度条。
 * 三颗点的错相由 `../styles.css` 的 `dot-wave-*` 给，减少动效时全局规则关掉动画。
 * 点已经在动，`label` 不带省略号。 */

export function LoadingDots({ label }: { label: string }) {
  return (
    <p role="status" className="flex min-w-0 items-center gap-2 text-caption-1-regular text-text-secondary">
      <span aria-hidden className="inline-flex shrink-0 items-center gap-1">
        <i className="dot-wave-0 size-1 rounded-full bg-current" />
        <i className="dot-wave-1 size-1 rounded-full bg-current" />
        <i className="dot-wave-2 size-1 rounded-full bg-current" />
      </span>
      <span className="min-w-0 wrap-anywhere">{label}</span>
    </p>
  );
}
