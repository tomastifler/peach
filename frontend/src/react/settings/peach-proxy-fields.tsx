/* 首次设置与配置页共用的代理输入。地址只由用户输入，服务端状态不回传凭据。 */
import type { ReactNode } from 'react';

import { Input } from '@/components/base/input/input';
import { Select, SelectItem } from '@/components/base/select/select';

const PROXY_MODES = [['environment', '跟随环境'], ['direct', '直连'], ['proxy', '自定义']] as const;

export function ProxyModeSelect({ mode, onChange, labelledBy }: {
  mode: string; onChange(mode: string): void; labelledBy?: string;
}) {
  return <Select aria-label={labelledBy ? undefined : '连接方式'} aria-labelledby={labelledBy} selectedKey={mode}
    onSelectionChange={(key) => { if (key !== null) onChange(String(key)); }}>
    {PROXY_MODES.map(([key, name]) => <SelectItem key={key} id={key}>{name}</SelectItem>)}
  </Select>;
}

export function ProxyAddressField({ id, value, onChange, saved = false, error }: {
  id: string; value: string; onChange(value: string): void; saved?: boolean; error?: ReactNode;
}) {
  return <Input id={id} type="password" label="代理地址" autoComplete="off" spellCheck="false"
    value={value} onChange={onChange} placeholder={saved ? '已保存，留空保留' : 'http://127.0.0.1:7890'}
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
