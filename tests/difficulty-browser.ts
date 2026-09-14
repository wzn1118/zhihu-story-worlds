import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, type Page } from 'playwright';
import { defaultSettings, storageKeys } from '../src/game.ts';
import { challengeInitials } from '../src/difficulty.ts';
import type { GameWorld } from '../shared/types.ts';

const base = process.env.DIFFICULTY_URL ?? 'http://127.0.0.1:4175';
const output = resolve('output/playwright/difficulty-20260910');
await mkdir(output, { recursive: true });
const response = await fetch(`${base}/api/worlds/2025684191967294692`, { signal: AbortSignal.timeout(35_000) });
assert.equal(response.status, 200);
const world: GameWorld = await response.json();
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const results: unknown[] = [];
const state = (page: Page) => page.evaluate(() => JSON.parse(window.render_game_to_text!()));
async function reveal(page: Page) {
  for (let index = 0; index < 12; index++) {
    const current = await state(page);
    if (current.mode === 'ending') return current;
    if (!current.textComplete) await page.evaluate(() => window.advanceTime!(100_000));
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text!()).textComplete);
    if ((await state(page)).paragraph === current.paragraphCount) return await state(page);
    await page.keyboard.press('Space');
    await page.waitForFunction(previous => JSON.parse(window.render_game_to_text!()).paragraph > previous, current.paragraph);
  }
  throw new Error('Paragraphs did not reveal');
}
async function pick(page: Page, id: string) {
  const before = await reveal(page);
  const index = before.choices.findIndex((choice: { id: string }) => choice.id === id);
  assert.ok(index >= 0, `${before.nodeId}/${id}`);
  await page.locator('.choice-button').nth(index).click();
  await page.waitForFunction(previous => JSON.parse(window.render_game_to_text!()).choiceCount > previous, before.choiceCount);
}
async function fit(page: Page) {
  const box = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(box.scroll <= box.width + 1, JSON.stringify(box));
}
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport });
    await context.addInitScript(({ settings, keys }) => {
      localStorage.setItem(keys.settings, JSON.stringify(settings));
      localStorage.setItem(keys.onboarding, 'true');
    }, { settings: { ...defaultSettings, reducedMotion: true, textSpeed: 100 }, keys: storageKeys });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    const card = page.locator('.story-card').filter({ has: page.getByRole('heading', { name: '蓝血', exact: true }) });
    await card.getByRole('button', { name: '玩改编', exact: true }).click({ timeout: 45_000 });
    const intro = page.getByRole('dialog', { name: '世界序章', exact: true });
    await intro.waitFor();
    assert.equal(await intro.locator('input[value="challenge"]').isChecked(), true);
    const challengeValues = challengeInitials(world);
    for (const resource of world.resources ?? []) assert.ok((await intro.locator('.world-mechanics').innerText()).includes(`初始 ${challengeValues[resource.id]} / ${resource.max}`));
    assert.equal(await intro.locator('.beginner-tip').count(), 0);
    await intro.locator('.difficulty-picker').scrollIntoViewIfNeeded();
    await fit(page);
    await page.screenshot({ path: resolve(output, `intro-${viewport.width}.png`) });
    await intro.getByRole('button', { name: '开始故事', exact: true }).click();
    assert.equal((await state(page)).difficulty, 'challenge');
    assert.deepEqual((await state(page)).resources, challengeValues);

    for (let remaining = 3; remaining > 0; remaining--) {
      await pick(page, 'accept_exam');
      await page.getByRole('button', { name: `重选上一步 · 剩余 ${remaining} 次`, exact: true }).click();
      const rewind = page.getByRole('dialog', { name: '返回这次选择', exact: true });
      assert.ok((await rewind.innerText()).includes(`之后剩余 ${remaining - 1} 次`));
      await rewind.getByRole('button', { name: '返回选择', exact: true }).click();
      assert.equal((await state(page)).nodeId, 'training');
      assert.equal((await state(page)).rewindsRemaining, remaining - 1);
    }
    assert.equal(await page.getByRole('button', { name: '重选上一步 · 剩余 0 次', exact: true }).isDisabled(), true);
    for (const id of ['accept_exam', 'record_test', 'search_landmarks', 'save_map', 'ask_witness', 'visit_diner', 'record_alley', 'save_alley', 'open_case_desk']) await pick(page, id);
    const pressure = await reveal(page);
    assert.equal(pressure.nodeId, 'case_desk');
    assert.equal(pressure.challenge.hint, undefined);
    assert.equal(await page.locator('.challenge-box details, details.challenge-box').count(), 0);
    assert.ok(pressure.lockedChoices.length > 0);
    assert.ok(pressure.lockedChoices.some((choice: { reasons: string[] }) => choice.reasons.some(reason => reason.includes('至少'))));
    await fit(page);
    await page.screenshot({ path: resolve(output, `pressure-${viewport.width}.png`) });
    await page.getByRole('button', { name: '线索与手记', exact: true }).click();
    await page.getByRole('tab', { name: '剧情回看', exact: true }).click();
    const exhausted = page.getByRole('button', { name: '回溯次数已用完', exact: true });
    assert.ok(await exhausted.count() > 0);
    assert.equal(await exhausted.first().isDisabled(), true);
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '我的存档', exact: true }).click();
    await page.locator('.save-slot').first().getByRole('button', { name: '载入', exact: true }).click();
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text!()).nodeId === 'case_desk');
    assert.equal((await state(page)).rewindsRemaining, 0);
    assert.equal((await state(page)).difficulty, 'challenge');
    assert.deepEqual((await state(page)).resources, pressure.resources);
    await page.getByRole('button', { name: '返回书库', exact: true }).click();
    await card.getByRole('button', { name: '玩改编', exact: true }).click();
    await intro.locator('input[value="classic"]').check();
    assert.equal(await intro.locator('.beginner-tip').count(), 1);
    await intro.getByRole('button', { name: '开始故事', exact: true }).click();
    const classic = await state(page);
    assert.equal(classic.difficulty, 'classic');
    assert.equal(classic.rewindsRemaining, null);
    assert.deepEqual(classic.resources, Object.fromEntries((world.resources ?? []).map(resource => [resource.id, resource.initial])));
    assert.deepEqual(errors, []);
    results.push({ viewport, resources: pressure.resources, challengeInitials: challengeValues, lockedChoices: pressure.lockedChoices, rewindsAfterReload: 0, classicResources: classic.resources, pageErrors: errors });
    await context.close();
  }
} finally {
  await browser.close();
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ base, api: 'actual local world endpoint; no payload injection', results }, null, 2));
}
console.log(JSON.stringify({ passed: results.length, output }));
