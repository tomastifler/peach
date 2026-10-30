/* Skeleton for the configuration page: the static full-page skeleton (before the React bundle and `/api/configuration` respond) and the
 * per-section skeletons shown while each section fetches its own data are all built from the pieces here, drawn in their final structure: lists as rows, forms as "label + input", toggle rows as
 * "title + description + toggle", and the footer as disabled buttons.
 *
 * Row counts come from two sources:
 * - Fixed by static registries in code (the source-credential site list, each section's fixed setting rows and field names): drawn straight from the registry, with real names;
 * - Varying with this machine's configuration (libraries and folders, indexers, cloud-drive accounts, download channels, access-password state, etc.): drawn from the structure recorded the last time
 *   this machine drew them: what is recorded is row counts and whether each row is expanded, not heights. With no record, drawn as an empty set or the minimal one-row structure. */
import { esc } from '@peach/legacy/core';
import { islandButton, islandGlyph, islandSelect } from './island-skeleton';
import { CONFIGURATION_SECTIONS } from './history/settings-route';
import { diagnosticsSkeleton } from './diagnostics-skeleton';
import { LIBRARY_FOLDER_HELP, POLICY_SUMMARY } from './react/settings/library-policy-copy';
import { ENTRY_LINKS_HELP, ENTRY_LINKS_HINT } from './configuration-copy';
import CREDENTIAL_REGISTRY from './react/follow-manage/credential-providers.json' with { type: 'json' };

export const CLOUD_PROXY_HELP = 'The API proxy is used to list directories and query file info; the data proxy is used to read videos and companion files. After saving, other reads for the same cloud-drive account in CloudDrive also use this setting.';

/* ---------- Structure recorded on this machine ---------- */

export interface MediaShape { folders: number[]; cloud: boolean }
export interface DiscoveryShape { enabled: boolean; watchLocal: boolean; cloud: boolean; webhook: boolean; prefixes: number }
export interface CredentialsShape { done: string[] }
/** One entry per indexer: whether it is expanded by default (the one with no address yet is expanded) */
export interface IndexersShape { open: boolean[] }
export interface JavBrowserShape { enabled: boolean; ready: boolean }
/** One entry per cloud-drive account: [data proxy uses proxy, API proxy uses proxy]; when a proxy is used, three extra rows appear for address, port and authentication. */
export interface CloudProxyShape { configured: boolean; accounts: [boolean, boolean][]; unlinked: number }
export interface DownloadsShape { cloud: boolean; has115: boolean; pikpak: boolean; pikpakRoots: boolean; pikpakLoggedIn: boolean; browserLogin: boolean }
export interface NetworkShape { port: boolean; addresses?: number; networkEditable?: boolean; lan?: boolean; proxyAddress: boolean; access: string; tunnelNamed: boolean; tunnelNamedMode: boolean; tunnelNote: boolean }
export interface MaintenanceShape {
  releaseFacts: number; releaseNotes: number; autoUpdateHelp: boolean; startupNote: boolean; desktopNote: boolean;
  storageRows: number; storageNotes: number; reporting: boolean; reportingIdle: boolean; sharing: boolean;
  sharingNotice: boolean; sharingIdle: boolean; facts: string[]; uninstall: boolean; uninstallHelp: boolean;
}
export interface ConfigurationShape {
  media: MediaShape; discovery: DiscoveryShape; credentials: CredentialsShape; indexers: IndexersShape;
  javBrowser: JavBrowserShape; cloudProxy: CloudProxyShape; downloads: DownloadsShape; network: NetworkShape;
  maintenance: MaintenanceShape;
}
type Shapes = { [K in keyof ConfigurationShape]?: Partial<ConfigurationShape[K]> };

export const SHAPE_KEY = 'peach.configuration.shape.v1';

function shapes(): Shapes {
  try {
    const value = JSON.parse(localStorage.getItem(SHAPE_KEY) || '{}') as unknown;
    return value && typeof value === 'object' ? value as Shapes : {};
  } catch { return {} }
}

/** Record a section's structure as drawn this time, so the next first-paint skeleton follows it. */
export function rememberShape<K extends keyof ConfigurationShape>(key: K, value: ConfigurationShape[K]): void {
  try {
    const all = shapes();
    if (JSON.stringify(all[key]) === JSON.stringify(value)) return;
    localStorage.setItem(SHAPE_KEY, JSON.stringify({ ...all, [key]: value }));
  } catch { /* Next time, draw the minimal structure. */ }
}

