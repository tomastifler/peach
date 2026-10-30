import { act } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { RatingStars } from '../../src/react/components/rating-stars';
import { CatalogRating } from '../../src/react/catalog-grid/catalog-table-controls';
import { queryClient } from '../../src/react/query';
import { click, mountRoot, settle } from './render';

afterEach(() => queryClient.clear());

it('评分按钮提供当前星级与取消名称，忙态阻止重复评分并保留焦点能力', async () => {
  const rate = vi.fn();
  const root = await mountRoot(<RatingStars value={3} onRate={rate} />);
  await click(root.host.querySelector('button[aria-label="评为 4 星"]'));
  expect(rate).toHaveBeenLastCalledWith(4);
  await click(root.host.querySelector('button[aria-label="取消评分（当前 3 星）"]'));
  expect(rate).toHaveBeenLastCalledWith(3);
  await root.rerender(<RatingStars value={3} onRate={rate} busyStar={4} />);
  const buttons = [...root.host.querySelectorAll('button')];
  expect(buttons.every(button => button.getAttribute('aria-disabled') === 'true' && !button.disabled)).toBe(true);
  expect(root.host.querySelector('[role="status"]')?.getAttribute('aria-label')).toBe('正在保存评分');
  await click(buttons[4]);
  expect(rate).toHaveBeenCalledTimes(2);
});

it('只读评分保留小数填充且不提供写入按钮', async () => {
  const { host } = await mountRoot(<RatingStars value={3.5} />);
  expect(host.querySelectorAll('[data-rate]')).toHaveLength(5);
  expect(host.querySelectorAll('button')).toHaveLength(0);
  expect([...host.querySelectorAll<HTMLElement>('[data-rating-fill]')].map(node => node.style.width))
    .toEqual(['100%', '100%', '100%', '50%', '0%']);
});

it('表格评分成功同步列表与详情缓存，失败保留原因并支持重试', async () => {
  const item = { id: 1, rating: 60 };
  queryClient.setQueryData(['catalog-grid', 'table', 'fixture'], { items: [item], total: 1 });
  queryClient.setQueryData(['item', 1], { ...item, name: '示例影片' });
  const rate = vi.fn(async (_item, _star, changed) => { changed(80) });
  const root = await mountRoot(<CatalogRating item={item} actions={{ rate }} />);
  await click(root.host.querySelector('button[aria-label="评为 4 星"]'));
  await settle();
  expect(queryClient.getQueryData(['item', 1])).toMatchObject({ id: 1, rating: 80, name: '示例影片' });
  expect(queryClient.getQueryData(['catalog-grid', 'table', 'fixture'])).toMatchObject({ items: [{ id: 1, rating: 80 }] });
  rate.mockRejectedValueOnce(new Error('示例评分失败'));
  await click(root.host.querySelector('button[aria-label="评为 5 星"]'));
  await settle();
  expect(root.host.textContent).toContain('示例评分失败');
  const retry = [...root.host.querySelectorAll('button')].find(button => button.getAttribute('aria-label') === '立即重试评分')!;
  await act(async () => retry.click());
  await settle();
  expect(rate).toHaveBeenCalledTimes(3);
  expect(root.host.textContent).not.toContain('示例评分失败');
});
