import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { chromium, type Page, type Route } from 'playwright';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import type { WorkshopProject } from '../shared/workshop.ts';

// Isolated browser fixtures only: this server has no API or generation workers.
const cacheDir = await mkdtemp(resolve(tmpdir(), 'workshop-progress-vite-'));
const vite = await createServer({ root: resolve(import.meta.dirname, '..'), configFile: false, cacheDir,
  plugins: [react()], resolve: { dedupe: ['react', 'react-dom'] },
  server: { host: '127.0.0.1', port: 0, hmr: false, watch: null }, logLevel: 'error' });
await vite.listen();
const address = vite.httpServer!.address();
assert.ok(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });
const errors: string[] = [], mutations: string[] = [], scenarios: string[] = [];
const project = (id: string, title = id): WorkshopProject => ({ id, title, author: 'Regression fixture', scope: 'user-import', sourceHash: 'fixture',
  generationOptions: { mode: 'fast', adaptation: 'inspiration', images: 'none' }, createdAt: '2026-09-14T00:00:00.000Z', updatedAt: '2026-09-14T00:00:00.000Z',
  revision: 1, status: 'running', stage: 'scenes', completedRoutes: 1, playable: false, attempts: 1,
  art: { status: 'disabled', approved: 0, total: 0 }, events: [] });
const selected = project('selected', '所选项目'), other = project('other', '另一项目');
const list = (route: Route, projects: WorkshopProject[]) => route.fulfill({ json: { projects, capabilities: { creativeConfigEditable: false } } });

async function fixture(release: boolean, handler: (route: Route, path: string) => Promise<void>, run: (page: Page) => Promise<void>) {
  const context = await browser.newContext();
  await context.route('**/api/**', async route => {
    if (route.request().method() !== 'GET') { mutations.push(route.request().method()); return route.abort(); }
    await handler(route, new URL(route.request().url()).pathname);
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(`${base}/tests/fixtures/workshop-progress-browser.html?selected=selected&release=${release ? 1 : 0}`);
    await run(page);
  } catch (error) {
    console.error(JSON.stringify({ pageErrors: errors, visibleFixture: await page.locator('body').innerText() }));
    throw error;
  } finally { await context.close(); }
}

try {
  for (const release of [false, true]) {
    const version = release ? 'release' : 'current';
    let missingCalls = 0;
    await fixture(release, async (route, path) => {
      if (path === '/api/workshop/projects') return list(route, missingCalls ? [{ ...other, title: '列表继续更新' }] : [selected, other]);
      if (path.endsWith('/selected')) { missingCalls++; return route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not Found' }); }
      return route.fulfill({ json: {} });
    }, async page => {
      await page.getByRole('button', { name: /列表继续更新/ }).waitFor();
      assert.equal(await page.locator('.workshop-project.selected').count(), 0);
      assert.equal(await page.getByRole('alert').count(), 0);
      await page.getByRole('button', { name: '刷新生成项目', exact: true }).click();
      await page.getByRole('button', { name: /列表继续更新/ }).waitFor();
      assert.equal(missingCalls, 1, 'a missing selection is not retried forever');
    });
    scenarios.push(`${version}: inaccessible detail does not block list refresh`);

    let staleDetailCalls = 0;
    await fixture(release, async (route, path) => {
      if (path === '/api/workshop/projects') return list(route, [other]);
      if (path.endsWith('/selected')) staleDetailCalls++;
      return route.fulfill({ status: 404, body: 'Not Found' });
    }, async page => {
      await page.getByRole('button', { name: /另一项目/ }).waitFor();
      assert.equal(await page.locator('.workshop-project.selected').count(), 0);
      assert.equal(await page.getByRole('alert').count(), 0);
      assert.equal(staleDetailCalls, 0, 'selection absent from a successful list is cleared immediately');
    });
    scenarios.push(`${version}: removed selection is cleared`);

    let detailCalls = 0;
    await fixture(release, async (route, path) => {
      if (path === '/api/workshop/projects') return list(route, [selected, other]);
      if (path.endsWith('/selected')) {
        detailCalls++;
        return detailCalls === 1 ? route.abort() : route.fulfill({ json: { ...selected, title: '详情恢复' } });
      }
      return route.fulfill({ json: {} });
    }, async page => {
      await page.getByRole('alert').filter({ hasText: '暂时未能更新进度' }).waitFor();
      assert.equal(await page.locator('.workshop-project').count(), 2);
      assert.equal(await page.locator('.workshop-project.selected').count(), 1);
      await page.locator('.workshop-detail h2').filter({ hasText: '详情恢复' }).waitFor({ timeout: 12_000 });
      assert.equal(await page.getByRole('alert').count(), 0);
      assert.ok(detailCalls >= 2, 'the existing automatic timer recovers a transient detail failure');
    });
    scenarios.push(`${version}: transient detail failure preserves list and retries automatically`);

    let listCalls = 0;
    await fixture(release, async (route, path) => {
      if (path === '/api/workshop/projects') {
        listCalls++;
        return listCalls === 2 ? route.abort() : list(route, [selected, other]);
      }
      return route.fulfill({ json: selected });
    }, async page => {
      await page.locator('.workshop-detail h2').filter({ hasText: '所选项目' }).waitFor();
      await page.getByRole('button', { name: '刷新生成项目', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: '暂时未能更新进度' }).waitFor();
      assert.equal(await page.locator('.workshop-project').count(), 2);
      assert.equal(await page.locator('.workshop-detail h2').innerText(), '所选项目');
      await page.getByRole('button', { name: '立即重连', exact: true }).click();
      await page.getByRole('alert').waitFor({ state: 'hidden' });
      assert.equal(await page.locator('.workshop-project.selected').count(), 1);
    });
    scenarios.push(`${version}: transient list failure retains saved UI and reconnects`);
  }
  assert.deepEqual(errors, []); assert.deepEqual(mutations, []);
  console.log(JSON.stringify({ ok: true, scenarios, errors, mutations }));
} finally { await browser.close(); await vite.close(); await rm(cacheDir, { recursive: true, force: true }); }
