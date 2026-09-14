import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import type { WorkshopProject } from '../shared/workshop.ts';

const base = process.env.WORKSHOP_URL || 'http://127.0.0.1:4173';
const response = await fetch(`${base}/api/workshop/projects`);
assert.ok(response.ok);
const data = await response.json() as { projects: WorkshopProject[]; capabilities?: Record<string, boolean> };
const running = data.projects.find(project => project.status === 'running');
const failed = data.projects.find(project => project.status === 'failed' && project.editorial?.status === 'failed' && project.editorial.message);
assert.ok(running, 'A live running project is required for this read-only verification');
assert.ok(failed, 'A live failed project is required for this read-only verification');
const fixture: WorkshopProject = { ...failed, status: 'running', stage: 'validation', error: undefined };
const output = resolve('output/playwright/workshop-status', new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors: string[] = [], mutationRequests: string[] = [], results = [];
try {
  for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
    for (const scenario of [{ name: 'live-running', project: running }, { name: 'live-failed', project: failed }, { name: 'fixture-resumed', project: fixture }]) {
      const context = await browser.newContext({ viewport });
      await context.route('**/api/**', async route => {
        if (route.request().method() !== 'GET') {
          mutationRequests.push(`${route.request().method()} ${route.request().url()}`);
          return route.abort();
        }
        const path = new URL(route.request().url()).pathname;
        if (scenario.name === 'fixture-resumed') {
          if (path === '/api/workshop/projects') return route.fulfill({ json: { ...data, projects: data.projects.map(project => project.id === fixture.id ? fixture : project) } });
          if (path === `/api/workshop/projects/${fixture.id}`) return route.fulfill({ json: fixture });
        }
        return route.continue();
      });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base);
      await page.getByTitle('\u65b0\u6545\u4e8b\u5de5\u4f5c\u53f0', { exact: true }).click();
      await page.locator('.workshop-project').filter({ has: page.locator('b', { hasText: scenario.project.title }) }).click();
      const detail = page.locator('.workshop-detail');
      await detail.waitFor();
      const current = detail.locator(':scope > .workshop-editorial-status');
      const history = detail.locator('details').filter({ has: page.locator('summary', { hasText: '\u5386\u53f2\u5ba1\u7a3f\u8bb0\u5f55' }) });
      if (scenario.name === 'live-failed') {
        assert.ok((await current.innerText()).includes(failed.editorial!.message!));
        assert.equal(await history.count(), 0);
        assert.equal(await detail.getByRole('button', { name: '\u4ece\u5b8c\u6210\u9636\u6bb5\u7eed\u8dd1', exact: true }).count(), 1);
      } else {
        assert.equal(await detail.getByRole('button', { name: '\u4ece\u5b8c\u6210\u9636\u6bb5\u7eed\u8dd1', exact: true }).count(), 0);
        if (scenario.name === 'fixture-resumed') {
          assert.ok((await current.innerText()).includes('\u7b49\u5f85\u672c\u8f6e\u5ba1\u7a3f\u7ed3\u679c'));
          assert.ok(!(await current.innerText()).includes(failed.editorial!.message!));
          assert.equal(await history.count(), 1);
          assert.equal(await history.getAttribute('open'), null);
        }
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await detail.screenshot({ path: resolve(output, `${viewport.name}-${scenario.name}.png`) });
      if (scenario.name === 'fixture-resumed') {
        await history.locator('summary').click();
        assert.ok((await history.innerText()).includes(failed.editorial!.message!));
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await detail.screenshot({ path: resolve(output, `${viewport.name}-${scenario.name}-history.png`) });
      }
      results.push({ viewport: viewport.name, scenario: scenario.name, id: scenario.project.id, currentText: await current.innerText(), historyPreserved: scenario.name === 'fixture-resumed' });
      await context.close();
    }
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(mutationRequests, []);
  const record = { status: 'passed', readOnly: true, fixtureOnlyInBrowser: true, results, errors, mutationRequests };
  await writeFile(resolve(output, 'verification.json'), JSON.stringify(record, null, 2));
  console.log(JSON.stringify({ output, ...record }, null, 2));
} finally {
  await browser.close();
}
