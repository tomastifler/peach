import { fmtSize } from '@peach/legacy/core';
import { useId, useState } from 'react';
import { RiArrowDownSLine, RiArrowUpSLine, RiGlobalLine, RiHardDrive3Line } from '@remixicon/react';
import { Button } from '@/components/base/buttons/button';
import type { ProcessingTraffic } from './library-processing';
import { useOverlayScrollbar } from '../components/overlay-scrollbar';
import { SourceLabel } from '../components/source-label';
import { SourceMark } from '../settings/section';

const size = (value: number) => fmtSize(value).replace(/\s/g, '');
const averageSize = (value: number) => value >= 1024 ** 2 && value < 1024 ** 3
  ? `${Number((value / 1024 ** 2).toFixed(1))}MB` : size(value);
const range = (low: number, high: number) => {
  if (low === high) return size(high);
  const [start, startUnit] = fmtSize(low).split(' ');
  const [end, endUnit] = fmtSize(high).split(' ');
  return startUnit === endUnit ? `${start}-${end}${endUnit}` : `${size(low)}-${size(high)}`;
};
const forecast = (expected: number | undefined, low: number, high: number) => expected === undefined
  ? range(low, high) : `${expected > 0 ? '~ ' : ''}${size(expected)}`;

/** The confirmation dialog, job card and management page share the per-folder breakdown. */
export function TrafficProgress({ traffic, initial = false, detailsOpen, onDetailsChange }: {
  traffic?: ProcessingTraffic; initial?: boolean; detailsOpen?: boolean; onDetailsChange?(open: boolean): void;
}) {
  const list = useOverlayScrollbar<HTMLUListElement>();
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const open = detailsOpen ?? expanded;
  if (!traffic) return null;
  const count = (value: number) => value.toLocaleString('zh-CN');
  return <div data-processing-traffic="" className="flex min-w-0 flex-col gap-2 text-caption-1-regular text-text-secondary tabular-nums wrap-anywhere">
    {traffic.workload ? <p className="flex flex-wrap gap-x-3 gap-y-1">
      <span>{traffic.unknown_files ? 'Videos found' : 'Videos in scope'} {count(traffic.workload.video_files)} </span>
      <span>JAV files {count(traffic.workload.jav_files)} · distinct codes {count(traffic.workload.jav_titles)} </span>
    </p> : null}
    {traffic.inventory && !traffic.inventory.complete ? <p role="status">Discovering new files; counts and estimates may still change…</p> : null}
    {traffic.unknown_files && traffic.inventory?.complete !== false ? <p role="status">Some files are unconfirmed; the current count and estimate are incomplete</p> : null}
    {traffic.inventory?.errors ? <p role="status">Some folders cannot be read; the count and estimate are incomplete</p> : null}
    <div className="inline-grid grid-cols-2 gap-6 py-2">
      <section aria-label="Traffic estimate" className="flex min-w-0 flex-col gap-1">
        <p className="inline-flex items-center gap-1.5"><RiGlobalLine aria-hidden className="size-(--icon-inline) shrink-0" />
          {traffic.inventory && !traffic.inventory.complete ? 'Traffic identified' : 'Estimated traffic'}</p>
        <p className="text-title-3-semibold text-text-primary">{forecast(traffic.estimated_bytes, traffic.estimated_min_bytes, traffic.estimated_max_bytes)}</p>
        <p>{traffic.unknown_route_estimated_bytes ? 'Confirmed proxy' : 'Proxy'} {forecast(traffic.metered_estimated_bytes, traffic.metered_estimated_min_bytes, traffic.metered_estimated_max_bytes)}</p>
        {!initial ? <p>Used <span>{traffic.partial ? '~ ' : ''}{size(traffic.used_bytes)}</span> · proxy {size(traffic.metered_used_bytes)}</p> : null}
      </section>
      {traffic.disk ? <section aria-label="Disk estimate" className="flex min-w-0 flex-col gap-1">
        <p className="inline-flex items-center gap-1.5"><RiHardDrive3Line aria-hidden className="size-(--icon-inline) shrink-0" />
          {traffic.inventory && !traffic.inventory.complete ? 'Usage identified' : 'Estimated usage'}</p>
        <p className="text-title-3-semibold text-text-primary">~ {size(traffic.disk.estimated_bytes)}</p>
        {traffic.disk.temporary_bytes > 0 ? <p>Frame-extraction temp files ~{averageSize(traffic.disk.temporary_bytes)}</p> : null}
        {traffic.disk.volumes.map(volume => <div key={volume.path} className="flex min-w-0 flex-col gap-1">
          <p>{volume.path} free {volume.free_bytes == null ? 'unavailable' : size(volume.free_bytes)}</p>
          {volume.can_fit === false ? <p role="status">Not enough space, short by {size(volume.shortfall_bytes || 0)}</p> : null}
        </div>)}
        {traffic.disk.cache_unknown ? <p role="status">Cloud drive cache usage to be confirmed</p> : null}
      </section> : null}
    </div>
    <Button variant="secondary" size="small" className="self-start" aria-expanded={open} aria-controls={detailsId}
      trailingIcon={open ? RiArrowUpSLine : RiArrowDownSLine} onClick={() => {
        setExpanded(!open);
        onDetailsChange?.(!open);
      }}>{open ? 'Hide details' : 'View details'}</Button>
    <div id={detailsId} hidden={!open}>
      <div className="relative min-w-0">
      <ul ref={initial ? undefined : list} className={`flex flex-col pr-2${initial ? '' : ' max-h-48 overflow-y-auto overscroll-contain'}`}>
        {traffic.sources.map(source => <li key={source.key} className="flex min-w-0 flex-col gap-1 border-b border-separator-border py-2 last:border-b-0">
          <div className="flex min-w-0 items-start justify-between gap-2">
            {source.root ? <SourceLabel source={source.location} label={source.label} />
              : <span className="inline-flex min-w-0 items-center gap-1.5"><SourceMark mark="globe" />{source.label}</span>}
            <span className="shrink-0">{source.connection === 'system' ? 'Follow system' : source.connection === 'unknown' ? 'Connection to be confirmed' : source.metered ? 'Proxy' : 'Direct'}</span>
          </div>
          {source.workload?.video_files ? <p className="text-text-tertiary">Videos {count(source.workload.video_files)} · JAV {count(source.workload.jav_files)} </p> : null}
          {source.workload?.pending_jav_titles ? <p className="text-text-tertiary">Pending details {count(source.workload.pending_jav_titles)} · average ~{averageSize(source.workload.metadata_average_bytes || 0)}/video</p> : null}
          <div className="flex flex-wrap justify-between gap-x-4 text-text-tertiary">
            {!initial ? <span>Used{source.unobserved.length ? '~' : ''} {size(source.used_bytes)}</span> : null}
            <span>Estimated {forecast(source.estimated_bytes, source.estimated_min_bytes, source.estimated_max_bytes)}</span>
          </div>
        </li>)}
      </ul>
      </div>
    </div>
  </div>;
}
