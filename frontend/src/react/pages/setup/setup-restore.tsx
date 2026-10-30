import { useEffect, useRef, useState, type FormEvent } from 'react';

import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';

import { busyProps } from '../../settings/busy-props';
import { describeFailure, restoreSetup, SetupRequestError, type SetupDone } from './setup-api';
import { SetupShell } from './setup-scene';

export function SetupRestore({ onDone, onBack }: { onDone: (done: SetupDone) => void; onBack: () => void }) {
  const [path, setPath] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      onDone(await restoreSetup(path));
    } catch (cause) {
      const detail = cause instanceof SetupRequestError ? cause.errors?.data_root : undefined;
      setError(typeof detail === 'string' ? detail : describeFailure(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <SetupShell step="restore">
    <form data-setup-form-panel="" onSubmit={submit} noValidate aria-labelledby="auth-card-title">
      <div data-setup-top=""><span className="text-body-2-regular text-text-secondary">连接已有数据</span></div>
      <div data-setup-step-scroll=""><div data-setup-step-content="">
      <header data-setup-step-heading="">
        <h1 id="auth-card-title" ref={heading} tabIndex={-1} className="text-title-1-semibold text-text-primary">使用已有数据</h1>
        <p className="text-body-regular text-text-secondary">连接 Peach 数据目录，继续使用原来的配置与馆藏。</p>
      </header>
      <div><Input label="已有数据目录" value={path} onChange={setPath} isRequired autoComplete="off" spellCheck="false"
        validationBehavior="aria" isInvalid={Boolean(error)}
        hint={error ? <span role="alert">{error}</span> : '选择包含 config.toml 和 database 文件夹的数据目录。'} /></div>
      </div></div>
      <footer data-setup-footer="" data-copy-interact>
        <Button variant="ghost" onClick={() => { if (!busy) onBack(); }} aria-disabled={busy || undefined}>返回首次设置</Button>
        <Button type="submit" {...busyProps(busy)}>{busy ? '正在连接数据目录…' : '使用此目录'}</Button>
      </footer>
    </form>
    </SetupShell>
  );
}
