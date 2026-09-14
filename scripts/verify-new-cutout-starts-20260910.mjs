import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { defaultSettings, storageKeys } from '../src/game.ts';

const root = 'http://127.0.0.1:4173';
const folder = 'output/coordination/ceo-cutout-integration-20260910';
await mkdir(folder, { recursive: true });
const coverage = JSON.parse(await readFile('output/coordination/cutout-game-integration-20260910/ceo-baseline-coverage.json', 'utf8'));
const targets = ['blue-blood', 'ming-whisper', 'six-roots'].map(id => coverage.worlds.find(world => world.worldId === id));
const manifest = await (await fetch(`${root}/generated-art/character-cutouts.json`)).json();
const report = { at: new Date().toISOString(), publishedAt: manifest.generatedAt, published: manifest.entries.length, cases: [] };
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const world of targets) {
    const expected = world.usableNodes.find(node => node.nodeId === world.startNodeId);
    const proof = manifest.entries.find(entry => entry.url === expected.url);
    assert.ok(proof);
    const png = await (await fetch(`${root}${proof.url}`, { cache: 'no-store' })).arrayBuffer();
    assert.equal(createHash('sha256').update(Buffer.from(png)).digest('hex'), proof.sha256);
    const viewport = world.worldId === 'ming-whisper' ? { width: 390, height: 844 } : { width: 1440, height: 1000 };
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ keys, settings }) => {
      localStorage.setItem(keys.onboarding, 'true');
      localStorage.setItem(keys.settings, JSON.stringify(settings));
    }, { keys: storageKeys, settings: { ...defaultSettings, textSpeed: 100, reducedMotion: true } });
    await page.goto(root, { waitUntil: 'domcontentloaded' });
    await page.locator('.story-card').filter({ has: page.getByRole('heading', { name: world.title, exact: true }) }).getByRole('button', { name: '玩改编', exact: true }).click();
    await page.getByRole('dialog', { name: '世界序章', exact: true }).getByRole('button', { name: '开始故事', exact: true }).click();
    await page.waitForFunction(({ url, nodeId, actor }) => {
      const state = JSON.parse(window.render_game_to_text());
      const image = document.querySelector('.character-portrait');
      return state.nodeId === nodeId && state.visuals.character?.id === actor && image?.complete
        && image.naturalWidth > 0 && new URL(image.src).pathname === url;
    }, { url: expected.url, nodeId: world.startNodeId, actor: expected.characterId });
    const decoded = await page.locator('.character-portrait').evaluate(image => ({ width: image.naturalWidth, height: image.naturalHeight }));
    assert.deepEqual(decoded, { width: proof.width, height: proof.height });
    const state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
    assert.equal(state.difficulty, 'challenge');
    await page.screenshot({ path: `${folder}/${world.worldId}-${viewport.width}.png`, fullPage: true });
    assert.deepEqual(errors, []);
    report.cases.push({ worldId: world.worldId, nodeId: state.nodeId, characterId: state.visuals.character.id,
      jobId: proof.jobId, sourceSha256: proof.sourceSha256, sha256: proof.sha256, url: proof.url, viewport, decoded, errors });
    await page.close();
  }
} finally {
  await browser.close();
  await writeFile(`${folder}/new-starts-report.json`, JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ published: report.published, verifiedStarts: report.cases.length, report: `${folder}/new-starts-report.json` }));
