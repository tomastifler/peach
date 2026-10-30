/* "Storage": where the data folder is, how much space is left on its disk, how much each kind of data takes, cleaning up the kinds that can be rebuilt,
 * or moving the whole data folder to another disk.
 *
 * The statistics are enclosed in their own panel: two charts on top (share by category, disk usage) and one row per category below. The categories that can be cleaned
 * have a checkbox at the start of the row; tick several to clean them together, or use "Clean all"; for those that cannot be cleaned the checkbox is disabled and the row says why.
 *
 * Measuring and cleaning run in a server background thread, and while running the status is polled every 1.5 seconds. While measuring, progress is estimated from the last file count,
 * and if it has never been measured only the number of files scanned so far is reported. After a move request is accepted the service exits,
 * and the page keeps only a one-line receipt: after the tray finishes the move it reopens Peach by itself. */
import { useEffect, useRef, useState } from 'react';
import { confirmModal } from '@peach/legacy/ui';
import { fmtSize } from '@peach/legacy/core';

import { Button } from '@/components/base/buttons/button';
import { Checkbox } from '@/components/base/checkbox/checkbox';

import { ApiError, apiGet, apiSend, errorMessage } from '../../api';
import { PICK_FOLDER_URL } from '../../configuration-endpoints';
import type { StorageCategory, StorageState } from '../bundle';
import { AnimatedNumber } from '../components/animated-number';
import { cardClass } from '../components/card';
import { LoadingDots } from '../components/loading-dots';
import { PathLine } from '../components/path-line';
import { Progress } from '../components/progress';
import { ErrorText, Fact, FactList, Footer, Help, Stack, Section } from './section';
import { CATEGORY_SWATCH, REST_SWATCH, StorageOverview } from './storage-charts';
import { busyProps, useAction } from './use-action';

const STORAGE_URL = '/api/configuration/storage';
const POLL_MS = 1500;
/** The receipt for a finished move is kept for a day; after that it shows only when something still needs handling (a note). */
const RESULT_MS = 24 * 3600 * 1000;

const targetReason = (cause: unknown) =>
  (cause instanceof ApiError && (cause.body as { errors?: { target?: string } } | null)?.errors?.target)
  || errorMessage(cause);

function diskLine(storage: StorageState) {
  if (storage.free_bytes === null || storage.total_bytes === null) return 'Unavailable';
  const line = `${fmtSize(storage.free_bytes)} free of ${fmtSize(storage.total_bytes)}`;
  return storage.system_drive ? `${line} (system disk)` : line;
}

const cleanable = (category: StorageCategory) => category.cleanable && category.reclaimable > 0;

/** Measuring in progress: draw a progress bar if the last file count is known, otherwise just say how many have been scanned. */
function Measuring({ job }: { job: StorageState['job'] }) {
  const files = job.files || 0;
  const expected = job.expected_files || 0;
  const reading = <>Counted <AnimatedNumber value={files} /> files · <AnimatedNumber value={job.bytes || 0} format={fmtSize} /></>;
  return (
    <div aria-live="polite" className="flex flex-col gap-2">
      {expected
        ? <>
            {/* When there are more files than last time the progress bar stays at 99% until the result arrives. */}
            <Progress label="Measuring progress" value={Math.min(files, expected * 0.99)} max={expected} />
            <Help>{reading}, last time {expected.toLocaleString()} in total</Help>
          </>
        : <LoadingDots label="Measuring space usage" />}
      {!expected ? <Help>{reading}</Help> : null}
    </div>
  );
}

