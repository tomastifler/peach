import { useSyncExternalStore } from 'react';
import { nameRevision, subscribeNames } from '../core/entity-names';

/** When name preferences and detail projections update, only the display is redrawn; identities in the query cache are not changed. */
export function useEntityNames(): number {
  return useSyncExternalStore(subscribeNames, nameRevision, nameRevision);
}