/** Structure recorded last time; when this machine has no record it is `undefined`. Each item is validated on read; bad data is treated as absent. */
export const rememberedShape = <K extends keyof ConfigurationShape>(key: K): Shapes[K] => shapes()[key];

const on = (value: unknown): boolean => value === true;
const count = (value: unknown, max: number): number => Number.isInteger(value) && (value as number) > 0 ? Math.min(value as number, max) : 0;
const list = <T>(value: unknown, max: number, item: (entry: unknown) => T): T[] => Array.isArray(value) ? value.slice(0, max).map(item) : [];

/* ---------- Pieces: class names share geometry with the real components ---------- */

const wait = 'disabled data-skeleton-action';
const text = (width = '60%') => `<span class="skeleton skeleton-text" style="width:${width}"></span>`;
const input = (width = '100%') => `<span class="skeleton ui-configuration-skeleton-input" style="width:${width}"></span>`;
/** Fixed-size blocks such as icons and badges: only placed inside flex rows. */
const block = (width: string, height: string) => `<span class="skeleton shrink-0" style="width:${width};height:${height}"></span>`;
const chip = (width = '3em') => block(width, '24px');
const icon = () => block('var(--icon-inline)', 'var(--icon-inline)');
const button = (label: string, variant: 'primary' | 'secondary' = 'primary', size: 'medium' | 'small' = 'medium') =>
  islandButton({ label, variant, size, attrs: wait });
const footer = (content: string, status = '') => `<div class="-ml-3 flex flex-wrap items-center justify-end gap-3 rounded-b-2xl border-t border-separator-border bg-card-footer px-3 py-3">${status ? `<div class="mr-auto min-w-0 text-body-2-regular text-text-secondary">${status}</div>` : ''}${content}</div>`;
const stack = (content: string, divided = false) => `<div class="flex flex-col gap-4 ${divided ? 'border-t border-separator-border ' : ''}py-4 pr-3">${content}</div>`;
const heading = (name: string, aside: string, mark: boolean) => {
  const label = `<p class="w-full px-3 text-body-2-medium text-text-secondary">${mark ? `<span class="inline-flex items-center gap-1.5">${icon()}${name}</span>` : name}</p>`;
  return aside ? `<div class="flex w-full flex-wrap items-center justify-between gap-2"><div class="min-w-40 flex-1">${label}</div><div class="flex min-w-0 max-w-full">${aside}</div></div>` : label;
};
const section = (name: string, content: string, actions = '', { aside = '', status = '', mark = false } = {}) =>
  `<section aria-label="${name}" class="flex w-full flex-col gap-2 wrap-anywhere">${heading(name, aside, mark)}<div class="flex w-full flex-col rounded-2xl bg-background-secondary-default pl-3">${content}${actions ? footer(actions, status) : ''}</div></section>`;
