/* The two highlights drifting across a glass surface. The drawing and trajectory are in `[data-glass-drift]` in `web/board.css`: a canvas twice the size moves via
 * `transform`, and the host's own two background glow layers fold away accordingly. Only shown inside hosts with glass material such as `[data-glass-pane]`;
 * placed last among the host's children so the matching of earlier children such as `:first-child` is not changed. */
export function GlassDrift() {
  return <span data-glass-drift="" aria-hidden="true"><span data-drift="b"><span /></span><span data-drift="a"><span /></span></span>;
}
