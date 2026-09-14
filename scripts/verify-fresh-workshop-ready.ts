import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const base = process.env.FRESH_WORKSHOP_URL ?? 'http://127.0.0.1:4179';
const id = process.env.FRESH_PROJECT_ID ?? 'import-614dde3a-2fcd-450a-9cec-438cd6079637';
const output = resolve(process.env.FRESH_WORKSHOP_READY_OUTPUT ?? 'output/playwright/fresh-workshop-third-20260913');
await mkdir(output, { recursive: true });

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(20_000) });
  const data = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(data));
  return data as T;
}

const [project, source, world] = await Promise.all([
  get<{ id: string; title: string; author: string; status: string; stage: string; revision: number; playable: boolean; generation?: { model?: string; elapsedMs?: number; attempts?: number }; validation?: { scenes: number; decisions: number; endings: number; routes: number; states: number } }>(`/api/workshop/projects/${id}`),
  get<{ text: string; origin?: { sourceUrl?: string; contentScope?: string } }>(`/api/workshop/projects/${id}/source`),
  get<{ id: string; title: string; startNodeId: string; generated?: { mode?: string; revision?: number }; adaptation?: { note?: string }; source: { origin?: { sourceUrl?: string } }; nodes: Record<string, { text: string[]; choices: Array<{ id: string; text: string; nextNodeId: string }>; ending?: { title: string } }> }>(`/api/workshop/projects/${id}/world`),
]);
assert.equal(project.status, 'ready');
assert.equal(project.playable, true);
assert.equal(world.generated?.mode, 'fast');
assert.match(world.adaptation?.note ?? '', /以导入回答为灵感/);
assert.equal(world.source.origin?.sourceUrl, source.origin?.sourceUrl);
assert.equal(source.origin?.contentScope, 'search-excerpt');
assert.equal(project.validation?.scenes, 12);
assert.equal(project.validation?.decisions, 9);
assert.equal(project.validation?.endings, 3);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors: string[] = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base, { waitUntil: 'networkidle' });
  const dismissGuide = page.getByRole('button', { name: '我先自己逛逛', exact: true });
  if (await dismissGuide.count()) await dismissGuide.click();
  const entry = page.locator('article').filter({ hasText: project.title }).filter({ hasText: project.author }).first();
  await entry.getByRole('button', { name: '玩改编', exact: true }).click();
  await page.getByRole('button', { name: '认识这个世界', exact: true }).click();
  await page.getByRole('button', { name: '开始故事', exact: true }).click();
  for (let index = 0; index < 40; index++) {
    const state = JSON.parse(await page.evaluate(() => window.render_game_to_text!()));
    if (state.choices?.length) break;
    const next = page.getByRole('button', { name: /^(显示全文|继续)$/ });
    if (await next.count()) await next.click();
    await page.waitForTimeout(100);
  }
  const before = JSON.parse(await page.evaluate(() => window.render_game_to_text!()));
  assert.equal(before.worldId, world.id);
  assert.equal(before.nodeId, world.startNodeId);
  assert.equal(before.choices.length, 3);
  const first = world.nodes[world.startNodeId].choices[0];
  assert.equal(before.choices[0].id, first.id);
  await page.locator('.choice-button').first().click();
  await page.waitForFunction(expected => JSON.parse(window.render_game_to_text!()).nodeId === expected, first.nextNodeId);
  const after = JSON.parse(await page.evaluate(() => window.render_game_to_text!()));
  await page.screenshot({ path: resolve(output, 'browser-after-first-choice.png'), fullPage: false, animations: 'disabled' });
  assert.deepEqual(errors, []);
  const report = {
    status: 'passed', base, project: { id: project.id, title: project.title, author: project.author, revision: project.revision, model: project.generation?.model, elapsedMs: project.generation?.elapsedMs, validation: project.validation },
    source: { url: source.origin?.sourceUrl, scope: source.origin?.contentScope, characters: source.text.length },
    world: { id: world.id, title: world.title, mode: world.generated?.mode, adaptation: world.adaptation?.note, start: world.startNodeId, endings: Object.values(world.nodes).flatMap(node => node.ending ? [node.ending.title] : []) },
    browser: { openingNode: before.nodeId, openingChoices: before.choices.map((choice: { id: string; text: string }) => choice), clickedChoice: first.id, nextNode: after.nodeId, errors },
  };
  await writeFile(resolve(output, 'fresh-ready-verification.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
