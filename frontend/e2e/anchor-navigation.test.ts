import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Browser } from 'playwright-core';
import { launch, VIEWPORTS } from './harness.ts';
import { openItemPage } from './item-fixture.ts';

describe('跨页锚点定位', () => {
  let browser: Browser;
  before(async () => { browser = await launch() });
  after(async () => { await browser?.close() });
  for (const viewport of VIEWPORTS) {
    for (const reduced of [false, true]) {
      it(`${viewport.name}：内容就绪后定位，减少动态效果=${reduced}`, { timeout: 60_000 }, async () => {
        const opened = await openItemPage(browser, '/', viewport, { ready: '#grid [data-media-card]' });
        const { page } = opened;
        let release!: () => void;
        const waiting = new Promise<void>(resolve => { release = resolve });
        try {
          await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
          await page.route('**/api/orphan-records', async route => {
            await waiting;
            await route.fulfill({ json: { total: 1, items: [{ id: 100001, name: '示例影片.mp4', code: '',
              location: 'local', duration: 1, size: 100, vanished_at: 1, has_thumb: false,
              records: { play_count: 1 }, candidates: [] }] } });
          });
          await page.route('**/api/sources', route => route.fulfill({ json: { sources: [{
            location: 'local', online: true, roots: ['D:\\Media'], label: '本地',
          }] } }));
          await page.route('**/api/resource-sync/scan', route => route.fulfill({ json: { status: 'idle' } }));
          await page.route('**/api/resource-sync/apply', route => route.fulfill({ json: { status: 'idle' } }));
          await page.evaluate(() => {
            const scroll = Element.prototype.scrollIntoView;
            const calls: { id: string; behavior: string | undefined }[] = [];
            Object.assign(window, { anchorScrolls: calls });
            Element.prototype.scrollIntoView = function(options) {
              calls.push({ id: this.id, behavior: typeof options === 'object' ? options.behavior : undefined });
              return scroll.call(this, options);
            };
            const link = document.createElement('a');
            link.href = '/data-cleanup#resource-sync'; link.textContent = '打开资源同步';
            document.querySelector('#main')!.prepend(link);
          });
          const navigations: string[] = [];
          page.on('request', request => { if (request.isNavigationRequest()) navigations.push(request.url()) });
          await page.getByRole('link', { name: '打开资源同步', exact: true }).click();
          await page.waitForURL('**/data-cleanup#resource-sync');
          assert.deepEqual(navigations, [], '跨页锚点复用站内导航');
          await page.waitForTimeout(150);
          assert.equal(await page.locator('#resource-sync').count(), 0, '依赖内容就绪后再绘制和定位');
          release();
          await page.locator('#resource-sync').waitFor();
          await page.waitForFunction(expected => {
            const calls = (window as unknown as { anchorScrolls: { id: string; behavior: string }[] }).anchorScrolls;
            return calls.some(call => call.id === 'resource-sync' && call.behavior === expected);
          }, reduced ? 'instant' : 'smooth');
          await page.waitForFunction(() => {
            const target = document.getElementById('resource-sync')!;
            const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
            const padding = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
            const desired = Math.min(target.getBoundingClientRect().top + scrollY - margin - padding,
              document.documentElement.scrollHeight - innerHeight);
            return Math.abs(scrollY - desired) < 2;
          });
          const before = await page.locator('#resource-sync').evaluate(node => node.getBoundingClientRect().top);
          await page.waitForTimeout(200);
          assert.ok(Math.abs(await page.locator('#resource-sync').evaluate(node => node.getBoundingClientRect().top) - before) < 2);
          await page.evaluate(() => {
            Object.assign(window, { cleanupNode: document.getElementById('libraryProcessing') });
            const link = document.createElement('a');
            link.href = '#libraryProcessing'; link.textContent = '定位扫描与采集';
            document.getElementById('resource-sync')!.prepend(link);
          });
          await page.getByRole('link', { name: '定位扫描与采集', exact: true }).click();
          await page.waitForFunction(expected => {
            const state = window as unknown as { anchorScrolls: { id: string; behavior: string }[]; cleanupNode: Element };
            return state.anchorScrolls.some(call => call.id === 'libraryProcessing' && call.behavior === expected)
              && state.cleanupNode === document.getElementById('libraryProcessing');
          }, reduced ? 'instant' : 'smooth');
          assert.deepEqual(navigations, []);
          assert.deepEqual(opened.problems, []);
        } finally { release(); await opened.close() }
      });
    }
  }
});
