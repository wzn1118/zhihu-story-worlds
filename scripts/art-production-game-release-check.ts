import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { explore } from '../tests/core-creative-support.ts';
import { defaultSettings, storageKeys } from '../src/game.ts';
import type { GameWorld } from '../shared/types.ts';

const base = process.env.ART_GAME_URL ?? 'http://127.0.0.1:4173';
const folder = resolve('output/imagegen/scene-production/game-release-20260910');
await mkdir(folder, { recursive: true });
const manifest = JSON.parse(await readFile('public/generated-art/production-manifest.json', 'utf8'));
const target = manifest.worlds.find((w: { worldId: string }) => w.worldId === 'double-pursuit');
const asset = target.assets.find((a: { nodeId: string }) => a.nodeId === 'window');
assert.equal(asset.gameReady, true);
const world = await (await fetch(`${base}/api/worlds/${target.storyId}`)).json() as GameWorld;
const path = explore(world).nodes.get('window'); assert.ok(path);
const browser = await chromium.launch({ headless: true,
  executablePath: 'C:/Users/10847/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe' });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage(), errors: string[] = [];
page.on('pageerror', error => errors.push(error.message));
await context.addInitScript(({ keys, settings }) => {
  localStorage.setItem(keys.onboarding, 'true'); localStorage.setItem(keys.settings, JSON.stringify(settings));
}, { keys: storageKeys, settings: { ...defaultSettings, reducedMotion: true, textSpeed: 100 } });
try {
  await page.goto(base, { waitUntil: 'networkidle', timeout: 60000 });
  const inventory = await page.evaluate(async () => {
    const modulePath = '/src/published-art.ts';
    const { withPublishedArt } = await import(modulePath);
    const m = await (await fetch('/generated-art/production-manifest.json', { cache: 'no-store' })).json();
    const rows = [];
    for (const entry of m.worlds) {
      const response = await fetch(`/api/worlds/${entry.storyId}`);
      if (!response.ok) throw new Error(`WORLD_HTTP_${response.status}:${entry.worldId}`);
      const w = await withPublishedArt(await response.json());
      const scenes = Object.entries(w.nodes).filter(([, node]: [string, any]) => node.background?.startsWith('/generated-art/scene_'));
      rows.push({ worldId: w.id, sceneSlots: scenes.length,
        portraitBindings: [...w.characters, ...(w.artCharacters ?? [])].filter((c: any) => c.portrait?.startsWith('/generated-art/scene_'))
          .map((c: any) => ({ id: c.id, url: c.portrait })),
        stagedPortraits: Object.values(w.nodes).filter((node: any) => node.character).length,
        portraits: w.characters.filter((c: any) => c.portrait?.startsWith('/generated-art/scene_')).length,
        reactions: w.characters.filter((c: any) => c.portraits?.reaction?.startsWith('/generated-art/scene_')).length,
        cover: w.cover.startsWith('/generated-art/scene_'),
        bindingUrls: scenes.map(([, node]: [string, any]) => node.background) });
    }
    return rows;
  });
  const corrections = JSON.parse(await readFile('output/imagegen/scene-production/formal-production-20260907/inspection-wave42-20260910/review-report.json', 'utf8'));
  const newPortraits = corrections.results.filter((row: any) => row.decision === 'approved');
  for (const row of newPortraits) {
    const actual = inventory.find(entry => entry.worldId === row.worldId)?.portraitBindings
      .find((entry: any) => entry.id === row.nodeId.slice('__art_character_'.length));
    assert.equal(actual?.url, `/generated-art/${row.jobId}.png`, `New approved portrait must bind: ${row.jobId}`);
  }
  const newDecoded = await page.evaluate(async (portraits: any[]) => Promise.all(portraits.map(async row => {
    const image = new Image(); image.src = `/generated-art/${row.jobId}.png`; await image.decode();
    return { jobId: row.jobId, width: image.naturalWidth, height: image.naturalHeight };
  })), newPortraits);
  for (const decoded of newDecoded) {
    const expected = newPortraits.find((row: any) => row.jobId === decoded.jobId);
    assert.deepEqual([decoded.width, decoded.height], expected.dimensions);
  }
  await page.locator('.story-card').filter({ has: page.getByRole('heading', { name: '李冬原著：同时被两个精神病追杀', exact: true }) })
    .getByRole('button', { name: '玩改编', exact: true }).click();
  await page.getByRole('button', { name: '开始故事', exact: true }).click();
  for (const id of path) {
    let state: any;
    for (let attempt = 0; attempt < 65; attempt++) {
      state = JSON.parse(await page.evaluate(() => window.render_game_to_text!()));
      if (state.choices?.length) break;
      if (await page.locator('button.dialogue-next').isVisible()) await page.locator('button.dialogue-next').click();
      await page.waitForTimeout(80);
    }
    const index = state.choices.findIndex((choice: { id: string }) => choice.id === id); assert.ok(index >= 0);
    await page.locator('.choice-button').nth(index).click();
    await page.waitForTimeout(150);
  }
  await page.locator(`img.scene-image[src="${asset.asset.url}"]`).waitFor();
  const displayed = await page.locator(`img.scene-image[src="${asset.asset.url}"]`).evaluate((img: HTMLImageElement) =>
    ({ src: img.getAttribute('src'), width: img.naturalWidth, height: img.naturalHeight, complete: img.complete }));
  assert.equal(displayed.width, asset.asset.width); assert.equal(displayed.height, asset.asset.height);
  assert.equal(displayed.complete, true); assert.deepEqual(errors, []);
  await page.screenshot({ path: resolve(folder, 'game-window.png'), animations: 'disabled' });
  const report = { at: new Date().toISOString(), base, manifestCounts: manifest.counts, inventory,
    boundSceneSlots: inventory.reduce((n, row) => n + row.sceneSlots, 0), displayed, actualChoices: path, errors, newDecoded,
    paidRequests: 0, sharedServerRestarts: 0 };
  await writeFile(resolve(folder, 'verification.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ boundSceneSlots: report.boundSceneSlots, worlds: inventory.length, displayed, errors, folder }));
} catch (error) {
  await page.screenshot({ path: resolve(folder, 'failure.png') }).catch(() => {});
  throw error;
} finally { await browser.close(); }
