import { expect, it, vi } from 'vitest';

it('独立页面的 API 错误反馈不初始化界面分段器', async () => {
  vi.resetModules();
  const segmenter = vi.spyOn(Intl, 'Segmenter');
  const { errorMessage } = await import('../src/api');
  expect(errorMessage(new TypeError('Failed to fetch'))).toContain('Cannot connect to the Peach service');
  expect(segmenter).not.toHaveBeenCalled();
});
