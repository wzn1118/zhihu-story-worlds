// Run the bundled game client unchanged against a real, UI-entered B story.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const client = 'E:/CodexHome/skills/develop-web-game/scripts/web_game_playwright_client.js';
const { chromium } = createRequire(client)('playwright');
const launch = chromium.launch.bind(chromium);
chromium.launch = async options => {
  const browser = await launch({ ...options, channel: process.env.B_SKILL_BROWSER ?? 'msedge' });
  const newPage = browser.newPage.bind(browser);
  browser.newPage = async options => {
    const page = await newPage({ ...options, viewport: { width: 320, height: 740 } });
    const goto = page.goto.bind(page);
    page.goto = async (...args) => {
      const response = await goto(...args);
      await page.getByRole('textbox', { name: '搜索标题、作者或关键词' }).fill('俺妈和她的丧尸闺女');
      await page.locator('article').filter({ has: page.getByRole('heading', { name: '俺妈和她的丧尸闺女', exact: true }) }).getByRole('button', { name: '玩改编' }).click();
      await page.getByRole('button', { name: '认识这个世界' }).click();
      await page.getByRole('button', { name: /^(开始故事|以.*的身份醒来)$/ }).click();
      for (const id of ['b_enter_ferry', 'light', 'lock']) {
        for (let n = 0; n < 16; n++) {
          let state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
          await page.evaluate(() => window.advanceTime(100_000));
          await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).textComplete);
          state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
          if (state.paragraph === state.paragraphCount) break;
          await page.getByRole('button', { name: '继续', exact: true }).click();
        }
        const state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
        const index = state.choices.findIndex(c => c.id === id);
        if (index < 0) throw new Error(`Missing actual UI choice: ${id}`);
        await page.locator('button.choice-button').nth(index).click();
        await page.waitForFunction(node => JSON.parse(window.render_game_to_text()).nodeId !== node, state.nodeId);
      }
      return response;
    };
    return page;
  };
  return browser;
};
process.argv = [process.argv[0], client, '--url', 'http://127.0.0.1:4173', '--actions-json', JSON.stringify({ steps: [{ buttons: ['space'], frames: 2 }, { buttons: [], frames: 2 }] }), '--iterations', '1', '--pause-ms', '200', '--screenshot-dir', process.env.B_SKILL_OUTPUT ?? 'output/playwright/catalog-b-live/skill-client'];
await import(pathToFileURL(client).href);
