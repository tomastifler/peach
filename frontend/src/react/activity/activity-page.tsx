/* 活动页：任务中心那张表的唯一界面。
 *
 * 这一屏要回答三个问题，顺序就是它们的紧迫程度：现在有什么在跑、有哪一轮被挡下了、
 * how the ones that just finished went. The three sections share the result of a single `/api/tasks` request. The first one, "Needs attention", is the background service's
 * current problems; the last, "Cloud downloads", is cloud-drive offline tasks. Those two each fetch and poll on their own (`background-issues.tsx`,
 * `downloads-panel.tsx`) and are independent of these three sections.
 *
 * 轮询交给 Query 的 `refetchInterval`：间隔按上一次拿到的内容算，有东西在跑两秒一次，
 * 全是终态十秒一次。它是后台刷新，不写 `aria-busy`——页面上的内容一直是完整的，写了
 * 等于告诉辅助技术和冒烟用例「这一屏还没好」。取数失败只在页内报一条，上一份数据留着：
 * 服务重启的那几秒里，把整页换成一句错误比留着十秒前的进度更难用。
 *
 * 「最近完成」末尾的「加载更早」往前接一页，接上的行留在组件里，与轮询那一份按 id 合并：
 * 轮询只管第一页，翻过的那些不会被下一次刷新冲掉。 */
import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { RiArrowDownSLine, RiArrowRightLine, RiHistoryLine } from '@remixicon/react';
import { useMutation, useQuery } from '@tanstack/react-query';

import { Chip } from '@/components/base/badges/chip';
import { Button } from '@/components/base/buttons/button';
import { LinkButton } from '@/components/base/buttons/link-button';

import { errorMessage } from '../../api';
import { cardClass } from '../components/card';
import { CodeBlock } from '../components/code-block';
import { EmptyState } from '../components/empty-state';
import { LoadingDots } from '../components/loading-dots';
import { Note } from '../components/note';
import { Page } from '../components/page';
import { Progress } from '../components/progress';
import { busyProps } from '../settings/use-action';
import { Disclosure } from '../settings/section';
import { BackgroundIssues } from './background-issues';
import { DownloadsPanel } from './downloads-panel';
import { ErrorDetails, ErrorExcerpt } from './error-excerpt';
import {
  elapsedText, fetchEarlier, fetchTasks, foldByKind, foldRoutine, followupDetail, followupTally, groupFollowups, isActive,
  hasResultProblems, isRoutine, latestOfKind, mergeFinished, momentText, pollInterval, problemDestination, progressText,
  statusLabel, summaryItems, taskIssues, TASKS_KEY, TRIGGER_LABELS, type FollowupCounts, type TaskRunPayload,
} from './tasks';

/** The most follow-ups listed in one card. When several batches are merged into one card there can be thousands, and drawing them all would fill the screen with the same sentence. */
const FOLLOWUP_ROWS = 50;
/** A task that only dispatches follow-ups: one round only "queued some items", and what matters is how those items turned out. */
const DISPATCHERS = new Set(['upgrade-repairs']);

/* Completed green, failed red, in progress blue, unexpectedly interrupted yellow; manually cancelled and queued are neutral. */
const BADGE_COLORS: Record<string, 'lime' | 'rose' | 'yellow' | 'blue' | 'neutral'> = {
  succeeded: 'lime', failed: 'rose', cancelled: 'neutral', interrupted: 'yellow', running: 'blue', pending: 'neutral',
};

function StatusBadge({ run }: { run: TaskRunPayload }) {
  const partial = run.status === 'failed' && run.task_key === 'library-processing'
    && run.result_summary?.outcome === 'partial';
  const problems = partial || run.status === 'succeeded' && hasResultProblems(run);
  return <Chip color={problems ? 'yellow' : BADGE_COLORS[run.status] ?? 'neutral'}>
    {partial ? 'Some items need attention' : problems ? 'Problems found' : statusLabel(run.status)}
  </Chip>;
}

/** 一轮任务派出的后继（ADR-0040）。挂在父任务卡里，一条一行。
 *
 * 后继是独立的一轮，有自己的状态和结果，但单独摆出来就读不出「它是谁派的」——
 * 而那恰恰是这一屏上唯一需要解释的东西：用户没点过补头像，它却在跑。
 * 条间线写在每个 li 自己身上，第一条那根同时充当与卡片正文的分隔。 */
