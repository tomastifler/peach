import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, ButtonLink } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { ApiError, apiGet, apiSend } from '../../api';
import { diagnosticHeaders } from '../../browser-diagnostics';
import { Fieldset, FieldsetTitle } from '../components/fieldset';
import { LoadingDots } from '../components/loading-dots';
import { Note } from '../components/note';
import { Progress } from '../components/progress';
import { queryClient } from '../query';
import { busyProps, useAction } from '../settings/use-action';

const URL = '/api/diagnostics/exports';
const KEY = ['diagnostic-export'] as const;
interface ExportState {
  job_id?: string; kind?: 'support' | 'scraping';
  status: 'idle' | 'running' | 'cancelling' | 'complete' | 'cancelled' | 'failed';
  stage?: string; done?: number; total?: number; files?: number; rows?: number; bytes?: number;
  download_url?: string; error?: string;
}

export function DiagnosticExportAction({ kind, codes = '' }: { kind: 'support' | 'scraping'; codes?: string }) {
  const action = useAction();
  const query = useQuery({ queryKey: KEY, queryFn: ({ signal }) => apiGet<ExportState>(URL, signal),
    refetchInterval: query => ['running', 'cancelling'].includes(query.state.data?.status || '') ? 1000 : false });
  const state = query.data;
  const mine = state?.kind === kind;
  const active = state?.status === 'running' || state?.status === 'cancelling';
  const label = kind === 'support' ? '下载诊断报告' : '导出刮削记录';
  const update = (next: ExportState) => { queryClient.setQueryData(KEY, next) };
  const start = () => void action.run('start', async signal => {
    const response = await fetch(URL, { method: 'POST', signal, credentials: 'same-origin',
      headers: { ...await diagnosticHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, codes }) });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new ApiError(result?.detail || result?.error || '诊断导出未启动', response.status, result);
    if (!result || !result.job_id) throw new Error('导出任务状态未取得');
    return result as ExportState;
  }, update);
  const cancel = () => void action.run('cancel', signal => apiSend<ExportState>(
    `${URL}/${state!.job_id}/cancel`, {}, 'POST', signal), update);
  return <div className="flex min-w-0 flex-col gap-3">
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="secondary" disabled={active} {...busyProps(action.busy === 'start')} onClick={start}>{label}</Button>
      {mine && active ? <Button type="button" variant="secondary" disabled={state.status === 'cancelling'}
        {...busyProps(action.busy === 'cancel')} onClick={cancel}>取消导出</Button> : null}
      {mine && state.status === 'complete' && state.download_url ? <ButtonLink variant="secondary"
        href={state.download_url}>下载已生成的文件</ButtonLink> : null}
    </div>
    {mine && active ? state.total && state.total > 0 ? <div className="flex flex-col gap-2" role="status">
      <span className="text-body-2-regular">{state.stage} · {state.done || 0} / {state.total} 项</span>
      <Progress label="导出进度" value={state.done || 0} max={state.total} />
    </div> : <LoadingDots label={`${state.stage || '准备导出'}${state.rows ? ` · ${state.rows} 条候选` : ''}${state.files ? ` · ${state.files} 个文件` : ''}`} /> : null}
    {mine && state.status === 'complete' ? <p role="status" className="text-body-2-regular text-text-secondary">
      导出已完成 · {((state.bytes || 0) / 1024 / 1024).toFixed(2)} MiB</p> : null}
    {mine && state.status === 'cancelled' ? <Note tone="neutral">导出已取消</Note> : null}
    {query.isError ? <Note tone="error" action={<Button type="button" variant="secondary"
      {...busyProps(query.isFetching)} onClick={() => { void query.refetch() }}>重新读取</Button>}>导出进度未取得</Note> : null}
    {action.error || mine && state.status === 'failed' ? <Note tone="error">{action.error || state?.error}</Note> : null}
  </div>;
}

export function ScrapingExport() {
  const [codes, setCodes] = useState('');
  return <Fieldset layout="stack" labelledBy="scraping-export-title" footer={<DiagnosticExportAction kind="scraping" codes={codes} />}>
    <div className="flex min-w-0 flex-col gap-4" aria-label="导出刮削记录">
      <FieldsetTitle id="scraping-export-title">刮削记录</FieldsetTitle>
      <p className="text-body-2-regular text-text-secondary">导出作品资料、来源取值及演员、厂牌和系列归属，供排查刮削错误。</p>
      <Input label="问题番号（可选）" name="scraping-codes" value={codes} onChange={setCodes}
        autoComplete="off" spellCheck="false" maxLength={1300}
        placeholder="例如 ABF-087、SYKH-145…" hint="多个番号用逗号分隔，最多 20 个；留空导出近期作品。" />
    </div>
  </Fieldset>;
}
