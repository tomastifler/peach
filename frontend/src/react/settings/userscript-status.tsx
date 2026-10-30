/* 用户脚本通过同源桥接页回报版本与当前地址的配对状态。 */
import { Button } from '@/components/base/buttons/button';
import { cardClass } from '../components/card';
import { ConnectionStatus } from '../components/connection-status';
import { StatusLabel } from '../components/status-label';
import { ExternalLink } from './section';
import { busyProps } from './busy-props';
import { useUserscriptProbe } from './userscript-probe';

export function userscriptVersionSupported(version: string, minimumVersion: string) {
  const current = version.split('.').map(Number);
  const minimum = minimumVersion.split('.').map(Number);
  for (let index = 0; index < 3; index++) {
    if (current[index] !== minimum[index]) return current[index]! > minimum[index]!;
  }
  return true;
}

export function UserscriptStatus({ enabled, release }: {
  enabled: boolean; release: { version: string; minimum_version: string; install_url: string };
}) {
  const { frame, attempt, status, retry } = useUserscriptProbe();
  const installed = typeof status === 'object';
  const required = installed && !userscriptVersionSupported(status.version, release.minimum_version);
  const update = installed && !userscriptVersionSupported(status.version, release.version);
  const tone = status === 'checking' ? 'progress' : status === 'missing' ? 'neutral'
    : required || update || !status.paired ? 'warning' : 'success';
  const label = status === 'checking' ? '检测中' : status === 'missing' ? '未检测到'
    : required ? '需更新' : update ? '可更新' : status.paired ? '已连接' : '待配对';
  const copyState = status === 'checking' ? 'checking' : status === 'missing' ? 'missing'
    : required ? 'required' : update ? 'available' : status.paired ? enabled ? 'enabled' : 'disabled' : 'unpaired';
  return <>
    <iframe ref={frame} key={attempt} title="Peach 用户脚本检测" hidden src="/integrations/peach-userscript-bridge" />
    <div aria-live="polite" data-userscript-status="" className={cardClass({ variant: 'raised', bordered: 'line', className: 'flex flex-col gap-3' })}>
      <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-body-medium text-text-primary">Peach 用户脚本</span>
        <ConnectionStatus tone={tone}><span data-copy-key={`userscript.${copyState}.status`}>{label}</span></ConnectionStatus></div>
      {installed ? <p data-copy-key="userscript.installed.version" className="text-body-regular text-text-secondary">用户脚本 v{status.version}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-body-regular text-text-secondary">浏览器添加</span>
        <StatusLabel tone={enabled ? 'success' : 'neutral'}><span data-copy-key={`userscript.adding.${enabled ? 'enabled' : 'disabled'}`}>{enabled ? '已启用' : '未启用'}</span></StatusLabel></div>
      <p data-copy-key={`userscript.${copyState}.message`} className="text-caption-1-regular text-text-secondary">{status === 'checking' ? '正在检测当前浏览器的用户脚本。' : status === 'missing'
        ? '确认脚本已启用并更新至最新版。Chrome 还需在 Tampermonkey 扩展详情中开启「允许用户脚本」或开发者模式，并允许访问当前 Peach 站点；刷新页面后重新检测。'
        : required ? `请更新至 v${release.minimum_version} 或更高版本。`
        : update ? `用户脚本 v${release.version} 可更新。`
        : status.paired ? enabled ? '可在支持的站点直接加入 Peach 馆藏。' : '启用浏览器添加后，可在支持的站点直接加入 Peach 馆藏。'
        : '生成令牌后复制配对信息，在用户脚本设置中粘贴并保存。'}</p>
      <div className="flex flex-wrap items-center gap-2">
        {status === 'missing' || required || update ? <ExternalLink href={release.install_url}><span data-copy-key={`userscript.${status === 'missing' ? 'install' : 'update'}.action`}>{required || update ? '更新用户脚本' : '安装 Peach 用户脚本'}</span></ExternalLink> : null}
        {status === 'missing' ? <ExternalLink href="https://www.tampermonkey.net/faq.php#Q209">Tampermonkey 权限设置说明</ExternalLink> : null}
        <Button variant="secondary" type="button" {...busyProps(status === 'checking')}
          onClick={retry}>重新检测</Button>
      </div>
    </div>
  </>;
}
