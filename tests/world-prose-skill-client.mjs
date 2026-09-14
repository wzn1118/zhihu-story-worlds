import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { defaultSettings, storageKeys } from '../src/game.ts';

const client = 'E:/CodexHome/skills/develop-web-game/scripts/web_game_playwright_client.js';
const { chromium } = createRequire(client)('playwright');
const launch = chromium.launch.bind(chromium);
const directory = process.env.WORLD_PROSE_OUTPUT ?? 'output/world-prose';
const browserDirectory = process.env.WORLD_PROSE_BROWSER_OUTPUT ?? 'output/playwright/world-prose';
const world = JSON.parse(readFileSync(`${directory}/hollow-immortals.world.json`, 'utf8'));
const saved = JSON.parse(readFileSync(`${directory}/hollow-immortals.save.json`, 'utf8'));
chromium.launch = async options => {
  const browser = await launch({ ...options, channel: 'msedge' });
  const newPage = browser.newPage.bind(browser);
  browser.newPage = async options => {
    const page = await newPage({ ...options, viewport: { width: 320, height: 740 } });
    await page.route(`**/api/worlds/${world.storyId}`, route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(world) }));
    await page.addInitScript(({ keys, save, settings }) => {
      localStorage.setItem(keys.auto, JSON.stringify(save));
      localStorage.setItem(keys.saves, JSON.stringify([save, null, null]));
      localStorage.setItem(keys.settings, JSON.stringify(settings));
      localStorage.setItem(keys.onboarding, 'true');
    }, { keys: storageKeys, save: saved, settings: { ...defaultSettings, textSpeed: 100, textSize: 22, reducedMotion: true } });
    const goto = page.goto.bind(page);
    page.goto = async (...args) => {
      const response = await goto(...args);
      await page.locator('button[title="我的存档"]').click();
      await page.locator('.save-slot').first().getByRole('button', { name: '载入', exact: true }).click();
      await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');
      await page.evaluate(() => window.advanceTime(100_000));
      return response;
    };
    return page;
  };
  return browser;
};
process.argv = [process.argv[0], client, '--url', 'http://127.0.0.1:4173', '--actions-json', JSON.stringify({ steps: [{ buttons: [], frames: 2 }] }), '--iterations', '1', '--pause-ms', '200', '--screenshot-dir', `${browserDirectory}/skill-client`];
await import(pathToFileURL(client).href);
