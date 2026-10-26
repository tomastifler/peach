/* 数据管理页上的「资源同步」：按馆藏记录逐条查找本地磁盘与网盘上的文件，列出文件已不在的
 * 记录、空文件夹和不再被引用的缓存，确认后一起清掉（ADR-0080）。失效记录分两档：带个人记录的
 * 标为已消失、记录留着（ADR-0087），其余永久删除、不进回收站，所以执行键是危险档，确认框写明
 * 哪一档不可撤销。
 *
 * 扫描与清理是两趟后台任务，都走 `useBackgroundJob`。扫描的结论就是那趟任务的终态，所以
 * 结果区画的是当前快照：上一趟扫出来的东西还等着清。那一趟清过之后（`applied`）读数就不是
 * 现状了，结果区改画服务器留着的最近一次清理回执。 */
import { confirmModal, MEDIA_SOURCE_ICONS } from '@peach/legacy/ui';
import { fmtSize } from '@peach/legacy/core';

import { Button } from '@/components/base/buttons/button';

import { errorMessage } from '../../api';
import { useBackgroundJob } from '../background-job';
import { Fieldset, FieldsetTitle } from '../components/fieldset';
import { Note } from '../components/note';
import { TaskProgress } from '../components/task-progress';
import { spriteGlyph } from '../components/sprite-glyph';
import { PlainStat, plainStatClass } from '../components/stat-card';
import { queryClient } from '../query';
import { SourceMark } from '../settings/section';
import { busyProps } from '../settings/use-action';
import { TRASH_KEY } from './data-cleanup';
import {
  applyConfirmText, applyLeftovers, applyPlanText, applyText, fetchResourceApply, fetchResourceScan, hasChanges,
  purgeCount, RESOURCE_APPLY_KEY, RESOURCE_SCAN_KEY, scanLine, SOURCE_LABELS, sourceMeta, startResourceApply, startResourceScan,
  type ResourceApplyState, type ResourceScanState,
} from './resource-sync';

const COMPARE = spriteGlyph('git-compare');
const AGAIN = spriteGlyph('rotate-cw');
const DISCONNECTED = 'Cannot read progress right now; reconnecting…';
const APPLY_LABEL = 'Clean up dead entries';

/* 结果读数两行各自按卡数等分：来源几个都不折出半行。窄了照顶上那排读数折两列、一列。 */
const RESULT_ROW = 'inline-grid w-full grid-flow-col auto-cols-fr gap-4 max-plain-stat-pair:grid-flow-row'
  + ' max-plain-stat-pair:grid-cols-2 max-plain-stat-single:grid-cols-1';

const count = (value: number | undefined) => Number(value || 0).toLocaleString();

/** 一趟扫描的结论：来源一行，每个来源一张读数卡；要清的三样一行。 */
function ScanResult({ scan, partial = false }: { scan: ResourceScanState; partial?: boolean }) {
  const cache = scan.cache ?? { files: 0, bytes: 0 };
  return (
    <>
      <div className={RESULT_ROW}>
        {(scan.sources ?? []).map((source) => (
          <article key={source.location} className={plainStatClass()}>
            <PlainStat label={SOURCE_LABELS[source.location] || 'Media source'}
              mark={<SourceMark mark={MEDIA_SOURCE_ICONS[source.location] ?? 'database'} />}
              aside={<span className={source.online ? 'text-notification-success-foreground' : 'text-text-error-primary'}>
                {source.online ? 'Reachable' : 'Offline, skipped'}
              </span>}
              figure={source.online ? `${count(source.missing)} items` : '—'}
              meta={sourceMeta(source)} wrapMeta />
          </article>
        ))}
      </div>
      {!partial && <div className={RESULT_ROW}>
        <article className={plainStatClass()}>
          <PlainStat label="To delete permanently" figure={`${count(purgeCount(scan))} items`} meta="File no longer on disk, includes trash" />
        </article>
        <article className={plainStatClass()}>
          <PlainStat label="To mark as gone" figure={`${count(scan.vanish)} items`} meta="Has personal records; records are kept" />
        </article>
        <article className={plainStatClass()}>
          <PlainStat label="Empty folders" figure={`${count(scan.empty)}`} meta="Source root folders are kept" />
        </article>
        <article className={plainStatClass()}>
          <PlainStat label="Cache to clean" figure={`${count(cache.files)}`}
            meta={cache.files ? fmtSize(cache.bytes) : ''} />
        </article>
      </div>}
    </>
  );
}

