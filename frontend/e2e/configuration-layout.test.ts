import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Browser } from 'playwright-core';
import { launch, layout, settle, visit, VIEWPORTS } from './harness.ts';

describe('配置表单与行间距', () => {
  let browser: Browser;
  before(async () => { browser = await launch() });
  after(async () => { await browser?.close() });
  for (const viewport of VIEWPORTS) {
    it(`${viewport.name}：应用更新包说明和体积不越出视口`, async () => {
      const opened = await visit(browser, '/settings/library?section=' + encodeURIComponent('App & maintenance'), viewport);
      const { page } = opened;
      try {
        await page.route('**/api/configuration', async route => {
          const data = await (await route.fetch()).json();
          await route.fulfill({ json: { ...data, updates: { ...data.updates, installation: '独立测试包',
            state: 'available', latest_version: '1.0.0', message: '有新版本可下载。', package_kind: 'update',
            asset_size: 12 * 1048576, release_url: 'https://github.com/peach-mitao/peach/releases/tag/v1.0.0' },
            update_job: { state: 'idle', progress: 0 } } });
        });
        await page.reload();
        const region = page.getByRole('region', { name: 'Check for updates', exact: true });
        await region.getByText('App update package · 12.0 MB', { exact: true }).waitFor();
        assert.ok((await region.innerText()).includes('if tools are missing, damaged or change version, the required tool package is downloaded separately'));
        assert.equal(await region.getByRole('link', { name: 'Full installer', exact: true }).count(), 0);
        await settle(page);
        assert.ok((await layout(page)).scrollWidth <= viewport.width + 1);
        await region.screenshot({ path: `../build/update-download-${viewport.name}.png` });
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close() }
    });
    it(`${viewport.name}：挂载目录的Proxy traffic protection可切换且不越出视口`, async () => {
      const opened = await visit(browser, '/settings/library?section=' + encodeURIComponent('Library & import'), viewport);
      const { page } = opened;
      try {
        await page.route('**/api/configuration', async route => {
          const data = await (await route.fetch()).json();
          await route.fulfill({ json: { ...data, editable: true, windows: true, media_sources: [
            { location: 'onedrive', root: 'O:\\Movies', path: 'O:\\Movies', cost: 'metered' },
            { location: 'mounted', root: 'M:\\Movies', path: 'M:\\Movies', cost: 'free' },
            { location: 'guangya', root: 'G:\\Movies', path: 'G:\\Movies', cost: 'free' },
            { location: '115', root: 'B:\\Movies', path: 'B:\\Movies', cost: 'free' },
            { location: 'pikpak', root: 'A:\\Movies', path: 'A:\\Movies', cost: 'metered' },
          ] } });
        });
        await page.reload();
        const form = page.getByRole('form', { name: 'Media folders', exact: true });
        const protectedFolder = form.locator('[data-media-read-policy="0"] [aria-haspopup="listbox"]');
        await protectedFolder.waitFor();
        await page.waitForFunction(() => {
          const marks = [...document.querySelectorAll<HTMLImageElement>('[data-folder-row] img')];
          return marks.length === 8 && marks.every(image => image.complete && image.naturalWidth > 0);
        });
        const marks = await form.locator('[data-folder-row] img').evaluateAll(images => images.map(image => {
          const box = image.getBoundingClientRect();
          return { inline: image.getAttribute('src')?.startsWith('data:image/png;base64,'),
            width: box.width, height: box.height };
        }));
        assert.deepEqual(marks, Array.from({ length: 8 }, () => ({ inline: true, width: 16, height: 16 })));
        assert.ok(!(await form.innerText()).includes('(read-only)'));
        assert.ok((await protectedFolder.textContent())?.includes('Proxy traffic protection'));
        assert.ok((await form.locator('[data-media-read-policy="1"]').textContent())?.includes('Normal reads'));
        await protectedFolder.click();
        await page.getByRole('option', { name: 'Normal reads', exact: true }).click();
        await settle(page);
        assert.ok((await protectedFolder.textContent())?.includes('Normal reads'));
        assert.deepEqual((await layout(page)).offenders, []);
        await form.screenshot({ path: `../build/cloud-source-icons-${viewport.name}.png` });
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close() }
    });

    it(`${viewport.name}：PikPak 表单直接显示，登录按钮同排`, async () => {
      const opened = await visit(browser, '/settings/library?section=' + encodeURIComponent('Download channels'), viewport);
      const { page } = opened;
      try {
        await page.route('**/api/configuration/downloads', async route => {
          const body = await (await route.fetch()).json();
          await route.fulfill({ json: { ...body, available: true, pikpak: { ...body.pikpak, logged_in: false },
            pikpak_browser: { available: true, state: 'idle', message: '' } } });
        });
        await page.reload();
        const form = page.getByRole('form', { name: 'PikPak account', exact: true });
        await form.getByLabel('Account', { exact: true }).waitFor();
        assert.equal(await form.locator('details').count(), 0);
        const password = await form.getByRole('button', { name: 'Sign in', exact: true }).boundingBox();
        const browserLogin = await form.getByRole('button', { name: 'Sign in with browser', exact: true }).boundingBox();
        assert.ok(password && browserLogin && Math.abs(password.y - browserLogin.y) <= 1);
        assert.ok((await layout(page)).scrollWidth <= viewport.width + 1);
        await form.screenshot({ path: `../build/pikpak-form-${viewport.name}.png` });
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close() }
    });
    it(`${viewport.name}：完全卸载行与设置卡片正文对齐`, async () => {
      const opened = await visit(browser, '/settings/library?section=' + encodeURIComponent('App & maintenance'), viewport);
      const { page } = opened;
      try {
        await page.route('**/api/configuration', async route => {
          const data = await (await route.fetch()).json();
          await route.fulfill({ json: { ...data, uninstall: { ...data.uninstall, available: false } } });
        });
        await page.reload();
        const region = page.getByRole('region', { name: 'Uninstall Peach', exact: true });
        await region.getByText('Full uninstall', { exact: true }).waitFor();
        await settle(page);
        const geometry = await region.evaluate(node => {
          const card = node.lastElementChild!.getBoundingClientRect();
          const label = [...node.querySelectorAll('p')].find(item => item.textContent === 'Full uninstall')!.getBoundingClientRect();
          return { top: label.top - card.top, left: label.left - card.left };
        });
        assert.ok(geometry.top <= 12 && geometry.top >= 9, JSON.stringify(geometry));
        assert.ok(Math.abs(geometry.left - 12) <= 1, JSON.stringify(geometry));
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close() }
    });
  }
});
