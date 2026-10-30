/* "Code recognition rules": names the built-in rules cannot recognize are covered by regexes the user writes.
 *
 * One per line, searched against the full file name, case-insensitive; the code is taken from the named group `code`, or the first parenthesized group if there is none,
 * and otherwise the whole match. The extracted part must still look like a code (`catalog_rules.compile_code_patterns`).
 * Rules follow the ledger (`/api/settings` in `codePatterns`), and take effect for videos without a code the next time "Process" runs.
 * Validation happens only on the server: a wrong rule is reported back on save, and the frontend does not duplicate the regex check. */
import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/base/buttons/button';
import { Textarea } from '@/components/base/textarea/textarea';

import { apiSend, errorMessage } from '../../api';
import { queryClient } from '../query';
import { SETTINGS_KEY, SETTINGS_URL, fetchSettings, type SyncedSettings } from '../settings-panel/settings-data';
import { Footer, Help, Section, Stack } from './section';
import { busyProps, useAction } from './use-action';

const PLACEHOLDER = '^\\+{3}\\s*(?<code>FC2-PPV-\\d+)\n\\[(?<code>[A-Z]+-\\d+)\\]';

export function CodePatternSettings({ receipt }: { receipt(message: string): void }) {
  const settings = useQuery({ queryKey: SETTINGS_KEY, queryFn: ({ signal }) => fetchSettings(signal) });
  /* When untouched, show the one in the ledger; once edited it is a local draft, which is dropped after a successful save and returns to the ledger's copy. */
  const [draft, setDraft] = useState<string | null>(null);
  const action = useAction();
  const value = draft ?? (settings.data?.codePatterns ?? []).join('\n');
  const failure = action.error || (settings.error ? errorMessage(settings.error) : '');

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const codePatterns = value.split('\n').map((rule) => rule.trim()).filter(Boolean);
    void action.run('save', (signal) =>
      apiSend<SyncedSettings>(SETTINGS_URL, { codePatterns }, 'POST', signal),
      (saved) => {
        queryClient.setQueryData(SETTINGS_KEY, saved);
        setDraft(null);
        receipt('Settings saved');
      });
  };

  return (
    <Section title="Code recognition rules" onSubmit={submit}>
      <Stack>
        <Help>When the built-in rules cannot recognize a code, the rules here are used to extract it from the file name. One regular expression per line, with the code inside (?&lt;code&gt;…); with no named group, the first parenthesized group is used. Rules take effect for videos without a code the next time processing runs.</Help>
        <Textarea id="codePatternSetting" aria-label="Code recognition rules" rows={3} autoResize maxRows={12}
          spellCheck="false" autoComplete="off" placeholder={PLACEHOLDER} value={value}
          isDisabled={!settings.data} isInvalid={!!failure} hint={failure || undefined}
          onChange={setDraft} />
      </Stack>
      <Footer>
        <Button type="submit" {...busyProps(action.busy === 'save')}>Save settings</Button>
      </Footer>
    </Section>
  );
}
