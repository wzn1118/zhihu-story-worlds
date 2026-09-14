import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { defaultSettings, storageKeys } from '../src/game.ts';

const folder = 'output/coordination/ceo-cutout-integration-20260910/version-retry';
const fixture = JSON.parse(await readFile(`${folder}/fixture.json`, 'utf8'));
const manifests = await Promise.all(['before', 'after'].map(phase => readFile(`${folder}/manifest-${phase}.json`, 'utf8')));
const pixels = await readFile(`${folder}/fixture.png`);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const report = { at: new Date().toISOString(), scope: fixture.scope, status: 'running', attempts: [], errors: [] };
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await page.clock.install();
  let revised = false;
  await context.route('**/generated-art/character-cutouts.json', route => route.fulfill({ status: 200,
    contentType: 'application/json', headers: { etag: revised ? '"fixture-B"' : '"fixture-A"' },
    body: route.request().method() === 'HEAD' ? '' : manifests[Number(revised)] }));
  await context.route(`**${fixture.url}*`, async route => {
    report.attempts.push(route.request().url());
    if (!revised) await route.fulfill({ status: 503, body: 'Controlled initial image failure' });
    else await route.fulfill({ status: 200, contentType: 'image/png', body: pixels });
  });
  page.on('pageerror', error => report.errors.push(error.message));
  await context.addInitScript(({ keys, settings }) => {
    localStorage.setItem(keys.onboarding, 'true');
    localStorage.setItem(keys.settings, JSON.stringify(settings));
  }, { keys: storageKeys, settings: { ...defaultSettings, textSpeed: 100, reducedMotion: true } });
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await page.locator('.story-card').filter({ has: page.getByRole('heading', { name: '蓝血', exact: true }) }).getByRole('button', { name: '玩改编', exact: true }).click();
  await page.getByRole('dialog', { name: '世界序章', exact: true }).getByRole('button', { name: '开始故事', exact: true }).click();
  await page.waitForFunction(url => {
    const image = document.querySelector('.character-portrait');
    const state = JSON.parse(window.render_game_to_text());
    return state.nodeId === 'training' && (state.visuals.character?.status === 'unavailable'
      || (image?.complete && image.naturalWidth > 0 && new URL(image.src).pathname !== url));
  }, fixture.url);
  assert.ok(report.attempts.some(url => new URL(url).searchParams.get('sha256') === fixture.beforeSha));
  const before = await page.evaluate(key => ({ saved: localStorage.getItem(key), state: JSON.parse(window.render_game_to_text()) }), storageKeys.auto);
  revised = true;
  await page.clock.fastForward(60001);
  await page.waitForFunction(({ url, sha }) => {
    const image = document.querySelector('.character-portrait');
    return image?.complete && image.naturalWidth > 0 && new URL(image.src).pathname === url
      && new URL(image.src).searchParams.get('sha256') === sha && getComputedStyle(image).visibility === 'visible';
  }, { url: fixture.url, sha: fixture.afterSha });
  const after = await page.evaluate(key => ({ saved: localStorage.getItem(key), state: JSON.parse(window.render_game_to_text()) }), storageKeys.auto);
  assert.equal(after.saved, before.saved);
  for (const key of ['worldId', 'nodeId', 'paragraph', 'text', 'resources', 'history', 'choiceCount', 'rewindsRemaining'])
    assert.deepEqual(after.state[key], before.state[key]);
  const decoded = await page.locator('.character-portrait').evaluate(image => {
    const canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 1;
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
    return { width: image.naturalWidth, height: image.naturalHeight, corner: [...ctx.getImageData(0, 0, 1, 1).data] };
  });
  assert.deepEqual(decoded, { width: fixture.width, height: fixture.height, corner: [255, 0, 0, 255] });
  assert.deepEqual(report.errors, []);
  Object.assign(report, { status: 'passed', beforeSha: fixture.beforeSha, afterSha: fixture.afterSha, decoded,
    autosaveUnchanged: true, progressUnchanged: true, compiled: await page.locator('script[type="module"]').getAttribute('src') });
  await page.screenshot({ path: `${folder}/recovered.png` });
} catch (error) { report.status = 'failed'; report.error = error.stack; throw error; }
finally {
  await browser.close();
  await writeFile(`${folder}/report.json`, JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ status: report.status, attempts: report.attempts.length, report: `${folder}/report.json` }));
