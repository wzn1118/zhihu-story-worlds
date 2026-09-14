import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, type Page } from 'playwright';
import type { GameWorld } from '../shared/types.ts';
import { defaultSettings, storageKeys } from '../src/game.ts';
import { explore } from '../tests/core-creative-support.ts';

const base = process.env.WORKSHOP_URL ?? 'http://127.0.0.1:4173';
const sourceId = '2025333783608537435';
const nodeId = 'ending_pursuit_loss';
const asset = '/generated-art/scene_89cce0808c88ddb09926000189a4.png';
const sha256 = 'e837cccbdf2863603abcdf2a879009d1cbb947cf821a336f704d8a18c0893d17';
const output = resolve('output/playwright/zhihu-art-integration', new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(output, { recursive: true });
const worlds: { port: number; boundScenes: string[] }[] = [];
for (const port of [4173, 4174]) {
  const response = await fetch(`http://127.0.0.1:${port}/api/worlds/${sourceId}`);
  assert.equal(response.status, 200);
  const world = await response.json() as GameWorld;
  assert.equal(world.nodes[nodeId].background, asset);
  const boundScenes = Object.values(world.nodes).filter(node => node.background === asset).map(node => node.id);
  assert.deepEqual(boundScenes, [nodeId]);
  worlds.push({ port, boundScenes });
}
const response = await fetch(`${base}${asset}`);
assert.equal(response.status, 200);
assert.equal(response.headers.get('content-type'), 'image/png');
const bytes = Buffer.from(await response.arrayBuffer());
assert.equal(bytes.length, 6538698);
assert.equal(createHash('sha256').update(bytes).digest('hex'), sha256);
assert.equal(bytes.readUInt32BE(16), 4096);
assert.equal(bytes.readUInt32BE(20), 2305);
const world = await (await fetch(`${base}/api/worlds/${sourceId}`)).json() as GameWorld;
const path = explore(world).nodes.get(nodeId);
assert.ok(path, 'The reviewed scene is reachable through actual game decisions');
const browser = await chromium.launch({ executablePath: 'C:/Users/10847/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe', headless: true });
const results: unknown[] = [], errors: string[] = [];
let page: Page | undefined;
const state = async (page: Page) => JSON.parse(await page.evaluate(() => window.render_game_to_text!()));
async function choices(page: Page) {
  for (let attempt = 0; attempt < 60; attempt++) {
    await page.waitForTimeout(80);
    const current = await state(page);
    if (current.mode === 'ending' || current.choices?.length) return current;
    const next = page.locator('button.dialogue-next');
    if (await next.isVisible()) await next.click();
  }
  throw new Error('The current scene did not expose its decisions');
}
console.log(`Evidence: ${output}`);
try {
  for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport });
    context.setDefaultTimeout(45000);
    await context.addInitScript(({ keys, settings }) => {
      localStorage.setItem(keys.onboarding, 'true');
      localStorage.setItem(keys.settings, JSON.stringify(settings));
    }, { keys: storageKeys, settings: { ...defaultSettings, textSpeed: 100, reducedMotion: true } });
    page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base, { waitUntil: 'networkidle' });
    const card = page.locator('.story-card').filter({ has: page.getByRole('heading', { name: '李冬原著：同时被两个精神病追杀', exact: true }) });
    await card.getByRole('button', { name: '玩改编', exact: true }).click();
    await page.getByRole('button', { name: '开始故事', exact: true }).click();
    for (const id of path) {
      const current = await choices(page);
      const index = current.choices.findIndex((choice: { id: string }) => choice.id === id);
      assert.ok(index >= 0, `Actually offered choice: ${id}`);
      const next = world.nodes[current.nodeId].choices.find(choice => choice.id === id)!.nextNodeId;
      await page.locator('.choice-button').nth(index).click();
      await page.waitForFunction(next => JSON.parse(window.render_game_to_text!()).nodeId === next, next);
    }
    assert.equal((await state(page)).nodeId, nodeId);
    const img = page.locator(`.ending-view .scene-image[src="${asset}"][data-art-state="ready"]`);
    await img.waitFor();
    const pixels = await img.evaluate((image: HTMLImageElement) => {
      const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 36;
      const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0, 64, 36);
      const data = ctx.getImageData(0, 0, 64, 36).data, colors = new Set<string>();
      for (let i = 0; i < data.length; i += 4) colors.add(`${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`);
      return { width: image.naturalWidth, height: image.naturalHeight, colors: colors.size };
    });
    assert.equal(pixels.width, 4096); assert.equal(pixels.height, 2305); assert.ok(pixels.colors > 20);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.evaluate(() => { scrollTo(0, 0); return document.fonts.ready; });
    await page.screenshot({ path: resolve(output, `${viewport.name}-accepted-scene.png`), animations: 'disabled' });
    results.push({ viewport, ending: nodeId, actualChoiceClicks: path.length, path, asset, pixels });
    await context.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'verification.json'), JSON.stringify({ status: 'passed', base, worlds, sha256, bytes: bytes.length, results, errors, paidRequests: 0, serviceRestarts: 0, acceptanceScope: 'existing internally approved scene binding only' }, null, 2));
  console.log(JSON.stringify({ output, results: results.length, errors }, null, 2));
} catch (error) {
  await page?.screenshot({ path: resolve(output, 'failure.png'), timeout: 10000 }).catch(() => {});
  await writeFile(resolve(output, 'verification.json'), JSON.stringify({ status: 'failed', error: String(error), results, errors }, null, 2));
  throw error;
} finally { await browser.close(); }
