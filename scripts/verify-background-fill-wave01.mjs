import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { authoredWorlds } from '../content/worlds.ts';
import { compileWorld } from '../server/worlds.ts';
import { startSession, choose, saveSession, defaultSettings, storageKeys } from '../src/game.ts';
import { withPublishedArt } from '../src/published-art.ts';

const base = 'http://127.0.0.1:4173';
const output = 'output/coordination/background-fill-20260911/qa-wave01';
const screenshots = 'output/playwright/background-fill-20260911';
await mkdir(output, { recursive: true });
await mkdir(screenshots, { recursive: true });

const nativeFetch = globalThis.fetch;
globalThis.fetch = (input, init) => nativeFetch(
  typeof input === 'string' && input.startsWith('/') ? `${base}${input}` : input, init,
);

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const pngSize = (bytes) => {
  assert.equal(bytes.toString('ascii', 1, 4), 'PNG');
  assert.equal(bytes.toString('ascii', 12, 16), 'IHDR');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
};
const getState = (page) => page.evaluate(() => JSON.parse(window.render_game_to_text()));

const manifestResponse = await nativeFetch(`${base}/generated-art/production-manifest.json?qa=${Date.now()}`);
assert.equal(manifestResponse.status, 200);
const manifest = await manifestResponse.json();
const indexHtml = await (await nativeFetch(`${base}/`)).text();
const bundle = indexHtml.match(/<script[^>]+src="([^"]+)"/)?.[1];
assert.equal(bundle, '/assets/index-Cl3Xz2c9.js');

const cases = [
  {
    id: 'velvet-alibi-dinner-desktop', worldId: 'velvet-alibi', target: 'dinner',
    viewport: { width: 1440, height: 1000 }, chosen: 'protect_evening', next: 'club',
    expectedDelta: { trust: 7 }, screenshot: 'velvet-alibi-dinner-1440.png',
  },
  {
    id: 'ming-whisper-escort-sickcamp-mobile', worldId: 'ming-whisper', target: 'escort_sickcamp',
    viewport: { width: 390, height: 844, isMobile: true, hasTouch: true },
    path: ['route_escort', 'escort_take_grain', 'escort_detour', 'escort_feed'],
    chosen: 'escort_kitchens', next: 'escort_command', expectedDelta: { grain: -2 },
    screenshot: 'ming-whisper-escort_sickcamp-390.png',
  },
];

function buildSaved(world, path = []) {
  let session = startSession(world, { difficulty: 'classic' });
  for (const choiceId of path) {
    const choice = session.choices.find(candidate => candidate.id === choiceId);
    assert.ok(choice, `${world.id}: path choice ${choiceId} must be enabled`);
    session = choose(session, choice);
  }
  return saveSession(session);
}

function expectedEnvironment(manifestWorld, nodeId) {
  const placement = Object.entries(manifestWorld.environmentPlacements ?? {})
    .find(([, entry]) => entry.nodeIds.includes(nodeId));
  assert.ok(placement, `${manifestWorld.worldId}/${nodeId}: environment placement missing`);
  const asset = manifestWorld.assets.find(row => row.nodeId === placement[0]);
  assert.ok(asset, `${manifestWorld.worldId}/${nodeId}: environment asset missing`);
  assert.equal(asset.review, 'approved');
  assert.equal(asset.bindingReady, true);
  return { placement: placement[0], asset };
}

async function revealParagraphs(page) {
  for (let index = 0; index < 12; index += 1) {
    const current = await getState(page);
    if (current.choices?.length) return current;
    const next = page.locator('button.dialogue-next');
    assert.ok(await next.count(), 'dialogue must expose a next control');
    await next.click();
    await page.waitForTimeout(20);
  }
  throw new Error('dialogue did not reveal choices');
}