const controlRow = (label: string, description: string, control: string) => `<div class="flex min-h-[52px] w-full items-center justify-between gap-4 py-2.5 pr-2.5 border-b border-separator-border last:border-b-0"><div class="flex min-w-0 flex-col"><p class="text-body-regular text-text-primary">${label}</p>${description ? `<p class="text-body-2-regular text-text-secondary">${description}</p>` : ''}</div>${control}</div>`;
const row = (label: string, description = '', control = 'ui-configuration-skeleton-toggle') => controlRow(label, description, `<span class="skeleton ${control}"></span>`);
/* A row that only reads out a phrase ("Every 3 months"): the right side is a text-width placeholder, with the same row height as toggle rows. */
const valueRow = (label: string, width = '4em') => controlRow(label, '', text(width));
const help = (content: string) => `<p class="text-body-2-regular text-text-secondary">${content}</p>`;
const fieldLabel = (label: string) => `<p class="text-body-medium text-text-primary">${label}</p>`;
const inputField = (label: string, hint = '') => `<div class="flex w-full flex-col items-start gap-1"><span class="flex items-center gap-0.5 text-body-medium text-text-primary">${label}</span>${input()}${hint ? `<span class="pt-px text-caption-1-medium text-text-secondary">${hint}</span>` : ''}</div>`;
const selectField = (label: string) => `<div class="flex flex-col gap-1">${fieldLabel(label)}${islandSelect(text('8em'))}</div>`;
const check = (label: string) => `<span class="flex items-center gap-2 text-body-regular text-text-primary">${block('16px', '16px')}${label}</span>`;
const marked = (label: string) => `<span class="inline-flex items-center gap-1">${icon()}${label}</span>`;
/** Collapsible row (the `Disclosure` summary): arrow and name; the arrow turns down when expanded. */
const summary = (label: string, open = false) => `<span class="flex w-fit items-center gap-1 text-body-2-medium text-text-secondary">${islandGlyph('chevron-right', `size-(--icon-inline) shrink-0${open ? ' rotate-90' : ''}`)}${label}</span>`;
/* One readout per row; the two rows for missing tools, FFmpeg and untrunc, are a description plus a download link, drawn as three lines of text. */
const DEPENDENCY_FACTS = new Set(['FFmpeg', 'untrunc']);
const facts = (terms: string[]) => `<dl class="ui-settings-facts flex flex-col">${terms.map(term => `<div class="flex min-h-11 items-center justify-between gap-4 border-b border-separator-border py-2.5 pr-3 last:border-b-0"><dt class="flex max-w-1/2 min-w-0 shrink-0 items-center gap-2 text-body-regular text-text-secondary">${term}</dt><dd class="flex min-w-0 flex-wrap items-center justify-end gap-2 text-body-regular text-text-primary">${DEPENDENCY_FACTS.has(term) ? text('100%') + text('80%') + text('6em') : text('6em')}</dd></div>`).join('')}</dl>`;

/* ---------- Source credentials: the site list is a static registry ---------- */

interface CredentialProvider { provider: string; label: string; requirement: string; fields?: string[]; why?: string; where?: string; howto?: string }
/** Matches the static part of `/api/follow/credentials`, checked against the endpoint by `tests/test_follow_web.py`. */
export const CREDENTIAL_PROVIDERS: readonly CredentialProvider[] = CREDENTIAL_REGISTRY;

export interface CredentialSkeletonRow extends CredentialProvider { done: boolean; open: boolean }

/** Each row in the skeleton: site, group and required fields come from the registry; whether configured comes from the last record, and with no record everything counts as not configured.
 *  Expansion follows the same rule as the final state: required and not yet configured rows are expanded. */
export function credentialSkeletonRows(shape = rememberedShape('credentials')): CredentialSkeletonRow[] {
  const done = new Set(list(shape?.done, 64, String));
  return CREDENTIAL_PROVIDERS.map(entry => {
    const configured = done.has(entry.provider);
    return { ...entry, done: configured, open: entry.requirement === 'required' && !configured };
  });
}

function credentialRow(row: CredentialSkeletonRow): string {
  const fields = row.fields ?? [];
  const configurable = row.requirement !== 'none' && row.requirement !== 'blocked';
  /* Badge slots: one for status, plus one per missing field when not configured. */
  const chips = chip() + (configurable && !row.done ? fields.map(() => chip('4.5em')).join('') : '');
  const head = `<span class="flex min-w-0 flex-wrap items-center gap-2">${block('14px', '14px')}<b class="min-w-0 text-body-medium wrap-anywhere text-text-primary">${esc(row.label)}</b>${chips}</span>`;
  if (!configurable) {
    return `<div class="flex flex-wrap items-center gap-3 border-b border-separator-border px-6 py-5 last:border-b-0 max-sm:px-4">${head}${row.requirement === 'blocked' && row.why ? help(esc(row.why)) : ''}</div>`;
  }
  const form = row.open ? '<div class="flex flex-col gap-2 pt-3"><div class="flex flex-col gap-3">'
    + help(`${esc(row.why ?? '')}${row.where ? ' Get credentials' : ''}`) + (row.howto ? help(esc(row.howto)) : '')
    + `<div class="flex w-full flex-col gap-3">${fields.map(name => inputField(esc(name))).join('')}</div>`
    + `<div class="flex flex-wrap items-center gap-2">${button('Save settings')}</div>${summary('Credentials file')}</div></div>` : '';
  return `<div class="flex flex-col gap-2 border-b border-separator-border px-6 py-5 last:border-b-0 max-sm:px-4">${head}<div>${summary(row.done ? 'Edit credentials' : 'Enter credentials', row.open)}${form}</div></div>`;
}

