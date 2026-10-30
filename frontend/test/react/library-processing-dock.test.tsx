import { act } from 'react';
import { QueryClientProvider, notifyManager } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { queryClient } from '../../src/react/query';
import { LIBRARY_PROCESSING_KEY, type LibraryProcessingData } from '../../src/react/library-processing/library-processing';
import { LibraryProcessingDock } from '../../src/react/library-processing/library-processing-dock';
import { setProcessingNoticeVisible } from '../../src/react/library-processing/processing-notice-visibility';
import { mount } from './render';

const sonner = vi.hoisted(() => ({ custom: vi.fn(), dismiss: vi.fn() }));
vi.mock('sonner', () => ({ toast: sonner }));
notifyManager.setScheduler(notify => notify());
beforeEach(() => { sonner.custom.mockClear(); sonner.dismiss.mockClear() });
afterEach(() => { queryClient.clear(); localStorage.clear(); sessionStorage.clear() });

async function open(state: LibraryProcessingData) {
  queryClient.setQueryData(LIBRARY_PROCESSING_KEY, state);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => state })));
  await mount(<QueryClientProvider client={queryClient}><LibraryProcessingDock toast={vi.fn()} /></QueryClientProvider>);
}

it('页面打开时历史失败留在数据管理，不自动弹出任务卡', async () => {
  await open({ status: 'failed', job_id: 'old', issue_count: 7276,
    completed_at: Date.now() / 1000 - 4 * 86400, error: '7276 项需要处理' });
  expect(sonner.custom).not.toHaveBeenCalled();
  expect(sonner.dismiss).not.toHaveBeenCalled();
});

it('任务状态回来之前不发收起；画出过的任务卡在任务结束时才收', async () => {
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
  await mount(<QueryClientProvider client={queryClient}><LibraryProcessingDock toast={vi.fn()} /></QueryClientProvider>);
  expect(sonner.dismiss).not.toHaveBeenCalled();
  await act(async () => { queryClient.setQueryData(LIBRARY_PROCESSING_KEY, { status: 'paused', job_id: 'current' }) });
  expect(sonner.custom).toHaveBeenCalled();
  expect(sonner.dismiss).not.toHaveBeenCalled();
  await act(async () => { queryClient.setQueryData(LIBRARY_PROCESSING_KEY, { status: 'complete', job_id: 'current' }) });
  expect(sonner.dismiss).toHaveBeenCalledWith('peach-library-processing');
});

it('本次观察到的任务失败持续显示，关闭后保持收起', async () => {
  await open({ status: 'running', job_id: 'current' });
  sonner.custom.mockClear();
  const failed = { status: 'failed', job_id: 'current', completed_at: Date.now() / 1000 - 600 };
  await act(async () => { queryClient.setQueryData(LIBRARY_PROCESSING_KEY, failed) });
  expect(sonner.custom).toHaveBeenCalled();
  const options = sonner.custom.mock.calls.at(-1)?.[1] as { onDismiss(): void };
  await act(async () => options.onDismiss());
  sonner.custom.mockClear();
  await act(async () => { queryClient.setQueryData(LIBRARY_PROCESSING_KEY, { ...failed, issue_count: 1 }) });
  expect(sonner.custom).not.toHaveBeenCalled();
});

it('刚刚失败的短任务仍可显示', async () => {
  await open({ status: 'failed', job_id: 'fresh', completed_at: Date.now() / 1000 - 10 });
  expect(sonner.custom).toHaveBeenCalled();
});

it('运行任务隐藏后状态更新保持隐藏，恢复时显示当前进度', async () => {
  await open({ status: 'running', job_id: 'hide-current', checked: 1 });
  const options = sonner.custom.mock.calls.at(-1)?.[1] as { onDismiss(): void; dismissible: boolean };
  expect(options.dismissible).toBe(false);
  await act(async () => options.onDismiss());
  sonner.custom.mockClear();
  for (const status of ['running', 'pausing', 'paused', 'running', 'failed']) {
    await act(async () => { queryClient.setQueryData(LIBRARY_PROCESSING_KEY,
      { status, job_id: 'hide-current', checked: 9 }) });
    expect(sonner.custom).not.toHaveBeenCalled();
  }
  expect(queryClient.getQueryData<LibraryProcessingData>(LIBRARY_PROCESSING_KEY)?.checked).toBe(9);
  await act(async () => setProcessingNoticeVisible('hide-current', true));
  expect(sonner.custom).toHaveBeenCalled();
});

it('页面挂载时读取当前任务的隐藏选择，新任务正常显示', async () => {
  setProcessingNoticeVisible('saved', false);
  await open({ status: 'running', job_id: 'saved' });
  expect(sonner.custom).not.toHaveBeenCalled();
  await act(async () => { queryClient.setQueryData(LIBRARY_PROCESSING_KEY, { status: 'running', job_id: 'next' }) });
  expect(sonner.custom).toHaveBeenCalled();
});

it('隐藏任务完成后仍给一次完成回执', async () => {
  const receipt = vi.fn();
  const state = { status: 'running', job_id: 'hidden-completion' };
  queryClient.setQueryData(LIBRARY_PROCESSING_KEY, state);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => state })));
  setProcessingNoticeVisible(state.job_id, false);
  await mount(<QueryClientProvider client={queryClient}><LibraryProcessingDock toast={receipt} /></QueryClientProvider>);
  await act(async () => { queryClient.setQueryData(LIBRARY_PROCESSING_KEY, { ...state, status: 'complete' }) });
  expect(receipt).toHaveBeenCalledTimes(1);
  expect(sonner.custom).not.toHaveBeenCalled();
});