export function ResourceSyncCard(
  { toast }: { toast(message: string, options?: { warning?: boolean }): void },
) {
  const apply = useBackgroundJob<ResourceApplyState, string>({
    queryKey: RESOURCE_APPLY_KEY,
    queryFn: ({ signal }) => fetchResourceApply(signal),
    start: startResourceApply,
    onFinish: (out) => {
      /* 回收站里的失效记录也一并删了：顶上那张回收站读数跟着重取。检查那一份带上了 `applied`。 */
      void queryClient.invalidateQueries({ queryKey: TRASH_KEY, exact: true });
      void queryClient.invalidateQueries({ queryKey: RESOURCE_SCAN_KEY, exact: true });
      if (out.status !== 'complete') return;
      /* 没删的几样是这一轮留下的，能删的已经删了：报警告档、写完成与没处理的数目，不说失败。 */
      const { done, left } = applyLeftovers(out);
      if (left) toast(`${count(done)} done, ${count(left)} not processed`, { warning: true });
      else toast('Dead entries cleaned up');
    },
  });
  const scan = useBackgroundJob<ResourceScanState>({
    queryKey: RESOURCE_SCAN_KEY,
    queryFn: ({ signal }) => fetchResourceScan(signal),
    start: startResourceScan,
    /* 又扫了一趟：上一趟清理的回执说的是旧清单。 */
    onStarted: () => apply.dismiss(),
  });

  const state = scan.job;
  const scanning = scan.running || scan.start.isPending;
  const cleaning = apply.running || apply.start.isPending;
  const scanned = state?.status === 'complete' || state?.status === 'failed';
  const label = scanning ? 'Scanning' : scanned ? 'Scan again' : 'Check files';

  /* 执行那一步只认这次检查的候选，逐条复核后再删；删了就没有撤销。 */
  const runApply = (payload: ResourceScanState) => void confirmModal({
    title: APPLY_LABEL,
    body: applyConfirmText(payload),
    confirmLabel: APPLY_LABEL,
    danger: true,
    onConfirm: () => apply.start.mutateAsync(payload.scan_id || ''),
  });

  const done = apply.outcome;
  const receipt = (out: ResourceApplyState) => {
    const partial = applyLeftovers(out).left > 0;
    return (
      <Note tone={partial ? 'warning' : 'success'} title={partial ? 'Partially done' : 'Cleanup result'}>
        {applyText(out, fmtSize)}
      </Note>
    );
  };
  let progress = null;
  let result = null;
  if (done?.status === 'failed') {
    result = <Note tone="error" title="Resource cleanup incomplete">{done.error || 'Check the task log to verify which files were processed.'}</Note>;
  } else if (done) {
    result = receipt(done);
  } else if (apply.running) {
    progress = <TaskProgress embedded label={apply.job?.message || 'Reviewing and cleaning dead entries…'} />;
  } else if (scan.start.isError) {
    result = <Note tone="error" title="Scan failed">{errorMessage(scan.start.error)}</Note>;
  } else if (scan.query.isError && state) {
    result = <Note tone="neutral" title="Task status">{DISCONNECTED}</Note>;
  } else if (state?.status === 'running') {
    const line = scanLine(state);
    progress = (
      <TaskProgress embedded label={line} value={state.completed_sources} total={state.total_sources} />
    );
    if (state.sources?.length) result = <ScanResult scan={state} partial />;
  } else if (state?.status === 'failed') {
    result = <>
      {state.sources?.length ? <ScanResult scan={state} partial /> : null}
      <Note tone="error" title="Scan failed">{state.error || 'Background scan failed'}</Note>
    </>;
  } else if (state?.status === 'complete' && state.applied) {
    result = apply.job?.status === 'complete'
      ? receipt(apply.job)
      : <Note tone="neutral" title="Cleanup result">The results of this check have been cleaned up; scan again to re-verify.</Note>;
  } else if (state?.status === 'complete') {
    const changes = hasChanges(state);
    result = (
      <>
        <ScanResult scan={state} />
        {changes ? <Note tone="neutral" title="Cleanup details">{applyPlanText(state)}</Note> : null}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {changes
            ? <Button variant="danger" {...busyProps(cleaning)} onClick={() => runApply(state)}>
                {cleaning ? 'Reviewing and cleaning…' : APPLY_LABEL}
              </Button>
            : <p className="mr-auto text-body-regular text-notification-success-foreground">
                Reachable sources were checked; there are no records, empty folders or caches to clean up.
              </p>}
        </div>
      </>
    );
  }
  if (apply.start.isError && !done) {
    result = <>{result}<Note tone="error" title="Cleanup failed">{errorMessage(apply.start.error)}</Note></>;
  }

  return (
    <section id="resource-sync" aria-labelledby="resource-sync-title" className="flex scroll-mt-20 flex-col gap-4">
      <Fieldset layout="split" labelledBy="resource-sync-title" footer={
        <Button data-resource-scan leadingIcon={scanned && !scanning ? AGAIN : COMPARE} {...busyProps(scanning)}
          onClick={() => { if (!scanning) scan.start.mutate() }}>{label}</Button>
      }>
        <FieldsetTitle id="resource-sync-title" gap="small">Resource sync</FieldsetTitle>
        <p className="max-w-190 text-body-2-regular leading-5 text-text-secondary">
          Looks up each library record's file on local disks and cloud drives, and lists records whose files no longer exist, empty folders, and caches that are no longer referenced.
        </p>
        <div aria-live="polite" className="mt-4 empty:hidden">{progress}</div>
      </Fieldset>
      <div aria-live="polite" className="flex flex-col gap-4 empty:hidden">{result}</div>
    </section>
  );
}
