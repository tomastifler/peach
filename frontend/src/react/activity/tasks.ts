/* 任务中心的数据契约与折算：`/api/tasks` 一次请求供整页三段使用。
 *
 * 分三次取会出现「在跑那段是新的、完成那段是旧的」这种自相矛盾的一屏，所以只有一个
 * queryKey。首屏由 `prefetchTasks` 写进 Query 缓存，组件挂上去读的就是它。 */
import { apiGet } from '../../api';
import { fmtSize } from '@peach/legacy/core';
import { requestErrorMessage } from '../../core/request-error';
import { queryClient } from '../query';

export const TASKS_URL = '/api/tasks';
/** 整页共用这一个键：三段是同一次响应的三个字段。 */
export const TASKS_KEY = ['tasks'] as const;

export interface TaskRunPayload {
  id: number;
  task_key: string;
  task_label: string;
  trigger: string;
  status: string;
  host: string;
  started_at: string | null;
  finished_at: string | null;
  elapsed_seconds: number | null;
  progress_current: number | null;
  progress_total: number | null;
  progress_label: string;
  result_summary: Record<string, unknown>;
  error: string;
  /** 派出这一轮的父任务；不是后继时为 null（ADR-0040）。 */
  parent_run_id: number | null;
  root_run_id: number | null;
  /** 这条后继要做的那件事的全名。不是后继时是空串，界面据此判断它挂不挂到父卡片下。 */
  followup_key: string;
  followup_depth: number;
}

export interface ActivityData {
  available: boolean;
  result_versions?: Record<string, string>;
  message?: string;
  running: TaskRunPayload[];
  skipped: TaskRunPayload[];
  finished: TaskRunPayload[];
  /** 「最近完成」这一页后面还有更早的。 */
  finished_has_more?: boolean;
  /** Parent tasks that have finished themselves while their follow-ups are still queued or running, and are not on the `running` / `finished` page. */
  working_parents?: TaskRunPayload[];
  /** Parent task id -> how many of its direct follow-ups are in each status. Only some follow-ups are sent down; use this for progress and whether anything is still running. */
  followup_counts?: FollowupCounts;
}

export type FollowupCounts = Record<string, Record<string, number>>;

/** 往前翻的一页：只有「最近完成」，在跑与被挡下的由轮询那一份负责。 */
export interface FinishedPage {
  finished: TaskRunPayload[];
  finished_has_more: boolean;
  followup_counts?: FollowupCounts;
}

/** Tally follow-ups dispatched across several rounds: how many in total, how many finished, and how many are still queued or running. */
export function followupTally(counts: FollowupCounts | undefined, runs: TaskRunPayload[]) {
  let total = 0, active = 0, failed = 0;
  for (const run of runs) {
    for (const [status, count] of Object.entries(counts?.[String(run.id)] || {})) {
      total += count;
      if (status === 'pending' || status === 'running') active += count;
      if (status === 'failed' || status === 'interrupted') failed += count;
    }
  }
  return { total, active, failed, settled: total - active };
}

/** Merge consecutive rounds of the same kind of task into one item: auto-repair dispatches a batch every minute, and a dozen "Completed" cards on one screen would all say the same thing.
 *  Each group is ordered with the latest round first; `runs[0]` is the latest round. */
export function foldByKind(rows: TaskRunPayload[]): RunFold[] {
  const folds = new Map<string, RunFold>();
  for (const run of rows) {
    const fold = folds.get(run.task_key);
    if (fold) fold.runs.push(run);
    else folds.set(run.task_key, { run, runs: [run] });
  }
  return [...folds.values()];
}

/** 以 `oldest` 为游标取它之前的一页。游标是它的结束时刻加 id，与服务端的排序键一致。 */
export const fetchEarlier = (oldest: TaskRunPayload, signal?: AbortSignal) => {
  const query = new URLSearchParams({
    before_finished_at: oldest.finished_at || '', before_id: String(oldest.id) });
  return apiGet<FinishedPage>(`${TASKS_URL}?${query}`, signal);
};

/** 几批终态行并成一列：同一轮只留一条，按结束时刻从新到旧、同一时刻按 id 从大到小，
 *  和服务端翻页的排序键同一个，拼接处才不会乱序。终态落地后不再变，重复的哪一份都一样。 */
