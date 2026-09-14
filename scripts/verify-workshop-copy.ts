import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { defaultSettings, saveSession, startSession, storageKeys } from '../src/game.ts';
import type { GameWorld } from '../shared/types.ts';

const base = 'http://127.0.0.1:4173';
const projectId = 'import-6febc2f6-3a12-41ac-bae5-6d05ebc68c10';
const response = await fetch(`${base}/api/workshop/projects/${projectId}/world?version=r1`, { signal: AbortSignal.timeout(15000) });
assert.ok(response.ok, `Published sample API: ${response.status}`);
const world = await response.json() as GameWorld;
const session = startSession(world);
session.paragraphIndex = session.paragraphs.length - 1;
const save = saveSession(session);
const expected = session.choices.map(choice => ({ text: choice.text, hint: choice.hint }));
const output = resolve('output/playwright/workshop-copy', new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(output, { recursive: true });
const executablePath = process.argv.find(arg => arg.startsWith('--executable='))?.slice('--executable='.length);
console.log('Opening browser for the three reviewed choices.');
const browser = await chromium.launch({ ...(executablePath ? { executablePath } : { channel: 'chrome' }), headless: true, timeout: 30000 });
const results: unknown[] = [], errors: string[] = [];
try {
  for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport });
    await context.addInitScript(({ keys, game, settings }) => {
      localStorage.setItem(keys.auto, JSON.stringify(game));
      localStorage.setItem(keys.onboarding, 'true');
      localStorage.setItem(keys.settings, JSON.stringify(settings));
    }, { keys: storageKeys, game: save, settings: { ...defaultSettings, reducedMotion: true, textSpeed: 100 } });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /我的存档/ }).click();
    await page.getByRole('button', { name: '载入', exact: true }).first().click();
    await page.locator('.choice-button').first().waitFor();
    const labels = await page.locator('.choice-copy').evaluateAll(elements => elements.map(element => ({
      text: element.firstChild?.textContent, hint: element.querySelector('small')?.textContent,
    })));
    assert.deepEqual(labels, expected);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    const boxes = await page.locator('.choice-button').evaluateAll(elements => elements.map(element => {
      const rect = element.getBoundingClientRect(), copy = element.querySelector('.choice-copy')!;
      return { top: rect.top, bottom: rect.bottom, height: rect.height, textFits: copy.scrollWidth <= copy.clientWidth + 1 && copy.scrollHeight <= copy.clientHeight + 1 };
    }));
    assert.ok(boxes.every(box => box.textFits));
    assert.ok(boxes.every((box, i) => i === 0 || box.top >= boxes[i - 1].bottom));
    await page.screenshot({ path: join(output, `${viewport.name}.png`), fullPage: true, animations: 'disabled' });
    await page.locator('.choice-button').first().click();
    await page.waitForFunction(id => JSON.parse(window.render_game_to_text!()).nodeId === id, world.nodes.arrival.choices[0].nextNodeId);
    results.push({ viewport, labels, boxes, firstChoiceReached: world.nodes.arrival.choices[0].nextNodeId });
    await context.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(join(output, 'verification.json'), JSON.stringify({ projectId, version: 'r1', results, errors }, null, 2));
  console.log(JSON.stringify({ output, results }, null, 2));
} finally { await browser.close(); }