async function openSaved(page, mobile) {
  await page.getByRole('button', { name: '我的存档', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '保存与载入', exact: true });
  await dialog.waitFor({ state: 'visible' });
  const load = dialog.locator('.save-slot').first().getByRole('button', { name: '载入', exact: true });
  await load.waitFor({ state: 'visible' });
  await load.click();
}

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const report = { at: new Date().toISOString(), base, bundle, manifestAt: manifest.generatedAt, cases: [] };
try {
  for (const spec of cases) {
    const authored = authoredWorlds.find(world => world.id === spec.worldId);
    assert.ok(authored, `${spec.worldId}: authored world missing`);
    const world = await withPublishedArt(compileWorld(authored));
    const node = world.nodes[spec.target];
    assert.ok(node, `${spec.worldId}/${spec.target}: node missing`);
    const manifestWorld = manifest.worlds.find(entry => entry.worldId === spec.worldId
      && entry.storyId === world.storyId && entry.version === world.version);
    assert.ok(manifestWorld, `${spec.worldId}: current manifest world missing`);
    const expected = expectedEnvironment(manifestWorld, spec.target);
    assert.equal(node.backgroundArtKind, 'environment');
    assert.equal(node.background, expected.asset.asset.url);
    const imageResponse = await nativeFetch(`${base}${expected.asset.asset.url}?qa=${Date.now()}`);
    assert.equal(imageResponse.status, 200);
    const imageBytes = Buffer.from(await imageResponse.arrayBuffer());
    const digest = sha256(imageBytes);
    assert.equal(digest, expected.asset.asset.sha256);
    const dimensions = pngSize(imageBytes);
    assert.deepEqual(dimensions, { width: expected.asset.asset.width, height: expected.asset.asset.height });

    const saved = buildSaved(world, spec.path ?? []);
    assert.equal(saved.nodeId, spec.target);
    const context = await browser.newContext({ viewport: spec.viewport });
    const page = await context.newPage();
    const pageErrors = [], consoleErrors = [], badResponses = [], backgroundRequests = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('response', response => {
      if (response.status() >= 400) badResponses.push({ status: response.status(), url: response.url() });
      if (response.url().includes(expected.asset.asset.url)) backgroundRequests.push(response.status());
    });
    await page.addInitScript(({ savedGame, keys, settings }) => {
      if (!localStorage.getItem(keys.auto)) localStorage.setItem(keys.auto, JSON.stringify(savedGame));
      localStorage.setItem(keys.onboarding, 'true');
      localStorage.setItem(keys.settings, JSON.stringify(settings));
    }, { savedGame: saved, keys: storageKeys, settings: { ...defaultSettings, textSpeed: 100, reducedMotion: true } });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
    await openSaved(page, Boolean(spec.viewport.isMobile));
    await page.waitForTimeout(1000);
    await page.waitForFunction(({ nodeId, background }) => {
      const state = JSON.parse(window.render_game_to_text());
      const image = document.querySelector('img.scene-image:not(.scene-backdrop)');
      return state.nodeId === nodeId && state.visuals.background === background
        && state.visuals.backgroundState?.status === 'ready'
        && !state.visuals.backgroundFallback && image?.complete && image.naturalWidth > 0
        && getComputedStyle(image).visibility === 'visible';
    }, { nodeId: spec.target, background: expected.asset.asset.url });
    const before = await getState(page);
    const visibleImage = page.locator('img.scene-image:not(.scene-backdrop)');
    assert.equal(await visibleImage.count(), 1);
    const imageBox = await visibleImage.boundingBox();
    assert.ok(imageBox && imageBox.width > 0 && imageBox.height > 0, 'background image must have visible pixels');
    assert.equal(await page.locator('img.scene-backdrop').count(), 0, 'local-vector fallback must be absent');
    const overlayCount = await page.locator('.character-layer').count();
    if (overlayCount) assert.equal(node.backgroundArtKind, 'environment');
    const initialResources = { ...before.resources };
    const initialTrust = before.trust;
    const shown = await revealParagraphs(page);
    const choice = shown.choices.find(candidate => candidate.id === spec.chosen);
    assert.ok(choice, `${spec.target}: expected choice ${spec.chosen} must be visible`);
    await page.locator('.choice-button').filter({ hasText: choice.text }).click();
    await page.waitForFunction(nodeId => JSON.parse(window.render_game_to_text()).nodeId === nodeId, spec.next);
    const after = await getState(page);
    if (spec.expectedDelta.trust) assert.equal(after.trust - initialTrust, spec.expectedDelta.trust);
    if (spec.expectedDelta.grain) assert.equal(after.resources.grain - initialResources.grain, spec.expectedDelta.grain);
    await page.waitForFunction(({ key, nodeId }) => {
      try { return JSON.parse(localStorage.getItem(key) ?? 'null')?.nodeId === nodeId; } catch { return false; }
    }, { key: storageKeys.auto, nodeId: spec.next });
    const savedAfterChoice = JSON.parse(await page.evaluate(key => localStorage.getItem(key), storageKeys.auto));
    await page.screenshot({ path: `${screenshots}/${spec.screenshot}`, fullPage: true });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
    await openSaved(page, Boolean(spec.viewport.isMobile));
    await page.waitForFunction(nodeId => JSON.parse(window.render_game_to_text()).nodeId === nodeId, spec.next);
    const reloaded = await getState(page);
    assert.deepEqual(reloaded.resources, after.resources);
    assert.equal(reloaded.choiceCount, after.choiceCount);
    assert.deepEqual(reloaded.clues, after.clues);
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
    assert.equal(badResponses.length, 0);
    assert.ok(backgroundRequests.includes(200), 'browser must GET the approved background');
    report.cases.push({
      id: spec.id, worldId: spec.worldId, targetNode: spec.target, nextNode: spec.next,
      viewport: spec.viewport, route: spec.path ?? [], selectedChoice: spec.chosen,
      environmentPlacement: expected.placement, background: {
        url: expected.asset.asset.url, review: expected.asset.review, bindingReady: expected.asset.bindingReady,
        sha256: digest, manifestSha256: expected.asset.asset.sha256, dimensions, bytes: imageBytes.length,
        browserRequests: backgroundRequests, visiblePixels: imageBox, fallback: before.visuals.backgroundFallback,
      }, characterOverlayCount: overlayCount, stateBefore: { nodeId: before.nodeId, resources: before.resources, trust: before.trust },
      stateAfterChoice: { nodeId: after.nodeId, resources: after.resources, trust: after.trust, choiceCount: after.choiceCount },
      autoSaveNodeId: savedAfterChoice.nodeId,
      reload: { nodeId: reloaded.nodeId, resources: reloaded.resources, clues: reloaded.clues, choiceCount: reloaded.choiceCount },
      screenshot: `${screenshots}/${spec.screenshot}`, pageErrors, consoleErrors, badResponses,
    });
    await context.close();
  }
  assert.equal(report.cases.length, 2);
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: 'passed', cases: report.cases.length, report: `${output}/report.json` }, null, 2));
} catch (error) {
  await writeFile(`${output}/report.json`, JSON.stringify({ ...report, status: 'failed', error: String(error) }, null, 2));
  throw error;
} finally {
  await browser.close();
}
