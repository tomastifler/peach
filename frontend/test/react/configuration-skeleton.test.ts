import { afterEach, describe, expect, it } from 'vitest';
import {
  CREDENTIAL_PROVIDERS, configurationContentSkeleton, credentialSkeletonRows, rememberShape, SHAPE_KEY,
} from '../../src/configuration-skeleton';
import { downloadsShape, maintenanceShape, networkShape } from '../../src/react/settings/configuration-shape';
import type { ConfigurationData } from '../../src/react/bundle';

const draw = (section: string) => {
  const root = document.createElement('div');
  root.innerHTML = configurationContentSkeleton(section);
  return root;
};
const sections = (root: ParentNode) => [...root.querySelectorAll('section[aria-label]')]
  .filter(node => !node.parentElement?.closest('section[aria-label]')).map(node => node.getAttribute('aria-label'));
const card = (root: ParentNode, name: string) => root.querySelector(`section[aria-label="${name}"]`)!;

afterEach(() => localStorage.clear());

describe('来源凭据骨架', () => {
  it('站点行取自静态登记，名字写真名；没有记录时按都没配，必填的展开', () => {
    const credentials = card(draw('Sources & subscriptions'), 'Source credentials');
    const names = [...credentials.querySelectorAll('b')].map(node => node.textContent);
    const configurable = CREDENTIAL_PROVIDERS.filter(row => row.requirement === 'required' || row.requirement === 'optional');
    const none = CREDENTIAL_PROVIDERS.filter(row => row.requirement === 'none');
    expect(names).toEqual([...configurable, ...none].map(row => row.label));
    expect([...credentials.querySelectorAll('h4')].map(node => node.textContent)).toEqual(['Configurable credentials', 'No credentials needed']);
    const required = CREDENTIAL_PROVIDERS.filter(row => row.requirement === 'required');
    expect(credentialSkeletonRows().filter(row => row.open).map(row => row.provider)).toEqual(required.map(row => row.provider));
    // 展开的那几行画出各自要填的字段。
    const fields = [...credentials.querySelectorAll('span.text-body-medium')].map(node => node.textContent);
    for (const row of required) expect(fields).toEqual(expect.arrayContaining(row.fields!));
  });

  it('上次记下已配好的来源收起，其余照登记', () => {
    const [first] = CREDENTIAL_PROVIDERS.filter(row => row.requirement === 'required');
    rememberShape('credentials', { done: [first!.provider] });
    const rows = credentialSkeletonRows();
    expect(rows.find(row => row.provider === first!.provider)).toMatchObject({ done: true, open: false });
    expect(rows.map(row => row.provider)).toEqual(CREDENTIAL_PROVIDERS.map(row => row.provider));
  });
});

