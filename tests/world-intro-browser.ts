import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, type Page } from 'playwright';
import type { GameWorld } from '../shared/types.ts';
import type { ImportedSource } from '../shared/workshop.ts';
import { defaultSettings, storageKeys } from '../src/game.ts';

const base = process.env.WORKSHOP_URL || 'http://127.0.0.1:4173';
const id = process.argv[2] || 'import-32bcca2e-c8e9-47bb-91b1-ee567f3cbe2f';
async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${base}${path}`); assert.ok(response.ok);
  return await response.json() as T;
}
const world = await get<GameWorld>(`/api/workshop/projects/${id}/world`);
const source = await get<ImportedSource>(`/api/workshop/projects/${id}/source`);
const original = await get<GameWorld>('/api/worlds/1831621186162937856');
assert.ok(world.generated?.editorial);
assert.equal(original.generated, undefined);
assert.ok(original.mechanics?.description);
assert.equal(world.mechanics!.description, world.resources!.map(resource => `${resource.label}\uff1a${resource.description}`).join('\n'));
const output = resolve('output/playwright/world-intro', `${id}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const results = [], errors: string[] = [], mutationRequests: string[] = [];
const readState = (page: Page) => page.evaluate(() => JSON.parse(window.render_game_to_text!()));
async function fit(page: Page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  assert.ok(await page.locator('.modal-body').evaluate(element => element.scrollWidth <= element.clientWidth + 1));
}
try {
  for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
    for (const scenario of [{ name: 'generated', world }, { name: 'original', world: original }]) {
      const target = scenario.world;
      const context = await browser.newContext({ viewport });
      await context.route('**/api/**', async route => {
        if (route.request().method() !== 'GET') {
          mutationRequests.push(`${route.request().method()} ${route.request().url()}`);
          return route.abort();
        }
        return route.continue();
      });
      await context.addInitScript(({ keys, settings }) => {
        localStorage.setItem(keys.settings, JSON.stringify(settings));
        localStorage.setItem(keys.onboarding, 'true');
      }, { keys: storageKeys, settings: { ...defaultSettings, reducedMotion: true, textSpeed: 100 } });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base);
      if (scenario.name === 'generated') {
        await page.locator(`.new-adaptation-list [data-project-id="${id}"]`).getByRole('button', { name: '\u5f00\u59cb\u6e38\u620f', exact: true }).click();
      } else {
        await page.locator('.story-card').filter({ has: page.getByRole('heading', { name: original.source.title, exact: true }) }).locator('.story-card-open').click();
        await page.getByRole('button', { name: '\u8fdb\u5165\u6545\u4e8b\u4e16\u754c', exact: true }).click();
      }
      const intro = page.getByRole('dialog', { name: '\u4e16\u754c\u5e8f\u7ae0', exact: true });
      await intro.getByRole('heading', { name: target.title, exact: true }).waitFor();
      const mechanics = intro.locator('.world-mechanics');
      const overview = mechanics.locator(':scope > p:not(.beginner-tip)');
      if (scenario.name === 'generated') {
        assert.equal(await overview.count(), 0);
        const text = await mechanics.textContent();
        for (const resource of target.resources!) assert.equal(text!.split(resource.description).length - 1, 1);
      } else {
        assert.equal(await overview.textContent(), target.mechanics!.description);
      }
      assert.deepEqual(await mechanics.locator('dd').allTextContents(), (target.resources ?? []).map(resource => resource.description));
      const labels = await mechanics.locator('dt').allTextContents();
      for (const [index, resource] of (target.resources ?? []).entries()) {
        assert.ok(labels[index].includes(resource.label));
        assert.ok(labels[index].includes(`${resource.initial} / ${resource.max}`));
      }
      assert.equal(await mechanics.locator('.beginner-tip').textContent(), target.mechanics!.beginnerTip);
      await fit(page);
      await page.screenshot({ path: resolve(output, `${viewport.name}-${scenario.name}-introduction.png`) });
      await mechanics.scrollIntoViewIfNeeded();
      await fit(page);
      await page.screenshot({ path: resolve(output, `${viewport.name}-${scenario.name}-mechanics.png`) });
      await intro.getByRole('button', { name: '\u5f00\u59cb\u6545\u4e8b', exact: true }).click();
      await page.waitForFunction(nodeId => window.render_game_to_text && JSON.parse(window.render_game_to_text()).nodeId === nodeId, target.startNodeId);
      const before = await readState(page);
      assert.equal(before.worldId, target.id);
      assert.equal(before.modal, null);
      for (const resource of target.resources ?? []) assert.equal(before.resources[resource.id], resource.initial);
      await page.screenshot({ path: resolve(output, `${viewport.name}-${scenario.name}-opening.png`) });
      if (scenario.name === 'generated') {
        await page.locator('.game-bottomline .source-reader-link').click();
        assert.equal(await page.getByTestId('imported-source-text').textContent(), source.text);
        await fit(page);
        await page.screenshot({ path: resolve(output, `${viewport.name}-${scenario.name}-source.png`) });
        await page.getByRole('button', { name: '\u7ee7\u7eed\u5f53\u524d\u6545\u4e8b', exact: true }).click();
        const after = await readState(page);
        for (const key of ['worldId', 'nodeId', 'paragraph', 'choiceCount', 'resources', 'clues']) assert.deepEqual(after[key], before[key]);
      }
      results.push({ viewport: viewport.name, scenario: scenario.name, worldId: target.id, version: target.version,
        uniqueResourceDescriptions: true, resourceInitialAndMaxPreserved: true, beginnerTipPreserved: true,
        originalOverviewPreserved: scenario.name === 'original', startVerified: true, exactSourceReturnVerified: scenario.name === 'generated' });
      await context.close();
    }
  }
  const after = await get<GameWorld>(`/api/workshop/projects/${id}/world?version=${world.version}`);
  assert.deepEqual(after.resources, world.resources);
  assert.deepEqual(after.mechanics, world.mechanics);
  assert.deepEqual(after.generated?.editorial, world.generated?.editorial);
  assert.deepEqual(await get<ImportedSource>(`/api/workshop/projects/${id}/source`), source);
  assert.deepEqual(errors, []); assert.deepEqual(mutationRequests, []);
  const record = { status: 'passed', base, readOnly: true, liveApiOnly: true, id, version: world.version,
    editorial: world.generated?.editorial, sourceSha256: createHash('sha256').update(source.text).digest('hex'),
    publishedMechanicsAndResourcesUnchanged: true, results, errors, mutationRequests };
  await writeFile(resolve(output, 'verification.json'), JSON.stringify(record, null, 2));
  console.log(JSON.stringify({ output, ...record }, null, 2));
} finally {
  await browser.close();
}