export function credentialsSkeleton(): string {
  const rows = credentialSkeletonRows();
  const pending = rows.filter(row => row.requirement === 'required' && !row.done).length;
  const groups = [
    ['Configurable credentials', rows.filter(row => row.requirement !== 'none' && row.requirement !== 'blocked')],
    ['No credentials needed', rows.filter(row => row.requirement === 'none')],
    ['Not supported yet', rows.filter(row => row.requirement === 'blocked')],
  ] as const;
  const body = groups.filter(([, items]) => items.length).map(([name, items]) => `<div class="flex flex-col gap-2"><h4 class="text-body-medium text-text-secondary">${name}</h4><div class="min-w-0 border border-separator-border bg-background-primary-default rounded-surface flex flex-col overflow-hidden">${items.map(credentialRow).join('')}</div></div>`).join('');
  return section('Source credentials', stack(`<div class="flex flex-col gap-4">${body}</div>`), '', { aside: pending ? text('5em') : '' });
}

/* ---------- Resource search: indexer count follows the configuration ---------- */

export function indexersSkeleton(): string {
  const open = list(rememberedShape('indexers')?.open, 20, on);
  const rows = open.map(expanded => `<div class="min-w-0 border-t border-separator-border pt-2"><span class="flex w-full min-w-0 items-center gap-1 text-body-2-medium">${islandGlyph('chevron-right', `size-(--icon-inline) shrink-0 text-text-secondary${expanded ? ' rotate-90' : ''}`)}${text('6em')}${text('12em')}</span>`
    + (expanded ? `<div class="flex flex-col gap-2 pt-3"><div class="flex min-w-0 flex-col gap-4">${inputField('Name')}${inputField('Torznab address')}${inputField('API key')}<div class="flex flex-wrap items-center gap-x-6 gap-y-2">${check('Enable')}${button('Remove', 'secondary', 'small')}</div></div></div>` : '')
    + '</div>').join('');
  return section('Resource search', stack(`<div class="flex min-w-0 flex-col gap-4">${summary('Indexer connection help')}${rows}</div>`), button('Add indexer', 'secondary') + button('Save settings'));
}

/* ---------- Add JAV from browser ---------- */

export function javBrowserSkeleton(): string {
  const shape = rememberedShape('javBrowser');
  const enabled = on(shape?.enabled);
  const status = '<div class="min-w-0 bg-background-primary-default rounded-2xl shadow-card p-5 border border-border-button-default flex flex-col gap-3">'
    + `<div class="flex flex-wrap items-center justify-between gap-3"><span class="text-body-medium text-text-primary">Peach userscript</span>${text('4em')}</div>`
    + `<div class="flex flex-wrap items-center justify-between gap-3"><span class="text-body-regular text-text-secondary">Browser add</span>${chip()}</div>`
    + `<p class="text-caption-1-regular text-text-secondary">${text('70%')}</p>`
    + `<div class="flex flex-wrap items-center gap-2">${button('Re-detect', 'secondary')}</div></div>`;
  return section('Add JAV from browser', stack(`<div class="flex min-w-0 flex-col gap-4">${status}${selectField('Download channel for browser add')}`
    + `${on(shape?.ready) ? '' : help('Add a cloud-drive that supports cloud download in your library, then configure the account and target folder.')}${inputField('Peach address')}</div>`),
  (enabled ? button('Turn off browser add', 'secondary') : '') + button(enabled ? 'Update channel and token' : 'Enable and generate token'));
}

/* ---------- CloudDrive proxy: account count follows the configuration ---------- */

const proxyEditor = (label: string, proxy: boolean) => `<div class="flex min-w-0 flex-col gap-3">${fieldLabel(label)}${islandSelect(text('6em'))}`
  + (proxy ? `<div class="flex flex-wrap gap-3"><div class="min-w-40 flex-1">${inputField(`${label}address`)}</div><div class="w-full sm:w-28">${inputField(`${label}port`)}</div></div>${summary('Proxy authentication')}` : '') + '</div>';

