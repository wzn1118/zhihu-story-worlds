import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, type Page } from 'playwright';
import { defaultSettings, storageKeys } from '../src/game.ts';
import { withReviewedWorkshopCopy } from '../shared/workshop-copy.ts';
import type { GameWorld } from '../shared/types.ts';
import type { ArtBatch } from '../shared/production.ts';
import { explore } from '../tests/core-creative-support.ts';

const base = process.env.WORKSHOP_URL ?? 'http://127.0.0.1:4174';
const sampleId = 'import-6febc2f6-3a12-41ac-bae5-6d05ebc68c10';
const revoked = 'scene_89cce0808c88ddb09926000189a4';
const revokedUrl = `/generated-art/${revoked}.png`;
const output = resolve('output/playwright/workshop-art-integration', new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(output, { recursive: true });
console.log(`Evidence: ${output}`);
async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200, path);
  return await response.json() as T;
}
const project = await get<{ title: string; status: string; stage: string; publishedVersion: string; editorial: unknown; error: unknown; jobId: string; attempts: number; art: unknown }>(`/api/workshop/projects/${sampleId}`);
const source = await get<{ text: string; scope: string }>(`/api/workshop/projects/${sampleId}/source`);
const acceptance = JSON.parse(await readFile(resolve(`output/workshop-sample/${sampleId}-r1-1788663853936/acceptance.json`), 'utf8')) as { version: string; sourceTextSha256: string; endings: { id: string; path: string[] }[] };
assert.equal(project.publishedVersion, acceptance.version, 'Reuse the existing verified revision; do not silently switch its paths');
assert.equal(createHash('sha256').update(source.text).digest('hex'), acceptance.sourceTextSha256);
const sample = withReviewedWorkshopCopy(await get<GameWorld>(`/api/workshop/projects/${sampleId}/world?version=r1`));
const pursuit = await get<GameWorld>('/api/worlds/2025333783608537435');
const blue = await get<GameWorld>('/api/worlds/2025684191967294692');
const batches = (await get<{ batches: ArtBatch[] }>('/api/art/batches')).batches;
const oldJob = batches.flatMap(b => b.jobs).find(job => job.id === revoked);
assert.equal(oldJob?.review?.decision, 'rejected');
assert.ok(Object.values(pursuit.nodes).every(node => node.background !== revokedUrl));
const parallelReads = await Promise.all(Array.from({ length: 2 }, () => get<GameWorld>('/api/worlds/2025333783608537435')));
assert.ok(parallelReads.every(w => w.nodes.ending_pursuit_loss.background !== revokedUrl));
assert.equal(sample.generated?.artReady, false);
const pathToRevoked = explore(pursuit).nodes.get('ending_pursuit_loss'); assert.ok(pathToRevoked);
const browser = await chromium.launch({ executablePath: 'C:/Users/10847/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe', headless: true });
const results: unknown[] = [], errors: string[] = [], mutations: string[] = [];
let page: Page | undefined;
const state = async (p: Page) => JSON.parse(await p.evaluate(() => window.render_game_to_text!()));
async function decisions(p: Page) {
  for (let i = 0; i < 80; i++) {
    await p.waitForTimeout(70);
    const s = await state(p);
    if (s.mode === 'ending' || s.choices?.length) return s;
    const next = p.locator('button.dialogue-next');
    if (await next.isVisible()) await next.click();
  }
  throw new Error('No decisions exposed by current scene');
}
async function clickPath(p: Page, world: GameWorld, path: string[]) {
  for (const id of path) {
    const s = await decisions(p), index = s.choices.findIndex((c: { id: string }) => c.id === id);
    assert.ok(index >= 0, `${s.nodeId}: missing actual choice ${id}`);
    const next = world.nodes[s.nodeId].choices.find(c => c.id === id)!.nextNodeId;
    await p.locator('.choice-button').nth(index).click();
    await p.waitForFunction(id => JSON.parse(window.render_game_to_text!()).nodeId === id, next);
  }
  return await decisions(p);
}
async function screenshot(p: Page, name: string) {
  await p.evaluate(() => document.fonts.ready);
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await p.screenshot({ path: resolve(output, `${name}.png`), animations: 'disabled' });
}
async function layout(p: Page, label: string) {
  const [annotation, resources, heading] = await p.evaluate(() =>
    ['.scene-annotation', '.resource-strip', '.scene-topline'].map(selector => {
      const element = document.querySelector<HTMLElement>(selector)!;
      return { display: getComputedStyle(element).display, text: element.textContent, rect: element.getBoundingClientRect().toJSON() };
    }));
  const boxes = { annotation, resources, heading };
  assert.equal(boxes.annotation.display, 'none');
  assert.equal(boxes.annotation.rect.width, 0); assert.equal(boxes.annotation.rect.height, 0);
  assert.ok(boxes.resources.rect.width > 0 && boxes.resources.rect.height > 0);
  assert.ok(boxes.resources.rect.top >= boxes.heading.rect.bottom - 1);
  await screenshot(p, label);
  results.push({ label, ...boxes });
}
async function startAuthored(p: Page, title: string) {
  await p.goto(base, { waitUntil: 'networkidle' });
  await p.locator('.story-card').filter({ has: p.getByRole('heading', { name: title, exact: true }) }).getByRole('button', { name: '玩改编', exact: true }).click();
  await p.getByRole('button', { name: '开始故事', exact: true }).click();
}
try {
  for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport });
    context.setDefaultTimeout(45000);
    await context.addInitScript(({ keys, settings }) => {
      localStorage.setItem(keys.onboarding, 'true'); localStorage.setItem(keys.settings, JSON.stringify(settings));
    }, { keys: storageKeys, settings: { ...defaultSettings, reducedMotion: true, textSpeed: 100 } });
    page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.url().includes('/api/') && request.method() !== 'GET') mutations.push(`${request.method()} ${request.url()}`); });
    await startAuthored(page, '蓝血');
    await decisions(page); await layout(page, `${viewport.name}-authored-opening`);
    const current = await state(page); await clickPath(page, blue, [current.choices[0].id]);
    await layout(page, `${viewport.name}-authored-next`);
    await startAuthored(page, '李冬原著：同时被两个精神病追杀');
    const ending = await clickPath(page, pursuit, pathToRevoked);
    assert.equal(ending.nodeId, 'ending_pursuit_loss');
    assert.notEqual(ending.visuals.background, revokedUrl);
    assert.equal(await page.locator(`img[src="${revokedUrl}"]`).count(), 0);
    await screenshot(page, `${viewport.name}-revoked-art-ending`);
    results.push({ viewport, revokedArtAbsent: true, ending: ending.nodeId, actualClicks: pathToRevoked.length, visuals: ending.visuals });

    await page.goto(base, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '新故事工作台', exact: true }).click();
    await page.locator('.workshop-project').filter({ hasText: project.title }).click();
    await page.getByRole('button', { name: '读导入原文', exact: true }).click();
    await page.getByTestId('imported-source-text').waitFor();
    assert.equal(await page.getByTestId('imported-source-text').textContent(), source.text);
    assert.equal(await page.locator('.imported-reader .zhihu-wordmark').count(), 0);
    await page.getByRole('button', { name: '返回工作台', exact: true }).click();
    await page.getByRole('button', { name: /游玩 r1/ }).click();
    await page.getByRole('button', { name: '开始故事', exact: true }).waitFor();
    for (const [index, target] of acceptance.endings.entries()) {
      if (index) await page.getByRole('button', { name: '重新开始', exact: true }).click();
      await page.getByRole('button', { name: '开始故事', exact: true }).click();
      if (!index) { await decisions(page); await layout(page, `${viewport.name}-sample-opening`); }
      const final = await clickPath(page, sample, target.path);
      assert.equal(final.nodeId, target.id); assert.equal(final.mode, 'ending');
      assert.equal(await page.locator('.ending-prose').textContent(), sample.nodes[target.id].text.join('\n\n'));
      await screenshot(page, `${viewport.name}-${target.id}`);
      await page.getByRole('button', { name: '查看导入原文', exact: true }).click();
      await page.getByTestId('imported-source-text').waitFor();
      assert.equal(await page.getByTestId('imported-source-text').textContent(), source.text);
      await page.getByRole('button', { name: '继续当前故事', exact: true }).click();
      assert.equal((await state(page)).nodeId, target.id);
      results.push({ viewport: viewport.name, sampleVersion: sample.version, ending: target.id, actualChoiceClicks: target.path.length, sourceReturn: true });
    }
    await context.close();
  }
  assert.deepEqual(errors, []); assert.deepEqual(mutations, []);
  const after = await get<typeof project>(`/api/workshop/projects/${sampleId}`);
  assert.equal(after.jobId, project.jobId); assert.equal(after.attempts, project.attempts);
  await writeFile(resolve(output, 'verification.json'), JSON.stringify({ status: 'passed', base, project, sourceScope: source.scope, revokedReview: oldJob!.review,
    currentApprovedJobs: batches.flatMap(b => b.jobs).filter(j => !j.stale && j.review?.decision === 'approved').length,
    sampleVisualReady: false, results, errors, mutations, generationLaunched: false, paidRequests: 0 }, null, 2));
  console.log(JSON.stringify({ output, results: results.length, errors, mutations }, null, 2));
} catch (error) {
  await page?.screenshot({ path: resolve(output, 'failure.png'), timeout: 10000 }).catch(() => {});
  await writeFile(resolve(output, 'verification.json'), JSON.stringify({ status: 'failed', error: String(error), results, errors, mutations }, null, 2));
  throw error;
} finally { await browser.close(); }