function FollowupList({ rows }: { rows: TaskRunPayload[] }) {
  return (
    <ul className="flex min-w-0 flex-col">
      {rows.map((row) => {
        const detail = followupDetail(row);
        return (
          <li key={row.id} data-status={row.status} data-followup-key={row.followup_key}
            className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 border-t border-separator-border px-5 py-2.5">
            <span className="min-w-0 break-words text-caption-1-regular text-text-primary">
              {row.task_label}
            </span>
            <StatusBadge run={row} />
            {detail
              ? <span className="min-w-0 break-words text-caption-1-regular text-text-secondary">{detail}</span>
              : null}
            {/* Queued items have no result yet: an empty "Technical details" expansion would only hold a pair of braces. */}
            {Object.keys(row.result_summary || {}).length
              ? <div className="w-full min-w-0">
                  <Disclosure summary="Technical details" contentClassName="pb-2.5">
                    <CodeBlock code={JSON.stringify(row.result_summary, null, 2)} language="json"
                      label={`${row.task_label}technical details`} />
                  </Disclosure>
                </div>
              : null}
          </li>
        );
      })}
    </ul>
  );
}

/** 一轮任务一张卡。失败时整张卡的框线换成 danger 色，不给结束原因那行字上色——
 *  一屏十几行里逐行读红字，比看一眼哪张卡的框是红的慢得多。 */
function RunCard(
  { run, meta, children, footer, followups, followupTotal = 0, badge }:
  { run: TaskRunPayload; meta: string; children?: ReactNode; footer?: string;
    followups?: TaskRunPayload[]; followupTotal?: number; badge?: ReactNode },
) {
  /* When a round dispatches thousands of follow-ups, only the latest few dozen are sent down, and the merged batches may each carry a few dozen more: the title states the full count,
     the list shows running and queued ones first, then the most recently finished, at most `FOLLOWUP_ROWS` rows, and says clearly that only some of them are listed. */
  const rank = (row: TaskRunPayload) => (row.status === 'running' ? 3 : row.status === 'pending' ? 2
    : row.status === 'failed' || row.status === 'interrupted' ? 1 : 0);
  const listed = followups ? [...followups].sort((a, b) =>
    rank(b) - rank(a) || b.id - a.id).slice(0, FOLLOWUP_ROWS) : [];
  const shown = listed.length;
  const total = Math.max(followups?.length || 0, followupTotal);
  return (
    // `id` lets the "View failure records" link on the "Needs attention" row scroll straight to this card.
    <li id={`run-${run.id}`} data-status={run.status} data-task-key={run.task_key} data-run-id={run.id}
      className={cardClass({
        padding: 'none',
        bordered: 'line',
        className: run.status === 'failed' ? 'flex flex-col border-border-error-default' : 'flex flex-col',
      })}>
      {/* Card titles are one step below section titles ("In progress"), with the same line spacing between title, time and summary. */}
      <div className="flex flex-col gap-2 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="min-w-0 break-words text-title-3-medium text-text-primary">{run.task_label}</strong>
          {badge ?? <StatusBadge run={run} />}
        </div>
        <p className="text-caption-1-regular text-text-secondary">{meta}</p>
        {children}
      </div>
      {shown ? <div className="border-t border-separator-border px-5 py-2.5">
        <Disclosure summary={`Task details · ${total.toLocaleString()} items`}
          contentClassName="pb-2.5"
          defaultOpen={listed.some((row) => isActive(row))}>
          {shown < total
            ? <p className="text-caption-1-regular text-text-secondary">Showing {shown.toLocaleString()} of them, with items being processed first</p>
            : null}
          <FollowupList rows={listed} />
        </Disclosure>
      </div> : null}
      {Object.keys(run.result_summary || {}).length ? <div className="border-t border-separator-border px-5 py-2.5">
        <Disclosure summary="Technical details" contentClassName="pb-2.5">
          <CodeBlock code={JSON.stringify(run.result_summary, null, 2)} language="json"
            label={`${run.task_label}technical details`} />
        </Disclosure>
      </div> : null}
      {footer
        ? <div className="flex min-h-14 flex-col justify-center rounded-b-2xl border-t border-separator-border bg-card-footer px-5 py-3">
            <ErrorExcerpt text={footer} className="text-caption-1-regular text-text-secondary" />
          </div>
        : null}
    </li>
  );
}

