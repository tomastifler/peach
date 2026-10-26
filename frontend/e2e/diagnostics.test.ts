import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Browser } from 'playwright-core';
import { installDesignBrowser } from './design-fixture.ts';
import { layout, settle, visit, VIEWPORTS } from './harness.ts';

describe('配置中的系统诊断', () => {
  let browser: Browser;
  installDesignBrowser(next => { browser = next; });
  for (const viewport of VIEWPORTS) {
    it(`方形站标、状态标签与可识别的作品表格（${viewport.name}）`, { timeout: 60_000 }, async () => {
      const opened = await visit(browser, '/settings/diagnostics', viewport, async page => {
        await page.route('**/api/diagnostics', async route => {
          const report = await (await route.fetch()).json();
          report.checks.media_mounts = { label: 'Media mounts', status: 'warning', reason: 'Media folder does not exist',
            action: 'Check media folders', target: '/settings/library', details: {} };
          report.library.groups.cover = { label: 'Missing covers', status: 'ok', count: 31, truncated: false,
            items: Array.from({ length: 31 }, (_, index) => ({ id: index + 1, code: null,
              title: `演示条目 ${index + 1}`, name: `演示文件 ${index + 1}.mp4`,
              path: `R:\\Media\\演示文件 ${index + 1}.mp4`, location: 'local', duration: 123, size: 1048576 })) };
          await route.fulfill({ json: report });
        });
      });
      try {
        const { page } = opened;
        const icon = page.locator('[data-diagnostic-source="minnano-av"] img');
        await icon.waitFor();
        assert.equal(await icon.evaluate(node => getComputedStyle(node).borderRadius), '0px');
        const badge = page.locator('[data-diagnostic-check="media_mounts"] [data-diagnostic-status="warning"]');
        await badge.waitFor();
        assert.notEqual(await badge.evaluate(node => getComputedStyle(node).backgroundColor), 'rgba(0, 0, 0, 0)');
        await page.locator('summary').filter({ hasText: 'Missing covers · 31 items' }).click();
        const table = page.getByRole('grid', { name: 'Missing covers', exact: true });
        await table.waitFor();
        assert.equal(await table.getByRole('row').count(), 21);
        assert.ok((await table.innerText()).includes('演示文件 1.mp4'));
        assert.ok((await table.innerText()).includes('R:\\Media\\演示文件 1.mp4'));
        const pagination = page.getByRole('navigation', { name: 'Missing covers pagination' });
        await pagination.getByRole('button', { name: 'Next', exact: true }).click();
        assert.equal(await table.getByRole('row').count(), 12);
        assert.ok((await table.innerText()).includes('演示条目 21'));
        assert.ok((await layout(page)).scrollWidth <= viewport.width);
        assert.deepEqual(opened.problems, []);
        await page.goto(new URL('/sources', page.url()).href);
        const settingsIcon = page.locator('form[aria-label="MGStage"] img');
        await settingsIcon.waitFor();
        assert.equal(await settingsIcon.evaluate(node => getComputedStyle(node).borderRadius), '0px');
      } finally { await opened.close(); }
    });
    it(`配置导航停在搜索栏下方，分区切换保持正文可见（${viewport.name}）`, { timeout: 60_000 }, async () => {
      const opened = await visit(browser, '/settings/diagnostics', viewport);
      try {
        const { page } = opened;
        await page.locator('article[data-diagnostic-source]').first().waitFor();
        await settle(page);
        await page.evaluate(() => window.scrollTo(0, 650));
        const nav = page.getByRole('tablist', { name: 'Settings sections' });
        const pinned = await nav.evaluate(element => ({ nav: element.getBoundingClientRect().top,
          search: document.querySelector('.top')!.getBoundingClientRect().bottom }));
        assert.ok(pinned.nav >= pinned.search + 7, JSON.stringify(pinned));
        assert.ok(pinned.nav <= pinned.search + 9, JSON.stringify(pinned));
        await nav.getByRole('tab', { name: 'Network & access', exact: true }).click();
        await settle(page);
        const visible = await page.locator('.ui-board-group-active').evaluate(element => ({ panel: element.getBoundingClientRect().top,
          nav: document.querySelector('.ui-board-local-nav')!.getBoundingClientRect().bottom,
          search: document.querySelector('.top')!.getBoundingClientRect().bottom }));
        assert.ok(visible.panel >= (viewport.mobile ? visible.nav : visible.search), JSON.stringify(visible));
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close(); }
    });
    it(`诊断深链等待时保留分区与正文布局（${viewport.name}）`, { timeout: 60_000 }, async () => {
      const opened = await visit(browser, '/settings/library', viewport);
      let release!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      try {
        const { page } = opened;
        await page.route('**/api/diagnostics', async route => { await gate; await route.continue(); });
        await page.goto(new URL('/settings/diagnostics', page.url()).href);
        const skeleton = page.locator('[data-skeleton="board/settings/diagnostics"]');
        await skeleton.waitFor();
        assert.equal(await skeleton.locator('.ui-board-local-nav [aria-selected="true"]').textContent(), 'System diagnostics');
        assert.equal(await skeleton.locator('section[aria-label="Media folders"]').count(), 0);
        assert.equal(await skeleton.locator('[data-skeleton="diagnostics"]').count(), 1);
        const pending = await skeleton.locator('.ui-configpage').evaluate(element => {
          const body = element.lastElementChild!.getBoundingClientRect();
          return { x: body.x, width: body.width };
        });
        release();
        await page.getByRole('tab', { name: 'System diagnostics', selected: true }).waitFor();
        await page.locator('article[data-diagnostic-source]').first().waitFor();
        await settle(page);
        const ready = await page.locator('.ui-board-group-active').boundingBox();
        assert.ok(Math.abs(ready!.x - pending.x) <= 1, JSON.stringify({ pending, ready }));
        assert.ok(Math.abs(ready!.width - pending.width) <= 1, JSON.stringify({ pending, ready }));
        assert.deepEqual(opened.problems, []);
      } finally { release(); await opened.close(); }
    });
    it(`入口、错误层级与来源卡片（${viewport.name}）`, { timeout: 60_000 }, async () => {
      const opened = await visit(browser, '/settings/library', viewport);
      try {
        const { page } = opened;
        await page.route('**/api/diagnostics', async route => {
          const report = await (await route.fetch()).json();
          report.checks.media_mounts = { label: 'Media mounts', status: 'warning', reason: 'Local disk: folder does not exist',
            action: 'Check media folders and mount status', target: '/settings/library', details: {} };
          await route.fulfill({ json: report });
        });
        await page.getByRole('tab', { name: 'System diagnostics', exact: true }).click();
        await page.locator('section[aria-label="Source sessions"]').waitFor();
        await settle(page);
        assert.equal(new URL(page.url()).pathname, '/settings/diagnostics');
        const source = page.locator('article[data-diagnostic-source]').first();
        assert.ok(await page.locator('article[data-diagnostic-source]').count() > 1);
        assert.ok(await source.locator('img').getAttribute('src'));
        const shape = await source.evaluate(element => {
          const next = element.nextElementSibling!;
          return { gap: next.getBoundingClientRect().top - element.getBoundingClientRect().bottom,
            background: getComputedStyle(element.firstElementChild!).backgroundColor };
        });
        assert.ok(shape.gap >= 12);
        assert.notEqual(shape.background, 'rgba(0, 0, 0, 0)');
        const row = page.locator('[data-diagnostic-check="media_mounts"]');
        if (await row.count()) {
          const shown = await row.evaluate(element => {
            const title = element.querySelector('h3')!;
            const reason = element.querySelector('[data-check-reason]')!;
            const button = element.querySelector('button')!;
            const box = element.getBoundingClientRect();
            const action = button.getBoundingClientRect();
            return { titleWeight: getComputedStyle(title).fontWeight, reasonWeight: getComputedStyle(reason).fontWeight,
              titleSize: getComputedStyle(title).fontSize, reasonSize: getComputedStyle(reason).fontSize,
              middle: Math.abs((box.top + box.bottom - action.top - action.bottom) / 2),
              right: box.right - action.right };
          });
          assert.ok(shown.titleWeight !== shown.reasonWeight || shown.titleSize !== shown.reasonSize);
          if (!viewport.mobile) {
            assert.ok(shown.middle <= 2, JSON.stringify(shown));
            assert.ok(shown.right <= 24, JSON.stringify(shown));
          }
        }
        assert.ok((await layout(page)).scrollWidth <= viewport.width);
        await page.locator('summary').filter({ hasText: /Other checks ·/ }).click();
        const groups = page.locator('[data-diagnostic-group]');
        assert.ok(await groups.count() > 1);
        const grouping = await groups.first().evaluate(element => {
          const heading = element.querySelector('h3')!;
          const card = heading.nextElementSibling!;
          const item = card.querySelector('h4')!;
          return { title: parseFloat(getComputedStyle(heading).fontSize), item: parseFloat(getComputedStyle(item).fontSize),
            background: getComputedStyle(card).backgroundColor, gap: element.nextElementSibling!.getBoundingClientRect().top - element.getBoundingClientRect().bottom };
        });
        assert.ok(grouping.title > grouping.item);
        assert.notEqual(grouping.background, 'rgba(0, 0, 0, 0)');
        assert.ok(grouping.gap >= 20);
        assert.deepEqual(opened.problems, []);
        await page.reload();
        await page.getByRole('tab', { name: 'System diagnostics', selected: true }).waitFor();
        await page.locator('section[aria-label="Source sessions"]').waitFor();
      } finally { await opened.close(); }
    });
  }
});
