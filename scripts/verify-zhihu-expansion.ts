import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import type { WorkshopProject } from '../shared/workshop.ts';
import type { ZhihuDiscoveryResult } from '../shared/zhihu-discovery.ts';

const base = process.env.WORKSHOP_URL || 'http://127.0.0.1:4173';
const output = resolve('output/playwright/zhihu-expansion', new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(output, { recursive: true });
const discovery = await (await fetch(`${base}/api/workshop/discovery`)).json() as ZhihuDiscoveryResult;
const candidate = discovery.candidates.find(row => row.origin.sourceUrl === 'https://zhuanlan.zhihu.com/p/2076377777419326606');
assert.ok(candidate, 'A real saved new source is required');
const gameSource = discovery.candidates.find(row => row.origin.sourceUrl === 'https://zhuanlan.zhihu.com/p/706674379');
assert.ok(gameSource);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const results = [], errors: string[] = [];
try {
  for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport }), page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await page.getByRole('region', { name: '新接入的知乎故事' }).waitFor();
    assert.ok(await page.locator('.new-adaptation-list article').count() >= 2);
    await page.locator('.zhihu-new-adaptations').screenshot({ path: resolve(output, `${viewport.name}-new-stories-home.png`) });
    await page.locator('.new-adaptation-list article').filter({ hasText: candidate.title }).getByRole('button', { name: '读节选', exact: true }).click();
    assert.equal(await page.getByTestId('imported-source-text').textContent(), candidate.excerpt);
    await page.getByRole('dialog').getByRole('button', { name: '返回书库', exact: true }).click();
    await page.getByTitle('新故事工作台', { exact: true }).click();
    await page.getByRole('tab', { name: '发现新故事' }).click();
    await page.locator('.discovery-result').first().waitFor();
    await page.getByRole('textbox', { name: '搜索新的知乎故事' }).fill('科幻短篇小说 太空 空间站');
    const searched = page.waitForResponse(response => response.url() === `${base}/api/workshop/discovery` && response.request().method() === 'POST');
    await page.locator('.discovery-search').getByRole('button', { name: '搜索', exact: true }).click();
    const searchResponse = await searched; assert.equal(searchResponse.status(), 200);
    const searchResult = await searchResponse.json() as ZhihuDiscoveryResult;
    assert.ok(searchResult.candidates.some(row => row.id === candidate.id));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: resolve(output, `${viewport.name}-discover.png`), fullPage: false });
    await page.locator(`.discovery-result[data-candidate-id="${candidate.id}"]`).click();
    assert.equal(await page.getByTestId('discovered-source-text').textContent(), candidate.excerpt);
    assert.ok((await page.locator('.discovery-scope').innerText()).includes('并非完整原作'));
    await page.locator('.discovered-source').screenshot({ path: resolve(output, `${viewport.name}-source-preview.png`) });
    const save = page.getByRole('button', { name: '先保存原文', exact: true });
    let imported: WorkshopProject;
    if (await save.count()) {
      const response = page.waitForResponse(r => r.url() === `${base}/api/workshop/discovery/import` && r.request().method() === 'POST');
      await save.click(); imported = await (await response).json() as WorkshopProject;
      assert.equal(imported.revision, 0); assert.equal(imported.playable, false);
    } else {
      await page.getByRole('button', { name: '查看改编项目', exact: true }).click();
      const records = await (await fetch(`${base}/api/workshop/projects`)).json();
      imported = records.projects.find((project: WorkshopProject) => project.origin?.sourceUrl === candidate.origin.sourceUrl);
    }
    assert.ok(imported);
    const source = await (await fetch(`${base}/api/workshop/projects/${imported.id}/source`)).json();
    assert.equal(source.text, candidate.excerpt); assert.equal(source.origin.contentScope, 'search-excerpt');
    await page.getByRole('button', { name: '读导入原文', exact: true }).click();
    assert.equal(await page.getByTestId('imported-source-text').textContent(), candidate.excerpt);
    assert.ok((await page.getByRole('dialog').innerText()).includes('搜索返回的节选'));
    await page.screenshot({ path: resolve(output, `${viewport.name}-exact-reader.png`) });
    await page.getByRole('dialog').getByRole('button', { name: /关闭/ }).click();
    await page.getByRole('button', { name: '返回搜索结果', exact: true }).click();
    await page.locator(`.discovery-result[data-candidate-id="${gameSource.id}"]`).click();
    await page.getByRole('button', { name: '查看改编项目', exact: true }).click();
    await page.locator('.workshop-detail').screenshot({ path: resolve(output, `${viewport.name}-actual-production.png`) });
    const projects = await (await fetch(`${base}/api/workshop/projects`)).json();
    const active = projects.projects.find((project: WorkshopProject) => project.origin?.sourceUrl === gameSource.origin.sourceUrl) as WorkshopProject;
    assert.ok(active?.jobId); assert.ok(active.revision > 0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    results.push({ viewport, actualSearchSubmit: true, searchCached: searchResult.cached, importedProjectId: imported.id, exactSource: true, activeProject: active.id, jobId: active.jobId, status: active.status, stage: active.stage, playable: active.playable });
    await context.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'verification.json'), JSON.stringify({ status: 'passed', base, results, errors }, null, 2));
  console.log(JSON.stringify({ output, status: 'passed', results }, null, 2));
} catch (error) {
  await writeFile(resolve(output, 'failure.json'), JSON.stringify({ status: 'failed', base, results, errors, message: String(error) }, null, 2));
  console.log(output); throw error;
} finally { await browser.close(); }
