import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { authoredWorlds } from '../content/worlds.ts';
import { compileWorld } from '../server/worlds.ts';
import { defaultSettings, saveSession, storageKeys } from '../src/game.ts';
import { explore, replay } from './core-creative-support.ts';

const client = 'E:/CodexHome/skills/develop-web-game/scripts/web_game_playwright_client.js';
const { chromium } = createRequire(client)('playwright');
const launch = chromium.launch.bind(chromium);
const world = compileWorld(authoredWorlds.find(w => w.id === 'blue-blood'));
const path = explore(world).nodes.get('b_cross');
const session = replay(world, path);
session.paragraphIndex = session.paragraphs.length - 1;
const saved = saveSession(session);

// Run the unmodified bundled client with the installed browser and a browser-
// local current-world response. Never refresh or replace the shared server.
chromium.launch = async options => {
  const browser = await launch({ ...options, channel: 'msedge' });
  const newPage = browser.newPage.bind(browser);
  browser.newPage = async options => {
    const page = await newPage(options);
    await page.route(`**/api/worlds/${world.storyId}*`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(world) }));
    await page.addInitScript(({ keys, save, settings }) => {
      localStorage.setItem(keys.auto, JSON.stringify(save));
      localStorage.setItem(keys.settings, JSON.stringify(settings));
      localStorage.setItem(keys.onboarding, 'true');
    }, { keys: storageKeys, save: saved, settings: { ...defaultSettings, reducedMotion: true, textSpeed: 100 } });
    return page;
  };
  return browser;
};
process.argv = [process.argv[0], client, '--url', 'http://127.0.0.1:4173', '--click-selector', 'button.current-world', '--actions-json', JSON.stringify({ steps: [{ buttons: [], frames: 2 }] }), '--iterations', '1', '--pause-ms', '200', '--screenshot-dir', 'output/playwright/creative-core/skill-client'];
await import(pathToFileURL(client).href);