/** One row per kind of data: checkbox, color swatch, name and description, size. The checkbox is disabled for what cannot be cleaned, and the description gives the reason. */
function CategoryRow(
  { category, selected, disabled, onToggle }:
  { category: StorageCategory; selected: boolean; disabled: boolean; onToggle(next: boolean): void },
) {
  const able = cleanable(category);
  const reason = category.cleanable
    ? category.reclaimable > 0 ? `After cleanup: ${category.note}` : 'No files that can be cleaned'
    : `Cannot be cleaned: ${category.note}`;
  return (
    <div data-category={category.key}
      className="flex min-h-13 w-full items-start gap-3 border-b border-separator-border py-2.5 pr-3 last:border-b-0">
      <Checkbox aria-label={`Clean ${category.label}`} isSelected={selected} isDisabled={!able || disabled}
        onChange={onToggle} className="mt-0.5" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="flex items-center gap-2 text-body-regular text-text-primary">
          <i aria-hidden className={`size-2.5 shrink-0 rounded-xs ${CATEGORY_SWATCH[category.key] || REST_SWATCH}`} />
          {category.label}
        </p>
        <p className="text-body-2-regular text-text-secondary">{category.description}</p>
        <p className="text-caption-1-regular text-text-tertiary">{reason}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
        <AnimatedNumber value={category.bytes} format={fmtSize} className="text-body-regular text-text-primary" />
        {able ? <span className="text-caption-1-regular text-text-secondary">Can free {fmtSize(category.reclaimable)}</span> : null}
      </div>
    </div>
  );
}

