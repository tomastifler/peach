/* "Needs attention" at the top of the task center: problems the background services have right now, one row each.
 *
 * These are ongoing states (scheduler failing repeatedly, public entry disconnected, network unreachable), not a round that has run, so they do not go into the task table;
 * the data comes from `/api/background-issues`, and the server reads each service's snapshot fresh every time; once a problem is gone, its row is gone.
 * A row only says what it is and since when, plus a link stating where to go (the wording is supplied by the server); the cause is explained only at the settings location the link
 * points to, not repeated here. For problems that may be fixed by simply rerunning in place (network, scheduler, the amane bridge) there is an extra
 * "Retry now"; for those needing settings changes or credentials there is only the link. The link is on the left and Retry on the right: the action that fixes it in place is the row's
 * primary action, placed rightmost like the section footer action bar; for rows without Retry, the link also sits in the same position.
 *
 * Time comes in two kinds: a start recorded by the service itself reads "Since ..."; for services that do not record the failure time, the moment it was first
 * read during this run is written as "Noticed at ...", and the two are never mixed. When there are no problems the whole block is not drawn, and a failed fetch is not drawn either: when the service is unreachable
 * the top of the page already has a read-failure notice. */
import { useId } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RiArrowRightLine } from '@remixicon/react';

import { Button } from '@/components/base/buttons/button';
import { LinkButton } from '@/components/base/buttons/link-button';

import { apiGet, apiSend, errorMessage } from '../../api';
import { Note } from '../components/note';
import { busyProps } from '../settings/use-action';
import { momentText } from './tasks';

export const BACKGROUND_ISSUES_URL = '/api/background-issues';
export const BACKGROUND_ISSUES_KEY = ['background-issues'] as const;

export interface BackgroundIssue {
  key: string;
  title: string;
  href: string;
  /** Link text stating the specific destination, for example "Open push settings". */
  link_label: string;
  /** The start recorded by the service itself; null for services that do not record one. */
  since: string | null;
  /** The moment this item was first read during this run. */
  noticed_at: string;
  retry: string | null;
  retry_available: boolean;
}

export function BackgroundIssues() {
  const id = useId();
  const query = useQuery({
    queryKey: BACKGROUND_ISSUES_KEY,
    queryFn: ({ signal }) => apiGet<{ issues: BackgroundIssue[] }>(BACKGROUND_ISSUES_URL, signal),
    refetchInterval: 30_000,
  });
  const issues = query.data?.issues || [];
  if (!issues.length) return null;
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-3">
      <h3 id={id} className="text-title-2-medium text-text-primary">Needs attention</h3>
      <ul className="flex min-w-0 flex-col gap-3">
        {issues.map((issue) => <li key={issue.key}><IssueRow issue={issue} /></li>)}
      </ul>
    </section>
  );
}

function IssueRow({ issue }: { issue: BackgroundIssue }) {
  const client = useQueryClient();
  const retry = useMutation({
    mutationFn: () => apiSend(issue.retry!, {}),
    onSuccess: () => { void client.invalidateQueries({ queryKey: BACKGROUND_ISSUES_KEY }) },
  });
  const moment = issue.since ? `Since ${momentText(issue.since)}` : `Noticed at ${momentText(issue.noticed_at)}`;
  return (
    <Note tone="error" title={issue.title} action={
      <div className="flex flex-wrap items-center gap-2">
        <LinkButton href={issue.href} size="small" trailingIcon={RiArrowRightLine}>{issue.link_label}</LinkButton>
        {issue.retry
          ? <Button variant="secondary" size="small" disabled={!issue.retry_available}
              {...busyProps(retry.isPending)} onClick={() => retry.mutate()}>Retry now</Button>
          : null}
      </div>
    }>
      {retry.error ? `${moment}\nRetry failed: ${errorMessage(retry.error)}` : moment}
    </Note>
  );
}
