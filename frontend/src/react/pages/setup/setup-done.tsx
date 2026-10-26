/* 设置完成：扫描是否已排队、进入 Peach 的入口，运行信息默认折叠。口令不出现在页面上。
 *
 * 独立包的服务端在 `redirect` 里给入口地址，过 `RESTART_REDIRECT_MS` 自己跳过去，与配置页保存后
 * 等托盘换进程的时长是同一个数。 */
import { useEffect, useRef } from 'react';

import { ButtonLink } from '@/components/base/buttons/button';

import { RESTART_REDIRECT_MS } from '../../restart-redirect';
import { Disclosure, ExternalLink, Fact, FactList } from '../../settings/section';
import { AuthCard } from '../auth-card';
import type { SetupDone } from './setup-api';

export function SetupDoneView({ done }: { done: SetupDone }) {
  const entry = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    document.title = 'Peach · Setup complete';
    entry.current?.focus();
  }, []);

  useEffect(() => {
    const target = done.redirect;
    if (!target) return undefined;
    const timer = setTimeout(() => location.assign(target), RESTART_REDIRECT_MS);
    return () => clearTimeout(timer);
  }, [done.redirect]);

  return (
    <AuthCard title="Setup complete" lede="Starting your library.">
      <p className="text-body-regular text-text-primary">
        {done.restored ? 'Connected to the existing data folder.' : done.scan_requested
          ? 'The first scan is queued and will organize your library in the background; you can keep using Peach meanwhile.'
          : 'Start scanning your library later from the settings page.'}
      </p>
      <ButtonLink ref={entry} href={done.url} className="self-start">
        {done.history_guide ? 'Import browser history' : 'Enter Peach'}
      </ButtonLink>
      <Disclosure summary="Runtime info">
        <FactList>
          {done.facts.map((fact) => (
            <Fact key={fact.term} term={fact.term}>
              {fact.value}
              {fact.download_url
                ? <ExternalLink href={fact.download_url}>{fact.download_label ?? fact.download_url}</ExternalLink>
                : null}
            </Fact>
          ))}
        </FactList>
      </Disclosure>
    </AuthCard>
  );
}