export function cloudProxySkeleton(): string {
  const shape = rememberedShape('cloudProxy');
  const accounts = list(shape?.accounts, 12, entry => Array.isArray(entry) ? [on(entry[0]), on(entry[1])] as const : [false, false] as const);
  const unlinked = count(shape?.unlinked, 12);
  const body = accounts.length || unlinked
    ? Array.from({ length: unlinked }, () => `<div class="flex min-w-0 flex-col gap-1">${fieldLabel(marked(text('6em')))}${help(text('9em'))}</div>`).join('')
      + accounts.map(([data, api]) => `<div class="flex min-w-0 flex-col gap-4 border-t border-separator-border pt-4">${fieldLabel(marked(text('8em')))}${help(text('50%'))}${proxyEditor('Data proxy', data)}${proxyEditor('API proxy', api)}<div class="flex justify-end">${button('Save settings')}</div></div>`).join('')
    : help(text('60%'));
  return section('CloudDrive proxy', stack(`${help(CLOUD_PROXY_HELP)}<div class="flex min-w-0 flex-col gap-4">${body}</div>`), button('Reload', 'secondary'));
}

/* ---------- Library and import ---------- */

const field = (label: string, control: string, className: string) =>
  `<div class="flex min-w-0 flex-col gap-1 ${className}"><span class="flex items-center gap-0.5 text-body-medium text-text-primary" aria-hidden="true">${label}</span>${control}</div>`;
const folderRow = (libraries: number) => `<div data-folder-row class="@container flex flex-col gap-2 rounded-2lg border border-separator-border bg-background-primary-default p-3">
    <div class="flex items-start gap-2"><span class="min-w-0 flex-1">${input()}</span>${islandButton({ glyph: 'folder-search', variant: 'secondary', attrs: wait })}</div>
    <div class="flex flex-wrap items-end gap-2"><div class="flex w-full flex-wrap items-start gap-2">${field('Source', islandSelect(text('6em')), 'w-full @lg:w-60')}${field('Read policy', islandSelect(text('4em')), 'w-full @lg:w-32')}${libraries > 1 ? field('Move to library', islandSelect(text('4em')), 'w-full @lg:w-48') : ''}</div></div>
  </div>`;
/* The library card uses the same class names as `cardClass({ variant: 'raised', padding: 'none' })` . */
const libraryBlock = (folders: number, libraries: number) => `<div data-library-block class="min-w-0 bg-background-primary-default rounded-2xl shadow-card flex flex-col p-2">
    <div data-library-head>${islandButton({ label: 'Auto-detect', variant: 'secondary', attrs: wait })}${input()}<span class="skeleton ui-configuration-skeleton-input" style="width:136px"></span>${islandSelect(text('4em'), { prefix: 'Handling' })}</div>
    <div data-library-folders>${folderRow(libraries).repeat(folders)}<div class="flex">${islandButton({ label: 'Add folder', variant: 'secondary', attrs: wait })}</div></div></div>`;
/* The help area is fixed text: the always-visible sentence is written as in the original, the comparison table stays collapsed, and only its expandable row is drawn. */
const legend = `<div data-policy-legend class="flex flex-col gap-1"><p class="text-body-2-regular text-text-secondary">${POLICY_SUMMARY}</p>`
  + '<span class="flex items-center gap-1 text-body-2-medium text-text-secondary">Comparison of the three handling modes</span></div>';
const cloudHelp = '<p class="text-body-2-regular text-text-secondary">Choosing "Proxy traffic protection" as the read policy limits automatic video reads.</p>'
  + '<div class="flex flex-col gap-3"><span class="flex items-center gap-1 text-body-2-medium text-text-secondary">CloudDrive setup help</span></div>';

/** Folders per library: from the last record; with none, one folder per group. */
export function mediaSkeletonShape(shape = rememberedShape('media')): MediaShape {
  const folders = list(shape?.folders, 12, entry => count(entry, 50)).filter(Boolean);
  return folders.length ? { folders, cloud: on(shape?.cloud) } : { folders: [1], cloud: false };
}