export function mergeFinished(...batches: TaskRunPayload[][]): TaskRunPayload[] {
  const byId = new Map<number, TaskRunPayload>();
  for (const batch of batches) for (const row of batch) if (!byId.has(row.id)) byId.set(row.id, row);
  return [...byId.values()].sort((a, b) => {
    const left = a.finished_at || '', right = b.finished_at || '';
    if (left !== right) return left < right ? 1 : -1;
    return b.id - a.id;
  });
}

/** 有东西在跑就两秒一次（和进度写库的节流同一个数），全是终态时十秒一次。 */
export const RUNNING_POLL_MS = 2000;
export const SETTLED_POLL_MS = 10000;
export const pollInterval = (data: ActivityData | undefined): number =>
  data?.running?.length ? RUNNING_POLL_MS : SETTLED_POLL_MS;

export const fetchTasks = (signal?: AbortSignal) => apiGet<ActivityData>(TASKS_URL, signal);

/** 首屏：取完数才画。中止时 `fetchQuery` 把 `AbortError` 抛回给挂载方，它据此放弃这一次。 */
export async function prefetchTasks(signal: AbortSignal): Promise<void> {
  await queryClient.fetchQuery({ queryKey: TASKS_KEY, queryFn: () => fetchTasks(signal) });
}

export const TRIGGER_LABELS: Record<string, string> = {
  manual: 'Manual', scheduled: 'Scheduled', startup: 'Startup', cli: 'Command line',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Queued', running: 'In progress', succeeded: 'Completed',
  failed: 'Failed', cancelled: 'Cancelled', interrupted: 'Interrupted',
};

/** 状态的中文名。表里的状态集是封闭的，认不出来只可能是表先改了，那就原样显示。 */
export const statusLabel = (status: string): string => STATUS_LABELS[status] || status;

/* The main summary uses the labels defined here; the raw status dictionary is kept in the technical details. */
const SUMMARY_LABELS: Record<string, string> = {
  checked: 'Checked', total: 'Total', scanned: 'Scanned', identified: 'Identified',
  candidates: 'Metadata results', covers: 'Covers', changed: 'Changed', operation: 'Operation',
  ok: 'Found', miss: 'Not found', kept: 'Kept', planned: 'Planned', done: 'Processed', added: 'Added',
  written: 'Saved', removed: 'Removed', issue_count: 'Needs attention',
  followups_duplicate: 'Follow-ups already queued', followups_truncated: 'Follow-ups over the limit',
  followups_depth_exceeded: 'Follow-ups too deep', name: 'Name',
  matched: 'Matches', size: 'Size', source: 'Source', cover_network: 'Cover: cannot reach image host',
  probed: 'Media info read', previews: 'Previews', paused_count: 'Waiting for source to recover',
  auto_applied: 'Saved automatically', auto_rejected: 'Not adopted', performer_avatars: 'Performer avatars',
  performer_profile_failed: 'Performer profile fetch failed', performer_aliases: 'Performer aliases',
  performer_profile_conflicts: 'Performer profiles to review', conflicts: 'Conflicts to review',
  gone_count: 'Links gone', unclear_count: 'Links unreachable',
  source_failed: 'Source check failed', source_warning: 'Source follow-up check failed',
  resolve_failed: 'Lookup failed', sources_found: 'Sources found',
  warning_count: 'Needs attention', profiles_checked: 'Browser profiles read',
  missing: 'Files missing', purge: 'Records that can be deleted', vanish: 'Personal records to keep',
  empty: 'Empty folders', unreadable: 'Unreadable', cache_files: 'Cache files that can be cleared',
  cache_bytes: 'Cache size that can be cleared', bytes_reclaimed: 'Space reclaimed',
  cache_removed: 'Cache files cleared', cache_blocked_count: 'Cache clearing failed',
  purged: 'Records deleted', vanished: 'Marked as file missing', reattached: 'Records moved',
  blocked_count: 'Records that could not be deleted', dirs_removed: 'Empty folders deleted', dir_errors: 'Folder cleanup failed',
  marked: 'Marked as dead', recovered: 'Reachable after recheck', entities: 'Items involved',
  found: 'Files needing repair', repaired: 'Repaired', failed: 'Failed', missing_tool: 'Repair tool missing',
  moved: 'Files organized', restored: 'Restored', skipped: 'Skipped', made: 'Previews generated',
  fetched: 'Metadata fetched', updated: 'Updated', discovered: 'Works discovered', without_code: 'No product code recognized',
  incomplete: 'Metadata or cover not retrieved',
  result: 'Result',
};

