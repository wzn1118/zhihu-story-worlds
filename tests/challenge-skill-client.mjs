import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { choose, defaultSettings, saveSession, startSession, storageKeys } from '../src/game.ts';

const base = 'http://127.0.0.1:4173';
const client = 'E:/CodexHome/skills/develop-web-game/scripts/web_game_playwright_client.js';
const { chromium } = createRequire(client)('playwright');
const launch = chromium.launch.bind(chromium);
const response = await fetch(`${base}/api/worlds/2025684191967294692`);
assert.equal(response.status, 200);
const world = await response.json();
let session = startSession(world, { difficulty: 'challenge' });
for (const id of ['accept_exam', 'record_test', 'search_landmarks', 'save_map', 'ask_witness', 'visit_diner', 'record_alley', 'save_alley', 'open_case_desk']) {
  const choice = session.choices.find(choice => choice.id === id);
  assert.ok(choice, `Missing legal choice ${id}`);
  session = choose(session, choice);
}
session.paragraphIndex = session.paragraphs.length - 1;
const saved = saveSession(session);

// Exercise the bundled client against the shared API with a valid, replayed
// challenge save. The wrapper only selects Edge and initializes local storage.
chromium.launch = async options => {
  const browser = await launch({ ...options, channel: 'msedge' });
  const newPage = browser.newPage.bind(browser);
  browser.newPage = async options => {
    const page = await newPage(options);
    await page.addInitScript(({ keys, save, settings }) => {
      localStorage.setItem(keys.auto, JSON.stringify(save));
      localStorage.setItem(keys.settings, JSON.stringify(settings));
      localStorage.setItem(keys.onboarding, 'true');
    }, { keys: storageKeys, save: saved, settings: { ...defaultSettings, reducedMotion: true, textSpeed: 100 } });
    return page;
  };
  return browser;
};
process.argv = [process.argv[0], client, '--url', base, '--click-selector', 'button.current-world', '--actions-json', JSON.stringify({ steps: [{ buttons: [], frames: 2 }] }), '--iterations', '2', '--pause-ms', '3000', '--screenshot-dir', 'output/playwright/difficulty-source-20260910-skill'];
process.once('beforeExit', () => {
  const state = JSON.parse(readFileSync('output/playwright/difficulty-source-20260910-skill/state-1.json', 'utf8'));
  assert.equal(state.nodeId, 'case_desk');
  assert.equal(state.difficulty, 'challenge');
  assert.equal(state.resources.focus, 0);
});
await import(pathToFileURL(client).href);