/** Auto-discover new files: the three toggle rows are fixed; when on, the description, Webhook row and prefix table follow the configuration. */
export function discoverySkeleton(): string {
  const shape = rememberedShape('discovery');
  const enabled = on(shape?.enabled);
  const cloud = enabled && on(shape?.cloud);
  const webhook = cloud && on(shape?.webhook);
  const prefixRow = `<div class="flex items-start gap-2"><span class="min-w-0 flex-1">${input()}</span>${islandSelect(text('4em'), { prefix: 'Matching folder' })}${islandButton({ glyph: 'trash', variant: 'secondary', attrs: wait })}</div>`;
  return section('Auto-discover new files', stack(`<div class="flex flex-wrap items-center gap-2"><span class="text-body-regular text-text-secondary">Local watching</span>${chip()}</div>`)
    + row('Auto-import after discovering new files', enabled ? text('10em') : '') + row('Watch local folders', enabled && on(shape?.watchLocal) ? text('12em') : '')
    + row('Receive CloudDrive2 notifications') + (cloud ? controlRow('Webhook settings', text('20em'), '') : '')
    + (webhook ? stack(summary('View settings'), true) : '')
    + (cloud ? stack(`<div class="flex flex-col gap-3">${fieldLabel('Cloud path prefix')}<div class="flex flex-col gap-3">${prefixRow.repeat(count(shape?.prefixes, 20))}</div><div>${button('Add prefix', 'secondary')}</div></div>`, true) : ''),
  (webhook ? button('Change key', 'secondary') : '') + button('Save settings'));
}

/** Libraries and folders: legend, each library's title row, folder rows and its own add button, with Add library and the bottom actions at the end. */
const media = () => {
  const shape = mediaSkeletonShape();
  return section('Libraries and folders', stack(`${legend}<div class="flex flex-col gap-4">${shape.folders.map(folders => libraryBlock(folders, shape.folders.length)).join('')}</div>
  <div class="self-start">${button('Add library', 'secondary')}</div>
  <p class="text-body-2-regular text-text-secondary">${LIBRARY_FOLDER_HELP}</p>
  ${shape.cloud ? cloudHelp : ''}<span class="text-body-medium text-text-primary">${text('15em')}</span>`),
  button('Save settings'), { status: 'Peach restarts after saving.' })
  + (shape.cloud ? cloudProxySkeleton() : '')
  + discoverySkeleton()
  + section('Product-code recognition rules', stack(`${text('90%')}${text('60%')}<span class="skeleton ui-configuration-skeleton-input" style="width:100%;height:88px"></span>`), button('Save settings'))
  + section('Video previews', row('Generate video previews', 'Generate grid and timeline previews for local videos; when off, duration and resolution are still probed per the import rules.')
    + row('Timeline previews', 'Frames are sampled at the chosen interval; only videos on the disk of this machine are processed.', 'ui-configuration-skeleton-select')
    + row('Frame decoding method', 'Used to generate covers, grids and timelines.', 'ui-configuration-skeleton-select'));
};

/* ---------- Sources and subscriptions ---------- */

const subscriptions = () => `<div>${button('Collection sources and sign-in status', 'secondary')}</div>`
  + credentialsSkeleton()
  + section('Follow collection', controlRow('Auto-check for updates', '', `<span class="flex items-center gap-2"><span class="skeleton ui-configuration-skeleton-toggle"></span><span class="skeleton ui-configuration-skeleton-input" style="width:96px"></span></span>`)
    + valueRow('Feed fetching') + row('First collection scope', '', 'ui-configuration-skeleton-select') + valueRow('Avatar refresh') + valueRow('Favicon refresh'))
  + indexersSkeleton()
  + section('Title info sites', stack(`<p class="text-body-2-regular text-text-secondary">${ENTRY_LINKS_HELP}</p>${inputField(marked('JavDB address'), ENTRY_LINKS_HINT)}${inputField(marked('MISSAV address'), ENTRY_LINKS_HINT)}`), button('Save settings'));

/* ---------- Download channels: the Cloud download and PikPak blocks appear with the cloud drives in the library ---------- */

const downloads = () => {
  const shape = rememberedShape('downloads');
  const pikpak = on(shape?.pikpak);
  const roots = on(shape?.pikpakRoots) ? selectField(marked('Media folder for the PikPak root'))
    : `<div class="flex flex-col gap-1">${fieldLabel(marked('Media folder for the PikPak root'))}${help('First add a PikPak mount folder under "Library and import".')}</div>`;
  const cloud = on(shape?.cloud) ? section('Cloud download', stack(inputField('CloudDrive2 address') + inputField('CloudDrive2 API token', 'Requires offline-task permission.')
    + (on(shape?.has115) ? inputField(marked('115 target folder'), 'Should be inside the auto-import cloud path prefix.') : '')
    + (pikpak ? inputField(marked('PikPak target folder'), 'The folder must already exist.') + roots : '')
    + inputField('Wait limit (hours)', text('14em'))), button('Check connection', 'secondary') + button('Save settings')) : '';
  const loggedIn = on(shape?.pikpakLoggedIn);
  const account = pikpak ? section('PikPak account', loggedIn ? facts(['Account', text('4em')]) : stack(inputField('Account') + inputField('Password') + check('Save password and sign in again automatically when the session expires')),
    loggedIn ? button('Sign out', 'secondary') : (on(shape?.browserLogin) ? button('Sign in with browser', 'secondary') : '') + button('Sign in'), { aside: chip(), mark: true }) : '';
  return cloud + account + javBrowserSkeleton();
};

