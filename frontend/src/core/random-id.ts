/* 浏览器只在 HTTPS 与 localhost 页面提供 `crypto.randomUUID`；局域网按 HTTP 打开时它不存在。
 * `getRandomValues` 在任何页面都可用，用它按 RFC 9562 拼出同格式的 v4 UUID，服务端按 UUID 校验的身份照常通过。 */

/** 随机 v4 UUID，HTTP 页面也可用。 */
export function randomId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
