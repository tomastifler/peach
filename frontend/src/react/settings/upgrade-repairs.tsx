/** Upgrade repairs and program installation are shown separately; review and retry are always started explicitly by the user. */
import { useEffect, useState } from 'react';
import { Button } from '@/components/base/buttons/button';
import { apiSend } from '../../api';
import { useClientUpdates } from '../client-updates';
import type { ClientUpdates } from '../client-updates';
import { AnimatedNumber } from '../components/animated-number';
import { StatusLabel } from '../components/status-label';
import { ErrorText, ExternalLink, Fact, FactList, Footer, Help, Section, Stack, TaskCenterLink } from './section';
import { useAction } from './use-action';

const LABELS: Record<string, string> = { pending: 'Waiting to repair', running: 'Repairing', failed: 'Needs retry',
  review: 'Needs review', complete: 'Complete', unavailable: 'Not enabled in this deployment' };

export function UpgradeRepairs() {
  const { snapshot } = useClientUpdates();
  const [saved, setSaved] = useState<ClientUpdates['repairs'] | null>(null);
  const action = useAction();
  useEffect(() => setSaved(null), [snapshot]);
  const data = saved ?? snapshot?.repairs;
  const state = data?.state || 'pending';
  const pending = data?.items.reduce((count, row) => count + (row.pending || 0), 0) || 0;
  const failed = data?.items.reduce((count, row) => count + (row.failed || 0), 0) || 0;
  const review = data?.items.reduce((count, row) => count + (row.review_count || 0), 0) || 0;
  const retry = () => void action.run('retry', signal => apiSend<ClientUpdates['repairs']>(
    '/api/configuration/upgrade-repairs/retry', {}, 'POST', signal), next => {
    setSaved(next);
    document.dispatchEvent(new Event('peach:client-updates'));
  });
  return <Section id="upgradeRepairs" title="Automatic repair" aside={<StatusLabel
    tone={state === 'failed' ? 'error' : state === 'running' ? 'progress' : state === 'review' ? 'warning'
      : state === 'complete' ? 'success' : 'neutral'}><span key={state}
        data-copy-key={`upgradeRepairs.${state}.status`}>{LABELS[state] || 'Unavailable'}</span></StatusLabel>}>
    <Stack><Help>After an upgrade, details are corrected and caches updated automatically.</Help></Stack>
    <FactList>
      <Fact term="Pending"><span><AnimatedNumber value={pending} /> items</span></Fact>
      <Fact term="Failed"><span><AnimatedNumber value={failed} /> items</span></Fact>
      <Fact term="Awaiting review"><span><AnimatedNumber value={review} /> items</span></Fact>
    </FactList>
    {data?.message || action.error ? <Stack><ErrorText>{action.error || data?.message}</ErrorText></Stack> : null}
    {state === 'running' ? <Stack><Help>Details and previews are being completed in the background.</Help><TaskCenterLink /></Stack> : null}
    <Footer status={review ? <ExternalLink href="/api/configuration/upgrade-repairs/review">Download review record</ExternalLink> : undefined}>
      <Button size="small" variant="secondary" disabled={!data?.available || state === 'running' || !!action.busy || (!failed && state !== 'failed')}
        onClick={retry}>Retry failed items</Button>
    </Footer>
  </Section>;
}
