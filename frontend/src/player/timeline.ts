/** 预览索引按开始时刻查找；未覆盖区间返回空值。 */
export interface TimelineSheets {
  frames: number; interval: number; columns?: number; rows?: number;
  cues?: [number, number][];
  source?: string;
  fallback?: TimelineSheets;
}

export function timelineFrame(seconds: number, sheet: TimelineSheets): number | null {
  if (!Number.isFinite(seconds) || seconds < 0 || sheet.frames <= 0) return null;
  if (!sheet.cues?.length) {
    return sheet.interval > 0 ? Math.min(sheet.frames - 1, Math.floor(seconds / sheet.interval)) : null;
  }
  let low = 0, high = sheet.cues.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (sheet.cues[middle]![0] <= seconds) low = middle + 1;
    else high = middle;
  }
  const index = low - 1, cue = sheet.cues[index];
  if (!cue || (seconds >= cue[1] && !(index === sheet.cues.length - 1 && seconds === cue[1]))) return null;
  return index;
}
