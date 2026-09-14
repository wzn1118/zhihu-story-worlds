import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { authoredWorlds } from '../content/worlds.ts';
import { defaultSettings, storageKeys } from '../src/game.ts';

const root = 'http://127.0.0.1:4173';
const folder = 'output/coordination/ceo-cutout-integration-20260910/overview';
await mkdir(folder, { recursive: true });
const manifest = await (await fetch(`${root}/generated-art/character-cutouts.json`)).json();
const report = { at: new Date().toISOString(), manifestAt: manifest.generatedAt, published: manifest.entries.length, cases: [] };
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const target of [
    { world: 'blue-blood', width: 390, actors: [{ id: 'trainer', expression: 'main' }, { id: 'trainer', expression: 'reaction' }] },
    { world: 'future-island', width: 1440, actors: [{ id: 'xiwei_old', expression: 'main' }, { id: 'wencheng_old', expression: 'reaction' }] },
  ]) {
    const world = authoredWorlds.find(world => world.id === target.world);
    const page = await browser.newPage({ viewport: { width: target.width, height: target.width === 390 ? 844 : 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ keys, settings }) => {
      localStorage.setItem(keys.onboarding, 'true');
      localStorage.setItem(keys.settings, JSON.stringify(settings));
    }, { keys: storageKeys, settings: { ...defaultSettings, textSpeed: 100, reducedMotion: true } });
    await page.goto(root, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(id => JSON.parse(window.render_game_to_text()).stories?.some(story => story.id === id), world.storyId);
    const sourceTitle = await page.evaluate(id => JSON.parse(window.render_game_to_text()).stories.find(story => story.id === id).title, world.storyId);
    await page.locator('.story-card').filter({ has: page.getByRole('heading', { name: sourceTitle, exact: true }) }).getByRole('button', { name: '玩改编', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '世界序章', exact: true });
    for (const actor of target.actors) {
      const entry = manifest.entries.find(entry => entry.worldId === target.world
        && entry.nodeId === `__art_${actor.expression === 'main' ? 'character' : 'reaction'}_${actor.id}`);
      assert.ok(entry, `Missing approved ${target.world}/${actor.id}/${actor.expression}`);
      const card = dialog.locator(`[data-character-id="${actor.id}"]`);
      const label = actor.expression === 'main' ? '立绘' : '立绘表情';
      await card.getByRole('button', { name: label, exact: true }).click();
      const image = card.locator('img');
      await image.scrollIntoViewIfNeeded();
      await page.waitForFunction(({ actorId, url, sha }) => {
        const image = document.querySelector(`[data-character-id="${actorId}"] img`);
        return image?.complete && image.naturalWidth > 0 && new URL(image.src).pathname === url
          && new URL(image.src).searchParams.get('sha256') === sha;
      }, { actorId: actor.id, url: entry.url, sha: entry.sha256 });
      const decoded = await image.evaluate(image => ({ width: image.naturalWidth, height: image.naturalHeight }));
      assert.deepEqual(decoded, { width: entry.width, height: entry.height });
      const response = await fetch(`${root}${entry.url}`, { cache: 'no-store' });
      assert.equal(response.status, 200);
      const sha = createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');
      assert.equal(sha, entry.sha256);
      assert.equal(await card.getByRole('button', { name: label, exact: true }).getAttribute('aria-pressed'), 'true');
      await page.screenshot({ path: `${folder}/${target.world}-${actor.id}-${actor.expression}.png` });
      const originalLabel = actor.expression === 'main' ? '人物' : '表情';
      await card.getByRole('button', { name: originalLabel, exact: true }).click();
      assert.ok(!(await image.getAttribute('src')).startsWith('/generated-art/cutouts/'));
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      assert.equal(overflow, false);
      report.cases.push({ worldId: world.id, characterId: actor.id, expression: actor.expression,
        width: target.width, sha256: sha, url: entry.url, decoded, originalReferenceRetained: true, overflow });
    }
    await dialog.getByRole('button', { name: '开始故事', exact: true }).click();
    await page.waitForFunction(id => JSON.parse(window.render_game_to_text()).worldId === id, world.id);
    assert.equal(await page.evaluate(() => JSON.parse(window.render_game_to_text()).difficulty), 'challenge');
    assert.deepEqual(errors, []);
    await page.close();
  }
} finally {
  await browser.close();
  await writeFile(`${folder}/report.json`, JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ cases: report.cases.length, published: report.published, report: `${folder}/report.json` }));
