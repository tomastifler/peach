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
        { label: 'Select all', onPress: () => setSelected(true) },
        { label: 'Select none', onPress: () => setSelected(false) },
        { label: 'Credential settings', href: '/settings/subscriptions' },
      ]} />;
  }
  const host = await mount(<Picker />);
  await click(buttonNamed('选择来源', host));
  const dialog = () => document.querySelector('[role="dialog"][aria-label="示例筛选"]')!;
  const checkbox = () => dialog().querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  expect(actionOrder(dialog().querySelector('[data-selection-actions]'))).toEqual(['Select all', 'Select none', 'Credential settings']);
  await click(buttonNamed('Select all', dialog()));
  expect(checkbox().checked).toBe(true);
  await click(checkbox());
  expect(checkbox().checked).toBe(false);
  expect(linkNamed('Credential settings', dialog())?.getAttribute('href')).toBe('/settings/subscriptions');
});

it('批量操作保留禁用状态及完整按钮名称', async () => {
  const press = vi.fn();
  const host = await mount(<SelectionActions layout="fullWidth" actions={[
    { label: 'Show all columns', onPress: press, disabled: true },
    { label: 'Restore default view', onPress: press },
  ]} />);
  expect(buttonNamed('Show all columns', host)?.disabled).toBe(true);
  await click(buttonNamed('Show all columns', host));
  expect(press).not.toHaveBeenCalled();
  await click(buttonNamed('Restore default view', host));
  expect(press).toHaveBeenCalledOnce();
});
