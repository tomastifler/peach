import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Browser } from 'playwright-core';
import { launch, layout, settle, visit, VIEWPORTS } from './harness.ts';

describe('资源清理提示与操作', () => {
  let browser: Browser;
  before(async () => { browser = await launch(); });
  after(async () => { await browser?.close(); });
  for (const viewport of VIEWPORTS) {
    it(`清理操作位于提示内并适应容器（${viewport.name}）`, async () => {
      const opened = await visit(browser, '/resource-sync', viewport, async page => {
        await page.route('**/api/resource-sync/scan', route => route.fulfill({ json: {
          status: 'complete', scan_id: 'layout-fixture', missing: 1, purge: 1, vanish: 0, empty: 203,
          cache: { files: 1858, bytes: 232783872 },
          sources: [{ location: 'local', online: true, total: 2553, missing: 1, empty: 203, unreadable: 0 }],
        } }));
        await page.route('**/api/resource-sync/apply', route => route.fulfill({ json: { status: 'idle' } }));
      });
      try {
        const { page } = opened;
        await page.locator('#resource-sync').waitFor();
        await page.getByRole('button', { name: '清理失效条目', exact: true }).waitFor();
        await settle(page);
        const note = page.locator('#resource-sync [role="note"]').filter({ hasText: '清理内容' });
        assert.equal(await note.getByRole('button', { name: '清理失效条目', exact: true }).count(), 1);
        const boxes = await note.evaluate(node => {
          const box = (element: Element) => {
            const rect = element.getBoundingClientRect();
            return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
          };
          return { note: box(node), text: box(node.querySelector('[data-note-layout] > div')!),
            action: box(node.querySelector('[data-note-action]')!) };
        });
        assert.ok(boxes.action.left >= boxes.note.left && boxes.action.right <= boxes.note.right);
        assert.ok(boxes.action.bottom <= boxes.note.bottom);
        if (viewport.mobile) assert.ok(boxes.action.top >= boxes.text.bottom);
        else assert.ok(boxes.action.left >= boxes.text.right);
        assert.deepEqual((await layout(page)).offenders, []);
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close(); }
    });
  }
});
