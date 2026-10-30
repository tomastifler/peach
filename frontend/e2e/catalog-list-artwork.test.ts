import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Browser } from 'playwright-core';
import { launch, layout, VIEWPORTS, visit } from './harness.ts';

describe('列表缩略图取景', () => {
  let browser: Browser;
  before(async () => { browser = await launch() });
  after(async () => { await browser?.close() });
  const examples = [
    { id: 9101, code: 'DEMO-001', width: 640, height: 900 },
    { id: 9102, code: 'DEMO-002', width: 2184, height: 1468 },
    { id: 9103, code: 'DEMO-003', width: 1920, height: 1080 },
    { id: 9104, code: '', width: 1920, height: 1080 },
  ];
  for (const viewport of VIEWPORTS) it(`${viewport.name}：正封、封套与剧照完整可见，预览填满缩略图`, async () => {
    const opened = await visit(browser, '/', viewport, async page => {
      await page.route(url => url.pathname === '/api/items', route => route.fulfill({ json: {
        items: examples.map(row => ({ ...row, name: `示例影片 ${row.id}`, location: 'local', medium: 'video',
          is_jav: !!row.code, has_cover: !!row.code, has_thumb: true, tags: [], performers: [] })),
        total: examples.length, has_more: false,
      } }));
      await page.route(url => ['/cover', '/poster'].includes(url.pathname), route => {
        const url = new URL(route.request().url());
        const art = examples.find(row => row.code && row.code === url.searchParams.get('code')) || examples[3]!;
        return route.fulfill({ contentType: 'image/svg+xml', body:
          `<svg xmlns="http://www.w3.org/2000/svg" width="${art.width}" height="${art.height}"><rect width="100%" height="100%" fill="gray"/><circle cx="50%" cy="10%" r="24" fill="white"/></svg>` });
      });
    });
    try {
      const { page } = opened;
      await page.locator('#grid [data-media-card]').first().waitFor();
      await page.getByRole('radiogroup', { name: '馆藏显示方式' }).locator('label')
        .filter({ has: page.getByRole('radio', { name: '列表', exact: true }) }).click();
      for (const example of examples) {
        const image = page.locator(`[data-catalog-row] img${example.code ? `[data-cover-code="${example.code}"]` : ':not(.cover)'}`);
        await image.scrollIntoViewIfNeeded();
        await image.evaluate((img: HTMLImageElement) => img.decode());
        const geometry = await image.evaluate((img: HTMLImageElement) => {
          const box = img.getBoundingClientRect(), css = getComputedStyle(img);
          const scale = css.objectFit === 'contain' ? Math.min(box.width / img.naturalWidth, box.height / img.naturalHeight)
            : Math.max(box.width / img.naturalWidth, box.height / img.naturalHeight);
          return { fit: css.objectFit, width: box.width, height: box.height,
            paintedWidth: img.naturalWidth * scale, paintedHeight: img.naturalHeight * scale };
        });
        assert.equal(geometry.fit, example.code ? 'contain' : 'cover', JSON.stringify(geometry));
        if (example.code) {
          assert.ok(geometry.paintedWidth <= geometry.width + 1 && geometry.paintedHeight <= geometry.height + 1, JSON.stringify(geometry));
        }
      }
      const measured = await layout(page);
      assert.ok(measured.scrollWidth <= measured.viewportWidth + 1, JSON.stringify(measured));
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close() }
  });
});
