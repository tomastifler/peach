import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import type { LibraryProcessingProps } from '../bundle';
import { errorMessage } from '../../api';
import { DISCONNECTED_TEXT, freshProcessingResult, processingActive } from './library-processing';
import { ProcessingNoticePanel } from './library-processing-notice';
import { useLibraryProcessingJob } from './use-library-processing';
import { setProcessingNoticeVisible, useProcessingNoticeVisibility } from './processing-notice-visibility';

const TASK_TOAST = 'peach-library-processing';

/** 路由根持续观察，任务浮层不随换页卸载；普通回执使用有独立目标的栈。
 *
 *  只收自己画出来、还在栈里的那一张。Sonner 的收起分两步送达：先登记，下一帧再由栈把这个 id
 *  标成删除。页面刚打开、任务状态还没回来时若对一张不存在的卡发收起，栈那一帧在主线程忙时会
 *  落在随后画出任务卡的那次更新之后，把刚出现的任务卡一起收走，状态不变就再也不出来。 */
export function LibraryProcessingDock({ toast: receipt }: Pick<LibraryProcessingProps, 'toast'>) {
  const { job, settled } = useLibraryProcessingJob({ toast: receipt, mode: 'notice' });
  const shown = useRef(false);
  const state = job.data;
  const key = state?.job_id || 'unavailable';
  const { hidden, requested } = useProcessingNoticeVisibility(key);
  const problem = job.isError ? state ? DISCONNECTED_TEXT : errorMessage(job.error) : '';
  useEffect(() => {
    const active = processingActive(state);
    const currentFailure = state?.status === 'failed'
      && (settled?.job_id === state.job_id || freshProcessingResult(state));
    if (hidden || (state?.archived && !problem) || (!active && !problem && !currentFailure && !(requested && state?.status === 'failed'))) {
      if (shown.current) toast.dismiss(TASK_TOAST);
      shown.current = false;
      return;
    }
    toast.custom(() => <div className="peach-react"><ProcessingNoticePanel state={state} problem={problem} measure
      onHide={() => setProcessingNoticeVisible(key, false)} /></div>, {
      id: TASK_TOAST, toasterId: 'processing', duration: Infinity, dismissible: false,
      closeButton: false, className: 'processing-task-toast',
      onDismiss: () => { setProcessingNoticeVisible(key, false); shown.current = false },
    });
    shown.current = true;
  }, [state, problem, settled, key, hidden, requested]);
  useEffect(() => () => {
    if (shown.current) toast.dismiss(TASK_TOAST);
    shown.current = false;
  }, []);
  return null;
}
