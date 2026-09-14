import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { storageKeys, defaultSettings } from '../src/game.ts';

const base = 'http://127.0.0.1:4173';
const folder = 'output/coordination/art-in-game-20260910';
await mkdir(folder, { recursive: true });
const cutouts = await (await fetch(`${base}/generated-art/character-cutouts.json`)).json();
const trainer = cutouts.entries.find(row => row.worldId === 'blue-blood' && row.nodeId === '__art_character_trainer');
assert.ok(trainer);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const mobileOnly = process.argv.includes('--mobile-only');
const prior = mobileOnly ? JSON.parse(await readFile(`${folder}/report.json`, 'utf8')) : null;
const report = { at: new Date().toISOString(), approvedCutouts: cutouts.entries.length, cases: prior?.cases.filter(entry => entry.viewport.width !== 390) ?? [] };
try {
  for (const viewport of (mobileOnly ? [{ width: 390, height: 844 }] : [{ width: 1440, height: 1000 }, { width: 390, height: 844 }])) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ keys, settings }) => {
      localStorage.setItem(keys.onboarding, 'true');
      localStorage.setItem(keys.settings, JSON.stringify(settings));
    }, { keys: storageKeys, settings: { ...defaultSettings, textSpeed: 100, reducedMotion: true } });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.locator('.story-card').filter({ has: page.getByRole('heading', { name: '蓝血', exact: true }) }).getByRole('button', { name: '玩改编', exact: true }).click();
    const intro = page.getByRole('dialog', { name: '世界序章', exact: true });
    await intro.locator('.world-art-overview').waitFor();
    const reference = intro.locator('.character-reference').filter({ has: page.getByRole('button', { name: '表情', exact: true }) }).first();
    await reference.scrollIntoViewIfNeeded();
    const mainUrl = await reference.locator('img').getAttribute('src');
    await reference.getByRole('button', { name: '表情', exact: true }).click();
    const reactionUrl = await reference.locator('img').getAttribute('src');
    assert.notEqual(mainUrl, reactionUrl);
    await reference.locator('img').evaluate(image => image.decode());
    await page.screenshot({ path: `${folder}/references-${viewport.width}.png` });
    await intro.getByRole('button', { name: '开始故事', exact: true }).click();
    await page.waitForFunction(url => {
      const image = document.querySelector('.character-portrait');
      return image?.getAttribute('src') === url && image.complete && image.naturalWidth > 0;
    }, trainer.url);
    const state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
    assert.equal(state.nodeId, 'training');
    assert.equal(state.difficulty, 'challenge');
    assert.equal(state.visuals.character.id, 'trainer');
    assert.equal(state.visuals.authoredCharacter.id, 'fangnuo');
    const geometry = await page.evaluate(() => {
      const actor = document.querySelector('.character-portrait').getBoundingClientRect();
      const dialogue = document.querySelector('.dialogue-panel').getBoundingClientRect();
      return { actorBottom: actor.bottom, dialogueTop: dialogue.top, overflow: document.documentElement.scrollWidth > innerWidth };
    });
    assert.ok(geometry.actorBottom <= geometry.dialogueTop + 2, 'Actor must not cover dialogue');
    assert.equal(geometry.overflow, false);
    await page.screenshot({ path: `${folder}/trainer-in-game-${viewport.width}.png`, fullPage: true });
    for (let step = 0; step < 8; step++) {
      const playing = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
      if (playing.choices.length) break;
      await page.locator('button.dialogue-next').click();
    }
    await page.getByRole('button', { name: /留在座位上，观察发下来的试卷/ }).click();
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).nodeId === 'test');
    const next = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
    assert.equal(next.choiceCount, 1);
    await page.reload({ waitUntil: 'domcontentloaded' });
    if (await page.locator('.current-world').isVisible()) await page.locator('.current-world').click();
    else {
      await page.getByRole('button', { name: '我的存档', exact: true }).click();
      await page.getByRole('dialog', { name: '保存与载入', exact: true }).locator('.save-slot').first().getByRole('button', { name: '载入', exact: true }).click();
    }
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).nodeId === 'test');
    const restored = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
    assert.equal(restored.choiceCount, next.choiceCount);
    assert.deepEqual(restored.resources, next.resources);
    assert.deepEqual(errors, []);
    report.cases.push({ viewport, actor: state.visuals.character, authoredActor: state.visuals.authoredCharacter, geometry,
      mainUrl, reactionUrl, choiceNode: next.nodeId, restoredChoiceCount: restored.choiceCount, errors });
    await page.close();
  }
} finally {
  await browser.close();
  await writeFile(`${folder}/report.json`, JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ cases: report.cases.length, approvedCutouts: report.approvedCutouts, report: `${folder}/report.json` }));
