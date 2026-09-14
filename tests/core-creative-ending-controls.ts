import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { defaultSettings, storageKeys } from '../src/game.ts';

const cases = [
  ['blue-blood', 'ending_glass'], ['double-pursuit', 'ending_captured'],
  ['velvet-alibi', 'ending_friend_lost'], ['future-island', 'ending_white_room'],
];
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const results: object[] = [];
try {
  for (const [id, end] of cases) {
    const world = JSON.parse(readFileSync(`output/creative-core/${id}.world.json`, 'utf8'));
    const { game } = JSON.parse(readFileSync(`output/creative-core/${id}-${end}.save.json`, 'utf8'));
    const context = await browser.newContext({ viewport: { width: 320, height: 740 } });
    await context.route(`**/api/worlds/${world.storyId}`, route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(world) }));
    await context.addInitScript(({ keys, game, settings }) => {
      localStorage.setItem(keys.auto, JSON.stringify(game));
      localStorage.setItem(keys.onboarding, 'true');
      localStorage.setItem(keys.settings, JSON.stringify(settings));
    }, { keys: storageKeys, game, settings: { ...defaultSettings, textSize: 22, reducedMotion: true, textSpeed: 100 } });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:4173');
    await page.getByRole('button', { name: '我的存档', exact: true }).click();
    await page.locator('.save-slot').first().getByRole('button', { name: '载入', exact: true }).click();
    await page.waitForFunction(id => JSON.parse(window.render_game_to_text!()).nodeId === id, end);
    const replay = page.getByRole('button', { name: '翻开另一种可能' });
    await replay.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `output/creative-core/browser/${id}-ending-controls-320.png` });
    await replay.click();
    await page.getByRole('button', { name: new RegExp(`以${world.player.name}的身份醒来`) }).click();
    await page.waitForFunction(id => JSON.parse(window.render_game_to_text!()).nodeId === id, world.startNodeId);
    const state = await page.evaluate(() => JSON.parse(window.render_game_to_text!()));
    assert.equal(state.choiceCount, 0);
    assert.deepEqual(errors, []);
    results.push({ worldId: id, from: end, to: state.nodeId, viewport: '320x740', textSize: 22, replayControlClickable: true, pageErrors: errors });
    await context.close();
  }
} finally {
  await browser.close();
  writeFileSync('output/creative-core/ending-controls.json', JSON.stringify(results, null, 2));
}
console.log(`${results.length}/4 narrow-screen ending replay controls passed.`);
