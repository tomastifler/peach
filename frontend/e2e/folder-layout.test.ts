import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Browser } from 'playwright-core';
import { launch, settle, VIEWPORTS, visit } from './harness.ts';

describe('文件夹反馈与滚动边界', () => {
  let browser: Browser;
  before(async () => { browser = await launch() });
  after(async () => { await browser?.close() });

  it('224px 目录栏里的短提示和重试在同一行，失败不显示空目录', async () => {
    let message = '演示回放未取得';
    const opened = await visit(browser, '/?browse=folders', VIEWPORTS[0]!, async page => {
      await page.route(url => url.pathname === '/api/folders', route => route.fulfill({
        status: 503, json: { message },
      }));
    });
    try {
      const note = opened.page.locator('#catalogFolderHeader [role="alert"]');
      await note.waitFor();
      await note.evaluate(element => { element.style.width = '224px' });
      const bounds = await note.evaluate(element => {
        const text = element.querySelector('p')!.getBoundingClientRect();
        const button = element.querySelector('button')!.getBoundingClientRect();
        return { text: text.toJSON(), button: button.toJSON() };
      });
      assert.ok(bounds.button.top < bounds.text.bottom, JSON.stringify(bounds));
      assert.equal(await opened.page.locator('#catalogFoldersTree [role="alert"]').count(), 0);
      assert.equal(await opened.page.locator('#catalogFoldersTree [data-empty-state]').count(), 0);
      message = '目录读取失败，请检查媒体库来源是否可用，然后重新读取文件夹。';
      await opened.page.reload({ waitUntil: 'load' });
      await note.waitFor();
      await note.evaluate(element => { element.style.width = '224px' });
      const wrapped = await note.evaluate(element => {
        const text = element.querySelector('p')!.getBoundingClientRect();
        const button = element.querySelector('button')!.getBoundingClientRect();
        return { below: button.top >= text.bottom + 8, overflow: element.scrollWidth > element.clientWidth };
      });
      assert.deepEqual(wrapped, { below: true, overflow: false });
    } finally { await opened.close() }
  });

  it('手机目录弹窗接管同一错误提示，关闭后恢复正文的重试入口', async () => {
    const opened = await visit(browser, '/?browse=folders', VIEWPORTS[1]!, async page => {
      await page.route(url => url.pathname === '/api/folders', route => route.fulfill({ status: 503, json: { message: '目录读取失败' } }));
    });
    try {
      const { page } = opened;
      await page.locator('#catalogFolderHeader [role="alert"]').waitFor();
      await page.getByRole('button', { name: '打开文件夹目录', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: '文件夹目录', exact: true });
      await dialog.getByRole('alert').waitFor();
      assert.equal(await page.locator('#catalogFolderHeader [role="alert"]').count(), 0);
      await dialog.getByRole('button', { name: '立即重试', exact: true }).click();
      await dialog.getByRole('button', { name: '关闭文件夹目录', exact: true }).click();
      await page.locator('#catalogFolderHeader [role="alert"]').waitFor();
    } finally { await opened.close() }
  });

  it('224px 目录空态标题完整占一行', async () => {
    const opened = await visit(browser, '/?browse=folders', VIEWPORTS[0]!, async page => {
      await page.route(url => url.pathname === '/api/folders', route => route.fulfill({ json: {
        roots: [], children: [], ancestors: [], matches: [], selected: null,
        rule: null, rules: [], conflicts: [], rules_revision: 0,
      } }));
    });
    try {
      const title = opened.page.locator('#catalogFoldersTree [data-empty-state] h3');
      await title.waitFor();
      const measured = await title.evaluate(element => ({ height: element.getBoundingClientRect().height,
        line: parseFloat(getComputedStyle(element).lineHeight) }));
      assert.ok(measured.height <= measured.line + 1, JSON.stringify(measured));
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close() }
  });

  it('目录树在矮窗口里可滚到首尾，页面滚动不遮挡目录', async () => {
    const roots = Array.from({ length: 45 }, (_, i) => ({
      id: `root-${i}`, name: `演示目录 ${String(i + 1).padStart(2, '0')}`, location: 'local',
      path: `R:\\演示\\${i}`, parent: null, root: `root-${i}`, videos: 1, files: 1, has_children: false,
    }));
    const opened = await visit(browser, '/?browse=folders', { ...VIEWPORTS[0]!, height: 560 }, async page => {
      await page.route(url => url.pathname === '/api/folders', route => route.fulfill({ json: {
        roots, children: roots, ancestors: [], matches: [], selected: null,
        rule: null, rules: [], conflicts: [], rules_revision: 0,
      } }));
    });
    try {
      const { page } = opened;
      await page.locator('#catalogFoldersTree [role="treegrid"]').waitFor();
      await settle(page, '#catalogFolderHeader');
      // 头像排取回之前先画两排占位；这份数据里没有人，取回后两排收起，目录栏才是量的那个高度。
      await page.locator('[data-catalog-root]:not([data-loading])').waitFor();
      for (const position of [0, 600, Number.MAX_SAFE_INTEGER, 0]) {
        await page.evaluate(async y => { scrollTo(0, y); await new Promise(requestAnimationFrame) }, position);
        for (const end of [false, true]) {
          const bounds = await page.locator('#catalogFoldersTree').evaluate(async (element, last) => {
            const scroller = element.querySelector('.folder-tree-scroller')!;
            scroller.scrollTop = last ? scroller.scrollHeight : 0;
            await new Promise(requestAnimationFrame);
            const rows = element.querySelectorAll('[role="row"]');
            const row = rows[last ? rows.length - 1 : 0]!;
            const box = row.getBoundingClientRect();
            const filter = document.querySelector('[data-catalog-frame]')!.getBoundingClientRect();
            return { top: box.top, bottom: box.bottom, filter: filter.bottom,
              viewport: innerHeight, height: scroller.clientHeight, overflow: scroller.scrollHeight > scroller.clientHeight };
          }, end);
          assert.ok(bounds.height >= 40 && bounds.overflow, JSON.stringify(bounds));
          assert.ok(bounds.top >= bounds.filter && bounds.bottom <= bounds.viewport - 8, JSON.stringify(bounds));
        }
      }
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close() }
  });
});