const PROBLEM_COUNTS = [
  'gone_count', 'unclear_count', 'source_failed', 'source_warning', 'resolve_failed',
  'warning_count', 'missing', 'unreadable', 'cache_blocked_count', 'blocked_count', 'dir_errors',
  'failed', 'missing_tool', 'issue_count', 'cover_network', 'performer_profile_failed',
  'performer_profile_conflicts', 'conflicts', 'paused_count', 'miss', 'incomplete',
];

/** This round lacked a capability, so the conclusion was reached with the older fallback criteria. A count of 0 still counts as a problem: what failed was not those items but the whole round. */
const PROBLEM_FLAGS = ['face_match_unavailable'];

/** Finishing the check and the check result having problems are two different things; problems must not be hidden by routine folding. */
export const hasResultProblems = (run: TaskRunPayload): boolean => run.result_summary?.ok === false
  || Boolean(run.result_summary?.error)
  || PROBLEM_FLAGS.some((key) => run.result_summary?.[key] === true)
  || PROBLEM_COUNTS.some((key) => Number(run.result_summary?.[key]) > 0);

export interface TaskIssue { source: number; label: string; provider: string; kind: string; error: string }

/** Issue details are bound to this round's snapshot; the current source status is viewed on the corresponding management page. */
export function taskIssues(run: TaskRunPayload): TaskIssue[] {
  const issues = run.result_summary?.issues;
  return Array.isArray(issues) ? issues.filter((item): item is TaskIssue => !!item
    && typeof item === 'object' && typeof item.error === 'string' && typeof item.label === 'string') : [];
}

/** Tasks whose handling entry only makes sense for the latest round of the same kind of task: the target page shows only the latest round, and earlier failures have been superseded by later results.
 *  The issue list and "Retry unfinished items" on scan and collection cards only recognize the failure set of the latest round. */
const LATEST_ONLY = new Set(['library-processing']);

export function problemDestination(run: TaskRunPayload, latest = true): { href: string; label: string } | null {
  if (!hasResultProblems(run) && run.status !== 'failed') return null;
  if (LATEST_ONLY.has(run.task_key) && !latest) return null;
  const targets: Record<string, [string, string]> = {
    'link-check': ['/data-cleanup#link-manager', 'View problem links'],
    'link-prune': ['/data-cleanup#link-manager', 'View problem links'],
    // "Needs attention" does not include the retryable items here: the issue list has hundreds of entries, so look at the list first and retry from that card.
    'library-processing': ['/data-cleanup#libraryProcessing', 'View unfinished items'],
    'follow-check': ['/subscriptions', 'View followed sources'],
    'feed-check': ['/subscriptions', 'View feeds'],
    'follow-resolve': ['/subscriptions?tab=add', 'View source lookup'],
    'resource-scan': ['/data-cleanup#resource-sync', 'View resource sync'],
    'resource-apply': ['/data-cleanup#resource-sync', 'View resource sync'],
    'media-repair': ['/data-cleanup#mediaRepair', 'View media repair'],
    'taste-refresh': ['/taste', 'View taste data sources'],
  };
  const target = targets[run.task_key];
  return target ? { href: target[0], label: target[1] } : null;
}

/** The id of the latest round for each kind of task in `LATEST_ONLY`. Follow-ups do not count: they hang under the parent task and are not a round of this kind of task. */
export function latestOfKind(rows: TaskRunPayload[]): Set<number> {
  const newest = new Map<string, number>();
  for (const row of rows) {
    if (LATEST_ONLY.has(row.task_key) && !row.followup_key
        && row.id > (newest.get(row.task_key) ?? 0)) newest.set(row.task_key, row.id);
  }
  return new Set(newest.values());
}

/** 把一批任务按 `parent_run_id` 归到各自的父任务下。没有父的那些留在外面。 */
export function groupFollowups(rows: TaskRunPayload[]): Map<number, TaskRunPayload[]> {
  const grouped = new Map<number, TaskRunPayload[]>();
  for (const row of rows) {
    if (!row.followup_key || row.parent_run_id == null) continue;
    const siblings = grouped.get(row.parent_run_id);
    if (siblings) siblings.push(row);
    else grouped.set(row.parent_run_id, [row]);
  }
  return grouped;
}

