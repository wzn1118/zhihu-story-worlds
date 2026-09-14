import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { defaultSettings, storageKeys } from '../src/game.ts';

const coversOnly = process.argv.includes('--covers');
const folder = `output/coordination/black-pages-20260910/${coversOnly ? 'covers' : 'starts'}`;
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const report = { at: new Date().toISOString(), cases: [], errors: [], library: null };
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  page.on('pageerror', error => report.errors.push(error.message));
  await page.addInitScript(({ keys, settings }) => {
    localStorage.setItem(keys.onboarding, 'true');
    localStorage.setItem(keys.settings, JSON.stringify(settings));
  }, { keys: storageKeys, settings: { ...defaultSettings, reducedMotion: true, textSpeed: 100 } });
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).stories?.length === 20);
  const stories = await page.evaluate(() => JSON.parse(window.render_game_to_text()).stories);
  await page.waitForFunction(() => [...document.querySelectorAll('.story-cover')].every(cover => {
    const image = cover.querySelector('img');
    return cover.querySelector('.book-jacket') || (image?.complete && image.naturalWidth > 0);
  }));
  report.library = await page.evaluate(() => ({ cards: document.querySelectorAll('.story-card').length,
    printedCovers: document.querySelectorAll('.story-cover .book-jacket').length,
    visibleCovers: [...document.querySelectorAll('.story-cover img')].filter(image => image.complete && image.naturalWidth > 0).length }));
  await page.screenshot({ path: `${folder}/library.png`, fullPage: true });
  const selected = coversOnly ? stories.filter(story => ['1831621186162937856', '2025684191967294692'].includes(story.id)) : stories;
  assert.equal(selected.length, coversOnly ? 2 : 20);
  for (const story of selected) {
    await page.locator('.story-card').filter({ has: page.getByRole('heading', { name: story.title, exact: true }) }).getByRole('button', { name: '玩改编', exact: true }).click();
    const intro = page.getByRole('dialog', { name: '世界序章', exact: true });
    if (coversOnly) {
      await intro.locator('.world-cover-frame').scrollIntoViewIfNeeded();
      await page.waitForFunction(() => {
        const frame = document.querySelector('.world-cover-frame');
        const image = frame?.querySelector('img');
        return frame?.querySelector('.book-jacket') || (image?.complete && image.naturalWidth > 0 && getComputedStyle(image).visibility === 'visible');
      });
      await page.screenshot({ path: `${folder}/intro-${story.id}.png` });
    }
    await intro.getByRole('button', { name: '开始故事', exact: true }).click();
    await page.waitForFunction(() => {
      const state = JSON.parse(window.render_game_to_text());
      const image = [...document.querySelectorAll('.game-stage .scene-image')].find(image => image.complete && image.naturalWidth > 0 && getComputedStyle(image).visibility === 'visible');
      return state.mode === 'playing' && state.visuals.backgroundState.status !== 'loading' && image;
    });
    const state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
    const image = await page.locator('.game-stage .scene-image').evaluateAll(images => {
      const image = images.find(image => image.complete && image.naturalWidth > 0 && getComputedStyle(image).visibility === 'visible');
      const canvas = document.createElement('canvas'); canvas.width = 80; canvas.height = 45;
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0, 80, 45);
      const rgba = ctx.getImageData(0, 0, 80, 45).data;
      let lit = 0, opaque = 0;
      for (let i = 0; i < rgba.length; i += 4) {
        if (.2126 * rgba[i] + .7152 * rgba[i + 1] + .0722 * rgba[i + 2] > 35) lit++;
        if (rgba[i + 3] > 240) opaque++;
      }
      return { width: image.naturalWidth, height: image.naturalHeight, litRatio: lit / 3600, opaqueRatio: opaque / 3600,
        source: image.dataset.artSource ?? 'published-or-authored', kind: image.dataset.backdropKind ?? null };
    });
    assert.ok(image.opaqueRatio > .99, `${state.worldId}: opaque backdrop`);
    assert.ok(image.litRatio > .12, `${state.worldId}: background cannot be almost black`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `${folder}/${state.worldId}.png` });
    report.cases.push({ storyId: story.id, worldId: state.worldId, nodeId: state.nodeId, image,
      backgroundState: state.visuals.backgroundState, difficulty: state.difficulty });
    await page.getByRole('button', { name: '返回书库', exact: true }).click();
  }
  assert.equal(report.cases.length, selected.length);
  assert.deepEqual(report.errors, []);
} catch (error) { report.error = error.stack; throw error; }
finally {
  await browser.close();
  await writeFile(`${folder}/report.json`, JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ starts: report.cases.length, drawnFallbacks: report.cases.filter(row => row.image.source === 'local-vector').length,
  library: report.library, report: `${folder}/report.json` }));
