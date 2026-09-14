import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { defaultSettings, saveSession, storageKeys } from '../src/game.ts';
import type { GameWorld } from '../shared/types.ts';
import { withReviewedWorkshopCopy } from '../shared/workshop-copy.ts';
import { originalSeed } from '../shared/workshop.ts';
import { explore, replay } from '../tests/core-creative-support.ts';

const base = 'http://127.0.0.1:4173';
const projectId = 'import-6febc2f6-3a12-41ac-bae5-6d05ebc68c10';
const response = await fetch(`${base}/api/workshop/projects/${projectId}/world?version=r1`, { signal: AbortSignal.timeout(45000) });
assert.ok(response.ok, `Published sample API: ${response.status}`);
const original = await response.json() as GameWorld;
const world = withReviewedWorkshopCopy(original);
const graph = explore(world);
const output = resolve('output/playwright/workshop-prose', new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(output, { recursive: true });
const reading = [`# ${world.title}\n\n${world.subtitle}\n\n本稿为生成故事的文案校订，原文未改。`, ...world.introduction,
  ...Object.values(world.nodes).map(node => `## ${node.chapter} / ${node.title}\n\n${node.text.join('\n\n')}\n\n${node.choices.map(choice => `- ${choice.text}\n  ${choice.hint ?? ''}\n  结果：${choice.feedback?.text ?? ''}`).join('\n\n')}`)];
await writeFile(join(output, 'reading-draft.md'), reading.join('\n\n'));
const executablePath = process.argv.find(arg => arg.startsWith('--executable='))?.slice('--executable='.length);
console.log('Checking all 40 scenes on desktop and mobile through actual save loading.');
const browser = await chromium.launch({ ...(executablePath ? { executablePath } : { channel: 'chrome' }), headless: true, timeout: 30000 });
const results: unknown[] = [], errors: string[] = [];
const selectedShots = new Set(['arrival', 'bring_her_back_05_voice', 'let_the_record_speak_08_one_repair', 'close_the_station_10_last_window']);
let current: { viewport: string; nodeId: string } | undefined;
let activePage: import('playwright').Page | undefined;
const saveReport = (status: string, failure?: string) => writeFile(join(output, 'verification.json'), JSON.stringify({ projectId, version: 'r1', scenes: graph.nodes.size, status, current, results, errors, failure }, null, 2));
console.log(`Evidence: ${output}`);
try {
  for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
    const openPage = async () => {
      const context = await browser.newContext({ viewport });
      context.setDefaultTimeout(60000);
      await context.addInitScript(({ keys, settings }) => {
        localStorage.setItem(keys.onboarding, 'true');
        localStorage.setItem(keys.settings, JSON.stringify(settings));
      }, { keys: storageKeys, settings: { ...defaultSettings, reducedMotion: true, textSpeed: 100 } });
      const page = await context.newPage();
      activePage = page;
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      return { context, page };
    };
    let { context, page } = await openPage();
    let index = 0;
    for (const [nodeId, path] of graph.nodes) {
      current = { viewport: viewport.name, nodeId };
      if (index && index % 10 === 0) {
        await context.close();
        ({ context, page } = await openPage());
      }
      const session = replay(world, path);
      session.paragraphIndex = session.paragraphs.length - 1;
      await page.evaluate(({ key, save }) => localStorage.setItem(key, JSON.stringify(save)), { key: storageKeys.auto, save: saveSession(session) });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /我的存档/ }).click();
      await page.getByRole('button', { name: '载入', exact: true }).first().click();
      await page.waitForFunction(id => { const state = JSON.parse(window.render_game_to_text?.() ?? '{}'); return state.nodeId === id && state.textComplete; }, nodeId);
      const actual = JSON.parse(await page.evaluate(() => window.render_game_to_text!()));
      const expectedText = session.node.ending ? session.paragraphs.join('\n\n') : session.paragraphs.at(-1);
      assert.equal(actual.text, expectedText, nodeId);
      assert.deepEqual(actual.choices.map(({ text, hint }: { text: string; hint?: string }) => ({ text, hint })), session.choices.map(choice => ({ text: choice.text, hint: choice.hint })));
      assert.equal(await page.locator(session.node.ending ? '.ending-prose' : '.dialogue-text').textContent(), expectedText);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${nodeId}: horizontal fit`);
      const boxes = await page.locator('.choice-button').evaluateAll(elements => elements.map(element => {
        const rect = element.getBoundingClientRect(), copy = element.querySelector('.choice-copy')!;
        return { top: rect.top, bottom: rect.bottom, textFits: copy.scrollWidth <= copy.clientWidth + 1 && copy.scrollHeight <= copy.clientHeight + 1 };
      }));
      assert.ok(boxes.every(box => box.textFits), `${nodeId}: choice text fits`);
      assert.ok(boxes.every((box, i) => i === 0 || box.top >= boxes[i - 1].bottom), `${nodeId}: choices separated`);
      if (selectedShots.has(nodeId) || session.node.ending) await page.screenshot({ path: join(output, `${viewport.name}-${nodeId}.png`), fullPage: true, animations: 'disabled' });
      if (nodeId === 'arrival') {
        if (viewport.name === 'desktop') {
          await page.getByRole('button', { name: '故事背景', exact: true }).click();
          assert.ok((await page.locator('.world-intro').innerText()).includes(world.introduction[2]));
          assert.ok(!(await page.locator('.world-intro').innerText()).includes('共通开场完成一次闭环'));
          await page.screenshot({ path: join(output, 'desktop-introduction.png'), animations: 'disabled' });
          await page.getByRole('button', { name: '返回故事', exact: true }).click();
        }
        await page.locator('.game-bottomline .source-reader-link').click();
        await page.getByTestId('imported-source-text').waitFor();
        assert.equal(await page.getByTestId('imported-source-text').textContent(), originalSeed.text);
        await page.screenshot({ path: join(output, `${viewport.name}-source.png`), animations: 'disabled' });
        await page.getByRole('button', { name: '继续当前故事', exact: true }).click();
      }
      if (!session.node.ending) {
        const chosen = session.choices[0];
        await page.locator('.choice-button').first().click();
        await page.waitForFunction(id => JSON.parse(window.render_game_to_text!()).nodeId === id, chosen.nextNodeId);
        const state = JSON.parse(await page.evaluate(() => window.render_game_to_text!()));
        assert.equal(state.lastOutcome.feedback?.text, chosen.feedback?.text);
      }
      results.push({ viewport: viewport.name, nodeId, exactText: true, choiceCount: session.choices.length, saveRestored: true, clickedNext: !session.node.ending });
      console.log(`${viewport.name}: ${++index}/40 ${nodeId}`);
      await saveReport('running');
    }
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /新故事工作台/ }).click();
    await page.locator('.workshop-project').filter({ hasText: world.title }).click();
    await page.screenshot({ path: join(output, `${viewport.name}-workshop.png`), fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: /游玩 r/ }).click();
    await page.getByRole('button', { name: '开始故事', exact: true }).waitFor();
    await page.screenshot({ path: join(output, `${viewport.name}-new-game-introduction.png`), animations: 'disabled' });
    await page.getByRole('button', { name: '开始故事', exact: true }).click();
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text!()).nodeId === 'arrival');
    await context.close();
  }
  assert.deepEqual(errors, []);
  await saveReport('passed');
  console.log(JSON.stringify({ output, scenes: graph.nodes.size, checks: results.length, errors }, null, 2));
} catch (error) {
  await saveReport('failed', String(error));
  await activePage?.screenshot({ path: join(output, 'failure.png'), timeout: 10000 }).catch(() => {});
  throw error;
} finally { await browser.close(); }