/** 连着的几轮收成一张卡：`runs[0]` 是最新那一轮。 */
export interface RunFold { run: TaskRunPayload; runs: TaskRunPayload[] }

/** 「最近完成」按时间顺序折叠：一段连续的例行轮次里，同一种任务并成一张卡，摆在它
 *  最新那一轮的位置上。任何一轮不是例行的（手动、失败、有新增或派了后继）都会截断这一段
 *  ——折叠只收「按时跑了、什么也没发生」的那些，有事的那一轮必须单独看得见。 */
export function foldRoutine(rows: TaskRunPayload[],
                            routine: (run: TaskRunPayload) => boolean): RunFold[] {
  const folds: RunFold[] = [];
  let open = new Map<string, RunFold>();
  for (const run of rows) {
    if (!routine(run)) {
      open = new Map();
      folds.push({ run, runs: [run] });
      continue;
    }
    const fold = open.get(run.task_key);
    if (fold) fold.runs.push(run);
    else {
      const started = { run, runs: [run] };
      open.set(run.task_key, started);
      folds.push(started);
    }
  }
  return folds;
}

/** 按时跑完、什么也没发生的一轮：定时触发、成功、没有新增也没派后继。 */
export const isRoutine = (run: TaskRunPayload) => run.trigger === 'scheduled'
  && run.status === 'succeeded' && !run.error
  && !hasResultProblems(run)
  && !(Number(run.result_summary?.added) > 0) && !(Number(run.result_summary?.followups) > 0);

export const isActive = (run: TaskRunPayload) => run.status === 'pending' || run.status === 'running';

/** 后继那一行的说明：它在做哪一件（标签去掉与任务名重复的前缀）、做到第几项或结果如何。
 *  标题已经是任务名，这里再写一遍「取新作资料：」读起来就是同一句话说了两次。 */
export function followupDetail(row: TaskRunPayload): string {
  const prefix = `${row.task_label}：`;
  const label = row.progress_label || '';
  const item = String(row.result_summary?.name || '')
    || (label.startsWith(prefix) ? label.slice(prefix.length) : label === row.task_label ? '' : label);
  const total = row.progress_total || 0;
  const { name: _name, ...result } = row.result_summary || {};
  const tail = readableErrorHeadline(row.error) || summaryText(result)
    || (isActive(row) && total > 0 ? `${progressText(row.progress_current, total)} items` : '');
  return [item, tail].filter(Boolean).join(' · ');
}

