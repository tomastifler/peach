/* The two charts of the "Storage" statistics: how much each category takes in the data folder, and how much Peach takes on the whole disk.
 *
 * The two charts answer for different wholes, so they are drawn separately, each with its own total. Category shares use an EvilCharts donut chart,
 * with the total in the middle; the disk uses an EvilCharts horizontal percentage stacked bar, one bar with three segments: Peach, other files on the disk, and free.
 * Colors follow the category, not the ranking: when a category shrinks after cleanup its color stays the same. There are only nine chart colors,
 * so logs, login state and "Other" are usually the smallest and are merged into the gray "Rest" on the chart, while the list still shows each one.
 * Differences are recorded in `../evilcharts/ORIGIN.md`. */
import { fmtSize } from '@peach/legacy/core';

import { EvilBarChart } from '@/registry/charts/recharts-bar-chart';
import { EvilPieChart } from '@/registry/charts/recharts-pie-chart';
import type { ChartConfig } from '@/registry/ui/recharts-chart';

import type { StorageCategory, StorageState } from '../bundle';
import { tone } from '../charts/chart-card';
import { ChartTip, TIP_SWATCH } from '../charts/chart-tip';

/** Each category has a fixed chart color; those not in the table are merged into "Rest". */
const CATEGORY_COLORS: Record<string, string> = {
  database: 'var(--color-chart-1)', backups: 'var(--color-chart-2)', playback: 'var(--color-chart-3)',
  thumbnails: 'var(--color-chart-4)', previews: 'var(--color-chart-5)', downloads: 'var(--color-chart-6)',
  sources: 'var(--color-chart-7)', records: 'var(--color-chart-8)', tools: 'var(--color-chart-9)',
};
const REST_COLOR = 'var(--color-text-tertiary)';

/** The class name of the color swatch in the list, in the same color as the chart. The class name is written as a whole string so Tailwind can detect it. */
export const CATEGORY_SWATCH: Record<string, string> = {
  database: 'bg-chart-1', backups: 'bg-chart-2', playback: 'bg-chart-3', thumbnails: 'bg-chart-4',
  previews: 'bg-chart-5', downloads: 'bg-chart-6', sources: 'bg-chart-7', records: 'bg-chart-8',
  tools: 'bg-chart-9',
};
export const REST_SWATCH = 'bg-text-tertiary';

const size = (value: number) => fmtSize(value);

/** The segments drawn on the chart: one for each category with a color, with the rest merged into one segment. Zero-size segments are not drawn. */
export function storageSlices(categories: StorageCategory[]) {
  const named = categories.filter((item) => CATEGORY_COLORS[item.key] && item.bytes > 0)
    .map((item) => ({ key: item.key, label: item.label, bytes: item.bytes, color: CATEGORY_COLORS[item.key]! }));
  const rest = categories.filter((item) => !CATEGORY_COLORS[item.key])
    .reduce((sum, item) => sum + item.bytes, 0);
  return rest > 0 ? [...named, { key: 'rest', label: 'Rest', bytes: rest, color: REST_COLOR }] : named;
}

export function StorageOverview({ storage }: { storage: StorageState }) {
  const usage = storage.usage!;
  const slices = storageSlices(usage.categories);
  const config: ChartConfig = Object.fromEntries(slices.map((slice) =>
    [slice.key, { label: slice.label, colors: tone(slice.color) }]));
  const data = slices.map((slice) => ({ slice: slice.key, value: slice.bytes }));
  return (
    <div className="flex flex-col gap-5 md:flex-row md:items-center">
      {/* The donut chart's total is written inside the ring: the chart's container comes with `flex-1`, which is replaced with a fixed width in this flex row. */}
      <div className="relative mx-auto size-48 flex-none" role="img"
        aria-label={`Data folder total ${size(usage.total_bytes)}, share by category`}>
        <EvilPieChart data={data} dataKey="value" nameKey="slice" config={config}
          className="aspect-square size-48 flex-none">
          <EvilPieChart.Pie innerRadius="68%" outerRadius="100%" paddingAngle={1} cornerRadius={3} />
          <ChartTip nameKey="slice" hideLabel format={size} />
        </EvilPieChart>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <b className="text-title-2-medium tabular-nums text-text-primary">{size(usage.total_bytes)}</b>
          <small className="text-caption-1-regular tabular-nums text-text-secondary">
            {usage.total_files.toLocaleString()} files
          </small>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5" aria-label="Legend">
          {slices.map((slice) => (
            <li key={slice.key} className="flex items-center gap-1.5 text-caption-1-regular text-text-secondary">
              <i aria-hidden className={`${TIP_SWATCH} ${CATEGORY_SWATCH[slice.key] || REST_SWATCH}`} />
              {slice.label}
              <span className="tabular-nums text-text-primary">{size(slice.bytes)}</span>
            </li>
          ))}
        </ul>
        <DiskBar storage={storage} />
      </div>
    </div>
  );
}

/** The whole disk: what Peach takes, what other files take, and what is left. When the disk capacity cannot be read the whole chart is not drawn. */
function DiskBar({ storage }: { storage: StorageState }) {
  if (storage.total_bytes === null || storage.free_bytes === null || !storage.usage) return null;
  const peach = Math.min(storage.usage.total_bytes, storage.total_bytes);
  const free = storage.free_bytes;
  const others = Math.max(0, storage.total_bytes - free - peach);
  const config = {
    /* Does not use any category's chart color: this segment is the whole data folder, and sharing a color with one category above would read as "database only". */
    peach: { label: 'Peach data', colors: tone('var(--color-border-focus-ring)') },
    others: { label: 'Other files', colors: tone(REST_COLOR) },
    free: { label: 'Free', colors: tone('var(--color-background-tertiary-default)') },
  } satisfies ChartConfig;
  const share = (part: number) => {
    const percent = (part / storage.total_bytes!) * 100;
    return percent < 0.1 ? 'Under 0.1%' : `${percent.toFixed(percent < 10 ? 1 : 0)}%`;
  };
  return (
    <div className="flex flex-col gap-2">
      <p className="text-caption-1-regular text-text-secondary">
        Disk total {size(storage.total_bytes)}{storage.system_drive ? ' (system disk)' : ''}, Peach uses {share(peach)},
        free {size(free)}
      </p>
      <EvilBarChart data={[{ disk: 'Disk', peach, others, free }]} config={config}
        layout="horizontal" stackType="percent" barRadius={4}
        chartProps={{ margin: { top: 0, right: 0, bottom: 0, left: 0 } }}
        className="aspect-auto h-6 flex-none">
        <EvilBarChart.YAxis dataKey="disk" hide />
        <EvilBarChart.XAxis hide />
        <EvilBarChart.Bar dataKey="peach" />
        <EvilBarChart.Bar dataKey="others" />
        <EvilBarChart.Bar dataKey="free" />
        <ChartTip hideLabel format={size} />
      </EvilBarChart>
    </div>
  );
}
