import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.resetModules() });

function reports(transport: { mock: { calls: unknown[][] } }): [string, { body: string }][] {
  return transport.mock.calls.filter(call => JSON.parse(String((call[1] as RequestInit).body)).kind !== 'context') as [string, { body: string }][];
}

it('页面启动记录一次环境，原生媒体失败带能力与状态且不携带媒体地址', async () => {
  const listeners = new Map<string, (event: unknown) => void>();
  vi.spyOn(document, 'addEventListener').mockImplementation((name, callback) => {
    listeners.set(name, callback as (event: unknown) => void);
  });
  const fetch = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetch);
  vi.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(-480);
  const { installErrorReporting } = await import('../src/error-reporting');
  installErrorReporting(); installErrorReporting();
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  const context = JSON.parse(fetch.mock.calls[0]![1].body);
  expect(context.kind).toBe('context');
  expect(context.browser.native_codecs).toHaveProperty('h264');
  expect(context.browser.utc_offset_minutes).toBe(480);
  expect(context.browser.timezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const video = document.createElement('video');
  video.src = 'https://private.example/private.mp4?token=private-token';
  Object.defineProperty(video, 'error', { value: { code: 4, message: 'unsupported source' } });
  Object.defineProperty(video, 'networkState', { value: 3 });
  listeners.get('error')!({ target: video });
  const body = reports(fetch)[0]![1].body;
  expect(JSON.parse(body)).toMatchObject({ kind: 'media', playback: { code: 4, network_state: 3, ready_state: 0 } });
  for (const privateValue of ['private.example', 'private.mp4', 'private-token']) expect(body).not.toContain(privateValue);
});

it('诊断头编码 Unicode 环境且能力探测失败保留空值', async () => {
  const { browserDiagnostics, diagnosticHeaders } = await import('../src/browser-diagnostics');
  vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockImplementation(() => { throw new Error('blocked') });
  vi.spyOn(navigator, 'platform', 'get').mockReturnValue('测试平台');
  expect(browserDiagnostics().native_codecs.h264).toBeNull();
  const bytes = Uint8Array.from(atob((await diagnosticHeaders())['X-Peach-Browser-Diagnostics']!), value => value.charCodeAt(0));
  expect(JSON.parse(new TextDecoder().decode(bytes)).platform).toBe('测试平台');
});

it('客户端提示保存浏览器完整版本，受限平台不阻断环境快照', async () => {
  vi.stubGlobal('navigator', { userAgent: 'fixture-agent', userAgentData: {
    getHighEntropyValues: async () => ({ fullVersionList: [{ brand: 'Google Chrome', version: '150.0.1.2' }],
      platformVersion: '19.0.0', architecture: 'x86', bitness: '64', wow64: false }),
  } });
  const { detailedBrowserDiagnostics } = await import('../src/browser-diagnostics');
  expect((await detailedBrowserDiagnostics()).client_hints.fullVersionList?.[0]?.version).toBe('150.0.1.2');
});

it('客户端提示被拒绝时导出仍包含基本环境', async () => {
  vi.stubGlobal('navigator', { userAgent: 'fixture-agent', userAgentData: {
    getHighEntropyValues: async () => { throw new DOMException('blocked', 'NotAllowedError') },
  } });
  const { detailedBrowserDiagnostics } = await import('../src/browser-diagnostics');
  expect(await detailedBrowserDiagnostics()).toMatchObject({ user_agent: 'fixture-agent', client_hints: { status: 'unavailable' } });
});

it('HLS 引擎错误保留声明片源，原生视频尚未挂载也能取证', async () => {
  let onError: ((event: unknown) => void) | undefined;
  vi.spyOn(document, 'addEventListener').mockImplementation((name, callback) => {
    if (name === 'error') onError = callback as (event: unknown) => void;
  });
  const fetch = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal('fetch', fetch);
  const { installErrorReporting } = await import('../src/error-reporting'); installErrorReporting();
  const wrapper = document.createElement('hlsjs-video');
  wrapper.append(document.createElement('video'));
  Object.assign(wrapper, { error: { code: 100, message: 'manifest unavailable' },
    source: { src: '/stream/hls/12/index.m3u8?session=private-session', type: 'application/vnd.apple.mpegurl' } });
  onError!({ target: wrapper });
  const body = reports(fetch)[0]![1].body;
  expect(JSON.parse(body).playback).toMatchObject({ code: 100, source_assigned: false,
    declared_route: '/stream/hls/12/index.m3u8', source_type: 'application/vnd.apple.mpegurl' });
  expect(body).not.toContain('private-session');
});

it('浏览器异常有上限、去重，网络失败不会触发递归上报', async () => {
  const listeners = new Map<string, (event: unknown) => void>();
  vi.spyOn(window, 'addEventListener').mockImplementation((name, callback) => {
    listeners.set(name, callback as (event: unknown) => void);
  });
  const fetch = vi.fn().mockRejectedValue(new Error('offline'));
  vi.stubGlobal('fetch', fetch);
  const { installErrorReporting } = await import('../src/error-reporting');
  installErrorReporting(); installErrorReporting();
  expect(listeners.size).toBe(2);
  const error = new Error('render failed');
  const event = { error, message: error.message,
    filename: 'https://peach.example/dist/peach-app.js?token=private-token', lineno: 21, colno: 8 };
  listeners.get('error')!(event);
  listeners.get('error')!(event);
  expect(reports(fetch)).toHaveLength(1);
  expect(reports(fetch)[0]![0]).toBe('/api/diagnostics/client-error');
  expect(JSON.parse(reports(fetch)[0]![1].body)).toMatchObject({ kind: 'error', message: 'render failed' });
  expect(JSON.parse(reports(fetch)[0]![1].body)).toMatchObject({ source_file: 'peach-app.js', line: 21, column: 8 });
  expect(reports(fetch)[0]![1].body).not.toContain('private-token');
  for (let i = 0; i < 30; i += 1) listeners.get('unhandledrejection')!({ reason: `failure ${i}` });
  expect(reports(fetch)).toHaveLength(10);
  await Promise.resolve();
  expect(reports(fetch)).toHaveLength(10);
});

