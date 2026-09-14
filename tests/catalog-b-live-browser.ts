// Live acceptance, not a mock-server test. No request interception and no injected saves.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium, type Page } from 'playwright';
import type { GameWorld } from '../shared/types.ts';
import { choose, defaultSettings, startSession, storageKeys, type Session } from '../src/game.ts';
import { pressureWitness } from './catalog-b-live-pressure.ts';

const base = 'http://127.0.0.1:4173';
const directory = process.env.B_LIVE_OUTPUT ?? 'output/playwright/catalog-b-live/baseline';
mkdirSync(directory, { recursive: true });
const inventory = JSON.parse(readFileSync('tests/catalog-b-inventory.json', 'utf8')) as {
  worldId: string; storyId: string; version: string;
  routes: { id: string; entry: string; dialogueIds: string[]; endingWitnesses: { id: string; choices: string[] }[] }[];
}[];
const cases: { worldId: string; route: string; id: string; choices: string[] }[] | undefined = process.env.B_LIVE_CASES ? JSON.parse(readFileSync(process.env.B_LIVE_CASES, 'utf8')) : undefined;
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const state = (page: Page) => page.evaluate(() => JSON.parse(window.render_game_to_text!()));
const facts = (s: any) => ({ nodeId: s.nodeId, resources: s.resources, clues: s.clues, resolve: s.resolve, trust: s.trust, history: s.history, choiceCount: s.choiceCount });
const expectedFacts = (s: Session) => JSON.parse(JSON.stringify({ nodeId: s.node.id, resources: s.resources, clues: s.clues, resolve: s.resolve, trust: s.trust, history: s.history.map(e => ({ nodeId: e.nodeId, choiceId: e.choiceId, choice: e.choice })), choiceCount: s.choiceCount }));
async function reveal(page: Page) {
  const paragraphs: string[] = [];
  for (let i = 0; i < 16; i++) {
    const s = await state(page);
    if (s.mode === 'ending') return { ...s, readParagraphs: [s.text] };
    if (!s.textComplete) await page.evaluate(() => window.advanceTime!(100_000));
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text!()).textComplete);
    const read = await state(page);
    paragraphs.push(read.text);
    assert.equal(await page.locator('.dialogue-text').innerText(), read.text);
    if (read.paragraph === read.paragraphCount) return { ...read, readParagraphs: paragraphs };
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.waitForFunction(n => JSON.parse(window.render_game_to_text!()).paragraph > n, read.paragraph);
  }
  throw new Error('Unfinished paragraph sequence');
}
async function advance(page: Page, choiceId: string) {
  const before = await reveal(page);
  const index = before.choices.findIndex((c: { id: string }) => c.id === choiceId);
  assert.ok(index >= 0, `${before.worldId}/${before.nodeId}/${choiceId} is unavailable`);
  await page.locator('button.choice-button').nth(index).click();
  await page.waitForFunction(id => JSON.parse(window.render_game_to_text!()).nodeId !== id, before.nodeId);
  return state(page);
}
async function layout(page: Page) {
  const result = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  assert.ok(result.scrollWidth <= result.width, `Horizontal overflow: ${JSON.stringify(result)}`);
  return result;
}
async function shot(page: Page, name: string) {
  await layout(page);
  const path = `${directory}/${name}.png`;
  await page.screenshot({ path, fullPage: true });
  writeFileSync(`${directory}/${name}.snapshot.txt`, await page.locator('body').ariaSnapshot());
  return path;
}
async function begin(page: Page) {
  await page.getByRole('button', { name: /以.*的身份醒来/ }).click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text!()).mode === 'playing' && !JSON.parse(window.render_game_to_text!()).modal);
}
async function checkReader(page: Page, world: GameWorld, prefix: string) {
  const before = await state(page);
  await page.getByRole('button', { name: '线索与手记', exact: true }).click();
  await page.locator('.journal-sources button').first().click();
  await page.waitForFunction(() => {
    const s = JSON.parse(window.render_game_to_text!());
    return s.mode === 'source-reader' && !s.loading && s.text.length > 0;
  });
  await page.waitForFunction(() => {
    const s = JSON.parse(window.render_game_to_text!());
    return s.search?.anchorStatus === 'found' && s.search.count === 1;
  });
  const source = await state(page);
  const cached = JSON.parse(readFileSync(`.local/zhihu-cache/story-${world.storyId}.json`, 'utf8')).data;
  assert.equal(source.text, cached.content);
  assert.equal(source.author, world.source.author);
  assert.equal(source.returnTo, 'journal');
  assert.equal(source.gamePaused, true);
  assert.equal(source.error, '');
  const screenshot = await shot(page, `${prefix}-reader`);
  await page.getByRole('button', { name: '返回随身手记', exact: true }).click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text!()).modal === 'journal');
  assert.equal((await state(page)).journalTab, 'progress');
  await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
  const after = await state(page);
  assert.deepEqual(facts(after), facts(before));
  assert.equal(after.paragraph, before.paragraph);
  return { exactSourceHash: sha(source.text), chars: source.text.length, author: source.author, search: source.search, paragraphRetained: true, screenshot };
}
async function checkSaveRewind(page: Page, choiceId: string, prefix: string) {
  const before = await reveal(page);
  await page.getByRole('button', { name: '保存与载入', exact: true }).click();
  await page.locator('.save-slot').nth(1).getByRole('button', { name: '保存', exact: true }).click();
  await page.locator('.save-slot').nth(1).getByRole('button', { name: '载入', exact: true }).waitFor();
  const saveShot = await shot(page, `${prefix}-save`);
  await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
  const after = await advance(page, choiceId);
  // Reload the application, then load the actual manual save created by a UI click.
  await page.reload();
  await page.getByRole('button', { name: /^我的存档/ }).click();
  await page.locator('.save-slot').nth(1).getByRole('button', { name: '载入', exact: true }).click();
  // Do not depend on requestAnimationFrame after a full reload in an occluded
  // Windows browser. Poll the same exact state condition; no weaker assertion.
  await page.waitForFunction(id => JSON.parse(window.render_game_to_text!()).nodeId === id && !JSON.parse(window.render_game_to_text!()).modal, before.nodeId, { polling: 100 });
  assert.deepEqual(facts(await state(page)), facts(before));
  assert.equal((await state(page)).paragraph, before.paragraph);
  assert.deepEqual(facts(await advance(page, choiceId)), facts(after));
  await page.getByRole('button', { name: '重选上一步', exact: true }).click();
  const rewindShot = await shot(page, `${prefix}-rewind`);
  await page.getByRole('button', { name: '返回选择', exact: true }).click();
  await page.waitForFunction(id => JSON.parse(window.render_game_to_text!()).nodeId === id, before.nodeId);
  assert.deepEqual(facts(await state(page)), facts(before));
  assert.deepEqual(facts(await advance(page, choiceId)), facts(after));
  return { before: facts(before), after: facts(after), reloadAndManualLoad: true, rewindRestoredBalancesAndClues: true, replayMatched: true, saveShot, rewindShot };
}

