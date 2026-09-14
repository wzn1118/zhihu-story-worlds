import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium, type Page } from 'playwright';
import type { GameWorld } from '../shared/types.ts';
import { choose, defaultSettings, restoreSession, storageKeys, type SavedGame } from '../src/game.ts';
import { choiceBlockers } from '../shared/choice-rules.ts';

const url = process.env.WORLD_PROSE_URL ?? 'http://127.0.0.1:4173';
const directory = process.env.WORLD_PROSE_BROWSER_OUTPUT ?? 'output/playwright/world-prose';
mkdirSync(directory, { recursive: true });
const manifestText = readFileSync(`${process.env.WORLD_PROSE_OUTPUT ?? 'output/world-prose'}/scene-manifest.json`, 'utf8');
type BrowserCase = { nodeId: string; paragraphIndex: number; text: string; saveFile: string };
type Manifest = { worlds: { id: string; worldFile: string; worldSha256: string; browserCase: BrowserCase; endingCases?: BrowserCase[] }[] };
const manifest = JSON.parse(manifestText) as Manifest;
const cases = manifest.worlds.flatMap(w => [w.browserCase, ...(process.env.WORLD_PROSE_ENDINGS === '1' ? w.endingCases ?? [] : [])].map(browserCase => ({ ...w, browserCase })));
const manifestSha256 = createHash('sha256').update(manifestText).digest('hex');
const state = (page: Page) => page.evaluate(() => JSON.parse(window.render_game_to_text!()));
async function revealParagraph(page: Page) {
  await page.evaluate(() => window.advanceTime!(100_000));
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text!()).textComplete);
  const current = await state(page);
  assert.equal(await page.locator('.dialogue-text').innerText(), current.text);
  return current;
}

