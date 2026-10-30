import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Browser } from 'playwright-core';
import { installDesignBrowser, PIXEL } from './design-fixture.ts';
import { requiredEnv, settle, visit, VIEWPORTS } from './harness.ts';

describe('任务页云下载布局', () => {
  let browser: Browser;
  installDesignBrowser((next) => { browser = next; });
  for (const viewport of VIEWPORTS) it(`${viewport.name} 追更问题展示来源原因和管理入口`, async () => {
    const opened = await visit(browser, '/tasks', viewport, async page => {
      await page.route('**/api/tasks*', route => route.fulfill({ json: {
        available: true, running: [], skipped: [], finished: [{ id: 4038, task_key: 'follow-check',
          task_label: '追更检查', trigger: 'scheduled', status: 'succeeded',
          finished_at: '2026-10-20T00:00:00Z', result_summary: { source_failed: 51,
            issues: Array.from({ length: 51 }, (_, index) => ({ source: 12 + index, label: `示例作者 ${index + 1}`,
              provider: '示例站点', kind: '检查失败', error: 'HTTP 403：站点拒绝访问' })) },
          error: '', parent_run_id: null, followup_key: '',
        }],
      } }));
    });
    try {
      const card = opened.page.locator('[data-run-id="4038"]');
      await card.getByText('发现问题', { exact: true }).waitFor();
      const disclosure = card.locator('summary').filter({ hasText: '问题详情 · 51 项' });
      assert.equal(await disclosure.getAttribute('aria-expanded'), 'false');
      assert.equal(await card.locator('[data-task-issues]').isVisible(), false);
      await disclosure.click();
      const errors = card.getByRole('region', { name: '任务问题详情' });
      await errors.waitFor();
      const geometry = await errors.evaluate((node) => ({ height: node.getBoundingClientRect().height,
        scrollable: node.scrollHeight > node.clientHeight, overlay: node.getAttribute('data-overlay-scrollbar') }));
      assert.ok(geometry.height > 0 && geometry.height <= 320, JSON.stringify(geometry));
      assert.equal(geometry.scrollable, true);
      assert.equal(geometry.overlay, 'true');
      await card.locator('summary').filter({ hasText: '技术详情' }).click();
      const background = await card.locator('[data-code-block]').first().evaluate((node) => getComputedStyle(node).backgroundColor);
      assert.equal(await errors.evaluate((node) => getComputedStyle(node.parentElement!).backgroundColor), background);
      assert.match(await card.locator('[data-task-issues]').innerText(), /示例作者.*示例站点.*检查失败/s);
      assert.match(await card.locator('[data-task-issues]').innerText(), /HTTP 403：站点拒绝访问/);
      assert.equal(await card.getByText('示例作者 1 · 示例站点 · 检查失败', { exact: true })
        .evaluate((node) => getComputedStyle(node).fontWeight), '400');
      const link = card.getByRole('link', { name: '查看关注来源', exact: true });
      assert.equal(await link.getAttribute('href'), '/subscriptions');
      await link.click();
      await opened.page.waitForURL('**/subscriptions');
      await opened.page.locator('[data-empty-state]').filter({ hasText: '还没有关注来源' }).waitFor();
      await settle(opened.page);
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close() }
  });
  for (const viewport of VIEWPORTS) it(`${viewport.name} 检查结果和技术代码块完整可读`, async () => {
    const result = { checked: 1218, total: 1218, gone_count: 5, unclear_count: 54,
      diagnostic: 'technical-detail-'.repeat(80) };
    const opened = await visit(browser, '/tasks', viewport, async page => {
      await page.route('**/api/downloads?*', route => route.fulfill({ json: { available: false, tasks: [], providers: [] } }));
      await page.route('**/api/tasks*', route => route.fulfill({ json: {
        available: true, running: [], skipped: [], finished_has_more: false, finished: [{
          id: 4037, task_key: 'link-check', task_label: '链接检查', trigger: 'manual', status: 'succeeded',
          started_at: '2026-10-01T00:00:00Z', finished_at: '2026-10-01T00:01:00Z',
          elapsed_seconds: 60, result_summary: result, error: '', parent_run_id: null, followup_key: '',
        }],
      } }));
    });
    try {
      const page = opened.page;
      const card = page.locator('[data-run-id="4037"]');
      await card.getByText('发现问题', { exact: true }).waitFor();
      assert.equal(await card.getByText('链接已失效 5', { exact: true }).count(), 1);
      assert.equal(await card.getByText('链接访问失败 54', { exact: true }).count(), 1);
      const resultLink = card.getByRole('link', { name: '查看有问题的链接' });
      assert.equal(await resultLink.getAttribute('href'), '/data-cleanup#link-manager');
      assert.equal(await resultLink.evaluate(link => getComputedStyle(link).textDecorationLine), 'none');
      await card.locator('summary').click();
      assert.equal(await card.locator('[data-code-block] code').textContent(), JSON.stringify(result, null, 2));
      const geometry = await card.locator('pre').evaluate(pre => ({
        overflows: pre.scrollWidth > pre.clientWidth,
        pageFits: document.documentElement.scrollWidth <= innerWidth,
        leftGap: pre.closest('[data-code-block]')!.getBoundingClientRect().left
          - pre.closest('[data-run-id]')!.getBoundingClientRect().left,
        bottomGap: pre.closest('[data-run-id]')!.getBoundingClientRect().bottom
          - pre.closest('[data-code-block]')!.getBoundingClientRect().bottom,
      }));
      assert.equal(geometry.overflows, true, '长行在代码块内部横向滚动');
      assert.equal(geometry.pageFits, true);
      assert.ok(Math.abs(geometry.leftGap - geometry.bottomGap) <= 1,
        '技术详情代码块的底部留白与卡片左右内边距一致');
      assert.equal(await card.getByRole('button', { name: '复制代码' }).count(), 1);
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close(); }
  });
  for (const viewport of VIEWPORTS) it(`${viewport.name} 左侧封面可见，番号完整，长标题可展开`, async () => {
    const title = '制作记录与采访合集：摄影、场景设计及幕后访谈 '.repeat(12);
    const assetId = Number(requiredEnv('PEACH_E2E_ITEM'));
    const opened = await visit(browser, '/tasks', viewport, async (page) => {
      await page.route('**/cover?*', (route) => route.fulfill({ contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="1480" height="1000"><path fill="#666" d="M0 0h1480v1000H0z"/><path fill="#ddd" d="M776 0h704v1000H776z"/><path fill="#c44" d="M776 0h704v12H776zM776 988h704v12H776z"/></svg>' }));
      await page.route('**/entity-image?*', (route) => route.fulfill({ contentType: 'image/png', body: Buffer.from(PIXEL, 'base64') }));
      await page.route('**/api/downloads?*', (route) => route.fulfill({ json: {
        available: false, providers: [], tasks: [{ id: 1, title, code: 'ABC-123', provider: '115',
          provider_label: '115', state: 'ingested', state_label: '已入库',
          postprocess_state: 'complete', postprocess_label: '整理完成', target: '/云下载',
          source_uri: '', submitted_at: '2026-10-01T00:00:00Z', asset_id: assetId,
          artwork: { id: 10, code: 'ABC-123', has_cover: true, cover_key: 'ABC-123',
            poster_box: { x0: 776, y0: 0, x1: 1480, y1: 1000, px: [1480, 1000], method: 'fold' },
            performer_entities: [{ id: 30, name: '测试女优', has_image: true }] } },
          { id: 2, title: '另一条下载任务', code: 'XYZ-456', provider: '115', provider_label: '115',
            state: 'failed', state_label: '失败', target: '/云下载', source_uri: '', submitted_at: '2026-10-01T00:00:00Z' }],
      } }));
    });
    try {
      const page = opened.page;
      const firstCard = page.locator('[data-download-id="1"]');
      await page.locator('[data-download-id="1"]').waitFor();
      await settle(page);
      await page.waitForFunction(async () => {
        const images = document.querySelectorAll<HTMLImageElement>(
          '[data-download-id="1"] [data-download-cover] img, [data-download-id="1"] [data-media-avatar] img');
        if (images.length !== 2) return false;
        try {
          await Promise.all([...images].map(image => image.decode()));
          return [...images].every(image => image.complete && image.naturalWidth > 0);
        } catch { return false; }
      });
      const geometry = await page.locator('[data-download-id="1"]').evaluate((card) => {
        const heading = card.querySelector('strong')!;
        const titleContent = heading.querySelector('a') || heading;
        const row = heading.parentElement!;
        const metadata = row.nextElementSibling!;
        const provider = [...metadata.querySelectorAll('span')].filter((span) => span.textContent === '115').at(-1)!;
        const detail = metadata.lastElementChild!;
        const cover = card.querySelector('[data-download-cover]')!;
        const detailColumn = cover.nextElementSibling!;
        const picture = cover.querySelector('img') as HTMLImageElement;
        const avatar = card.querySelector('[data-media-avatar] img') as HTMLImageElement;
        const code = document.createRange();
        const headingText = heading.querySelector('a')?.firstChild || heading.firstChild!;
        code.setStart(headingText, 0);
        code.setEnd(headingText, 'ABC-123'.length);
        const pictureBox = picture.getBoundingClientRect();
        const coverBox = cover.getBoundingClientRect();
        const other = document.querySelector('[data-download-id="2"]')!;
        const emptyCover = other.querySelector('[data-download-cover]')!;
        const emptyBox = emptyCover.getBoundingClientRect();
        const probe = document.createElement('span');
        probe.style.backgroundColor = 'var(--color-background-quaternary-default)';
        emptyCover.append(probe);
        const expectedGround = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return { title: heading.getBoundingClientRect().height,
          line: Number.parseFloat(getComputedStyle(heading).lineHeight),
          row: row.getBoundingClientRect().height, clipped: titleContent.scrollWidth > titleContent.clientWidth,
          overflow: document.documentElement.scrollWidth > window.innerWidth,
          providerTop: provider.getBoundingClientRect().top, metadataTop: detail.getBoundingClientRect().top,
          coverLeft: cover.getBoundingClientRect().left, textLeft: heading.getBoundingClientRect().left,
          coverTop: cover.getBoundingClientRect().top, coverBottom: cover.getBoundingClientRect().bottom,
          coverHeight: coverBox.height, coverRatio: coverBox.width / coverBox.height,
          panelLeft: pictureBox.left + pictureBox.width * 776 / 1480,
          panelRight: pictureBox.right, panelTop: pictureBox.top, panelBottom: pictureBox.bottom,
          coverRight: coverBox.right,
          backdrop: getComputedStyle(cover, '::before').backgroundImage,
          backdropFilter: getComputedStyle(cover, '::before').filter,
          coverWidth: coverBox.width, emptyWidth: emptyBox.width, emptyHeight: emptyBox.height,
          emptyGround: getComputedStyle(emptyCover).backgroundColor, expectedGround,
          otherTitleLeft: other.querySelector('strong')!.getBoundingClientRect().left,
          detailTop: detailColumn.getBoundingClientRect().top, detailBottom: detailColumn.getBoundingClientRect().bottom,
          coverReady: picture.complete && picture.naturalWidth > 0, avatarReady: avatar.complete && avatar.naturalWidth > 0,
          codeFits: code.getBoundingClientRect().width <= heading.clientWidth };
      });
      assert.equal(geometry.title, geometry.line);
      assert.ok(geometry.row < geometry.line * 2);
      assert.equal(geometry.clipped, true);
      assert.equal(geometry.codeFits, true, '番号不能被状态标签挤掉');
      assert.equal(geometry.overflow, false);
      assert.ok(geometry.coverLeft < geometry.textLeft);
      if (!viewport.mobile) {
        assert.equal(geometry.coverTop, geometry.detailTop);
        assert.equal(geometry.coverBottom, geometry.detailBottom);
      }
      assert.equal(geometry.coverReady, true);
      assert.ok(Math.abs(geometry.coverRatio - .75) < .01, '封面框复用首页 JAV 大图比例');
      assert.equal(geometry.coverWidth, geometry.emptyWidth, '各张卡片的封面列等宽');
      assert.equal(geometry.coverHeight, geometry.emptyHeight, '各张卡片的封面框等高');
      assert.equal(geometry.textLeft, geometry.otherTitleLeft, '各张卡片的标题起点对齐');
      assert.equal(geometry.emptyGround, geometry.expectedGround, '缺封面使用共享灰色占位底');
      await page.evaluate(() => {
        document.documentElement.dataset.theme = 'dark';
        document.documentElement.classList.add('dark');
      });
      const darkGround = await page.locator('[data-download-id="2"]').evaluate(card => ({
        card: getComputedStyle(card).backgroundColor,
        picture: getComputedStyle(card.querySelector('[data-download-cover]')!).backgroundColor,
      }));
      assert.notEqual(darkGround.picture, darkGround.card, '深色模式下占位与卡片背景须可分辨');
      assert.ok(geometry.panelLeft >= geometry.coverLeft - 1 && geometry.panelRight <= geometry.coverRight + 1
        && geometry.panelTop >= geometry.coverTop - 1 && geometry.panelBottom <= geometry.coverBottom + 1,
      `正封四边完整可见：${JSON.stringify(geometry)}`);
      assert.notEqual(geometry.backdrop, 'none', '正封比例留白使用同图补底');
      assert.ok(geometry.backdropFilter.includes('blur('), '补底复用首页模糊效果');
      assert.equal(geometry.avatarReady, true);
      assert.equal(await firstCard.locator('[data-download-cover]').getByText('无封面').count(), 0);
      assert.equal(geometry.providerTop, geometry.metadataTop, '来源文字与目录、时间没有对齐');
      await page.screenshot({ path: `../build/agent-verification/browser/activity-${viewport.name}.png`, fullPage: true });
      await firstCard.getByRole('button', { name: '展开标题', exact: true }).click();
      assert.equal(await page.locator('[data-download-title-full]').textContent(), `ABC-123 · ${title.trim()}`);
      assert.equal(await firstCard.locator('[data-download-cover]').evaluate(cover => cover.getBoundingClientRect().height), geometry.coverHeight);
      await firstCard.getByRole('button', { name: '收起标题', exact: true }).click();
      assert.equal(await page.locator('[data-download-title-full]').count(), 0);
      for (const selector of ['[data-download-cover-link]', '[data-download-title-link]']) {
        await page.locator(selector).click();
        await page.waitForURL(`**/assets/${assetId}`);
        await page.goBack();
        await page.locator('[data-download-id="1"]').waitFor();
        await settle(page);
      }
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close(); }
  });
});
