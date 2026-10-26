/* 数据管理页上的「整理」（ADR-0039）：选来源、填两份模板、预览、执行，外加整批回滚。
 *
 * 预览是一次同步请求，结果只活在这张卡上；执行与回滚是同一趟后台任务，快照摊在
 * `/api/organize` 的顶层，所以 `useBackgroundJob` 用 `withJob` 只换任务那几格，来源、模板
 * 与上一批原样留着。执行与回滚动的是真实文件名与数据库路径，都要先过确认弹层。 */
import { useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { confirmModal, MEDIA_SOURCE_ICONS } from '@peach/legacy/ui';
import { LOC } from '@peach/legacy/core';

import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { Select, SelectItem } from '@/components/base/select/select';

import { errorMessage } from '../../api';
import { useBackgroundJob } from '../background-job';
import { Fieldset, FieldsetTitle } from '../components/fieldset';
import { Note } from '../components/note';
import { TaskProgress } from '../components/task-progress';
import { queryClient } from '../query';
import { SourceMark } from '../settings/section';
import { busyProps } from '../settings/use-action';
import {
  baseName, DIRECTORY_TEMPLATE_ERROR, fetchOrganize, ORGANIZE_KEY, organizeOutcome, planSummary,
  previewOrganize, rememberTemplates, startOrganize, withOrganizeJob,
  type OrganizeCommand, type OrganizeData, type OrganizeJob, type OrganizePlan,
} from './organize';

const APPLY_BODY = (name: string) => `File names and folders of "${name}" will be changed using these two templates; rows whose target already exists are skipped entirely.`
  + ' This batch can be reverted as a whole with "Roll back last batch".';
const ROLLBACK_BODY = 'Files touched by the last batch will be reverted to their previous names and locations, and database paths revert with them.'
  + ' After reverting, this batch no longer appears here.';
/** 预览只列前 8 行：这里是给人扫一眼方向对不对，完整计划在 CSV 里。 */
const PLAN_ROWS = 8;

function PlanRows({ plan }: { plan: OrganizePlan }) {
  return (
    <>
      <ol className="mt-2 flex min-w-0 flex-col gap-1">
        {plan.rows.slice(0, PLAN_ROWS).map((row) => (
          <li key={row.current_path}
            className="flex min-w-0 items-center gap-2 text-caption-1-regular text-text-secondary">
            <span data-middle-truncate title={row.current_path} className="min-w-0 truncate">{baseName(row.current_path)}</span>
            <span aria-hidden>→</span>
            <span data-middle-truncate title={row.target_path} className="min-w-0 truncate text-text-primary">{baseName(row.target_path)}</span>
          </li>
        ))}
      </ol>
      {plan.truncated
        ? <p className="text-caption-1-regular text-text-secondary">Only the first 8 rows are listed; the full plan is in the plan CSV.</p>
        : null}
    </>
  );
}

export function OrganizeCard(
  { toast, failure }: { toast(message: string): void; failure(action: string, error: unknown): void },
) {
  const organize = useQuery({ queryKey: ORGANIZE_KEY, queryFn: ({ signal }) => fetchOrganize(signal) });
  const data = organize.data;
  const locations = data?.locations ?? [];
  const [chosen, setChosen] = useState('');
  const location = locations.some((row) => row.location === chosen) ? chosen : locations[0]?.location ?? '';
  const stored = data?.templates?.[location];
  /* 两个框在人动过之前跟着存下的模板走：换来源就换成那个来源上次用的那两行。 */
  const [draft, setDraft] = useState<{ location: string; file: string; dir: string } | null>(null);
  const fields = draft?.location === location ? draft : { location, file: stored?.file ?? '', dir: stored?.dir ?? '' };
  const edit = (patch: Partial<{ file: string; dir: string }>) => setDraft({ ...fields, ...patch });
  const [invalid, setInvalid] = useState<'file' | 'dir' | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const dirInput = useRef<HTMLInputElement>(null);

  const request = () => ({ location, file_template: fields.file.trim(), dir_template: fields.dir.trim() });
  const preview = useMutation({
    mutationFn: previewOrganize,
    /* 模板不合法时错误就出在两个框里的一个，所以除了说原因还要指出是哪一格。 */
    onError: (cause) => {
      const target = DIRECTORY_TEMPLATE_ERROR.test(errorMessage(cause)) ? 'dir' : 'file';
      setInvalid(target);
      (target === 'dir' ? dirInput : fileInput).current?.focus();
    },
  });
  const job = useBackgroundJob<OrganizeJob, OrganizeCommand, OrganizeData>({
    queryKey: ORGANIZE_KEY,
    queryFn: ({ signal }) => fetchOrganize(signal),
    start: startOrganize,
    jobOf: (current) => current,
    withJob: withOrganizeJob,
    onStarted: () => preview.reset(),
    onFinish: (finished) => {
      /* 上一批跟着这一趟变了：执行多出一批，回滚退掉一批。重读一次拿到新的 `last_batch`。 */
      void queryClient.invalidateQueries({ queryKey: ORGANIZE_KEY, exact: true });
      if (finished.status !== 'complete') return;
      const { text, failed } = organizeOutcome(finished);
      if (failed) failure('Organize by template', new Error(`${failed} rows could not be processed`));
      else toast(text.replace(/[.。]$/, ''));
    },
  });

  const running = job.running || job.start.isPending;
  const plan = preview.data;
  const changes = Number(plan?.counts?.change || 0);
  const name = LOC[location] || location;
  const hint = (data?.placeholders ?? []).map((item) => `{${item.key}} ${item.label}`).join(' · ');

  const runPreview = () => {
    if (preview.isPending || !location) return;
    setInvalid(null);
    preview.mutate(request());
  };
  const runApply = () => void confirmModal({
    title: 'Organize files by template', body: APPLY_BODY(name), confirmLabel: 'Organize files',
    /* 预览只是试一试，不落盘；确认执行的那两行才记成这个来源的模板。 */
    onConfirm: async () => {
      const sent = request();
      await job.start.mutateAsync({ kind: 'apply', request: sent });
      void rememberTemplates({
        ...(data?.templates ?? {}), [sent.location]: { file: sent.file_template, dir: sent.dir_template },
      });
    },
  });
  const runRollback = () => void confirmModal({
    title: 'Roll back last batch', body: ROLLBACK_BODY, confirmLabel: 'Roll back',
    onConfirm: () => job.start.mutateAsync({ kind: 'rollback' }),
  });

  /* 这张卡上的结论只有一句：跑着的那一趟、这次跟完的那一趟、刚出的预览，按新旧取最新。 */
  let state = null;
  const current = job.job;
  const outcome = job.outcome;
  if (current?.status === 'running') {
    const line = current.message || current.stage || 'Organizing files…';
    state = <TaskProgress embedded label={line} value={Math.min(current.checked || 0, current.total || 0)} total={current.total} />;
  } else if (outcome?.status === 'failed') {
    state = <Note tone="error" title="File organizing incomplete">{outcome.error || 'Check the task log to verify which files were processed.'}</Note>;
  } else if (outcome) {
    const { text, failed } = organizeOutcome(outcome);
    state = <Note tone={failed ? 'warning' : 'success'} title={failed ? 'Partially done' : 'Result'}>{text}</Note>;
  } else if (job.start.isError) {
    state = <Note tone="error" title="Organizing failed">{errorMessage(job.start.error)}</Note>;
  } else if (preview.isPending) {
    state = <TaskProgress embedded label="Computing plan from templates…" />;
  } else if (preview.isError) {
    state = <Note tone="error" title="Template unavailable">{errorMessage(preview.error)}</Note>;
  } else if (plan) {
    state = <><Note tone="neutral" title="Preview result">{planSummary(plan)}</Note>{changes ? <PlanRows plan={plan} /> : null}</>;
  }

  return (
    <Fieldset layout="stack" id="organize" labelledBy="cleanup-organize-title"
      attributes={{ 'data-cleanup-organize': '' }}
      footer={
        <>
          <Button disabled={!locations.length} {...busyProps(preview.isPending)} onClick={runPreview}>Preview</Button>
          {changes && !running && !job.outcome
            ? <Button onClick={runApply}>Organize</Button>
            : null}
          {data?.last_batch
            ? <Button variant="secondary" {...busyProps(running)} onClick={runRollback}>Roll back last batch</Button>
            : null}
        </>
      }>
      <FieldsetTitle id="cleanup-organize-title" gap="medium">Organize</FieldsetTitle>
      <p className="text-body-regular text-text-secondary">
        Rename files and sort them into folders by template. Preview first, then run; a completed batch can be reverted as a whole.
      </p>
      {organize.isError
        ? <div className="mt-3"><Note tone="error" title="Could not load organize settings">{errorMessage(organize.error)}</Note></div>
        : null}
      <div className="mt-3 flex flex-col gap-3">
        {locations.length
          ? <Select aria-label="Source to organize" className="w-fit min-w-25" selectedKey={location || null}
              onSelectionChange={(key) => {
                if (key === null) return;
                setChosen(String(key)); setInvalid(null); preview.reset();
              }}>
              {locations.map((row) => (
                <SelectItem key={row.location} id={row.location} textValue={LOC[row.location] || row.location}>
                  <SourceMark mark={MEDIA_SOURCE_ICONS[row.location] || 'database'} />{LOC[row.location] || row.location}
                </SelectItem>
              ))}
            </Select>
          : null}
        <Input label="File name template" placeholder="{number}[ {title}]" value={fields.file} ref={fileInput}
          spellCheck="false" isInvalid={invalid === 'file'}
          onChange={(value) => { edit({ file: value }); setInvalid(null) }} />
        <Input label="Folder template" placeholder="Leave empty to rename in place" value={fields.dir} ref={dirInput}
          spellCheck="false" isInvalid={invalid === 'dir'}
          onChange={(value) => { edit({ dir: value }); setInvalid(null) }} />
        {data?.presets?.length
          ? <div className="flex flex-wrap gap-2">
              {data.presets.map((preset) => (
                <Button key={preset.label} variant="secondary" title={preset.label}
                  className="max-w-full [&>span]:min-w-0 [&>span]:shrink"
                  onClick={() => { edit({ file: preset.file, dir: preset.dir }); setInvalid(null) }}>
                  <span className="truncate">{preset.label}</span>
                </Button>
              ))}
            </div>
          : null}
        <p className="text-caption-1-regular leading-4.5 text-text-secondary">
          {`${hint ? `${hint}; ` : ''}Text in square brackets is omitted entirely when the field is empty.`}
        </p>
      </div>
      <div aria-live="polite" className="mt-3 flex flex-col gap-2 empty:hidden">{state}</div>
    </Fieldset>
  );
}
