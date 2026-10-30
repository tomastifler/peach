import { useEffect, useRef, useState } from 'react';

import { randomId } from '../../core/random-id';

export type UserscriptProbeStatus = 'checking' | 'missing' | { version: string; paired: boolean };

/** 通过同源桥接页核对当前浏览器中的用户脚本与配对状态。 */
export function useUserscriptProbe() {
  const frame = useRef<HTMLIFrameElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<UserscriptProbeStatus>('checking');
  useEffect(() => {
    const nonce = randomId();
    let settled = false;
    const bridge = frame.current;
    let timeout: ReturnType<typeof setTimeout>;
    const missing = () => {
      settled = true;
      clearInterval(interval);
      setStatus('missing');
    };
    const loaded = () => {
      if (settled) return;
      clearTimeout(timeout);
      timeout = setTimeout(missing, 3000);
      probe();
    };
    const probe = () => frame.current?.contentWindow?.postMessage({ type: 'peach-userscript:probe', nonce }, window.location.origin);
    const receive = (event: MessageEvent) => {
      if (settled || event.source !== frame.current?.contentWindow || event.origin !== window.location.origin
        || event.data?.type !== 'peach-userscript:ready' || event.data.nonce !== nonce || event.data.protocol !== 1
        || typeof event.data.version !== 'string' || !/^\d{1,5}\.\d{1,5}\.\d{1,5}$/.test(event.data.version)
        || typeof event.data.paired !== 'boolean') return;
      settled = true;
      clearInterval(interval);
      clearTimeout(timeout);
      setStatus({ version: event.data.version, paired: event.data.paired });
    };
    window.addEventListener('message', receive);
    const interval = setInterval(probe, 250);
    // 桥接文档加载与脚本回报分别计时，加载过程也有终止期限。
    timeout = setTimeout(missing, 15000);
    bridge?.addEventListener('load', loaded);
    if (bridge?.contentDocument?.readyState === 'complete'
      && bridge.contentDocument.URL !== 'about:blank') loaded();
    probe();
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
      bridge?.removeEventListener('load', loaded);
      window.removeEventListener('message', receive);
    };
  }, [attempt]);
  const retry = () => {
    if (status === 'checking') return;
    setStatus('checking');
    setAttempt(value => value + 1);
  };
  return { frame, attempt, status, retry };
}
