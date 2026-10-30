/** Full-width banner shown when the internet is unreachable: reads the server's snapshot probed through the Peach proxy and disappears on its own once online. */
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api';

export interface NetworkStatus { state: 'checking' | 'online' | 'offline' | 'unknown'; checked_at: number | null }

export const NETWORK_STATUS_KEY = ['network-status'] as const;
export const NETWORK_OFFLINE_TEXT = 'Peach cannot reach the internet; metadata collection, follow updates and online sources are temporarily unavailable. Local media can still be browsed and played as usual.';

/** When online the server rechecks only every ten minutes, and once a minute when offline or when probing has just started; the page reads at its pace. */
export function networkPollInterval(data?: NetworkStatus): number {
  return data?.state === 'online' ? 120_000 : 30_000;
}

export function NetworkBanner() {
  const query = useQuery({
    queryKey: NETWORK_STATUS_KEY,
    queryFn: ({ signal }) => apiGet<NetworkStatus>('/api/network-status', signal),
    refetchInterval: current => networkPollInterval(current.state.data),
    retry: false,
  });
  const host = document.querySelector('[data-network-banner]');
  if (query.data?.state !== 'offline' || !host) return null;
  return createPortal(
    <aside className="ui-project-banner ui-project-banner-warning" role="status" data-network-offline="">
      <div><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-alert" /></svg><p>{NETWORK_OFFLINE_TEXT}</p></div>
      <a href="/settings/network#peachProxy">Check Peach proxy</a>
    </aside>,
    host,
  );
}
