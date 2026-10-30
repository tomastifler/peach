/* Browsers only provide `crypto.randomUUID` on HTTPS and localhost pages; it does not exist when a LAN is opened over HTTP.
 * `getRandomValues` is available on any page, and with it a v4 UUID of the same format is assembled per RFC 9562, so identities the server validates as UUIDs pass as usual. */

/** Random v4 UUID, usable on HTTP pages as well. */
export function randomId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
