/* 外网横幅只在服务端确认连不上时出现，画进壳给的节点，恢复联网后消失。 */
import { notifyManager, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';

import { NETWORK_STATUS_KEY, NetworkBanner, networkPollInterval } from '../../src/react/network-banner';
import { queryClient } from '../../src/react/query';
import { mount, settle } from './render';

afterEach(() => queryClient.clear());
notifyManager.setScheduler((notify) => notify());

function answer(state: string) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ state, checked_at: 1 }) })));
}

async function render() {
  const slot = document.createElement('div');
  slot.setAttribute('data-network-banner', '');
  document.body.append(slot);
  await mount(<QueryClientProvider client={queryClient}><NetworkBanner /></QueryClientProvider>);
  await settle();
  return slot;
}

it('服务端确认断网时在壳节点里画出横幅与代理设置入口', async () => {
  answer('offline');
  const slot = await render();
  const banner = slot.querySelector('[data-network-offline]');
  expect(banner?.getAttribute('role')).toBe('status');
  expect(banner?.querySelector('a')?.getAttribute('href')).toBe('/settings/network#peachProxy');
});

it.each(['online', 'checking', 'unknown'])('%s 时不画横幅', async (state) => {
  answer(state);
  const slot = await render();
  expect(slot.childElementCount).toBe(0);
});

it('恢复联网后横幅消失', async () => {
  answer('offline');
  const slot = await render();
  expect(slot.querySelector('[data-network-offline]')).not.toBeNull();
  answer('online');
  await queryClient.refetchQueries({ queryKey: NETWORK_STATUS_KEY });
  await settle();
  expect(slot.childElementCount).toBe(0);
});

it('联网时放慢复查，其余状态按服务端的异常节律读', () => {
  expect(networkPollInterval({ state: 'online', checked_at: 1 })).toBe(120_000);
  expect(networkPollInterval({ state: 'offline', checked_at: 1 })).toBe(30_000);
  expect(networkPollInterval(undefined)).toBe(30_000);
});