/** 秒数说成「几分几秒」。跑了几小时的批处理也要一眼读得出量级：满 48 小时按天说。 */
export function elapsedText(seconds: number | null | undefined): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return '';
  const whole = Math.floor(seconds);
  if (whole < 60) return `${whole}s`;
  const minutes = Math.floor(whole / 60);
  if (minutes < 60) return `${minutes}m ${whole % 60}s`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24).toLocaleString()}d ${hours % 24}h`;
}

/** 进度读数「已做 / 总数」：服务端偶尔报出超过总数的已做数，按总数封顶。 */
export function progressText(current: number | null | undefined, total: number | null | undefined): string {
  const all = Math.max(0, Number(total) || 0);
  const done = Math.min(all, Math.max(0, Number(current) || 0));
  return `${done.toLocaleString()} / ${all.toLocaleString()}`;
}

/** 一段报错在列表里只露的那一行。Python traceback 的第一行永远是「Traceback (most recent call
 *  last):」，说明不了什么，取最后一行的异常类型与消息；别的取第一行非空。 */
export function errorHeadline(text: string | null | undefined): string {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return '';
  return /^Traceback \(most recent call last\)/.test(lines[0]!) ? lines[lines.length - 1]! : lines[0]!;
}

/** The exception type and raw stack trace are kept in the details; the summary states the actual cause. */
export function readableErrorHeadline(text: string | null | undefined): string {
  const head = errorHeadline(text);
  const technical = head.match(/^(?:[\w.]*Error|Exception):\s*(.*)$/);
  if (!technical) return head;
  return requestErrorMessage(technical[1]);
}

const OUTCOME_LABELS: Record<string, string> = {
  partial: 'Finished; some items need attention', complete: 'Finished', interrupted: 'Processing interrupted',
  '没有新写法': 'No new aliases found', '已装上': 'Profile image saved',
  '已装着认得准的小图': 'Kept the small image that passed identity check',
  '档案已不存在': 'Profile record no longer exists', '资料未过期': 'Existing info is still valid',
  '图太小': 'Image resolution too low', '官网未取得': 'Studio website info not retrieved',
  '两站都没有作品一览': 'Neither source provides a works list',
  '哪一站都没对上她': 'No matching profile page found for this person',
  '两站都没对上她': 'Neither source has a matching profile page for this person',
  '三站都没对上她': 'None of the three sources has a matching profile page for this person',
  '已有身份': 'Already has a creator category', '已变': 'Info was changed by another operation; not saved this time',
};
const SOURCE_NAMES: Record<string, string> = { avwikidb: 'AVWikiDB', javdb: 'JavDB', 'minnano-av': 'みんなのAV' };
const OPERATION_LABELS: Record<string, string> = {
  like: 'Mark as liked', seen: 'Mark as watched', later: 'Add to Watch later', dispose: 'Move to trash',
  restore: 'Restore', delete: 'Delete permanently', 'empty-trash': 'Empty trash',
  'dismiss-junk': 'Confirm not junk', 'reconsider-junk': 'Re-judge as junk', region: 'Determine region',
};
const outcomeText = (text: string): string => OUTCOME_LABELS[text] || text
  .replace(/(avwikidb|javdb|minnano-av) (绑定|写入)/gi, (_, site: string, action: string) =>
    action === '绑定' ? `Linked ${SOURCE_NAMES[site.toLowerCase()]} profile page`
      : `Saved info from ${SOURCE_NAMES[site.toLowerCase()]}`);

/** 时间戳说成本地的「月-日 时:分」。数据库里存的是 UTC，界面上一律按本机时区读。 */
export function momentText(stamp: string | null | undefined): string {
  if (!stamp) return '';
  const moment = new Date(stamp);
  if (Number.isNaN(moment.getTime())) return '';
  return moment.toLocaleString(undefined,
    { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/* 不进摘要的键：「谁挡的」已经写在错误那一句里；其余是域状态字典里的簿记——状态、
   起止时间戳、请求号和任务号，卡片标题、徽章和时间那一行已经说过，原样摆出来只是一串
   英文键和纪元秒。 */
const SUMMARY_HIDDEN = new Set([
  'blocked_by', 'status', 'run_id', 'request_id', 'started_at', 'completed_at', 'finished_at',
]);

/** Task results only show user-facing fields. */
export function summaryItems(summary: Record<string, unknown>): string[] {
  const items = fieldItems(summary);
  // "Problems found" must say what the problem is. When the reason is already written into the conclusion ("Face model unavailable: ...", "Portrait gate not in effect ...") do not repeat it.
  if (summary?.face_match_unavailable === true && !items.some((line) => /不可用|未生效/.test(line))) {
    items.push('Face model unavailable; face check not performed');
  }
  return items;
}

function fieldItems(summary: Record<string, unknown>): string[] {
  return Object.entries(summary || {})
    .filter(([key, value]) => !SUMMARY_HIDDEN.has(key)
      && (key in SUMMARY_LABELS || key === 'outcome' || key === 'followups' || key === 'error')
      && (typeof value === 'number' || typeof value === 'string')
      && String(value) !== '' && (value !== 0 || key === 'checked' || key === 'total'))
    .map(([key, value]) => {
      if (key === 'followups') return `Queued ${Number(value).toLocaleString()} follow-up tasks`;
      if (key === 'error') return readableErrorHeadline(String(value));
      if (key === 'outcome' || key === 'result') return outcomeText(String(value));
      if (key === 'cache_bytes' || key === 'bytes_reclaimed') return `${SUMMARY_LABELS[key]} ${fmtSize(Number(value))}`;
      if (key === 'operation') return `Operation: ${OPERATION_LABELS[String(value)] || 'Batch operation'}`;
      return `${SUMMARY_LABELS[key]} ${typeof value === 'number' ? value.toLocaleString() : value}`;
    });
}

export const summaryText = (summary: Record<string, unknown>): string => summaryItems(summary).join(' · ');
