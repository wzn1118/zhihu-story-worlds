import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, type Page } from 'playwright';
import { authoredWorlds } from '../content/worlds.ts';
import { defaultSettings, storageKeys } from '../src/game.ts';
import { explore } from '../tests/core-creative-support.ts';
import type { GameWorld } from '../shared/types.ts';

const base = 'http://127.0.0.1:4173';
const output = resolve('output/playwright/character-layer-correction');
await mkdir(output, { recursive: true });
const report = { at: new Date().toISOString(), base, apiMocks: false, sceneStateInjected: false,
  serviceRestarts: 0, visits: [] as unknown[], nonGet: [] as string[], errors: [] as string[], clicks: 0 };
const browser = await chromium.launch({ headless: true,
  executablePath: 'C:/Users/10847/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe' });
const state = async (page: Page) => JSON.parse(await page.evaluate(() => window.render_game_to_text!()));
async function choices(page: Page) {
  for (let i = 0; i < 60; i++) {
    const s = await state(page);
    if (s.choices?.length || s.mode === 'ending') return s;
    const next = page.locator('button.dialogue-next');
    if (await next.isVisible()) { await next.click(); report.clicks++; }
    await page.waitForTimeout(40);
  }
  throw new Error('Choices did not become available');
}
try {
  for (const [worldId, nodeIds] of [['blue-blood', ['training', 'test']], ['happy-home', ['arrival']], ['double-pursuit', ['window']]] as const) {
    const authored = authoredWorlds.find(world => world.id === worldId)!;
    const response = await fetch(`${base}/api/worlds/${authored.storyId}`);
    assert.equal(response.status, 200);
    const world = await response.json() as GameWorld;
    const routes = explore(world).nodes;
    for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
      for (const nodeId of nodeIds) {
        const context = await browser.newContext({ viewport, isMobile: viewport.name === 'mobile', hasTouch: viewport.name === 'mobile' });
        context.setDefaultTimeout(45000);
        await context.route('**/*', route => {
          if (route.request().method() === 'GET') return route.continue();
          report.nonGet.push(`${route.request().method()} ${route.request().url()}`);
          return route.abort();
        });
        await context.addInitScript(({ keys, settings }) => {
          localStorage.setItem(keys.onboarding, 'true'); localStorage.setItem(keys.settings, JSON.stringify(settings));
        }, { keys: storageKeys, settings: { ...defaultSettings, textSpeed: 100, reducedMotion: true } });
        const page = await context.newPage();
        page.on('pageerror', error => report.errors.push(error.message));
        await page.goto(base, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(id => JSON.parse(window.render_game_to_text!()).stories?.some((s: any) => s.id === id), world.storyId);
        const title = (await state(page)).stories.find((s: any) => s.id === world.storyId).title;
        const card = page.locator('.story-card').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
        await card.getByRole('button', { name: '玩改编', exact: true }).click();
        await page.locator('input[name="difficulty"][value="classic"]').check();
        await page.getByRole('button', { name: '开始故事', exact: true }).click(); report.clicks += 2;
        await page.waitForFunction(id => JSON.parse(window.render_game_to_text!()).worldId === id, worldId);
        const path = routes.get(nodeId); assert.ok(path);
        for (const choiceId of path) {
          const s = await choices(page), index = s.choices.findIndex((c: any) => c.id === choiceId);
          assert.ok(index >= 0);
          await page.locator('.choice-button').nth(index).click(); report.clicks++;
          const nextId = world.nodes[s.nodeId].choices.find(c => c.id === choiceId)!.nextNodeId;
          await page.waitForFunction(id => JSON.parse(window.render_game_to_text!()).nodeId === id, nextId);
        }
        await choices(page);
        await page.locator('img').evaluateAll(async images => { await Promise.all(images.map(img => (img as HTMLImageElement).decode().catch(() => {}))); });
        assert.equal(await page.locator('.character-portrait[src*="generated-art"]').count(), 0);
        const visuals = (await state(page)).visuals;
        const portraitUrls = await page.locator('.character-portrait').evaluateAll(images => images.map(img => (img as HTMLImageElement).getAttribute('src')));
        assert.ok(portraitUrls.every(url => url === '/assets/fang-nuo-main.webp' || url === '/assets/fang-nuo-reaction.webp'));
        if (worldId === 'double-pursuit') {
          const scene = page.locator('.scene-image').first();
          const decoded = await scene.evaluate((img: HTMLImageElement) => ({ url: img.getAttribute('src'), width: img.naturalWidth, height: img.naturalHeight }));
          assert.equal(decoded.url, '/generated-art/scene_34881d9ae2671767398735cf60e4.png');
          assert.equal(decoded.width, 4096); assert.equal(decoded.height, 2304);
          assert.equal(portraitUrls.length, 0);
        }
        await page.evaluate(() => { scrollTo(0, 0); });
        const screenshot = resolve(output, `${viewport.name}-${worldId}-${nodeId}.png`);
        await page.screenshot({ path: screenshot, fullPage: true });
        report.visits.push({ worldId, nodeId, viewport: viewport.name, portraitUrls, visuals, screenshot });
        console.log(JSON.stringify({ worldId, nodeId, viewport: viewport.name, generatedCharacterOverlays: 0 }));
        await context.close();
      }
    }
  }
  assert.equal(report.nonGet.length, 0); assert.equal(report.errors.length, 0);
} catch (error) { report.errors.push(String(error)); process.exitCode = 1; }
finally {
  await browser.close();
  await writeFile(resolve(output, 'verification.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ output, visits: report.visits.length, clicks: report.clicks, errors: report.errors, nonGet: report.nonGet.length }));
}
