import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import type { LibraryProcessingProps } from '../bundle';
import { errorMessage } from '../../api';
import { DISCONNECTED_TEXT, freshProcessingResult, processingActive } from './library-processing';
import { ProcessingNoticePanel } from './library-processing-notice';
import { useLibraryProcessingJob } from './use-library-processing';
import { setProcessingNoticeVisible, useProcessingNoticeVisibility } from './processing-notice-visibility';

const TASK_TOAST = 'peach-library-processing';

/** Observed continuously at the route root, so the job popup is not unmounted on page changes; ordinary receipts use a stack with its own target.
 *
 *  Only dismiss the one it drew itself that is still in the stack. Sonner delivers a dismiss in two steps: it registers first, and on the next frame the stack marks this id
 *  as removed. If a dismiss is sent for a card that does not exist when the page has just opened and the job state has not returned, then when the main thread is busy the stack's frame will
 *  land after the update that later draws the job card, sweeping away the just-appeared job card with it, and with no state change it never comes back. */
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
