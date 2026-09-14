import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { authoredWorlds } from '../content/worlds.ts';
import { compileWorld } from '../server/worlds.ts';
import { startSession, choose, saveSession, defaultSettings, storageKeys } from '../src/game.ts';
import { withPublishedArt } from '../src/published-art.ts';

const base = 'http://127.0.0.1:4173';
const folder = 'output/coordination/art-in-game-20260910/environments';
await mkdir(folder, { recursive: true });
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, options) => originalFetch(typeof input === 'string' && input.startsWith('/') ? `${base}${input}` : input, options);

function reachableSave(world, target) {
  const queue = [[]], visited = new Set();
  for (let index = 0; index < queue.length && index < 1600; index++) {
    const path = queue[index];
    let session = startSession(world, { difficulty: 'classic' });
    for (const choiceId of path) session = choose(session, session.choices.find(choice => choice.id === choiceId));
    if (session.node.id === target) return { saved: saveSession(session), path };
    const fingerprint = JSON.stringify([session.node.id, session.clues, session.resources, session.resolve, session.trust]);
    if (visited.has(fingerprint) || path.length > 16) continue;
    visited.add(fingerprint);
    for (const choice of session.choices) queue.push([...path, choice.id]);
  }
  return null;
}

const manifest = await (await fetch(`${base}/generated-art/production-manifest.json`)).json();
assert.ok(manifest.worlds.some(world => world.environmentPlacements), 'Formal environment placement publication is required');
const targets = [];
for (const id of ['rotten-pilgrimage', 'ming-whisper', 'hollow-immortals']) {
  const authored = authoredWorlds.find(world => world.id === id);
  const world = await withPublishedArt(compileWorld(authored));
  const entry = manifest.worlds.find(entry => entry.worldId === id);
  const semanticUrls = new Set(entry.assets.filter(asset => entry.environmentPlacements?.[asset.nodeId]
    && !asset.nodeId.startsWith(`__art_environment_${id}-`) && asset.review === 'approved' && asset.bindingReady).map(asset => asset.asset.url));
  for (const node of Object.values(world.nodes)) {
    if (node.backgroundArtKind !== 'environment' || !semanticUrls.has(node.background)) continue;
    const replay = reachableSave(world, node.id);
    if (replay) { targets.push({ world, node, ...replay, kind: 'environment' }); break; }
  }
}
// Include a real complete illustration to verify the overlay exclusion in the browser.
for (const authored of authoredWorlds) {
  const world = await withPublishedArt(compileWorld(authored));
  const node = world.nodes[world.startNodeId];
  if (node.backgroundArtKind === 'scene') { targets.push({ world, node, saved: saveSession(startSession(world, { difficulty: 'classic' })), path: [], kind: 'scene' }); break; }
}
assert.ok(targets.filter(target => target.kind === 'environment').length >= 2, 'Need at least two independently mapped environments');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const report = { at: new Date().toISOString(), manifestAt: manifest.generatedAt, cases: [] };
try {
  for (const target of targets) {
    const viewport = target.world.id === 'ming-whisper' ? { width: 390, height: 844 } : { width: 1440, height: 1000 };
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ saved, keys, settings }) => {
      localStorage.setItem(keys.auto, JSON.stringify(saved));
      localStorage.setItem(keys.onboarding, 'true');
      localStorage.setItem(keys.settings, JSON.stringify(settings));
    }, { saved: target.saved, keys: storageKeys, settings: { ...defaultSettings, textSpeed: 100, reducedMotion: true } });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    if (viewport.width > 800) await page.locator('.current-world').click();
    else {
      await page.getByRole('button', { name: '我的存档', exact: true }).click();
      await page.getByRole('dialog', { name: '保存与载入', exact: true }).locator('.save-slot').first().getByRole('button', { name: '载入', exact: true }).click();
    }
    await page.waitForFunction(({ id, url }) => {
      const state = JSON.parse(window.render_game_to_text());
      const image = document.querySelector('.scene-image');
      return state.nodeId === id && image?.getAttribute('src') === url && image.complete && image.naturalWidth > 0;
    }, { id: target.node.id, url: target.node.background });
    const state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
    assert.equal(state.visuals.background, target.node.background);
    if (target.kind === 'scene') assert.equal(await page.locator('.character-portrait').count(), 0);
    await page.screenshot({ path: `${folder}/${target.world.id}-${target.node.id}.png`, fullPage: true });
    assert.deepEqual(errors, []);
    report.cases.push({ worldId: target.world.id, nodeId: target.node.id, kind: target.kind,
      url: target.node.background, route: target.path, viewport, backgroundState: state.visuals.backgroundState, errors });
    await page.close();
  }
} finally {
  await browser.close();
  await writeFile(`${folder}/report.json`, JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ cases: report.cases.length, report: `${folder}/report.json` }));