/* ---------- Network and access ---------- */

const ACCESS_HELP: Record<string, string> = {
  legacy: 'Currently using a system-generated access passphrase. Set your own password, or turn off the sign-in requirement.',
  locked: 'Access settings cannot be read; check the configuration file on this machine.',
  password: 'Password set. New devices must sign in; tick "Stay signed in" when signing in to stay signed in for 30 days.',
};
const TUNNEL_HELP = {
  quick: 'For temporary previews; the address is random and changes after a restart. Set an access password before starting.',
  named: 'Uses the fixed domain you bound in Cloudflare. Set an access password before starting.',
};

function accessBody(mode: string): string {
  const pair = mode === 'locked' ? '' : inputField(mode === 'password' ? 'New access password *' : 'Set access password *', 'At least 8 characters. Other devices must sign in again after saving.')
    + inputField(mode === 'password' ? 'Confirm new access password *' : 'Confirm access password *');
  return (ACCESS_HELP[mode] ? help(ACCESS_HELP[mode]) : '') + (mode === 'open' ? block('100%', '64px') : '')
    + (mode === 'password' || mode === 'legacy' ? check('Turn off access password') : '')
    + (mode === 'password' ? inputField('Current access password *') : '') + pair;
}

const network = () => {
  const shape = rememberedShape('network');
  /* With no record, draw the server's default state: no access settings file means `legacy` (system-generated passphrase). */
  const mode = typeof shape?.access === 'string' && shape.access ? shape.access : 'legacy';
  const named = on(shape?.tunnelNamed);
  const tunnel = (named && on(shape?.tunnelNamedMode)
    ? help(TUNNEL_HELP.named) + inputField('Public hostname', 'The hostname in Cloudflare Zero Trust that points to this computer.') + inputField('Tunnel token', text('16em'))
    : help(TUNNEL_HELP.quick)) + (on(shape?.tunnelNote) ? block('100%', '64px') : '');
  const addresses = count(shape?.addresses, 3);
  const addressFields = Array.from({ length: addresses }, (_, i) => `<div class="flex min-w-0 flex-wrap items-end gap-2"><div class="min-w-0 flex-1">${inputField(['This computer', 'Phone connection address', 'Backup IP address'][i]!)}</div>${button('Copy address', 'secondary')}</div>`).join('');
  return (addresses || on(shape?.port) ? section('Access addresses', stack(addressFields + (addresses ? block('100%', '40px') : '')
      + (on(shape?.networkEditable) ? `<div class="flex flex-col gap-1.5">${fieldLabel('Who can access')}${block('min(100%, 20em)', '36px')}</div>` + (on(shape?.lan) ? inputField('LAN access address') : '') : '')
      + (on(shape?.port) ? inputField('Port') : '')), on(shape?.port) ? button('Save settings') : '',
      on(shape?.port) ? { status: 'Peach restarts after saving and redirects to the new address.' } : {}) : '')
    + section('Access password', stack(accessBody(mode)), mode === 'locked' ? '' : button('Save settings'))
    + section('Cloudflare public entry', stack((named ? block('10.5em', '36px') : '') + tunnel),
      button('Start public entry', named ? 'secondary' : 'primary') + (named ? button('Save settings') : ''), { aside: chip() })
    + section('Peach proxy', row('Connection method', '', 'ui-configuration-skeleton-select') + (on(shape?.proxyAddress) ? stack(inputField('Proxy address'), true) : ''), button('Save settings'));
};

/* ---------- App and maintenance ---------- */

/** Items always present in the runtime info; FFmpeg and untrunc add a row only when missing, per the last record. */
const RUNTIME_FACTS = ['Version', 'Operating system', 'Data folder', 'Settings file', 'Log folder'];

