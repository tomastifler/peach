/* The userscript reports its version and the pairing status of the current address through the same-origin bridge page. */
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
  const label = status === 'checking' ? 'Checking' : status === 'missing' ? 'Not detected'
    : required ? 'Update required' : update ? 'Update available' : status.paired ? 'Connected' : 'Awaiting pairing';
  const copyState = status === 'checking' ? 'checking' : status === 'missing' ? 'missing'
    : required ? 'required' : update ? 'available' : status.paired ? enabled ? 'enabled' : 'disabled' : 'unpaired';
  return <>
    <iframe ref={frame} key={attempt} title="Peach userscript check" hidden src="/integrations/peach-userscript-bridge" />
    <div aria-live="polite" data-userscript-status="" className={cardClass({ variant: 'raised', bordered: 'line', className: 'flex flex-col gap-3' })}>
      <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-body-medium text-text-primary">Peach userscript</span>
        <ConnectionStatus tone={tone}><span data-copy-key={`userscript.${copyState}.status`}>{label}</span></ConnectionStatus></div>
      {installed ? <p data-copy-key="userscript.installed.version" className="text-body-regular text-text-secondary">Userscript v{status.version}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-body-regular text-text-secondary">Browser add</span>
        <StatusLabel tone={enabled ? 'success' : 'neutral'}><span data-copy-key={`userscript.adding.${enabled ? 'enabled' : 'disabled'}`}>{enabled ? 'Enabled' : 'Not enabled'}</span></StatusLabel></div>
      <p data-copy-key={`userscript.${copyState}.message`} className="text-caption-1-regular text-text-secondary">{status === 'checking' ? 'Checking the userscript in the current browser.' : status === 'missing'
        ? 'Make sure the script is enabled and updated to the latest version. Chrome also needs "Allow user scripts" or developer mode turned on in the Tampermonkey extension details, with access to the current Peach site allowed; refresh the page and check again.'
        : required ? `Update to v${release.minimum_version} or later.`
        : update ? `Userscript v${release.version} is available.`
        : status.paired ? enabled ? 'You can add to your Peach library directly on supported sites.' : 'After turning on browser add, you can add to your Peach library directly on supported sites.'
        : 'After generating a token, copy the pairing info, paste it into the userscript settings and save.'}</p>
      <div className="flex flex-wrap items-center gap-2">
        {status === 'missing' || required || update ? <ExternalLink href={release.install_url}><span data-copy-key={`userscript.${status === 'missing' ? 'install' : 'update'}.action`}>{required || update ? 'Update userscript' : 'Install Peach userscript'}</span></ExternalLink> : null}
        {status === 'missing' ? <ExternalLink href="https://www.tampermonkey.net/faq.php#Q209">Tampermonkey permission setup guide</ExternalLink> : null}
        <Button variant="secondary" type="button" {...busyProps(status === 'checking')}
          onClick={retry}>Check again</Button>
      </div>
    </div>
  </>;
}
