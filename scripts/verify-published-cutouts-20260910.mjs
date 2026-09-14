import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { storageKeys, defaultSettings } from '../src/game.ts';
import { blueBlood } from '../content/worlds.ts';
const base = 'http://127.0.0.1:4173';
const folder = 'output/coordination/cutout-followup-20260910';
await mkdir(folder, { recursive: true });
const response = await fetch(`${base}/generated-art/character-cutouts.json`);
assert.equal(response.status, 200);
const manifest = await response.json();
const production = await (await fetch(`${base}/generated-art/production-manifest.json`)).json();
const trainer = manifest.entries.find(entry => entry.worldId === 'blue-blood' && entry.nodeId === '__art_character_trainer');
assert.ok(trainer, 'A published trainer cutout is required for this acceptance');
const original = await fetch(`${base}${trainer.url}`);
assert.equal(original.status, 200);
assert.equal(createHash('sha256').update(Buffer.from(await original.arrayBuffer())).digest('hex'), trainer.sha256);
const report = { at: new Date().toISOString(), published: manifest.entries.length, manifestAt: manifest.generatedAt, views: [] };
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ keys, settings }) => {
      localStorage.setItem(keys.onboarding, 'true');
      localStorage.setItem(keys.settings, JSON.stringify(settings));
    }, { keys: storageKeys, settings: { ...defaultSettings, textSpeed: 100, reducedMotion: true } });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.locator('.story-card').filter({ has: page.getByRole('heading', { name: '蓝血', exact: true }) }).getByRole('button', { name: '玩改编', exact: true }).click({ timeout: 45000 });
    await page.getByRole('dialog', { name: '世界序章', exact: true }).getByRole('button', { name: '开始故事', exact: true }).click();
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).nodeId === 'training');
    const state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
    await writeFile(`${folder}/game-debug-${viewport.width}.json`, JSON.stringify({ state, requests: await page.evaluate(() => performance.getEntriesByType('resource').filter(resource => resource.name.includes('manifest') || resource.name.includes('cutouts')).map(resource => ({ name: resource.name, duration: resource.duration, size: resource.transferSize }))) }, null, 2));
    await page.screenshot({ path: `${folder}/game-debug-${viewport.width}.png` });
    assert.equal(state.nodeId, 'training');
    assert.equal(state.difficulty, 'challenge');
    let display;
    if (state.visuals.character) {
      await page.waitForFunction(url => [...document.querySelectorAll('.character-portrait')].some(image => image.getAttribute('src') === url && image.complete && image.naturalWidth > 0), trainer.url);
      display = 'approved-transparent-portrait';
    } else {
      const scene = production.worlds.find(world => world.worldId === 'blue-blood')?.assets.find(asset => asset.nodeId === state.nodeId && asset.assetKind === 'scene' && asset.review === 'approved' && asset.bindingReady && asset.gameReady && asset.asset.url === state.visuals.background);
      const authoredActor = blueBlood.nodes[state.nodeId].character?.id;
      if (!scene) {
        assert.ok(authoredActor, 'An authored actor must explain why the supporting trainer cannot replace it');
        assert.ok(!manifest.entries.some(entry => entry.worldId === 'blue-blood' && entry.nodeId === `__art_character_${authoredActor}`), 'An approved authored actor should appear in this empty environment');
      }
      assert.equal(await page.locator('.character-portrait').count(), 0);
      display = scene ? 'approved-complete-scene-without-overlay' : `authored-actor-awaiting-cutout:${authoredActor}`;
    }
    await page.waitForFunction(() => [...document.querySelectorAll('.scene-image')].some(image => image.complete && image.naturalWidth > 0));
    await page.screenshot({ path: `${folder}/transparent-game-${viewport.width}.png` });
    await page.goto(`${base}/generated-art/cutouts/`, { waitUntil: 'domcontentloaded' });
    const image = page.locator(`img[src="${trainer.url}"]`);
    await image.scrollIntoViewIfNeeded();
    await page.waitForFunction(url => [...document.images].some(image => image.getAttribute('src') === url && image.complete && image.naturalWidth > 0), trainer.url);
    const decoded = await image.evaluate(image => ({ url: image.getAttribute('src'), width: image.naturalWidth, height: image.naturalHeight }));
    assert.equal(decoded.width, trainer.width);
    assert.equal(decoded.height, trainer.height);
    await page.screenshot({ path: `${folder}/transparent-gallery-${viewport.width}.png` });
    assert.deepEqual(errors, []);
    report.views.push({ viewport, decoded, nodeId: state.nodeId, display, errors });
    await page.close();
  }
} finally {
  await browser.close();
  await writeFile(`${folder}/game-cutout-verification.json`, JSON.stringify(report, null, 2));
}
console.log(JSON.stringify(report));
