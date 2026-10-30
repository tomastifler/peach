import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Browser } from 'playwright-core';
import { configurationBody, expectBody, launch, layout, requiredEnv, settle, visit, VIEWPORTS } from './harness.ts';

describe('普通 HTTP 的配置与播放', () => {
  let browser: Browser;
  before(async () => { browser = await launch() });
  after(async () => { await browser?.close() });

  for (const viewport of VIEWPORTS) {
    it(`${viewport.name}：非安全来源打开配置、编辑索引器并挂载播放器`, { timeout: 60_000 }, async t => {
      let phase = '准备演示服务';
      t.after(() => { if (t.signal.aborted) t.diagnostic(`HTTP 配置用例超时阶段：${phase}`); });
      const service = requiredEnv('PEACH_E2E_ORIGIN');
      const origin = 'http://peach-http.test';
      const opened = await visit(browser, '/', viewport, async page => {
        // 只将临时演示服务映射到普通 HTTP 来源；浏览器自行决定 Web Crypto 的可用性。
        // 跳转与关页会取消还在转发的请求（播放器的拉流尤其如此），那一趟落空不算失败；其余错误照常抛出。
        await page.route(`${origin}/**`, async route => {
          const request = route.request();
          const url = new URL(request.url());
          try {
            const response = await route.fetch({ url: service + url.pathname + url.search, maxRedirects: 0,
              headers: { ...request.headers(), host: new URL(service).host, origin: service } });
            await route.fulfill({ response });
          } catch (error) {
            if (!/already handled|disposed|closed/i.test(String(error))) throw error;
          }
        });
      });
      const { page, problems } = opened;
      try {
        const response = await page.request.get(`${service}/api/configuration`);
        assert.equal(response.status(), 200);
        const configuration = await response.json();
        // 路由拦截只处理重定向的首个请求；别名契约在服务端读取，页面走正式入口。
        const alias = await page.request.get(`${service}/configuration`, { maxRedirects: 0 });
        assert.equal(alias.status(), 307);
        assert.equal(alias.headers().location, '/settings/library');
        await page.route(`${origin}/api/configuration`, route => route.fulfill({ json: { ...configuration, editable: true } }));
        const writes: { indexers: { key: string; name: string; url: string }[] }[] = [];
        await page.route(`${origin}/api/configuration/indexers`, route => {
          if (route.request().method() === 'GET') return route.fulfill({ json: { indexers: [], max_indexers: 4 } });
          const sent = route.request().postDataJSON();
          writes.push(sent);
          return route.fulfill({ json: { ...sent, max_indexers: 4 } });
        });
        page.on('response', response => {
          if (response.url().startsWith(origin) && response.status() >= 400) problems.push(`${response.status()} ${response.url()}`);
        });
        for (const path of ['/settings/library', '/settings/subscriptions']) {
          phase = `打开 ${path}`;
          await page.goto(origin + path, { waitUntil: 'load' });
          assert.deepEqual(await page.evaluate(() => ({
            secure: isSecureContext, uuid: typeof crypto.randomUUID, random: typeof crypto.getRandomValues,
          })), { secure: false, uuid: 'undefined', random: 'function' });
          phase = `等待 ${path} 配置主体`;
          await expectBody(page, path, configurationBody(page));
          await page.getByRole('tab', { name: 'Sources & subscriptions', exact: true }).click();
          const section = page.getByRole('form', { name: 'Resource search', exact: true });
          phase = `编辑 ${path} 索引器`;
          await section.getByRole('button', { name: 'Add indexer', exact: true }).click();
          await section.getByRole('button', { name: 'Add indexer', exact: true }).click();
          await section.getByRole('textbox', { name: /Name/ }).nth(1).fill('HTTP 测试');
          await section.getByRole('textbox', { name: /Torznab address/ }).nth(1).fill('https://indexer.example/api');
          await section.getByRole('button', { name: '移除索引器 1', exact: true }).click();
          phase = `保存 ${path} 索引器`;
          const saved = page.waitForResponse(response => response.url() === `${origin}/api/configuration/indexers`
            && response.request().method() === 'POST');
          await section.getByRole('button', { name: 'Save settings', exact: true }).click();
          assert.equal((await saved).status(), 200);
          assert.equal(writes.at(-1)!.indexers.length, 1);
          assert.equal(writes.at(-1)!.indexers[0]!.name, 'HTTP 测试');
          phase = `等待 ${path} 保存后布局`;
          await settle(page, '.ui-configpage');
          const bounds = await layout(page);
          assert.ok(bounds.scrollWidth <= bounds.viewportWidth);
          assert.deepEqual(bounds.offenders, []);
        }
        phase = '打开播放器';
        await page.goto(`${origin}/assets/${requiredEnv('PEACH_E2E_ITEM')}`, { waitUntil: 'load' });
        phase = '等待播放器挂载';
        await page.locator('#stage .video-js video.vjs-tech').waitFor();
        assert.deepEqual(problems, []);
      } finally {
        phase = '离开播放器页面';
        await page.goto('about:blank');
        phase = '等待请求转发结束';
        await page.unrouteAll({ behavior: 'wait' });
        phase = '关闭浏览器上下文';
        await opened.close();
      }
    });
  }
});