const maintenance = () => {
  const shape = rememberedShape('maintenance');
  const releaseFacts = ['Current version', 'Install method', 'Update channel', 'Latest version', 'Download content'].slice(0, Math.max(4, count(shape?.releaseFacts, 5)));
  const releaseNotes = count(shape?.releaseNotes, 4);
  const storageRows = count(shape?.storageRows, 12);
  const storageNotes = count(shape?.storageNotes, 3);
  const runtime = list(shape?.facts, 12, entry => esc(String(entry)));
  const idle = `<span class="self-start">${chip('6em')}</span>`;
  /* The server always provides the data-upload and uninstall blocks; they are drawn even with no record, just without the status-dependent notices. */
  const given = (value: unknown) => shape ? on(value) : true;
  const reporting = given(shape?.reporting) ? row('Send version stats and error diagnostics (recommended)', 'Uploads the version, system info, failure type, code location and occurrence count.') + (on(shape?.reportingIdle) ? stack(idle, true) : '') : '';
  const sharing = given(shape?.sharing) ? `<div class="border-t border-separator-border">${row('Upload library and taste details', on(shape?.sharingNotice) ? text('12em') : '')}${on(shape?.sharingIdle) ? stack(idle, true) : ''}${footer(button('Preview upload content', 'secondary'))}</div>` : '';
  return section('Check for updates', facts(releaseFacts) + (releaseNotes ? stack(help(text('50%')).repeat(releaseNotes), true) : ''),
    button('Check for updates'), { aside: chip('4em'), status: text('5em') })
    + section('Auto-update', row('Auto-check for new versions') + row('Auto-download updates') + row('Check frequency', on(shape?.autoUpdateHelp) ? text('12em') : '', 'ui-configuration-skeleton-select'), button('Save settings'))
    + section('Launch at startup', row('Start Peach at login') + row('Start in the tray only, without opening the web page') + row('Create a desktop shortcut', on(shape?.desktopNote) ? text('12em') : '')
      + (on(shape?.startupNote) ? stack(help(text('60%')), true) : ''), button('Save settings'))
    + section('Video playback', row('Transcoding method', 'Used for video transcoding during playback.', 'ui-configuration-skeleton-select'))
    + section('Storage', facts(['Data folder', 'Disk'])
      + (storageRows ? Array.from({ length: storageRows }, () => controlRow(text('6em'), '', text('4em'))).join('') : stack(help('After calculating, shows the space used by each type of data, and lets you clear caches and old backups.'), true))
      + (storageNotes ? stack(help(text('80%')).repeat(storageNotes), true) : ''),
    button('Change location', 'secondary') + button(storageRows ? 'Recalculate' : 'Calculate usage'))
    + (reporting || sharing ? section('Data upload', reporting + sharing) : '')
    + section('Runtime info', facts(runtime.length ? runtime : RUNTIME_FACTS))
    + `<section aria-label="Installation guide" class="w-full"><div class="flex w-full flex-col rounded-2xl bg-background-secondary-default pl-3">${controlRow('Installation guide', '', button('Reopen guide', 'secondary'))}</div></section>`
    + (given(shape?.uninstall) ? section('Uninstall Peach', (on(shape?.uninstallHelp) ? stack(help('Uninstalling removes the Peach program itself; your original media files are kept.')) : '')
      + row('Full uninstall', 'Also deletes settings, the local database, watch history, credentials and cache') + stack(summary('Data folder'), true), button('Uninstall Peach'), { status: text('16em') }) : '');
};

/** Each section reuses the geometry of the real form's Section, Stack and SettingsRow. */
export function configurationContentSkeleton(chosen: string): string {
  switch (chosen) {
    case 'System diagnostics': return diagnosticsSkeleton();
    case 'Sources & subscriptions': return subscriptions();
    case 'Download channels': return downloads();
    case 'Network & access': return network();
    case 'App & maintenance': return maintenance();
    default: return media();
  }
}

export function configurationSkeleton(chosen = 'Library & import'): string {
  const nav = `<div class="ui-board-local-nav" data-section-nav data-section-items>${Object.values(CONFIGURATION_SECTIONS).map(title => `<button type="button" tabindex="-1" aria-selected="${title === chosen}">${title}</button>`).join('')}</div>`;
  return `<div class="peach-react"><div class="ui-configpage">${nav}<div class="flex min-w-0 flex-col gap-6">${configurationContentSkeleton(chosen)}</div></div></div>`;
}
