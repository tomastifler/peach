/* 本机诊断使用浏览器原生能力快照；不请求媒体、不读取浏览历史。 */
const codecs = {
  h264: 'video/mp4; codecs="avc1.42E01E"', h264High: 'video/mp4; codecs="avc1.640028"',
  hevc: 'video/mp4; codecs="hvc1.1.6.L93.B0"', av1: 'video/mp4; codecs="av01.0.05M.08"',
  vp9: 'video/webm; codecs="vp9"', aac: 'audio/mp4; codecs="mp4a.40.2"',
  ac3: 'audio/mp4; codecs="ac-3"', opus: 'audio/webm; codecs="opus"',
};
const routes = /^\/(?:stream(?:\/hls\/\d+\/(?:index\.m3u8|\d+\.ts))?|follow-stream|preview-stream|strm-resource\/\d+\/[a-f0-9]+)$/;
const attempt = <T>(read: () => T): T | null => { try { return read() } catch { return null } };
const number = (value: number): number | null => Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null;
let graphics: { status: string; vendor?: string; renderer?: string } | undefined;
interface ClientHints {
  fullVersionList?: { brand: string; version: string }[];
  architecture?: string; bitness?: string; platformVersion?: string; wow64?: boolean;
}
let hints: ClientHints & { status: string } = { status: 'not-requested' };
let hintsLoader: Promise<void> | undefined;

export async function detailedBrowserDiagnostics() {
  hintsLoader ??= (async () => {
    const data = (navigator as Navigator & { userAgentData?: { getHighEntropyValues?: (keys: string[]) => Promise<ClientHints> } }).userAgentData;
    if (!data?.getHighEntropyValues) { hints = { status: 'unsupported' }; return }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([data.getHighEntropyValues(['fullVersionList', 'architecture', 'bitness', 'platformVersion', 'wow64']),
        new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 1000) })]);
      hints = result ? { ...result, status: result.fullVersionList ? 'available' : 'restricted' } : { status: 'timeout' };
    } catch { hints = { status: 'unavailable' } }
    finally { if (timer) clearTimeout(timer) }
  })();
  await hintsLoader;
  return browserDiagnostics();
}
function graphicsDiagnostics() {
  if (graphics) return graphics;
  graphics = { status: 'unavailable' };
  if (typeof WebGLRenderingContext === 'undefined') return graphics;
  const context = attempt(() => document.createElement('canvas').getContext('webgl'));
  if (!context) return graphics;
  try {
    const extension = context.getExtension('WEBGL_debug_renderer_info');
    graphics = { status: 'available', vendor: String(context.getParameter(extension?.UNMASKED_VENDOR_WEBGL ?? context.VENDOR)),
      renderer: String(context.getParameter(extension?.UNMASKED_RENDERER_WEBGL ?? context.RENDERER)) };
  } catch { /* 图形信息不可读时保留未取得状态 */ }
  finally { attempt(() => context.getExtension('WEBGL_lose_context')?.loseContext()) }
  return graphics;
}

export function browserDiagnostics() {
  const video = document.createElement('video');
  const extended = navigator as Navigator & { deviceMemory?: number; userAgentData?: {
    brands?: { brand: string; version: string }[]; mobile?: boolean; platform?: string;
  }; connection?: { effectiveType?: string; saveData?: boolean; rtt?: number; downlink?: number } };
  return {
    user_agent: navigator.userAgent, platform: navigator.platform, language: navigator.language,
    brands: extended.userAgentData?.brands, mobile: extended.userAgentData?.mobile,
    client_hints: hints,
    platform_hint: extended.userAgentData?.platform, timezone: attempt(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
    utc_offset_minutes: -new Date().getTimezoneOffset(),
    secure_context: globalThis.isSecureContext, online: navigator.onLine, cookies_enabled: navigator.cookieEnabled,
    local_storage: attempt(() => { localStorage.getItem('peach.settings.v1'); return true }),
    protocol: location.protocol, viewport_width: innerWidth, viewport_height: innerHeight,
    pixel_ratio: devicePixelRatio, touch_points: navigator.maxTouchPoints,
    logical_processors: navigator.hardwareConcurrency, device_memory_gb: extended.deviceMemory,
    media_source: typeof MediaSource !== 'undefined', media_capabilities: !!navigator.mediaCapabilities,
    web_codecs: 'VideoDecoder' in globalThis, graphics: graphicsDiagnostics(),
    fullscreen: document.fullscreenEnabled, picture_in_picture: document.pictureInPictureEnabled,
    native_codecs: Object.fromEntries(Object.entries(codecs).map(([name, type]) => [name, attempt(() => video.canPlayType(type))])),
    mse_codecs: Object.fromEntries(Object.entries(codecs).map(([name, type]) => [name,
      attempt(() => typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported(type))])),
    connection: extended.connection && { effective_type: extended.connection.effectiveType, save_data: extended.connection.saveData,
      rtt_ms: extended.connection.rtt, downlink_mbps: extended.connection.downlink },
  };
}

export function playbackDiagnostics(video: HTMLMediaElement, failure: unknown = video.error) {
  const source = attempt(() => new URL(video.currentSrc || video.src, location.href));
  const wrapper = video.closest('hlsjs-video,dash-video') as (HTMLElement & { source?: { src?: string; type?: string } }) | null;
  const declared = attempt(() => new URL(wrapper?.source?.src || '', location.href));
  const error = failure as { code?: number; message?: string } | null;
  const recent = (attempt(() => performance.getEntriesByType('resource')) || []).filter(entry => {
    const url = attempt(() => new URL(entry.name));
    return !!url && url.origin === location.origin && routes.test(url.pathname);
  }).slice(-8).map(entry => {
    const request = entry as PerformanceResourceTiming;
    return { route: new URL(entry.name).pathname, duration_ms: number(entry.duration),
      transfer_bytes: request.transferSize, body_bytes: request.encodedBodySize,
      status: request.responseStatus, initiator: request.initiatorType };
  });
  return {
    code: error?.code, message: typeof error?.message === 'string' ? error.message.slice(0, 1000) : undefined,
    network_state: video.networkState, ready_state: video.readyState,
    current_time: number(video.currentTime), duration: number(video.duration),
    paused: video.paused, ended: video.ended, muted: video.muted, volume: number(video.volume),
    playback_rate: number(video.playbackRate), preload: video.preload,
    video_width: video instanceof HTMLVideoElement ? video.videoWidth : undefined,
    video_height: video instanceof HTMLVideoElement ? video.videoHeight : undefined,
    source_protocol: source?.protocol, same_origin: source?.origin === location.origin,
    source_assigned: video.hasAttribute('src'), source_type: wrapper?.source?.type,
    asset_id: source && source.origin === location.origin && routes.test(source.pathname) && /^\d+$/.test(source.searchParams.get('id') || '')
      ? Number(source.searchParams.get('id')) : undefined,
    source_route: source && source.origin === location.origin && routes.test(source.pathname) ? source.pathname : undefined,
    declared_route: declared && declared.origin === location.origin && routes.test(declared.pathname) ? declared.pathname : undefined,
    buffered_ranges: attempt(() => Array.from({ length: Math.min(video.buffered.length, 8) }, (_, index) =>
      [number(video.buffered.start(index)), number(video.buffered.end(index))])),
    recent_requests: recent,
  };
}

export async function diagnosticHeaders(): Promise<Record<string, string>> {
  const bytes = new TextEncoder().encode(JSON.stringify(await detailedBrowserDiagnostics()));
  return { 'X-Peach-Browser-Diagnostics': btoa(String.fromCharCode(...bytes)) };
}
