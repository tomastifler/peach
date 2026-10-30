import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Browser } from 'playwright-core';
import { launch, requiredEnv, VIEWPORTS } from './harness.ts';

describe('外壳首帧', () => {
  let browser: Browser;
  before(async () => { browser = await launch() });
  after(async () => { await browser.close() });
  for (const viewport of VIEWPORTS) for (const theme of ['light', 'dark']) for (const sidebar of ['open', 'closed']) {
    it(`${viewport.name} ${theme} ${sidebar} 主包到达前媒体库和侧栏按钮保持最终几何`, async () => {
      const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
      let release = () => {};
      const held = new Promise<void>(resolve => { release = resolve });
      try {
        await context.addInitScript(({ theme, sidebar }) => {
          localStorage.setItem('peach.settings.v1', JSON.stringify({ theme, detailAutoplay: false }));
          sessionStorage.setItem('board.sidebar', sidebar);
        }, { theme, sidebar });
        const page = await context.newPage();
        await page.route('**/dist/peach-app.js', async route => { await held; await route.continue() });
        await page.goto(requiredEnv('PEACH_E2E_ORIGIN') + '/', { waitUntil: 'commit' });
        await page.waitForFunction(() => document.querySelector('[data-sidebar-head] #brandHome'), null, { timeout: 5000 });
        const read = () => page.evaluate(() => {
          const rect = (selector: string) => {
            const el = document.querySelector(selector)!;
            const b = el.getBoundingClientRect(), css = getComputedStyle(el);
            return { x: b.x, y: b.y, width: b.width, height: b.height, display: css.display };
          };
          return { toggle: rect('#filterBtn'), search: rect('.top .search'),
            expanded: document.querySelector('#filterBtn')!.getAttribute('aria-expanded'),
            inTop: !!document.querySelector('.top>#filterBtn') };
        });
        const waiting = await read();
        assert.equal(await page.locator('#brandHome h1').textContent(), '全部媒体库');
        assert.equal(await page.locator('#brandHome img').count(), 0);
        assert.equal(await page.locator('.top>#brandHome').count(), 0);
        assert.equal(waiting.expanded, String(!viewport.mobile && sidebar === 'open'));
        assert.equal(waiting.inTop, viewport.mobile);
        release();
        await page.waitForFunction(() => document.querySelector('[data-sidebar-nav] [data-nav]'), null, { timeout: 5000 });
        await page.locator('#brandHome[aria-haspopup="dialog"]').waitFor({ state: viewport.mobile ? 'attached' : 'visible' });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert.deepEqual(await read(), waiting);
        assert.equal(await page.locator('#brandHome .board-library-chevron').count(), 1);
        assert.equal(await page.locator('#filterBtn').count(), 1);
      } finally { release(); await context.close() }
    });
  }
});