function RunningRun({ run, followups }: { run: TaskRunPayload; followups?: TaskRunPayload[] }) {
  const total = run.progress_total || 0;
  const current = run.progress_current || 0;
  const label = run.progress_label || 'In progress';
  const elapsed = elapsedText(run.elapsed_seconds);
  const meta = [TRIGGER_LABELS[run.trigger] || run.trigger, elapsed && `Running for  ${elapsed}`]
    .filter(Boolean).join(' · ');
  return (
    <RunCard run={run} meta={meta} followups={followups}>
      {total > 0
        ? <div className="flex flex-col gap-1.5">
            <Progress label={label} value={Math.min(current, total)} max={total} />
            <p className="text-caption-1-regular text-text-secondary wrap-anywhere">{label} · {progressText(current, total)} items</p>
          </div>
        : <LoadingDots label={label} />}
    </RunCard>
  );
}

/** 跑完的一轮。`runs` 多于一条时是折叠起来的几轮例行任务：时间写成从最早到最新那一段，
 *  The summary takes the latest round - routine rounds have identical summaries anyway, and listing them one by one would just copy the same line N times.
 *  A task card only records this round's history: problems still unresolved and "Retry now" are in the "Needs attention" block at the top of the page.
 *  `latest` says whether this is the latest round of the same kind of task: for some tasks only that round still has a handling entry. */
function SettledRun(
  { run, followups, runs, latest, followupTotal, followupFailed = 0 }:
  { run: TaskRunPayload; followups?: TaskRunPayload[]; runs?: TaskRunPayload[]; latest: boolean;
    followupTotal?: number; followupFailed?: number },
) {
  /* When several dispatched batches are merged into one card, the latest batch's "Queued 64 items" cannot describe the whole picture: say how many were processed in total and how many failed instead,
     and when there are failures the badge reads "Problems found", with the failed ones listed first in the task details. */
  const batches = Boolean(runs && runs.length > 1 && followupTotal);
  const summary = batches
    ? [`Processed ${followupTotal!.toLocaleString()} in total`, followupFailed ? `${followupFailed.toLocaleString()} failed` : '']
        .filter(Boolean)
    : summaryItems(run.result_summary).filter((line) => line !== run.error);
  const issues = taskIssues(run);
  const destination = problemDestination(run, latest);
  const elapsed = elapsedText(run.elapsed_seconds);
  const oldest = runs && runs.length > 1 ? runs[runs.length - 1] : undefined;
  const meta = (oldest
    ? [TRIGGER_LABELS[run.trigger] || run.trigger, `Last ${runs!.length} runs`,
       `${momentText(oldest.finished_at)} – ${momentText(run.finished_at)}`]
    : [TRIGGER_LABELS[run.trigger] || run.trigger, momentText(run.finished_at),
       elapsed && `Took ${elapsed}`]).filter(Boolean).join(' · ');
  return (
    <RunCard run={run} meta={meta} footer={run.error} followups={followups} followupTotal={followupTotal}
      badge={batches && followupFailed ? <Chip color="yellow">Problems found</Chip> : undefined}>
      {/* Do not add a bullet when there is only one summary line: a lone dot reads as if the rest is missing. */}
      {summary.length === 1
        ? <p className="text-caption-1-regular text-text-secondary wrap-anywhere">{summary[0]}</p>
        : summary.length ? <ul className="flex list-disc flex-col gap-1 pl-5 text-caption-1-regular text-text-secondary wrap-anywhere">
            {summary.map((line, index) => <li key={index}>{line}</li>)}
          </ul> : null}
      {issues.length ? <Disclosure summary={`Issue details · ${issues.length} items`} contentClassName="pt-2">
        <ErrorDetails label="Task issue details">
        <ul className="flex min-w-0 flex-col gap-3" data-task-issues="">
          {issues.map((issue, index) => <li key={`${issue.source}-${index}`} className="flex min-w-0 flex-col gap-1 text-body-2-regular wrap-anywhere">
            <p className="text-body-regular text-text-primary">{[issue.label, issue.provider, issue.kind].filter(Boolean).join(' · ')}</p>
            <ErrorExcerpt text={issue.error} className="text-text-primary" />
          </li>)}
        </ul>
        </ErrorDetails>
      </Disclosure> : hasResultProblems(run) && ['follow-check', 'feed-check'].includes(run.task_key)
        ? <p className="text-body-2-regular text-text-secondary">Per-item details for this round were not retrieved; see the check results in the source list.</p> : null}
      {destination
        ? <LinkButton href={destination.href} size="small" trailingIcon={RiArrowRightLine}
            className="self-start">
            {destination.label}
          </LinkButton> : null}
    </RunCard>
  );
}

/** Several rounds of the same task that have finished themselves while the follow-ups they dispatched are not done yet, merged into one card.
 *
 * The parent task's round only "queues" work and ends in a few seconds; what the user cares about is how far the queued batch has got. So the badge reads In progress
 * and the progress bar follows the counts of all follow-ups, not the few rows listed on the page. */
