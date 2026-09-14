import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = 'http://103.236.94.87:18080';
const output = '/data/zhihu-project/shared/public-verification';
const account = JSON.parse(await readFile(`${output}/temporary-account.json`, 'utf8'));
const browser = await chromium.launch({ executablePath: '/snap/bin/chromium', headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, storageState: `${output}/temporary-browser-state.json` });
const page = await context.newPage();
const errors = [], failures = [];
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => { if (response.url().startsWith(base) && response.status() >= 400) failures.push({ path: new URL(response.url()).pathname, status: response.status() }); });
try {
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.locator('.library-shell').waitFor({ timeout: 60000 });
  const me = await (await context.request.get(`${base}/api/auth/me`)).json();
  assert.equal(me.user?.id, account.id);
  if (await page.getByRole('button', { name: '稍后再看引导' }).isVisible()) await page.getByRole('button', { name: '稍后再看引导' }).click();
  await page.locator('.story-card').first().waitFor();
  await page.screenshot({ path: `${output}/public-library.png`, fullPage: false });
  const library = await (await context.request.get(`${base}/api/stories`)).json();
  const worlds = [];
  for (const story of library.stories.filter(row => row.playable)) {
    const response = await context.request.get(`${base}/api/worlds/${encodeURIComponent(story.id)}`);
    assert.equal(response.status(), 200, story.title);
    const world = await response.json();
    assert(Object.keys(world.nodes ?? {}).length > 0, story.title);
    worlds.push({ title: story.title, id: story.id, nodes: Object.keys(world.nodes).length });
  }
  const story = library.stories.find(row => row.title.includes('蓝血')) ?? library.stories.find(row => row.playable);
  const card = page.locator(`[data-story-id="${story.id}"]`);
  await card.getByRole('button', { name: '玩改编', exact: true }).click();
  const guide = page.getByRole('button', { name: '认识这个世界' });
  const start = page.getByRole('button', { name: '开始故事', exact: true });
  await guide.or(start).waitFor({ timeout: 60000 });
  if (await guide.isVisible()) await guide.click();
  await start.click();
  await page.locator('.game-stage').waitFor({ timeout: 30000 });
  await page.screenshot({ path: `${output}/public-game.png`, fullPage: false });
  const text = await page.locator('.game-stage').innerText();
  assert(text.trim().length > 0);
  const images = await page.locator('.game-stage img').evaluateAll(rows => rows.map(img => ({ source: img.currentSrc, loaded: img.complete && img.naturalWidth > 0 })));
  for (let step = 0; step < 12 && !(await page.locator('.choice-button').count()); step++) {
    await page.locator('button.dialogue-next').click();
  }
  const previousScene = await page.locator('.scene-time').innerText();
  const chosen = await page.locator('.choice-action').first().innerText();
  await page.locator('.choice-button').first().click();
  await page.waitForFunction(previous => document.querySelector('.scene-time')?.textContent !== previous, previousScene);
  const result = { at: new Date().toISOString(), base, checks: ['session preserved after service restart', 'all playable world endpoints', 'open story via library', 'start story gameplay', 'advance dialogue and choose a branch'], worlds, played: story.title, chosen, images, errors, failures };
  await writeFile(`${output}/play-result.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  assert.equal(errors.length, 0);
  assert.equal(failures.length, 0);
} catch (error) {
  await page.screenshot({ path: `${output}/play-failure.png`, fullPage: true }).catch(() => {});
  console.log(JSON.stringify({ errors, failures, text: (await page.locator('body').innerText()).slice(-1800) }));
  throw error;
} finally {
  await browser.close();
}