export function StorageSettings({ initial, receipt }: { initial: StorageState; receipt(message: string): void }) {
  const [storage, setStorage] = useState(initial);
  const [accepted, setAccepted] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const action = useAction();
  const running = storage.job.state !== 'idle';
  const reported = useRef(running);

  useEffect(() => {
    if (!running) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      apiGet<StorageState>(STORAGE_URL, controller.signal).then(setStorage, () => {
        if (!controller.signal.aborted) setStorage((current) => ({ ...current }));
      });
    }, POLL_MS);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [storage]);

  // A round of measuring or cleaning ends: a successful receipt goes to a Toast, a failure's reason stays in the section; categories that were cleaned are no longer ticked.
  useEffect(() => {
    if (running) { reported.current = true; return; }
    if (!reported.current) return;
    reported.current = false;
    setPicked(new Set());
    if (!storage.job.error) receipt(storage.job.message || 'Space usage measured');
  }, [running]);

  const measure = () => void action.run('measure', (signal) =>
    apiSend<StorageState>(`${STORAGE_URL}/measure`, {}, 'POST', signal), setStorage);

  const usage = storage.usage;
  const available = usage?.categories.filter(cleanable) ?? [];
  const chosen = available.filter((category) => picked.has(category.key));

  const clean = (targets: StorageCategory[], title: string) => {
    if (!targets.length) return;
    const total = targets.reduce((sum, category) => sum + category.reclaimable, 0);
    void confirmModal({
      title,
      body: `Will delete ${fmtSize(total)}: ${targets.map((category) =>
        `${category.label} ${fmtSize(category.reclaimable)} (after cleanup: ${category.note})`).join('; ')}.`,
      confirmLabel: `Clean ${fmtSize(total)}`,
      danger: targets.some((category) => category.key === 'backups'),
      onConfirm: async () => setStorage(await apiSend<StorageState>(`${STORAGE_URL}/clean`,
        { categories: targets.map((category) => category.key) })),
    });
  };

  const relocate = () => void action.run('relocate', async (signal) => {
    const target = (await apiSend<{ path: string | null }>(PICK_FOLDER_URL, { initial: storage.data_root }, 'POST', signal)).path;
    if (!target) return;
    const size = storage.usage ? fmtSize(storage.usage.total_bytes) : '';
    await confirmModal({
      title: 'Move data folder',
      body: `Move ${size} of data from ${storage.data_root} to ${target}. Peach quits during the move and reopens automatically when it finishes; the data at the original location is deleted once the new location is verified.`,
      confirmLabel: 'Move data folder',
      onConfirm: async () => {
        try {
          setAccepted((await apiSend<{ message: string }>(`${STORAGE_URL}/relocate`, { target })).message);
        } catch (cause) {
          throw new Error(targetReason(cause));
        }
      },
    });
  }, () => undefined);

  const last = storage.relocation.last;
  const recent = last && (last.state === 'error' || (last.notes?.length ?? 0) > 0
    || Date.now() - last.finished_at * 1000 < RESULT_MS);
  const cleaningLabel = usage?.categories.find((category) => category.key === storage.job.category)?.label;
  const status = accepted
    || (storage.job.state === 'cleaning' ? `Cleaning ${cleaningLabel || ''}…`
      : storage.job.state === 'measuring' ? 'Measuring space usage…'
        : chosen.length ? `Selected ${chosen.length} categories, can free ${fmtSize(chosen.reduce((sum, item) => sum + item.reclaimable, 0))}`
          : usage ? `Measured at ${new Date(usage.measured_at * 1000).toLocaleString()}` : '');
  const locked = running || Boolean(accepted);
  const toggle = (key: string) => (next: boolean) => setPicked((current) => {
    const copy = new Set(current);
    if (next) copy.add(key); else copy.delete(key);
    return copy;
  });
  return (
    <Section id="storageSettings" title="Storage">
      <FactList>
        <Fact term="Data folder">
          <PathLine path={storage.data_root} className="text-body-regular text-text-primary" onRevealed={receipt} />
        </Fact>
        <Fact term="Disk">{diskLine(storage)}</Fact>
      </FactList>
      <Stack divided>
        {storage.job.state === 'measuring' ? <Measuring job={storage.job} /> : null}
        {usage
          ? <div data-storage-result="" className={cardClass({ variant: 'outlined', padding: 'none', className: 'flex flex-col' })}>
              <div className="border-b border-separator-border p-4"><StorageOverview storage={storage} /></div>
              <div className="flex flex-col pl-4">
                {usage.categories.map((category) => (
                  <CategoryRow key={category.key} category={category} selected={picked.has(category.key)}
                    disabled={locked} onToggle={toggle(category.key)} />
                ))}
              </div>
            </div>
          : storage.job.state === 'measuring' ? null
            : <Help>After measuring, the usage of each kind of data is shown, and caches and old backups can be cleaned.</Help>}
        {!storage.relocation.available ? <Help>{storage.relocation.message}</Help> : null}
        {/* For deployments that the settings page cannot move (containers): the steps to take on the host, each with a one-line description and a command that can be copied as is. */}
        {!storage.relocation.available && storage.relocation.steps?.length
          ? <ol className="flex list-decimal flex-col gap-2 pl-5 text-body-2-regular text-text-secondary" aria-label="Move on the host">
              {storage.relocation.steps.map((step) => (
                <li key={step.command}>
                  {step.text}
                  <code className="mt-1 block rounded-md bg-background-tertiary-default px-2 py-1 text-caption-1-regular break-all text-text-primary">
                    {step.command}
                  </code>
                </li>
              ))}
            </ol>
          : null}
        {storage.job.error ? <ErrorText>{storage.job.message}</ErrorText> : null}
        {action.error ? <ErrorText>{action.error}</ErrorText> : null}
        {recent && last ? (last.state === 'error'
          ? <ErrorText>{last.message}</ErrorText>
          : <Help>{[last.message, ...(last.notes ?? [])].join('; ')}</Help>) : null}
      </Stack>
      <Footer status={status ? <p role={accepted ? 'status' : undefined}>{status}</p> : null}>
        {usage ? <>
          <Button variant="secondary" disabled={locked || !chosen.length}
            {...busyProps(storage.job.state === 'cleaning' && chosen.length > 0)}
            onClick={() => clean(chosen, 'Clean selected data')}>Clean selected</Button>
          <Button variant="secondary" disabled={locked || !available.length}
            onClick={() => clean(available, 'Clean all cleanable data')}>Clean all</Button>
        </> : null}
        <Button variant="secondary" disabled={locked || !storage.relocation.available || !usage}
          onClick={relocate} {...busyProps(action.busy === 'relocate')}>Change location</Button>
        <Button disabled={Boolean(accepted) || storage.job.state === 'cleaning'} onClick={measure}
          {...busyProps(action.busy === 'measure' || storage.job.state === 'measuring')}>
          {usage ? 'Measure again' : 'Measure usage'}
        </Button>
      </Footer>
    </Section>
  );
}