function WorkingRun(
  { runs, followups, counts }:
  { runs: TaskRunPayload[]; followups: TaskRunPayload[]; counts: FollowupCounts | undefined },
) {
  const run = runs[0]!;
  const oldest = runs[runs.length - 1]!;
  const tally = followupTally(counts, runs);
  const total = Math.max(tally.total, followups.length);
  const settled = tally.total ? tally.settled : followups.filter((row) => !isActive(row)).length;
  const failed = tally.total ? tally.failed
    : followups.filter((row) => row.status === 'failed' || row.status === 'interrupted').length;
  const meta = [TRIGGER_LABELS[run.trigger] || run.trigger,
    runs.length > 1 ? `${runs.length} batches` : '',
    `${momentText(oldest.started_at || oldest.finished_at)} started`].filter(Boolean).join(' · ');
  return (
    <RunCard run={run} meta={meta} followups={followups} followupTotal={total}
      badge={<Chip color="blue">In progress</Chip>}>
      <div className="flex flex-col gap-1.5">
        <Progress label={`${run.task_label}progress`} value={settled} max={total} />
        <p className="text-caption-1-regular text-text-secondary">
          Processed {progressText(settled, total)} items{failed ? ` · ${failed.toLocaleString()} failed` : ''}
        </p>
      </div>
    </RunCard>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-3">
      <h3 id={id} className="text-title-2-medium text-text-primary">{title}</h3>
      {children}
    </section>
  );
}

function RunList({ live = false, children }: { live?: boolean; children: ReactNode }) {
  return (
    <ul aria-live={live ? 'polite' : undefined} className="flex min-w-0 flex-col gap-3">{children}</ul>
  );
}

