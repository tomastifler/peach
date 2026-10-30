/* Proxy input shared by first-time setup and the settings page. The address is entered only by the user, and server state does not send credentials back. */
import type { ReactNode } from 'react';

import { Input } from '@/components/base/input/input';
import { Select, SelectItem } from '@/components/base/select/select';

const PROXY_MODES = [['environment', 'Follow environment'], ['direct', 'Direct'], ['proxy', 'Custom']] as const;

export function ProxyModeSelect({ mode, onChange, labelledBy }: {
  mode: string; onChange(mode: string): void; labelledBy?: string;
}) {
  return <Select aria-label={labelledBy ? undefined : 'Connection method'} aria-labelledby={labelledBy} selectedKey={mode}
    onSelectionChange={(key) => { if (key !== null) onChange(String(key)); }}>
    {PROXY_MODES.map(([key, name]) => <SelectItem key={key} id={key}>{name}</SelectItem>)}
  </Select>;
}

export function ProxyAddressField({ id, value, onChange, saved = false, error }: {
  id: string; value: string; onChange(value: string): void; saved?: boolean; error?: ReactNode;
}) {
  return <Input id={id} type="password" label="Proxy address" autoComplete="off" spellCheck="false"
    value={value} onChange={onChange} placeholder={saved ? 'Saved; leave blank to keep' : 'http://127.0.0.1:7890'}
    validationBehavior="aria" isInvalid={Boolean(error)} hint={error} />;
}

export function isLoopbackProxy(address: string): boolean {
  try {
    const hostname = new URL(address).hostname;
    return ['localhost', '[::1]', '::1'].includes(hostname) || /^127\./.test(hostname);
  } catch {
    return false;
  }
}