const channel = process.env.B_LIVE_BROWSER ?? 'msedge';
const browser = await chromium.launch({ headless: true, channel });
const results: any[] = [], network: any[] = [];
const manifest: any = { startedAt: new Date().toISOString(), base, browserChannel: channel, delivery: 'Real HTTP; UI-only progression and saves; no intercepted responses, seeded saves, or injected game state', results, network };
let activePage: Page | undefined;
try {
  for (const entry of inventory.filter(w => (!process.env.B_LIVE_WORLD || w.worldId === process.env.B_LIVE_WORLD) && (!cases || cases.some(c => c.worldId === w.worldId)))) {
    const response = await fetch(`${base}/api/worlds/${entry.storyId}`);
    assert.equal(response.status, 200);
    const raw = await response.text();
    const world: GameWorld = JSON.parse(raw);
    assert.equal(world.id, entry.worldId);
    assert.ok(world.version === entry.version || world.compatibleSaveVersions?.includes(entry.version), `${world.id}: inventory witness version is not declared compatible`);
    writeFileSync(`${directory}/${world.id}.live-world.json`, raw);
    network.push({ url: response.url, status: response.status, worldId: world.id, version: world.version, sha256: sha(raw), nodes: Object.keys(world.nodes).length });
    for (const viewport of [{ width: 1440, height: 960 }, { width: 320, height: 740 }].filter(v => !process.env.B_LIVE_WIDTH || String(v.width) === process.env.B_LIVE_WIDTH)) {
      const context = await browser.newContext({ viewport, ...(viewport.width === 320 ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
      await context.addInitScript(({ key, settings }) => { localStorage.setItem(key, JSON.stringify(settings)); }, { key: storageKeys.settings, settings: { ...defaultSettings, textSize: viewport.width === 320 ? 22 : 18, textSpeed: 100, reducedMotion: true } });
      const page = await context.newPage();
      activePage = page;
      page.setDefaultTimeout(12_000);
      const errors: string[] = [], httpFailures: any[] = [], api: any[] = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('response', r => {
        if (r.status() >= 400) httpFailures.push({ status: r.status(), url: r.url() });
        if (r.url().includes('/api/')) api.push({ url: r.url(), status: r.status(), method: r.request().method() });
      });
      await page.goto(base);
      await page.getByRole('textbox', { name: '搜索标题、作者或关键词' }).fill(world.source.title);
      await page.locator('article').filter({ has: page.getByRole('heading', { name: world.source.title, exact: true }) }).getByRole('button', { name: '玩改编', exact: true }).click();
      await page.getByRole('button', { name: '认识这个世界', exact: true }).click();
      await begin(page);
      for (const route of entry.routes.filter(r => (!process.env.B_LIVE_ROUTE || r.id === process.env.B_LIVE_ROUTE) && (!cases || cases.some(c => c.worldId === world.id && c.route === r.id)))) {
        const pressure = process.env.B_LIVE_PRESSURE ? pressureWitness(world, route.entry) : undefined;
        const targets = cases ? cases.filter(c => c.worldId === world.id && c.route === route.id) : pressure ? [{ id: pressure.endingId, choices: pressure.path }] : process.env.B_LIVE_PILOT ? route.endingWitnesses.slice(0, 1) : route.endingWitnesses;
        for (const [index, witness] of targets.entries()) {
          const prefix = `${world.id}-${route.id}-${witness.id}-${viewport.width}`;
          const result: any = { worldId: world.id, version: world.version, route: route.id, endingId: witness.id, viewport, path: witness.choices, scenes: [], worldResponseHash: sha(raw), errors, httpFailures, api };
          results.push(result);
          let expected = startSession(world);
          for (const [step, choiceId] of witness.choices.entries()) {
            const seen = await reveal(page);
            assert.deepEqual(facts(seen), expectedFacts(expected));
            result.scenes.push({ nodeId: seen.nodeId, chapter: seen.chapter, location: seen.location, time: seen.time, text: seen.readParagraphs, resources: seen.resources, clues: seen.clues, choices: seen.choices, lockedChoices: seen.lockedChoices, visuals: seen.visuals, layout: await layout(page) });
            assert.ok(seen.nodeId === world.startNodeId || route.dialogueIds.includes(seen.nodeId), `${route.id} crossed into an exclusive other route`);
            assert.equal(await page.locator('.locked-choice').count(), seen.lockedChoices.length);
            for (const resource of world.resources ?? []) {
              assert.equal(Number(await page.getByRole('meter', { name: resource.label, exact: true }).getAttribute('value')), seen.resources[resource.id]);
            }
            if (pressure && seen.nodeId === pressure.nodeId) {
              assert.deepEqual(seen.resources, pressure.resources);
              assert.ok(Object.values(seen.resources).includes(0));
              assert.ok(pressure.blocked.every(id => seen.lockedChoices.some((c: any) => c.id === id)));
              result.naturalDepletion = { ...pressure, screenshot: await shot(page, `${prefix}-depletion`) };
            }
            if (index === 0 && step === 1) result.reader = await checkReader(page, world, prefix);
            if (index === 0 && step === 3) {
              result.pressureScreenshot = await shot(page, `${prefix}-choices`);
              result.persistence = await checkSaveRewind(page, choiceId, prefix);
            } else await advance(page, choiceId);
            const c = expected.choices.find(c => c.id === choiceId);
            assert.ok(c, `${prefix}/${choiceId}: saved witness invalid`);
            expected = choose(expected, c);
            assert.deepEqual(facts(await state(page)), expectedFacts(expected));
          }
          const ending = await reveal(page);
          assert.equal(ending.mode, 'ending');
          assert.equal(ending.nodeId, witness.id);
          assert.equal(await page.locator('.ending-prose').innerText(), ending.text);
          assert.match(await page.locator('.ending-source').innerText(), /此结局为独立互动改编/);
          result.ending = { text: ending.text, tone: ending.ending.tone, resources: ending.resources, clues: ending.clues, visuals: ending.visuals };
          result.screenshot = await shot(page, prefix);
          await page.getByRole('button', { name: '回看这条路', exact: true }).click();
          await page.waitForFunction(() => JSON.parse(window.render_game_to_text!()).modal === 'journal');
          assert.equal((await state(page)).history.length, expected.history.length);
          await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
          await page.getByRole('button', { name: '翻开另一种可能', exact: true }).click();
          await begin(page);
          assert.deepEqual(facts(await state(page)), expectedFacts(startSession(world)));
          result.endingReview = true;
          result.replayReset = true;
          assert.deepEqual(errors, []);
          result.pass = true;
          writeFileSync(`${directory}/report.json`, JSON.stringify(manifest, null, 2));
          console.log(`${world.id} ${route.id} ${witness.id} ${viewport.width}: ${witness.choices.length} UI choices, ending/replay OK`);
        }
      }
      network.push({ worldId: world.id, viewport, api, httpFailures, errors });
      await context.close();
      activePage = undefined;
    }
  }
  manifest.finishedAt = new Date().toISOString();
  manifest.pass = true;
} catch (error) {
  manifest.failure = String(error);
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: `${directory}/failure.png`, fullPage: true });
    writeFileSync(`${directory}/failure.snapshot.txt`, await activePage.locator('body').ariaSnapshot());
    manifest.failureState = await state(activePage);
  }
  throw error;
} finally {
  writeFileSync(`${directory}/report.json`, JSON.stringify(manifest, null, 2));
  await browser.close();
}
