import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { chromium, type Page } from 'playwright';
import { authoredWorlds, type AuthoredWorld } from '../content/worlds.ts';
import { compileWorld } from '../server/worlds.ts';
import { defaultSettings, saveSession, storageKeys } from '../src/game.ts';
import { coreIds, explore, replay } from './core-creative-support.ts';

const url = process.env.CORE_BASE_URL ?? 'http://127.0.0.1:4173';
const directory = process.env.CORE_SCREENSHOT_DIR ?? 'output/playwright/creative-core';
mkdirSync(directory, { recursive: true });
const before: AuthoredWorld[] = JSON.parse(gunzipSync(readFileSync('tests/fixtures/core-pre-creative.json.gz')).toString());
const worlds = coreIds.map(id => compileWorld(authoredWorlds.find(w => w.id === id)!));
const readState = (page: Page) => page.evaluate(() => JSON.parse(window.render_game_to_text!()));
async function reveal(page: Page) {
  for (let paragraph = 0; paragraph < 8; paragraph++) {
    const before = await readState(page);
    if (before.mode === 'ending') return before;
    if (!before.textComplete) await page.evaluate(() => window.advanceTime!(100_000));
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text!()).textComplete);
    const state = await readState(page);
    if (state.mode === 'ending' || state.paragraph === state.paragraphCount) return state;
    await page.keyboard.press('Space');
    await page.waitForFunction(previous => JSON.parse(window.render_game_to_text!()).paragraph > previous, state.paragraph);
  }
  throw new Error('Paragraph did not progress');
}
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const results: unknown[] = [];
try {
  for (const world of worlds) {
    const old = before.find(w => w.id === world.id)!;
    const graph = explore(world);
    const newEnds = Object.values(world.nodes).filter(n => n.ending && !old.nodes[n.id]);
    for (const viewport of [{ width: 1440, height: 960 }, { width: 320, height: 740 }]) {
      const targets = viewport.width === 1440 ? newEnds : newEnds.filter(n => n.ending!.tone === 'dark');
      for (const ending of targets) {
        const path = graph.nodes.get(ending.id)!;
        let offset = 0;
        while (offset < path.length && old.nodes[replay(world, path.slice(0, offset)).node.id]) offset++;
        const start = replay(world, path.slice(0, offset));
        const saved = saveSession(start);
        const context = await browser.newContext({ viewport });
        const errors: string[] = [], missingArt: string[] = [];
        // Only the browser receives the current core compilation. The shared
        // server and its cached registry remain untouched.
        await context.route('**/api/**', async route => {
          if (route.request().method() !== 'GET') return route.abort();
          const pathname = new URL(route.request().url()).pathname;
          const target = worlds.find(w => pathname === `/api/worlds/${w.storyId}`);
          if (target) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(target) });
          return route.continue();
        });
        await context.addInitScript(({ keys, save, settings }) => {
          localStorage.setItem(keys.auto, JSON.stringify(save));
          localStorage.setItem(keys.saves, JSON.stringify([save, null, null]));
          localStorage.setItem(keys.settings, JSON.stringify(settings));
          localStorage.setItem(keys.onboarding, 'true');
        }, { keys: storageKeys, save: saved, settings: { ...defaultSettings, reducedMotion: true, textSpeed: 100, textSize: 22 } });
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        page.on('response', response => { if (response.status() === 404 && response.url().includes('/assets/')) missingArt.push(response.url()); });
        await page.goto(url);
        await page.locator('button[title="我的存档"]').click();
        await page.locator('.save-slot').first().getByRole('button', { name: '载入', exact: true }).click();
        await page.waitForFunction(id => JSON.parse(window.render_game_to_text!()).nodeId === id, start.node.id);
        const visited: string[] = [start.node.id];
        for (const choiceId of path.slice(offset)) {
          const state = await reveal(page);
          const index = state.choices.findIndex((choice: { id: string }) => choice.id === choiceId);
          assert.ok(index >= 0, `${world.id}/${state.nodeId}/${choiceId}`);
          await page.locator('button.choice-button').nth(index).click();
          await page.waitForFunction(id => JSON.parse(window.render_game_to_text!()).nodeId !== id, state.nodeId);
          const next = await readState(page);
          visited.push(next.nodeId);
        }
        const state = await reveal(page);
        assert.equal(state.nodeId, ending.id);
        assert.equal(state.mode, 'ending');
        const expected = replay(world, path);
        assert.deepEqual(state.resources, expected.resources);
        assert.deepEqual(state.clues, expected.clues);
        const layout = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, endingTitle: document.querySelector('h1')?.textContent }));
        assert.ok(layout.scrollWidth <= layout.width, `${ending.id}: horizontal overflow`);
        const file = `${directory}/${world.id}-${ending.id}-${viewport.width}.png`;
        await page.screenshot({ path: file, fullPage: true });
        assert.deepEqual(errors, []);
        const review = page.getByRole('button', { name: '回看这条路', exact: true });
        try {
          await review.scrollIntoViewIfNeeded();
          await review.click();
        } catch (error) {
          await page.screenshot({ path: `${directory}/failed-${world.id}-${ending.id}-${viewport.width}.png`, fullPage: true });
          writeFileSync(`${directory}/failure.json`, JSON.stringify({ worldId: world.id, endingId: ending.id, state: await readState(page), body: await page.locator('body').innerText(), error: String(error) }, null, 2));
          throw error;
        }
        await page.waitForFunction(() => JSON.parse(window.render_game_to_text!()).modal === 'journal');
        const journal = await readState(page);
        assert.equal(journal.history.length, expected.history.length);
        results.push({ worldId: world.id, version: world.version, endingId: ending.id, viewport, visited, resources: state.resources, screenshot: file, layout, historyReviewAccessible: true, visuals: state.visuals, pageErrors: errors, missingArt: [...new Set(missingArt)] });
        console.log(`${world.id} ${ending.id} ${viewport.width}: ${visited.length} live browser scenes`);
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
  writeFileSync(`${directory}/report.json`, JSON.stringify({ generatedAt: new Date().toISOString(), url, delivery: 'Current core payloads injected only into isolated browser requests; no shared-server restart', results }, null, 2));
}