it('主动取消请求不生成错误记录，真实异常保留类型', async () => {
  const listeners = new Map<string, (event: unknown) => void>();
  vi.spyOn(window, 'addEventListener').mockImplementation((name, callback) => {
    listeners.set(name, callback as (event: unknown) => void);
  });
  const fetch = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetch);
  const { installErrorReporting } = await import('../src/error-reporting');
  installErrorReporting();
  const cancelled = new DOMException('request cancelled', 'AbortError');
  listeners.get('unhandledrejection')!({ reason: cancelled });
  listeners.get('error')!({ error: cancelled, message: cancelled.message });
  expect(reports(fetch)).toHaveLength(0);
  listeners.get('unhandledrejection')!({ reason: new TypeError('render failed') });
  expect(reports(fetch)).toHaveLength(1);
  expect(JSON.parse(reports(fetch)[0]![1].body)).toMatchObject({ error_name: 'TypeError' });
});

it('正式 bundle 只上报固定文件名与有效 Debug ID，异常类型不携带自定义名称', async () => {
  const listeners = new Map<string, (event: unknown) => void>();
  vi.spyOn(window, 'addEventListener').mockImplementation((name, callback) => {
    listeners.set(name, callback as (event: unknown) => void);
  });
  const appId = '12345678-1234-4123-8123-123456789abc';
  const pagesId = '23456789-1234-4123-8123-123456789abc';
  vi.stubGlobal('_sentryDebugIds', {
    'Error\n at https://private-host/dist/peach-app.js?token=private-token:1:23': appId,
    'Error\nsentry@https://private-host/dist/peach-pages.js:1:12': pagesId,
    'Error\n at https://private-host/dist/other.js:1:2': '34567890-1234-4123-8123-123456789abc',
    'Error\n at https://private-host/dist/peach-app.js:1:2': 'private-value',
  });
  const fetch = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetch);
  const { installErrorReporting } = await import('../src/error-reporting');
  installErrorReporting();
  const error = new Error('fixture failure');
  error.name = 'private-name';
  error.stack = 'fixture failure';
  listeners.get('error')!({ error, filename: 'https://private-host/secret.js?token=private-token' });
  const body = reports(fetch)[0]![1].body;
  expect(JSON.parse(body)).toMatchObject({ error_name: 'Error', bundle_debug_ids: {
    'peach-app.js': appId, 'peach-pages.js': pagesId,
  } });
  expect(JSON.parse(body)).not.toHaveProperty('source_file');
  for (const secret of ['private-host', 'private-token', 'other.js', 'private-name', 'private-value']) expect(body).not.toContain(secret);
});

it('按页拆出的 chunk 也带文件名与 Debug ID 上报，查询串与主机不出本机', async () => {
  const listeners = new Map<string, (event: unknown) => void>();
  vi.spyOn(window, 'addEventListener').mockImplementation((name, callback) => {
    listeners.set(name, callback as (event: unknown) => void);
  });
  const chunk = 'peach-app.stats-page-Ab1_x-Y9.js';
  const chunkId = '45678901-1234-4123-8123-123456789abc';
  vi.stubGlobal('_sentryDebugIds', {
    [`Error\n at https://private-host/dist/${chunk}:1:9\n at https://private-host/dist/peach-app.js:1:2`]: chunkId,
    'Error\n at https://private-host/dist/peach-app.a.b.js:1:2': '56789012-1234-4123-8123-123456789abc',
  });
  const fetch = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetch);
  const { installErrorReporting } = await import('../src/error-reporting');
  installErrorReporting();
  const error = new TypeError('chunk failure');
  listeners.get('error')!({ error, filename: `https://private-host/dist/${chunk}?token=private-token`, lineno: 3, colno: 4 });
  const body = reports(fetch)[0]![1].body;
  expect(JSON.parse(body)).toMatchObject({ source_file: chunk, line: 3, column: 4 });
  expect(JSON.parse(body).bundle_debug_ids).toEqual({ [chunk]: chunkId });
  for (const secret of ['private-host', 'private-token']) expect(body).not.toContain(secret);
});

it('每分钟窗口恢复上报额度', async () => {
  let callback: ((event: unknown) => void) | undefined;
  vi.spyOn(window, 'addEventListener').mockImplementation((name, listener) => {
    if (name === 'unhandledrejection') callback = listener as (event: unknown) => void;
  });
  const now = vi.spyOn(Date, 'now').mockReturnValue(0);
  const fetch = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetch);
  const { installErrorReporting } = await import('../src/error-reporting');
  installErrorReporting();
  for (let index = 0; index < 11; index += 1) callback!({ reason: `failure ${index}` });
  expect(reports(fetch)).toHaveLength(10);
  now.mockReturnValue(60_000);
  callback!({ reason: 'failure 0' });
  expect(reports(fetch)).toHaveLength(11);
});
