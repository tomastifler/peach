/* A single video waiting on external metadata can be skipped; existing results are kept and unfinished items are left for retry.
 *
 * On the data management page the card uses a Note; the persistent job panel is already a yellow warning surface, so the notice and actions are shown directly.
 * Which video it is stuck on and how long it has waited are covered by the progress line above, so they are not repeated here. */
import { Button } from '@/components/base/buttons/button';

import { apiSend } from '../../api';
import { Note } from '../components/note';
import { queryClient } from '../query';
import { busyProps, useAction } from '../settings/use-action';
import {
  LIBRARY_PROCESSING_KEY, LIBRARY_PROCESSING_URL, slowItemText,
  type LibraryProcessingData, type ProcessingControlCommand, type SlowItem,
} from './library-processing';

function SlowItemActions({ state }: { state: LibraryProcessingData }) {
  const action = useAction();
  const send = (command: ProcessingControlCommand) => {
    if (action.busy) return;
    void action.run(command.action, signal =>
      apiSend<LibraryProcessingData>(LIBRARY_PROCESSING_URL, command, 'POST', signal), next => {
        queryClient.setQueryData(LIBRARY_PROCESSING_KEY, next);
        void queryClient.invalidateQueries({ queryKey: LIBRARY_PROCESSING_KEY });
      });
  };
  return <div className="flex min-w-0 flex-col gap-2">
    <div className="flex flex-wrap items-center gap-2">
      <Button size="small" variant="secondary" disabled={state.skip_requested} {...busyProps(action.busy === 'skip_current')}
        onClick={() => {
          if (state.job_id && state.current_asset_id != null)
            send({ action: 'skip_current', job_id: state.job_id, asset_id: state.current_asset_id });
        }}>{state.skip_requested ? 'Skipping' : 'Skip this one'}</Button>
    </div>
    {state.skip_requested ? <p role="status" className="text-caption-1-regular">Continues with the next one after the current request ends.</p> : null}
    {action.error ? <p role="alert" className="text-caption-1-regular text-text-error-primary">{action.error}</p> : null}
  </div>;
}

/** One entry in the column of notices outside the data management page card. */
export function SlowItemNote({ state, slow }: { state: LibraryProcessingData; slow: SlowItem }) {
  return <Note tone="warning"
    action={<SlowItemActions state={state} />}>
    {slowItemText(slow)}
  </Note>;
}

/** The segment inside the persistent job panel: the panel is already a warning color, so the body text and button are placed directly. */
export function SlowItemInline({ state, slow }: { state: LibraryProcessingData; slow: SlowItem }) {
  return <div data-processing-slow="" className="flex min-w-0 flex-wrap items-center justify-between gap-3">
    <p className="min-w-0 flex-auto text-body-2-regular wrap-anywhere">{slowItemText(slow)}</p>
    <SlowItemActions state={state} />
  </div>;
}
