import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { SiteMark } from '../../src/react/components/site-mark';

it('旧响应缺少链接站标 ID 时直接显示通用图标，不发 undefined 请求', () => {
  const html = renderToStaticMarkup(<SiteMark linkId={undefined} />);
  expect(html).toContain('<svg');
  expect(html).not.toContain('<img');
  expect(html).not.toContain('undefined');
});

it('有链接 ID 与内置来源时仍使用各自的真实站标地址', () => {
  expect(renderToStaticMarkup(<SiteMark linkId={12} />)).toContain('/link-mark?id=12');
  expect(renderToStaticMarkup(<SiteMark source="github" />)).toContain('/site-icon/github.png');
});
