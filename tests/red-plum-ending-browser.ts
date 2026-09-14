import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, type Page } from 'playwright';
import type { GameWorld } from '../shared/types.ts';
import { defaultSettings, encodeSaveFile, saveSession, storageKeys } from '../src/game.ts';
import { auditBGraph } from './catalog-b-graph.ts';
import { play } from './catalog-b-editorial-support.ts';

const base = 'http://127.0.0.1:4173';
const output = resolve('output/red-plum-ending-20260907');
const before = JSON.parse(await readFile(resolve(output, 'before.json'), 'utf8')) as GameWorld;
const response = await fetch(`${base}/api/worlds/${before.storyId}`);
assert.ok(response.ok);
const world = await response.json() as GameWorld;
const endingId = 'b_village_small';
assert.equal(world.nodes[endingId].title, '闹闹留在家里', 'Actual server must serve the correction');
const { ink: _oldInk, ...oldData } = structuredClone(before);
const { ink: _newInk, ...newData } = structuredClone(world);
const oldNode = oldData.nodes[endingId], newNode = newData.nodes[endingId];
oldNode.title = newNode.title;
oldNode.text = [...newNode.text];
oldNode.ending!.title = newNode.ending!.title;
oldNode.ending!.text = newNode.ending!.text;
assert.deepEqual(newData, oldData, 'Only the selected ending title and prose may change');
const audit = auditBGraph(world);
const late = audit.atEdge.get('b_village_table/home')!;
assert.ok(late);
const cases = [
  { name: 'early', path: ['b_enter_village', 'b_withdraw'] },
  { name: 'late', path: [...late.path, 'home'] },
];
await mkdir(output, { recursive: true });
const oldSaveFile = resolve(output, 'previous-ending-save.json');
await writeFile(oldSaveFile, encodeSaveFile(saveSession(play(before, cases[1].path))));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const results: object[] = [], errors: string[] = [];
const state = (page: Page) => page.evaluate(() => JSON.parse(window.render_game_to_text!()));
async function ready(page: Page) {
  for (let i = 0; i < 40; i++) {
    const current = await state(page);
    if (current.mode === 'ending' || current.choices?.length) return current;
    const next = page.getByRole('button', { name: /^(显示全文|继续)$/ });
    if (await next.count()) await next.click();
    await page.waitForTimeout(70);
  }
  throw new Error('Choices did not appear');
}
async function verifyEnding(page: Page, screenshot: string) {
  const current = await ready(page);
  assert.equal(current.nodeId, endingId);
  assert.equal(current.ending.title, world.nodes[endingId].title);
  assert.equal(await page.locator('.ending-prose').textContent(), world.nodes[endingId].text.join('\n\n'));
  assert.ok(!(await page.locator('.ending-content').innerText()).includes('把能做的事缩回'));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  assert.ok(await page.locator('.ending-prose').evaluate(element => element.scrollWidth <= element.clientWidth + 1));
  await page.screenshot({ path: resolve(output, screenshot), fullPage: true });
  return current;
}
try {
  for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport });
    await context.addInitScript(({ keys, settings }) => {
      localStorage.setItem(keys.settings, JSON.stringify(settings));
      localStorage.setItem(keys.onboarding, 'true');
    }, { keys: storageKeys, settings: { ...defaultSettings, reducedMotion: true, textSpeed: 100 } });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    for (const scenario of cases) {
      await page.goto(base);
      await page.locator('.story-card').filter({ has: page.getByRole('heading', { name: world.source.title, exact: true }) }).locator('.story-card-open').click();
      await page.getByRole('button', { name: '进入故事世界', exact: true }).click();
      await page.getByRole('dialog', { name: '世界序章', exact: true }).getByRole('button', { name: '开始故事', exact: true }).click();
      for (const id of scenario.path) {
        const current = await ready(page);
        const index = current.choices.findIndex((choice: { id: string }) => choice.id === id);
        assert.ok(index >= 0, `${current.nodeId}/${id} unavailable`);
        await page.locator('.choice-button').nth(index).click();
        await page.waitForFunction(node => JSON.parse(window.render_game_to_text!()).nodeId === node,
          world.nodes[current.nodeId].choices.find(choice => choice.id === id)!.nextNodeId);
      }
      const ending = await verifyEnding(page, `${viewport.name}-${scenario.name}.png`);
      results.push({ viewport: viewport.name, scenario: scenario.name, path: scenario.path,
        nodeId: ending.nodeId, title: ending.ending.title, exactProse: true, resources: ending.resources, clues: ending.clues });
    }
    await page.getByRole('button', { name: '返回书库', exact: true }).first().click();
    await page.getByRole('button', { name: /我的存档/ }).click();
    await page.getByLabel('选择存档文件', { exact: true }).setInputFiles(oldSaveFile);
    const dialog = page.getByRole('dialog', { name: '导入存档', exact: true });
    await dialog.locator('#import-save-slot').selectOption('1');
    await dialog.getByRole('button', { name: '导入到存档 02', exact: true }).click();
    await page.locator('.save-slot').filter({ has: page.getByText('02', { exact: true }) }).getByRole('button', { name: '载入', exact: true }).click();
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text!()).mode === 'ending');
    await verifyEnding(page, `${viewport.name}-old-save.png`);
    results.push({ viewport: viewport.name, oldEndingSaveImportedAndRestored: true, updatedProse: true });
    await context.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'after.json'), JSON.stringify(world, null, 2));
  await writeFile(resolve(output, 'verification.json'), JSON.stringify({ status: 'passed', base, worldId: world.id,
    endingId, onlySelectedEndingChanged: true, sourceAndMechanicsUnchanged: true, results, errors }, null, 2));
  console.log(JSON.stringify({ status: 'passed', output, checks: results.length, errors }));
} catch (error) {
  for (const context of browser.contexts()) for (const page of context.pages()) {
    await page.screenshot({ path: resolve(output, 'failure.png') }).catch(() => {});
  }
  await writeFile(resolve(output, 'failure.json'), JSON.stringify({ status: 'failed', error: String(error), results, errors }, null, 2));
  throw error;
} finally { await browser.close(); }
