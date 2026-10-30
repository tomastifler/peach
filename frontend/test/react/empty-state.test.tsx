import { expect, it } from 'vitest';
import { RiVideoLine } from '@remixicon/react';
import { EmptyFocusButton, EmptyState } from '../../src/react/components/empty-state';
import { click, mountRoot } from './render';

it('空态动作聚焦当前页面已有输入', async () => {
  const { host } = await mountRoot(<><input id="empty-focus-input" />
    <EmptyState icon={RiVideoLine} title="没有内容" actions={<EmptyFocusButton target="#empty-focus-input">添加内容</EmptyFocusButton>}>
      添加后显示在这里。
    </EmptyState></>);
  await click(host.querySelector('button'));
  expect(document.activeElement).toBe(host.querySelector('input'));
});

it('两档空态保留相同的图标语义且没有多余说明', async () => {
  const { host, rerender } = await mountRoot(<EmptyState icon={RiVideoLine} title="没有内容">{null}</EmptyState>);
  expect(host.querySelector('[data-empty-size="standard"]')).not.toBeNull();
  expect(host.querySelector('p')).toBeNull();
  expect(host.querySelector('svg')?.closest('[aria-hidden]')).not.toBeNull();
  await rerender(<EmptyState size="compact" icon={RiVideoLine} title="没有内容">说明</EmptyState>);
  expect(host.querySelector('[data-empty-size="compact"]')).not.toBeNull();
  expect(host.querySelector('h3')?.textContent).toBe('没有内容');
});