export function ActivityPage() {
  const tasks = useQuery({
    queryKey: TASKS_KEY,
    queryFn: ({ signal }) => fetchTasks(signal),
    refetchInterval: (query) => pollInterval(query.state.data),
  });
  const data = tasks.data;
  const top = data?.finished;
  // 往前翻接上的行。没翻过时一直是空的，页面和只有第一页时完全一样。
  const [earlier, setEarlier] = useState<TaskRunPayload[]>([]);
  const [earlierMore, setEarlierMore] = useState(false);
  const [earlierCounts, setEarlierCounts] = useState<FollowupCounts>({});
  const [seenTop, setSeenTop] = useState(top);
  if (top !== seenTop) {
    setSeenTop(top);
    // 翻过页之后，新完成的几轮会把第一页末尾的挤出去；把上一份第一页并进已翻过的部分，
    // 不然被挤出去的那几轮夹在两段之间，哪一段都不再有它们。
    if (earlier.length && seenTop) setEarlier(mergeFinished(earlier, seenTop));
  }
  const more = useMutation({
    mutationFn: ({ oldest }: { oldest: TaskRunPayload; shown: TaskRunPayload[] }) => fetchEarlier(oldest),
    onSuccess: (page, { shown }) => {
      setEarlier((current) => mergeFinished(current, shown, page.finished || []));
      setEarlierMore(Boolean(page.finished_has_more));
      setEarlierCounts((current) => ({ ...current, ...page.followup_counts }));
    },
  });
  const problem = tasks.error ? errorMessage(tasks.error) : '';
  // 首屏就没拿到数据：只剩这一条，不画空的三段。
  if (!data) return <Page><Note tone="error">{problem || 'Could not load the task center'}</Note></Page>;

  const allFinished = mergeFinished(data.finished || [], earlier);
  const parents = data.working_parents || [];
  const allRuns = [...(data.running || []), ...(data.skipped || []), ...allFinished, ...parents];
  // 后继挂到派出它的那张卡下面。父任务不在这一屏上（已经被 prune 掉）时照常单独摆出来
  // ——挂不上去就不显示，等于让一条在跑的任务凭空消失。
  const byParent = groupFollowups(allRuns);
  const visible = new Set(allRuns.map((run) => run.id));
  const topLevel = (rows: TaskRunPayload[]) => rows.filter(
    (run) => !(run.followup_key && run.parent_run_id != null && visible.has(run.parent_run_id)));
  const settled = topLevel(allFinished);
  // 游标取最旧的顶层那一轮：服务端一页数的是顶层行，后继跟着父任务走。
  const oldest = settled[settled.length - 1];
  const hasEarlier = Boolean(oldest) && (earlier.length ? earlierMore : Boolean(data.finished_has_more));
  const loadEarlier = () => {
    if (!more.isPending && oldest) more.mutate({ oldest, shown: allFinished });
  };
  const counts: FollowupCounts = { ...earlierCounts, ...data.followup_counts };
  const childrenOf = (runs: TaskRunPayload[]) => runs.flatMap((run) => byParent.get(run.id) || []);
  // 自己跑完、派出的后继还在跑的那一轮算「正在进行」：整件事还没完，放进「最近完成」
  // That is, one card with one completed and one in progress. Only some of the follow-ups can be listed on the page, so look at the counts first.
  const working = [...settled, ...topLevel(parents)].filter((run) => followupTally(counts, [run]).active > 0
    || byParent.get(run.id)?.some(isActive)).sort((a, b) => b.id - a.id);
  const running = topLevel(data.running || []);
  const skipped = topLevel(data.skipped || []);
  // 同一轮不在「最近完成」里再出现一次：一屏两行说的是同一件事，读起来像跑了两轮。
  const finished = settled.filter((run) => !working.includes(run)
    && !skipped.some((row) => row.id === run.id));
  // 每小时一轮的定时检查什么也没发生时一条条摆出来，一页就被同一句「已检查 83」占满。
  // A round that dispatched follow-ups counts as routine only if all its follow-ups finished without trouble; a single failure is shown on its own. The kind that only dispatches
  // (auto-repair, one batch a minute) is the exception: several batches of the same thing are still merged into one card, with the failure count written on the card.
  const quietChildren = (run: TaskRunPayload) => {
    const children = byParent.get(run.id) || [];
    return children.every((row) => row.status === 'succeeded' && !hasResultProblems(row))
      && followupTally(counts, [run]).failed === 0;
  };
  const folds = foldRoutine(finished, (run) => isRoutine(run)
    && (quietChildren(run) || DISPATCHERS.has(run.task_key)));
  const newest = latestOfKind(allRuns);
  const quiet = !running.length && !working.length && !skipped.length && !finished.length;
  return (
    <Page>
      {problem ? <Note tone="error">{problem}</Note> : null}
      {data.available === false
        ? <Note tone="warning">{data.message || 'The database has no task records table yet'}</Note>
        : null}
      {/* The background service's current problems come first: they will not finish on their own and need someone to handle them. */}
      <BackgroundIssues />
      {quiet
        ? <EmptyState icon={RiHistoryLine} title="No task records yet">
            Once scans, follow-up checks, batch operations and command-line batch jobs run, their progress and results will show here.
          </EmptyState>
        : <>
            <Section title="In progress">
              {running.length || working.length
                ? <RunList live>
                    {running.map((run) => (
                      <RunningRun key={run.id} run={run} followups={byParent.get(run.id)} />))}
                    {foldByKind(working).map(({ run, runs }) => (
                      <WorkingRun key={run.id} runs={runs} followups={childrenOf(runs)} counts={counts} />))}
                  </RunList>
                : <Note tone="neutral">No tasks running.</Note>}
            </Section>
            {/* 「刚才那一轮为什么没跑」只有这一段答得出：定时触发撞上在跑的那一轮会
                安静跳过，不留记录的话它在界面上和从没触发过一模一样。 */}
            {skipped.length
              ? <Section title="Not run this time">
                  <RunList>{skipped.map((run) => (
                    <SettledRun key={run.id} run={run} latest={newest.has(run.id)} followups={byParent.get(run.id)} />))}</RunList>
                </Section>
              : null}
            {finished.length || hasEarlier
              ? <Section title="Recently completed">
                  {finished.length
                    ? <RunList>{folds.map(({ run, runs }) => {
                        const tally = followupTally(counts, runs);
                        return <SettledRun key={run.id} run={run} runs={runs} latest={newest.has(run.id)}
                          followups={childrenOf(runs)} followupTotal={tally.total} followupFailed={tally.failed} />;
                      })}</RunList>
                    : null}
                  {more.error ? <Note tone="error">{errorMessage(more.error)}</Note> : null}
                  {hasEarlier
                    ? <Button variant="secondary" size="small" leadingIcon={RiArrowDownSLine}
                        className="self-start" {...busyProps(more.isPending)} onClick={loadEarlier}>
                        Load earlier
                      </Button>
                    : null}
                </Section>
              : null}
          </>}
      {/* 离线下载跑在网盘那头，自己一张表、自己轮询；任务中心为空时它照样在。 */}
      <DownloadsPanel />
    </Page>
  );
}
