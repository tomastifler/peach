import { afterEach, expect, it, vi } from 'vitest';

import { randomId } from '../src/core/random-id';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** 局域网 HTTP 页面：只有 `getRandomValues`，没有 `randomUUID`。 */
const insecureContext = () => {
  const real = globalThis.crypto;
  vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) });
};

afterEach(() => vi.unstubAllGlobals());

it('安全上下文直接用浏览器的 randomUUID', () => {
  const native = vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000000');
  expect(randomId()).toBe('00000000-0000-4000-8000-000000000000');
  expect(native).toHaveBeenCalledOnce();
});

it('HTTP 页面没有 randomUUID 时仍生成 v4 UUID，且每次不同', () => {
  insecureContext();
  const ids = Array.from({ length: 64 }, randomId);
  for (const id of ids) expect(id).toMatch(UUID_V4);
  expect(new Set(ids).size).toBe(ids.length);
});

it('版本位与变体位固定，其余位取自随机字节', () => {
  vi.stubGlobal('crypto', { getRandomValues: (bytes: Uint8Array) => bytes.fill(0xff) });
  expect(randomId()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
});
