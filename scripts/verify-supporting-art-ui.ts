import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, type Page } from 'playwright';
import { authoredWorlds } from '../content/worlds.ts';
import type { GameWorld } from '../shared/types.ts';
import type { ArtBatch } from '../shared/production.ts';
import { explore } from '../tests/core-creative-support.ts';
import { defaultSettings, storageKeys } from '../src/game.ts';

const base = 'http://127.0.0.1:4183';
const folder = resolve('output/playwright/supporting-art-integration', new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(folder, { recursive: true });
const report: any = { at: new Date().toISOString(), base, fixtures: false, apiMocks: false,
  worlds: [], assets: [], visits: [], errors: [], nonGet: [], pageErrors: [], clicks: 0 };
const recheckFile = process.argv.find(arg => arg.startsWith('--recheck='))?.slice('--recheck='.length);
const recheck = recheckFile ? JSON.parse(await readFile(recheckFile, 'utf8')) : undefined;
if (recheck) report.recheckOf = resolve(recheckFile!);
const get = async (path: string) => {
  const response = await fetch(base + path, { signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200, path); return response.json();
};
const batches = (await get('/api/art/batches')).batches as ArtBatch[];
type Target = { world: GameWorld; nodeId: string; id: string; expression: string; url: string; path: string[] };
const targets: Target[] = [];
for (const source of authoredWorlds) {
  const world = await get(`/api/worlds/${source.storyId}`) as GameWorld;
  const cast = [...world.characters, ...(world.artCharacters ?? [])].filter(c => c.portraits?.main?.startsWith('/generated-art/'));
  report.worlds.push({ id: world.id, storyId: world.storyId, mothers: cast.length,
    supporting: world.artCharacters?.length ?? 0, reactions: cast.filter(c => c.portraits?.reaction).length });
  if (!cast.length && world.id !== 'double-pursuit') continue;
  const routes = explore(world).nodes;
  for (const character of cast) for (const expression of ['main', 'reaction'] as const) {
    const url = character.portraits?.[expression]; if (!url) continue;
    const nodes = Object.values(world.nodes).filter(node => node.character?.id === character.id
      && node.character.expression === expression && routes.has(node.id))
      .sort((a, b) => routes.get(a.id)!.length - routes.get(b.id)!.length);
    if (!nodes.length) { report.errors.push({ worldId: world.id, characterId: character.id, expression, code: 'NO_REACHABLE_DISPLAY_NODE' }); continue; }
    targets.push({ world, nodeId: nodes[0].id, id: character.id, expression, url, path: routes.get(nodes[0].id)! });
  }
  if (world.id === 'double-pursuit' && world.nodes.window.background.startsWith('/generated-art/')) {
    targets.push({ world, nodeId: 'window', id: 'scene', expression: 'scene', url: world.nodes.window.background, path: routes.get('window')! });
  }
}
for (const target of targets) {
  const job = batches.flatMap(batch => batch.jobs).find(job => job.asset?.url === target.url)!;
  const bytes = await readFile(resolve('public', `.${target.url}`));
  const response = await fetch(base + target.url);
  const served = Buffer.from(await response.arrayBuffer());
  const sha = createHash('sha256').update(bytes).digest('hex');
  assert.equal(sha, job.asset!.sha256); assert.deepEqual(served, bytes);
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  report.assets.push({ worldId: target.world.id, characterId: target.id, expression: target.expression,
    url: target.url, sha256: sha, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), nodeId: target.nodeId, path: target.path });
}
const browser = await chromium.launch({ executablePath: 'C:/Users/10847/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe', headless: true });
const state = async (page: Page) => JSON.parse(await page.evaluate(() => window.render_game_to_text!()));
async function decisions(page: Page) {
  for (let i = 0; i < 30; i++) {
    const current = await state(page); if (current.choices?.length || current.mode === 'ending') return current;
    const next = page.locator('button.dialogue-next');
    if (await next.isVisible()) { await next.click(); report.clicks++; }
    await page.waitForTimeout(45);
  }
  throw new Error('CHOICES_NOT_AVAILABLE');
}
try {
  for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
    for (const target of targets) {
      if (recheck && !recheck.errors.some((error: any) => error.worldId === target.world.id && error.characterId === target.id && error.viewport === viewport.name)) continue;
      const context = await browser.newContext({ viewport, isMobile: viewport.name === 'mobile', hasTouch: viewport.name === 'mobile' });
      context.setDefaultTimeout(60000);
      await context.route('**/*', route => {
        if (route.request().method() === 'GET') return route.continue();
        report.nonGet.push({ method: route.request().method(), url: route.request().url() }); return route.abort();
      });
      await context.addInitScript(({ keys, settings }) => { localStorage.setItem(keys.onboarding, 'true'); localStorage.setItem(keys.settings, JSON.stringify(settings)); },
        { keys: storageKeys, settings: { ...defaultSettings, textSpeed: 100, reducedMotion: true } });
      const page = await context.newPage();
      page.on('pageerror', error => report.pageErrors.push(error.message));
      try {
        await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.locator('.story-card').first().waitFor();
        const adaptedCard = page.locator('.story-card').filter({ has: page.getByRole('heading', { name: target.world.title, exact: true }) });
        const card = await adaptedCard.count() ? adaptedCard : page.locator('.story-card').filter({ has: page.getByRole('heading', { name: target.world.source.title, exact: true }) });
        await card.getByRole('button', { name: '玩改编', exact: true }).click();
        await page.locator('input[name="difficulty"][value="classic"]').check();
        await page.getByRole('button', { name: '开始故事', exact: true }).click(); report.clicks += 2;
        await page.waitForFunction(id => JSON.parse(window.render_game_to_text!()).worldId === id, target.world.id);
        for (const id of target.path) {
          const current = await decisions(page), index = current.choices.findIndex((choice: any) => choice.id === id);
          assert.ok(index >= 0, `${target.world.id}/${current.nodeId}/${id}`);
          await page.locator('.choice-button').nth(index).click(); report.clicks++;
          const next = target.world.nodes[current.nodeId].choices.find(choice => choice.id === id)!.nextNodeId;
          await page.waitForFunction(id => JSON.parse(window.render_game_to_text!()).nodeId === id, next);
        }
        await decisions(page);
        const selector = target.id === 'scene' ? '.scene-image' : '.character-portrait';
        const img = page.locator(selector).first();
        await img.evaluate((image: HTMLImageElement) => image.decode());
        const rendered = await img.evaluate((image: HTMLImageElement) => ({ src: image.getAttribute('src'), width: image.naturalWidth, height: image.naturalHeight, rect: image.getBoundingClientRect().toJSON(), visible: getComputedStyle(image).visibility }));
        assert.equal(rendered.src, target.url); assert.equal(rendered.visible, 'visible');
        assert.ok(rendered.width > 0 && rendered.height > 0);
        const verified = report.assets.find((asset: any) => asset.url === target.url);
        assert.equal(rendered.width, verified.width); assert.equal(rendered.height, verified.height);
        const choices = await page.locator('.choice-region').boundingBox();
        if (viewport.name === 'mobile' && target.id !== 'scene' && choices) assert.ok(rendered.rect.bottom <= choices.y, 'Choices overlap portrait');
        const overflow = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
        assert.equal(overflow.width, overflow.scrollWidth);
        await page.evaluate(() => scrollTo(0, 0));
        const screenshot = resolve(folder, `${viewport.name}-${target.world.id}-${target.id}-${target.expression}.png`);
        await page.screenshot({ path: screenshot, fullPage: true, animations: 'disabled' });
        report.visits.push({ viewport: viewport.name, worldId: target.world.id, characterId: target.id, expression: target.expression, nodeId: target.nodeId, rendered, screenshot });
        console.log(JSON.stringify({ worldId: target.world.id, id: target.id, expression: target.expression, viewport: viewport.name, passed: true }));
      } catch (error) {
        report.errors.push({ worldId: target.world.id, characterId: target.id, expression: target.expression, viewport: viewport.name, error: String(error) });
      } finally { await context.close(); }
      await writeFile(resolve(folder, 'verification.json'), JSON.stringify(report, null, 2));
    }
  }
} finally { await browser.close(); }
report.status = report.errors.length || report.pageErrors.length || report.nonGet.length ? 'failed' : 'passed-browser-checks';
report.completedAt = new Date().toISOString();
await writeFile(resolve(folder, 'verification.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ status: report.status, folder, assets: report.assets.length, visits: report.visits.length, errors: report.errors, clicks: report.clicks }));
if (report.status === 'failed') process.exitCode = 1;
