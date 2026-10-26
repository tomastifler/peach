import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import type { Browser } from 'playwright-core';
import { launch, layout, settle, VIEWPORTS, visit } from './harness.ts';

describe('首页文件夹浏览', () => {
  let browser: Browser;
  before(async () => { browser = await launch() });
  after(async () => { await browser?.close() });

  for (const viewport of VIEWPORTS) {
    it(`${viewport.name} 目录范围、首页控件、用途预览和返回导航共用馆藏`, { timeout: 90_000 }, async () => {
      const opened = await visit(browser, '/?browse=folders&loc=local', viewport);
      const { page } = opened;
      try {
        const response = await page.request.get(new URL('/api/folders?loc=local', page.url()).toString());
        assert.equal(response.status(), 200);
        const tree = await response.json();
        const root = tree.roots[0];
        assert.ok(root, '演示库应有一个本地目录根');
        await page.locator('#catalogFolderHeader').getByRole('button', { name: root.name, exact: true }).click();
        await page.waitForFunction(key => new URLSearchParams(location.search).get('folder') === key, root.id);
        await page.locator('#grid [data-media-card]').first().waitFor();
        await page.getByRole('navigation', { name: 'Folder path' }).getByText(root.name, { exact: true }).waitFor();
        await page.locator('[data-catalog-filter] [data-catalog-views]').waitFor();
        assert.ok(await page.locator('[data-catalog-filter] [data-entity-sorts]').isVisible());
        assert.equal(await page.locator('#grid [data-mix-card]').count(), 0);
        const screenshots = join('..', 'build', 'agent-verification', 'folders');
        mkdirSync(screenshots, { recursive: true });
        await page.screenshot({ path: join(screenshots, `${viewport.name}.png`), fullPage: false });
        if (viewport.mobile) {
          await page.getByRole('button', { name: 'Open folder directory', exact: true }).click();
          const dialog = page.getByRole('dialog', { name: 'Folder directory', exact: true });
          await dialog.getByRole('treegrid', { name: 'Media folders' }).waitFor();
          await page.screenshot({ path: join(screenshots, 'mobile-tree.png'), fullPage: false });
          await dialog.getByRole('button', { name: 'Close folder directory' }).click();
        } else {
          await page.locator('#catalogFoldersTree').getByRole('treegrid', { name: 'Media folders' }).waitFor();
          for (const width of [1280, 1120]) {
            await page.setViewportSize({ width, height: 800 });
            await page.evaluate(async () => {
              window.scrollTo(0, 450);
              await new Promise(requestAnimationFrame);
              await new Promise(requestAnimationFrame);
            });
            const bounds = await page.evaluate(() => {
              const filter = document.querySelector('[data-catalog-frame]')!.getBoundingClientRect();
              const tree = document.getElementById('catalogFoldersTree')!.getBoundingClientRect();
              return { filterBottom: filter.bottom, treeTop: tree.top, treeBottom: tree.bottom, viewport: innerHeight };
            });
            await page.screenshot({ path: join(screenshots, `desktop-scrolled-${width}.png`), fullPage: false });
            assert.ok(bounds.treeTop >= bounds.filterBottom + 8, JSON.stringify(bounds));
            assert.ok(bounds.treeBottom <= bounds.viewport - 8, JSON.stringify(bounds));
          }
          await page.setViewportSize({ width: viewport.width, height: viewport.height });
          await page.evaluate(() => window.scrollTo(0, 0));
          const rootPage = await (await page.request.get(new URL(`/api/folders?loc=local&folder=${root.id}`, page.url()).toString())).json();
          const child = rootPage.children[0];
          if (child) {
            await page.locator('#catalogFoldersTree').getByRole('row', { name: child.name, exact: true }).click();
            await page.waitForFunction(key => new URLSearchParams(location.search).get('folder') === key, child.id);
            await page.goBack();
            await page.waitForFunction(key => new URLSearchParams(location.search).get('folder') === key, root.id);
          }
        }
        await page.getByRole('button', { name: 'Set folder purpose', exact: true }).click();
        const rule = page.getByRole('dialog', { name: 'Set folder purpose', exact: true });
        await rule.getByRole('button', { name: 'Preview impact', exact: true }).click();
        await rule.getByRole('region', { name: 'Folder purpose scope' }).waitFor();
        await page.screenshot({ path: join(screenshots, `${viewport.name}-rule.png`), fullPage: false });
        await rule.getByRole('button', { name: 'Save folder purpose', exact: true }).click();
        await rule.waitFor({ state: 'hidden' });
        const saved = await (await page.request.get(new URL(`/api/folders?loc=local&folder=${root.id}`, page.url()).toString())).json();
        assert.equal(saved.rule.purpose, 'category');
        await page.getByRole('button', { name: 'Set folder purpose', exact: true }).click();
        await page.getByRole('dialog', { name: 'Set folder purpose', exact: true }).getByRole('button', { name: 'Remove rule', exact: true }).click();
        await page.getByRole('button', { name: 'Remove folder rule', exact: true }).click();
        await page.getByRole('dialog', { name: 'Remove folder rule', exact: true }).waitFor({ state: 'hidden' });
        await page.getByRole('dialog', { name: 'Set folder purpose', exact: true }).waitFor({ state: 'hidden' });
        await page.getByRole('button', { name: 'Folder mode', exact: true }).click();
        await page.waitForFunction(() => !new URLSearchParams(location.search).has('browse'));
        assert.equal(await page.locator('#catalogFolderHeader').isVisible(), false);
        await page.goBack();
        await page.getByRole('navigation', { name: 'Folder path' }).waitFor();
        assert.equal(new URL(page.url()).searchParams.get('folder'), root.id);
        await settle(page, '#catalogFolderHeader');
        const geometry = await layout(page);
        assert.ok(geometry.scrollWidth <= geometry.viewportWidth + 1, JSON.stringify(geometry));
        assert.deepEqual(opened.problems.filter(line => !line.includes('VIDEOJS')), []);
      } finally { await opened.close() }
    });
  }
});
