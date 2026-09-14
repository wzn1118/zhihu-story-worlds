import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium, type Page } from 'playwright';
import type { GameWorld } from '../shared/types.ts';
import { defaultSettings, storageKeys } from '../src/game.ts';
import { auditBGraph } from './catalog-b-graph.ts';

const base = 'http://127.0.0.1:4173';
const output = 'output/editorial/catalog-b/20260907-followup/live-long-choices';
mkdirSync(output, { recursive: true });
const cases = [
  { storyId: '1793742089336532992', nodeId: 'b_dock', choiceId: 'charter' },
  { storyId: '1783485301039054849', nodeId: 'b_radio_gap', choiceId: 'high' },
];
const state = (page: Page) => page.evaluate(() => JSON.parse(window.render_game_to_text!()));
async function ready(page: Page) {
  for (let i = 0; i < 40; i++) {
    const current = await state(page);
    if (current.mode === 'ending' || current.choices?.length) return current;
    const next = page.getByRole('button', { name: /^(显示全文|继续)$/ });
    if (await next.count()) await next.click();
    await page.waitForTimeout(70);
  }
  throw new Error('Current scene choices did not become ready');
}
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const results = [], errors: string[] = [];
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 320, height: 740 }]) {
    for (const c of cases) {
      const response = await fetch(`${base}/api/worlds/${c.storyId}`);
      assert.ok(response.ok);
      const world = await response.json() as GameWorld;
      const witness = auditBGraph(world).atEdge.get(`${c.nodeId}/${c.choiceId}`)!;
      assert.ok(witness);
      const context = await browser.newContext({ viewport });
      await context.addInitScript(({ keys, settings }) => {
        localStorage.setItem(keys.settings, JSON.stringify(settings));
        localStorage.setItem(keys.onboarding, 'true');
      }, { keys: storageKeys, settings: { ...defaultSettings, reducedMotion: true, textSpeed: 100 } });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base);
      await page.locator('.story-card').filter({ has: page.getByRole('heading', { name: world.source.title, exact: true }) }).locator('.story-card-open').click();
      await page.getByRole('button', { name: '进入故事世界', exact: true }).click();
      await page.getByRole('dialog', { name: '世界序章', exact: true }).getByRole('button', { name: '开始故事', exact: true }).click();
      for (const id of witness.path) {
        const current = await ready(page);
        const index = current.choices.findIndex((choice: { id: string }) => choice.id === id);
        assert.ok(index >= 0, `${current.nodeId}/${id}`);
        await page.locator('.choice-button').nth(index).click();
        await page.waitForFunction(node => JSON.parse(window.render_game_to_text!()).nodeId === node,
          world.nodes[current.nodeId].choices.find(choice => choice.id === id)!.nextNodeId);
      }
      const current = await ready(page);
      assert.equal(current.nodeId, c.nodeId);
      const index = current.choices.findIndex((choice: { id: string }) => choice.id === c.choiceId);
      assert.ok(index >= 0);
      const button = page.locator('.choice-button').nth(index);
      const text = await button.innerText();
      assert.ok(text.includes(world.nodes[c.nodeId].choices.find(choice => choice.id === c.choiceId)!.text));
      await button.scrollIntoViewIfNeeded();
      const layout = await button.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        return { documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth,
          buttonWidth: bounds.width, buttonHeight: bounds.height, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth,
          clientHeight: element.clientHeight, scrollHeight: element.scrollHeight,
          left: bounds.left, right: bounds.right };
      });
      assert.ok(layout.documentWidth <= viewport.width + 1);
      assert.ok(layout.scrollWidth <= layout.clientWidth + 1);
      assert.ok(layout.scrollHeight <= layout.clientHeight + 1);
      assert.ok(layout.left >= 0 && layout.right <= viewport.width + 1);
      const prefix = `${world.id}-${viewport.width}`;
      await page.screenshot({ path: `${output}/${prefix}.png`, fullPage: true });
      writeFileSync(`${output}/${prefix}.state.json`, JSON.stringify(current, null, 2));
      await button.click();
      const nextId = world.nodes[c.nodeId].choices.find(choice => choice.id === c.choiceId)!.nextNodeId;
      await page.waitForFunction(id => JSON.parse(window.render_game_to_text!()).nodeId === id, nextId);
      results.push({ worldId: world.id, viewport, nodeId: c.nodeId, choiceId: c.choiceId, path: witness.path,
        text, layout, nextNodeId: nextId, actualUiClick: true, visuals: current.visuals,
        scope: 'Previously published long choice, not the new 20260907 follow-up prose' });
      await context.close();
    }
  }
  assert.deepEqual(errors, []);
  writeFileSync(`${output}/report.json`, JSON.stringify({ checkedAt: new Date().toISOString(), base, pass: true, results, errors, requestInterception: false, seededGameSaves: false, newFollowupPublished: false }, null, 2));
  console.log(JSON.stringify({ pass: true, cases: results.length, errors }));
} catch (error) {
  for (const context of browser.contexts()) for (const page of context.pages()) await page.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {});
  writeFileSync(`${output}/failure.json`, JSON.stringify({ error: String(error), results, errors }, null, 2));
  throw error;
} finally { await browser.close(); }