describe('随配置变化的分区按上次记录的结构画', () => {
  it('Resource search：没有记录时没有索引器行，有记录时按条数与展开态', () => {
    const empty = card(draw('Sources & subscriptions'), 'Resource search');
    expect(empty.querySelectorAll('.border-t.pt-2')).toHaveLength(0);
    expect([...empty.querySelectorAll('button')].map(key => [key.textContent, key.disabled])).toEqual([['Add indexer', true], ['Save settings', true]]);
    rememberShape('indexers', { open: [true, false, false] });
    const recorded = card(draw('Sources & subscriptions'), 'Resource search');
    expect(recorded.querySelectorAll('.border-t.pt-2')).toHaveLength(3);
    expect([...recorded.querySelectorAll('span.text-body-medium')].map(node => node.textContent)).toEqual(['Name', 'Torznab address', 'API key']);
  });

  it('媒体库：没有记录时一个媒体库一个文件夹，有记录时照每个媒体库的文件夹数', () => {
    const first = card(draw('Library & import'), 'Libraries and folders');
    expect(first.querySelectorAll('[data-library-block]')).toHaveLength(1);
    expect(first.querySelectorAll('[data-folder-row]')).toHaveLength(1);
    rememberShape('media', { folders: [3, 1], cloud: true });
    const root = draw('Library & import');
    expect([...card(root, 'Libraries and folders').querySelectorAll('[data-library-block]')].map(block => block.querySelectorAll('[data-folder-row]').length)).toEqual([3, 1]);
    expect(sections(root)).toEqual(['Libraries and folders', 'CloudDrive proxy', 'Auto-discover new files', 'Product-code recognition rules', 'Video previews']);
  });

  it('Download channels：没有记录时只有浏览器添加，有记录时按网盘画出云下载与 PikPak', () => {
    expect(sections(draw('Download channels'))).toEqual(['Add JAV from browser']);
    rememberShape('downloads', { cloud: true, has115: true, pikpak: true, pikpakRoots: false, pikpakLoggedIn: false, browserLogin: true });
    const root = draw('Download channels');
    expect(sections(root)).toEqual(['Cloud download', 'PikPak account', 'Add JAV from browser']);
    expect([...card(root, 'PikPak account').querySelectorAll('button')].map(key => key.textContent)).toEqual(['Sign in with browser', 'Sign in']);
  });

  it('CloudDrive proxy：每个账号一组，走代理的那一路多出地址与端口', () => {
    rememberShape('media', { folders: [1], cloud: true });
    expect(card(draw('Library & import'), 'CloudDrive proxy').querySelectorAll('.border-t.pt-4')).toHaveLength(0);
    rememberShape('cloudProxy', { configured: true, unlinked: 0, accounts: [[true, false], [false, false]] });
    const proxy = card(draw('Library & import'), 'CloudDrive proxy');
    expect(proxy.querySelectorAll('.border-t.pt-4')).toHaveLength(2);
    expect([...proxy.querySelectorAll('span.text-body-medium')].map(node => node.textContent)).toEqual(['Data proxyaddress', 'Data proxyport']);
  });

  it('坏记录按没有记录处理', () => {
    localStorage.setItem(SHAPE_KEY, JSON.stringify({ media: { folders: 'x' }, indexers: { open: 3 }, downloads: null }));
    const root = draw('Library & import');
    expect(card(root, 'Libraries and folders').querySelectorAll('[data-folder-row]')).toHaveLength(1);
    expect(sections(draw('Download channels'))).toEqual(['Add JAV from browser']);
    expect(card(draw('Sources & subscriptions'), 'Resource search').querySelectorAll('.border-t.pt-2')).toHaveLength(0);
  });

  it('骨架里没有按像素记下的正文高度', () => {
    rememberShape('indexers', { open: [false] });
    for (const name of ['Library & import', 'Sources & subscriptions', 'Download channels', 'Network & access', 'App & maintenance']) {
      expect(configurationContentSkeleton(name)).not.toMatch(/--skeleton-h|--remembered-h/);
    }
    expect(Object.keys(localStorage)).toEqual([SHAPE_KEY]);
  });
});

describe('整页配置记下的结构', () => {
  const data = {
    editable: true, port_editable: false, notice: '', revision: '', media_dirs: [], library_count: 1, port: 8900,
    facts: [{ term: 'Version', value: '1' }, { term: 'FFmpeg', value: '未找到' }],
    access: { mode: 'password', revision: 'r' },
    tunnel: { enabled: false, state: 'stopped', url: '', error: '', available: true, mode: 'named', hostname: '', token_set: false, named_available: true },
    peach_proxy: { mode: 'proxy', proxy_saved: true, needs_selection: false },
    downloads: { media_sources: ['local', 'pikpak'], pikpak_roots: ['/'], pikpak: { logged_in: true }, pikpak_browser: { available: false } },
  } as unknown as ConfigurationData;

  it('从配置算出几块、哪种表单，不含任何值', () => {
    expect(downloadsShape(data)).toEqual({ cloud: true, has115: false, pikpak: true, pikpakRoots: true, pikpakLoggedIn: true, browserLogin: false });
    expect(networkShape(data)).toEqual({ port: false, addresses: 0, networkEditable: false, lan: false,
      proxyAddress: true, access: 'password', tunnelNamed: true, tunnelNamedMode: true, tunnelNote: false });
    expect(maintenanceShape(data)).toMatchObject({ facts: ['Version', 'FFmpeg'], reporting: false, uninstall: false, storageRows: 0 });
  });

  it('网络与访问按记录画访问密码的表单；没有记录时按服务端默认的系统口令', () => {
    const fresh = card(draw('Network & access'), 'Access password');
    expect([...fresh.querySelectorAll('span.text-body-medium')].map(node => node.textContent)).toEqual(['Set access password *', 'Confirm access password *']);
    rememberShape('network', networkShape(data));
    const root = draw('Network & access');
    expect(sections(root)).toEqual(['Access password', 'Cloudflare public entry', 'Peach proxy']);
    expect([...card(root, 'Access password').querySelectorAll('span.text-body-medium')].map(node => node.textContent))
      .toEqual(['Current access password *', 'New access password *', 'Confirm new access password *']);
  });
});
