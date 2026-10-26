/* 本机端口与已保存媒体配置使用同一份修订号。 */
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { LinkButton } from '@/components/base/buttons/link-button';
import { ApiError, apiSend, errorMessage } from '../../api';
import { CONFIGURATION_URL } from '../../configuration-endpoints';
import type { ConfigurationGroupProps } from '../bundle';
import { Note } from '../components/note';
import { RESTART_REDIRECT_MS } from '../restart-redirect';
import { Footer, Section, Stack } from './section';
import { busyProps, useAction } from './use-action';

export function PortSettings({ data, receipt }: ConfigurationGroupProps) {
  const [port, setPort] = useState(String(data.port));
  const [fieldError, setFieldError] = useState('');
  const [saved, setSaved] = useState<{ url: string } | null>(null);
  const action = useAction();
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => location.assign(saved.url), RESTART_REDIRECT_MS);
    return () => clearTimeout(timer);
  }, [saved]);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFieldError('');
    void action.run('save', (signal) => apiSend<{ url: string }>(CONFIGURATION_URL, {
      revision: data.revision, media_dirs: data.media_dirs,
      ...(data.media_sources ? { media_sources: data.media_sources } : {}),
      port, scan_now: false,
    }, 'POST', signal), (result) => { setSaved(result); receipt('Settings saved'); }, (cause) => {
      const fields = cause instanceof ApiError && cause.status === 400
        ? (cause.body as { errors?: { port?: string } } | null)?.errors : null;
      if (fields?.port) setFieldError(fields.port);
      else action.setError(errorMessage(cause));
    });
  };
  if (saved) return <Section title="Local access port"><Stack>
    <Note tone="success" title="Settings saved">Peach is restarting.
      <LinkButton href={saved.url} size="small">Open library</LinkButton>
    </Note>
  </Stack></Section>;
  return <Section title="Local access port" onSubmit={submit}><Stack>
    <Input id="configPort" label="Port" inputMode="numeric" value={port} onChange={setPort}
      validationBehavior="aria" isInvalid={Boolean(fieldError)} hint={fieldError || undefined} />
    {action.error ? <Note tone="error" title="Not saved">{action.error}</Note> : null}
  </Stack><Footer status="Peach will restart after saving and redirect to the new address.">
    <Button type="submit" {...busyProps(action.busy === 'save')}>Save settings</Button>
  </Footer></Section>;
}
