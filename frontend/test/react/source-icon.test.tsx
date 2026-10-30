import { act } from 'react';
import { expect, it } from 'vitest';
import { SourceIcon } from '../../src/react/follow-manage/source-view';
import { mount } from './render';

it('站标失败与未知来源换成同尺寸的地球，站名交给旁边的文字', async () => {
  const host = await mount(<SourceIcon provider="f95zone" />);
  const image = host.querySelector('img')!;
  expect(image.getAttribute('src')).toBe('/source-icon?provider=f95zone');
  await act(async () => image.dispatchEvent(new Event('error')));
  expect(host.querySelector('img')).toBeNull();
  expect(host.querySelector('svg')).not.toBeNull();
  expect(host.textContent).toBe('');
  const unknown = await mount(<SourceIcon provider="unknown" />);
  expect(unknown.querySelector('svg')).not.toBeNull();
});
