/* The whole first-run page flow: load, enter wrong values, write errors back in place, correct them, reach the done state.
 *
 * Runs against `peach serve --setup`, not the already-configured server used by the route smoke tests. The server and
 * the temporary Peach data directory are prepared by `SetupE2ETests` in `tests/test_web_e2e.py` and passed in through
 * PEACH_E2E_SETUP_ORIGIN, PEACH_E2E_SETUP_DATA (the temporary Peach data folder) and PEACH_E2E_SETUP_MEDIA
 * (an existing empty media directory).
 * This file is run by the dedicated first-run entry point; without these variables the whole suite is skipped. */
import assert from 'node:assert/strict';
import { readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import type { Browser, Page } from 'playwright-core';

import { launch, layout, VIEWPORTS } from './harness.ts';

const origin = process.env.PEACH_E2E_SETUP_ORIGIN ?? '';
const media = process.env.PEACH_E2E_SETUP_MEDIA ?? '';
const dataRoot = process.env.PEACH_E2E_SETUP_DATA ?? '';

/** The 400 from the wrong-input round is expected: Chrome records it as both a console error and a 4xx response. */
const expectedRejection = (problem: string) =>
  problem === '400 /api/setup' || problem === '400 /api/setup/restore'
  || problem.startsWith('console Failed to load resource: the server responded with a status of 400');

describe('First-run page', { skip: origin && media && dataRoot ? false : 'Runs only against the first-run server started by SetupE2ETests' }, () => {
  let browser: Browser;
  before(async () => { browser = await launch(); });
  after(async () => { await browser?.close(); });

  it('Wrong input is written back in place, and correcting it reaches the done state', { timeout: 120_000 }, async () => {
    const viewport = VIEWPORTS.find((candidate) => candidate.name === 'desktop')!;
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    const problems: string[] = [];
    try {
      const page: Page = await context.newPage();
      page.on('pageerror', (error) => problems.push(`pageerror ${error.message}`));
      page.on('console', (message) => { if (message.type() === 'error') problems.push(`console ${message.text()}`); });
      page.on('response', (response) => {
        if (response.url().startsWith(origin) && response.status() >= 400) {
          problems.push(`${response.status()} ${response.url().slice(origin.length)}`);
        }
      });
      await page.goto(`${origin}/?edit`, { waitUntil: 'load' });
      const editor = page.getByRole('group', { name: 'Copy editing' });
      await editor.waitFor({ state: 'visible' });
      for (const size of VIEWPORTS.filter(candidate => ['desktop', 'mobile'].includes(candidate.name))) {
        await page.setViewportSize({ width: size.width, height: size.height });
        assert.equal(await editor.evaluate(element => getComputedStyle(element).position), 'fixed');
        assert.equal(await editor.getByRole('button', { name: 'Pause editing' }).evaluate(element => getComputedStyle(element).height), '36px');
        const bounds = await editor.boundingBox();
        assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= size.width && bounds.y + bounds.height <= size.height);
      }
      await page.getByRole('button', { name: 'Exit editing' }).click();
      await page.waitForURL(`${origin}/`);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      // Loading: the form appears once the questions arrive, the busy state ends, and the page does not overflow horizontally.
      const heading = page.getByRole('heading', { name: 'Welcome to Peach' });
      await heading.waitFor({ state: 'visible', timeout: 15_000 });
      await page.getByRole('button', { name: 'Start setup', exact: true }).click();
      const folder = page.getByRole('textbox', { name: 'Media directory 1' });
      await folder.waitFor({ state: 'visible', timeout: 15_000 });
      assert.equal(await folder.inputValue(), '', 'The user fills in the media directory');
      await page.getByRole('button', { name: 'My library source color: No color', exact: true }).click();
      const paints = await page.locator('[data-library-colors] [data-accent-ball]').evaluateAll(elements =>
        elements.map(element => getComputedStyle(element).backgroundImage));
      assert.equal(new Set(paints).size, 12, 'The source color palette shows twelve distinct colors');
      await page.keyboard.press('Escape');
      assert.equal(await page.getByRole('textbox', { name: /path prefix/i }).count(), 0,
        'Ordinary first-time setup does not ask for the internal path');
      await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), undefined, { timeout: 15_000 });
      const host = page.getByRole('radiogroup');
      assert.equal(await host.count(), 0, 'The access scope is shown in a later step');
      assert.equal(await page.getByRole('checkbox', { name: /browser history/i }).count(), 0);
      // The data directory decides which disk is used, so it is shown on the first screen with a folder-picker button.
      // Where files land follows the server process's PEACH_DATA_ROOT; if it is not the temporary Peach data directory, do not submit further.
      assert.equal(await page.locator('#f-data_root').inputValue(), dataRoot);
      await page.getByRole('button', { name: 'Choose data folder' }).waitFor({ state: 'visible' });
      assert.deepEqual((await layout(page)).offenders, []);

      await folder.fill(join(media, 'missing'));
      const selectedData = join(dataRoot, 'custom-data');
      await page.locator('#f-data_root').fill(selectedData);
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      const proxyMode = page.locator('[aria-labelledby="setup-proxy-title"] button[aria-haspopup="listbox"]');
      await proxyMode.scrollIntoViewIfNeeded();
      await proxyMode.focus();
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await proxyMode.click();
      await page.getByRole('option', { name: 'Custom', exact: true }).waitFor();
      await page.getByRole('option', { name: 'Custom', exact: true }).click();
      await page.locator('[data-trigger="Select"]').waitFor({ state: 'detached' });
      const proxy = page.getByLabel('Proxy address', { exact: true });
      await proxy.fill('http://proxy.invalid');
      const mobileForm = VIEWPORTS.find((candidate) => candidate.name === 'mobile')!;
      await page.setViewportSize({ width: mobileForm.width, height: mobileForm.height });
      assert.deepEqual((await layout(page)).offenders, []);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      // React Aria's native input is visually hidden and a click lands on the switch drawn around it, so set the value by state.

      // Wrong input: nonexistent directory, port out of range.
      const missing = join(media, 'missing');
      await page.getByRole('switch', { name: 'Access password' }).setChecked(false, { force: true });
      await page.getByText('Advanced settings', { exact: true }).click();
      const port = page.locator('#f-port');
      await port.waitFor({ state: 'visible' });
      const defaultPort = await port.inputValue();
      await port.fill('70000');
      // Collapse it, to verify it expands by itself on error.
      await page.getByText('Advanced settings', { exact: true }).click();
      await port.waitFor({ state: 'hidden' });
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await page.getByRole('checkbox', { name: /^Scan .*after setup/ }).setChecked(false, { force: true });

      const rejected = page.waitForResponse((response) => response.url().endsWith('/api/setup')
        && response.request().method() === 'POST');
      await page.getByRole('button', { name: 'Finish setup' }).click();
      assert.equal((await rejected).status(), 400);

      // Write-back: the directory row and the port are each marked, Advanced settings is expanded, entered values are kept, and focus lands on the first error.
      await page.waitForFunction(() => document.querySelectorAll('input[aria-invalid="true"]').length >= 2);
      assert.equal(await folder.getAttribute('aria-invalid'), 'true');
      assert.equal(await folder.inputValue(), missing);
      await page.getByText(/Directory does not exist/).first().waitFor({ state: 'visible' });
      await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Media directory 1');
      await folder.fill(media);
      await page.locator('#f-data_root').fill(selectedData);
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await port.waitFor({ state: 'visible' });
      assert.equal(await port.getAttribute('aria-invalid'), 'true');
      assert.equal(await port.inputValue(), '70000');
      assert.equal(await proxy.getAttribute('aria-invalid'), 'true');
      assert.equal(await proxy.inputValue(), 'http://proxy.invalid');
      await page.getByText('Please enter an HTTP or SOCKS proxy address with a port', { exact: true }).waitFor({ state: 'visible' });
      await page.getByText('Port must be an integer between 1 and 65535').waitFor({ state: 'visible' });

      // Correction: an existing directory, the default port, no scan.
      await port.fill(defaultPort);
      await proxy.fill('socks5h://user:private-proxy@127.0.0.1:17890');
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      const accepted = page.waitForResponse((response) => response.url().endsWith('/api/setup')
        && response.request().method() === 'POST');
      await page.getByRole('button', { name: 'Finish setup' }).click();
      const acceptedResponse = await accepted;
      assert.equal(acceptedResponse.status(), 200, await acceptedResponse.text());
      assert.deepEqual(JSON.parse(await readFile(join(selectedData, 'secrets/follow/peach-proxy.json'), 'utf8')), {
        mode: 'proxy', proxy: 'socks5h://user:private-proxy@127.0.0.1:17890',
      });

      // Done state: the entry link gets focus, no scan is queued, runtime info is collapsed, and the password is not on the page.
      await page.getByRole('heading', { name: "You're ready to go" }).waitFor({ state: 'visible' });
      assert.equal((await page.content()).includes('private-proxy'), false);
      const entry = page.getByRole('link', { name: 'Open Peach' });
      await entry.waitFor({ state: 'visible' });
      assert.ok(await entry.evaluate((element) => element === document.activeElement), 'The entry link gets focus');
      assert.match((await entry.getAttribute('href')) ?? '', /^https?:\/\//);
      await page.getByText('Start scanning the library later on the settings page.').waitFor({ state: 'visible' });
      assert.equal(await page.title(), 'Peach · Setup complete');
      assert.deepEqual((await layout(page)).offenders, []);
      await page.getByText('Runtime info', { exact: true }).click();
      await page.getByText(selectedData, { exact: true }).waitFor({ state: 'visible' });
      const mobile = VIEWPORTS.find((candidate) => candidate.name === 'mobile')!;
      await page.setViewportSize({ width: mobile.width, height: mobile.height });
      assert.deepEqual((await layout(page)).offenders, []);

      // The existing-data-folder entry works on the first-run page; when no config is found it keeps the path and explains why.
      const originalConfig = await readFile(join(selectedData, 'config.toml'));
      await unlink(join(dataRoot, 'state', 'data-root.txt'));
      await page.reload({ waitUntil: 'load' });
      await page.getByRole('button', { name: 'Use existing data', exact: true }).click();
      const existing = page.getByRole('textbox', { name: 'Existing data folder' });
      await existing.fill(join(dataRoot, 'missing'));
      const restoreRejected = page.waitForResponse((response) => response.url().endsWith('/api/setup/restore'));
      await page.getByRole('button', { name: 'Use this folder', exact: true }).click();
      assert.equal((await restoreRejected).status(), 400);
      await page.getByRole('alert').filter({ hasText: 'config.toml' }).waitFor({ state: 'visible' });
      assert.deepEqual((await layout(page)).offenders, []);
      await existing.fill(selectedData);
      const restoreAccepted = page.waitForResponse((response) => response.url().endsWith('/api/setup/restore'));
      await page.getByRole('button', { name: 'Use this folder', exact: true }).click();
      assert.equal((await restoreAccepted).status(), 200);
      await page.getByText('Connected to an existing data folder.', { exact: true }).waitFor({ state: 'visible' });
      assert.equal(await readFile(join(dataRoot, 'state', 'data-root.txt'), 'utf8'), selectedData);
      assert.deepEqual(await readFile(join(selectedData, 'config.toml')), originalConfig);
      assert.deepEqual((await layout(page)).offenders, []);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      assert.deepEqual((await layout(page)).offenders, []);

      assert.deepEqual(problems.filter((problem) => !expectedRejection(problem)), []);
    } finally {
      await context.close();
    }
  });
});
