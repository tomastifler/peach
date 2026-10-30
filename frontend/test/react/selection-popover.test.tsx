import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { SelectionPopover } from '../../src/react/components/selection-popover';
import { SelectionActions } from '../../src/react/components/selection-actions';
import { actionOrder, buttonNamed, click, linkNamed, mount } from './render';

it('批量操作与逐项勾选共用选择状态，操作后弹层保持打开', async () => {
  function Picker() {
    const [selected, setSelected] = useState(false);
    return <SelectionPopover label="示例筛选" triggerLabel="选择来源"
      items={[{ id: 'source', label: '来源一', selected }]}
      onChange={(_id, on) => setSelected(on)} actions={[
        { label: '全选', onPress: () => setSelected(true) },
        { label: '全不选', onPress: () => setSelected(false) },
        { label: '凭据设置', href: '/settings/subscriptions' },
      ]} />;
  }
  const host = await mount(<Picker />);
  await click(buttonNamed('选择来源', host));
  const dialog = () => document.querySelector('[role="dialog"][aria-label="示例筛选"]')!;
  const checkbox = () => dialog().querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  expect(actionOrder(dialog().querySelector('[data-selection-actions]'))).toEqual(['全选', '全不选', '凭据设置']);
  await click(buttonNamed('全选', dialog()));
  expect(checkbox().checked).toBe(true);
  await click(checkbox());
  expect(checkbox().checked).toBe(false);
  expect(linkNamed('凭据设置', dialog())?.getAttribute('href')).toBe('/settings/subscriptions');
});

it('批量操作保留禁用状态及完整按钮名称', async () => {
  const press = vi.fn();
  const host = await mount(<SelectionActions layout="fullWidth" actions={[
    { label: '显示全部列', onPress: press, disabled: true },
    { label: '恢复默认显示', onPress: press },
  ]} />);
  expect(buttonNamed('显示全部列', host)?.disabled).toBe(true);
  await click(buttonNamed('显示全部列', host));
  expect(press).not.toHaveBeenCalled();
  await click(buttonNamed('恢复默认显示', host));
  expect(press).toHaveBeenCalledOnce();
});