type Result = { worldId: string; nodeId: string; viewport: { width: number; height: number }; [key: string]: unknown };
const results: Result[] = [];
let carriedEvidence: { manifest: string; report: string; manifestSha256: string; reportSha256: string; worldIds: string[] } | undefined;
if (process.env.WORLD_PROSE_RESUME === '1' && existsSync(`${directory}/report.json`)) {
  const previousReportPath = process.env.WORLD_PROSE_PREVIOUS_REPORT ?? `${directory}/report.json`;
  const previousReportText = readFileSync(previousReportPath, 'utf8');
  const previous = JSON.parse(previousReportText);
  assert.equal(previous.expectedCases, cases.length * 2);
  const previousManifestPath = process.env.WORLD_PROSE_PREVIOUS_MANIFEST;
  if (previousManifestPath) {
    const previousManifestText = readFileSync(previousManifestPath, 'utf8');
    const previousManifest: Manifest = JSON.parse(previousManifestText);
    const previousSha256 = createHash('sha256').update(previousManifestText).digest('hex');
    assert.equal(previous.manifestSha256, previousSha256);
    const unchanged = manifest.worlds.filter(world => {
      const old = previousManifest.worlds.find(w => w.id === world.id);
      return old?.worldSha256 === world.worldSha256
        && JSON.stringify(old.browserCase) === JSON.stringify(world.browserCase)
        && JSON.stringify(old.endingCases) === JSON.stringify(world.endingCases);
    }).map(w => w.id);
    results.push(...previous.results.filter((r: Result) => unchanged.includes(r.worldId)));
    carriedEvidence = { manifest: previousManifestPath, report: previousReportPath, manifestSha256: previousSha256, reportSha256: createHash('sha256').update(previousReportText).digest('hex'), worldIds: unchanged };
    console.log(`Reusing ${results.length} cases from ${unchanged.length} exact-matching world snapshots`);
  } else {
    assert.equal(previous.manifestSha256, manifestSha256, 'Resume requires the identical content snapshot');
    results.push(...previous.results);
    carriedEvidence = previous.carriedEvidence;
    console.log(`Resuming ${results.length} completed cases from the identical content snapshot`);
  }
}
const resumedCases = results.length;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
let activePage: Page | undefined;
try {
  for (const entry of cases) {
    const world: GameWorld = JSON.parse(readFileSync(entry.worldFile, 'utf8'));
    const saved: SavedGame = JSON.parse(readFileSync(entry.browserCase.saveFile, 'utf8'));
    for (const viewport of [{ width: 1440, height: 960 }, { width: 320, height: 740 }]) {
      if (results.some(r => r.worldId === world.id && r.nodeId === entry.browserCase.nodeId && r.viewport.width === viewport.width)) continue;
      const context = await browser.newContext({ viewport });
      // Current content is scoped to this isolated browser. Shared services and
      // the registry held in server memory are left to the integration owner.
      await context.route('**/api/**', async route => {
        if (route.request().method() !== 'GET') return route.abort();
        if (new URL(route.request().url()).pathname === `/api/worlds/${world.storyId}`) {
          return route.fulfill({ contentType: 'application/json', body: JSON.stringify(world) });
        }
        return route.continue();
      });
      await context.addInitScript(({ keys, save, settings }) => {
        localStorage.setItem(keys.auto, JSON.stringify(save));
        localStorage.setItem(keys.saves, JSON.stringify([save, null, null]));
        localStorage.setItem(keys.settings, JSON.stringify(settings));
        localStorage.setItem(keys.onboarding, 'true');
      }, { keys: storageKeys, save: saved, settings: { ...defaultSettings, textSpeed: 100, textSize: 22, reducedMotion: true } });
      const page = await context.newPage();
      activePage = page;
      page.setDefaultTimeout(30_000);
      const errors: string[] = [], missingAssets: string[] = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('response', r => { if (r.status() >= 400 && r.url().includes('/assets/')) missingAssets.push(r.url()); });
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.locator('button[title="我的存档"]').click();
      await page.locator('.save-slot').first().getByRole('button', { name: '载入', exact: true }).click();
      await page.waitForFunction(id => JSON.parse(window.render_game_to_text!()).nodeId === id, entry.browserCase.nodeId);
      const session = restoreSession(world, saved);
      if (session.node.ending) {
        const current = await state(page);
        assert.equal(current.mode, 'ending');
        assert.equal(await page.locator('.ending-prose').textContent(), session.paragraphs.join('\n\n'));
        assert.deepEqual(current.resources, session.resources);
        assert.deepEqual(current.clues, session.clues);
        const layout = await page.evaluate(() => ({ viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
        assert.ok(layout.scrollWidth <= layout.viewport);
        const screenshot = `${directory}/${world.id}-${session.node.id}-${viewport.width}.png`;
        await page.screenshot({ path: screenshot, fullPage: true });
        const review = page.locator('.ending-actions').getByRole('button', { name: /^(回看这条路|回看剧情)$/ });
        await review.scrollIntoViewIfNeeded();
        await review.click();
        await page.waitForFunction(() => JSON.parse(window.render_game_to_text!()).modal === 'journal');
        assert.equal((await state(page)).history.length, session.history.length);
        assert.deepEqual(errors, []);
        results.push({ worldId: world.id, version: world.version, viewport, nodeId: session.node.id, ending: session.node.ending.tone, text: current.text, resources: current.resources, historyReviewAccessible: true, screenshot, layout, pageErrors: errors, missingAssets: [...new Set(missingAssets)] });
        console.log(`${world.id} ${viewport.width}: complete ${session.node.id} + history`);
        await context.close();
        activePage = undefined;
        continue;
      }
      const selected = await revealParagraph(page);
      assert.equal(selected.text, entry.browserCase.text);
      assert.equal(selected.paragraph, entry.browserCase.paragraphIndex + 1);
      const layout = await page.evaluate(() => ({ viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth, textWidth: document.querySelector('.dialogue-text')!.clientWidth, textScrollWidth: document.querySelector('.dialogue-text')!.scrollWidth }));
      assert.ok(layout.scrollWidth <= layout.viewport);
      assert.ok(layout.textScrollWidth <= layout.textWidth);
      const screenshot = `${directory}/${world.id}-${viewport.width}.png`;
      await page.screenshot({ path: screenshot, fullPage: true });
      const reading = await page.locator('.dialogue-text').evaluate(element => {
        element.scrollTop = element.scrollHeight;
        return { height: element.clientHeight, scrollHeight: element.scrollHeight, bottom: element.scrollTop + element.clientHeight };
      });
      assert.ok(reading.bottom >= reading.scrollHeight - 1, `${world.id}: prose clipped vertically`);
      if (reading.scrollHeight > reading.height) await page.screenshot({ path: `${directory}/${world.id}-paragraph-bottom-${viewport.width}.png`, fullPage: true });
      let current = selected;
      while (current.paragraph < current.paragraphCount) {
        await page.getByRole('button', { name: '继续', exact: true }).click();
        await page.waitForFunction(previous => JSON.parse(window.render_game_to_text!()).paragraph > previous, current.paragraph);
        current = await revealParagraph(page);
      }
      const choice = session.choices.find(c => !choiceBlockers(c, session, world.resources).length);
      assert.ok(choice);
      const index = current.choices.findIndex((c: { id: string }) => c.id === choice.id);
      assert.ok(index >= 0);
      const expected = choose(session, choice);
      await page.locator('.choice-button').nth(index).click();
      await page.waitForFunction(id => JSON.parse(window.render_game_to_text!()).nodeId === id, expected.node.id);
      const next = await state(page);
      assert.deepEqual(next.resources, expected.resources);
      assert.deepEqual(next.clues, expected.clues);
      assert.equal(next.choiceCount, expected.choiceCount);
      assert.deepEqual(errors, []);
      results.push({ worldId: world.id, version: world.version, viewport, nodeId: selected.nodeId, paragraph: selected.paragraph, text: selected.text, choiceId: choice.id, nextNodeId: next.nodeId, resources: next.resources, screenshot, layout, reading, pageErrors: errors, missingAssets: [...new Set(missingAssets)] });
      console.log(`${world.id} ${viewport.width}: exact prose + ${choice.id} -> ${next.nodeId}`);
      await context.close();
      activePage = undefined;
    }
  }
} catch (error) {
  if (activePage) {
    await activePage.screenshot({ path: `${directory}/failure.png`, fullPage: true }).catch(() => {});
    writeFileSync(`${directory}/failure.json`, JSON.stringify({ error: String(error), state: await state(activePage).catch(() => null) }, null, 2));
  }
  throw error;
} finally {
  await browser.close();
  writeFileSync(`${directory}/report.json`, JSON.stringify({ generatedAt: new Date().toISOString(), url, delivery: 'Current exported worlds supplied through isolated browser GET interception; no shared-server restart or live-publication claim.', manifestSha256, carriedEvidence, expectedCases: cases.length * 2, completedCases: results.length, resumedCases, executedCases: results.length - resumedCases, results }, null, 2));
}
