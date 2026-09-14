import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const output = resolve('output/liukan-intelligence/web-touch');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, hasTouch: true });
const page = await context.newPage(); page.setDefaultTimeout(15000);
const errors: string[] = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto('http://127.0.0.1:4180', { waitUntil: 'domcontentloaded' });
  await page.locator('.liukan-tour').waitFor(); await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /新故事工作台/ }).click();
  await page.getByRole('button', { name: /去知乎选故事/ }).click();
  const embedded = page.frameLocator('iframe');
  const handle = embedded.locator('[data-redleaf-feed]').first();
  await handle.waitFor();
  assert.equal(await embedded.locator('[data-redleaf-feed]').count(), 1);
  await page.mouse.move(500, 500); await page.mouse.wheel(0, 460); await page.waitForTimeout(200);
  const source = (await handle.boundingBox())!, target = (await page.locator('.liukan-bubble').boundingBox())!;
  const cdp = await context.newCDPSession(page);
  const sx = source.x + source.width / 2, sy = source.y + source.height / 2;
  const tx = target.x + target.width / 2, ty = target.y + target.height / 2;
  const response = page.waitForResponse(row => /\/api\/liukan\/inbox$/.test(row.url()) && row.request().method() === 'POST').then(value => ({ value }), error => ({ error }));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy }] });
  for (let i = 1; i <= 16; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sx + (tx - sx) * i / 16, y: sy + (ty - sy) * i / 16 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const outcome = await response; if ('error' in outcome) throw outcome.error;
  assert.equal(outcome.value.status(), 201);
  await page.locator('.liukan-post-kicker').waitFor();
  await page.getByRole('button', { name: '收起刘看山', exact: true }).click();
  // A cancelled drag must leave the next ordinary feed click available.
  await handle.scrollIntoViewIfNeeded();
  const start = (await handle.boundingBox())!;
  await page.mouse.move(start.x + 20, start.y + 10); await page.mouse.down();
  await page.mouse.move(start.x - 100, start.y + 15, { steps: 10 }); await page.mouse.up();
  const clicked = page.waitForResponse(row => /\/api\/liukan\/inbox$/.test(row.url()) && row.request().method() === 'POST').then(value => ({ value }), error => ({ error }));
  await handle.click();
  const clickOutcome = await clicked; if ('error' in clickOutcome) throw clickOutcome.error;
  assert.equal(clickOutcome.value.status(), 201);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: resolve(output, 'touch-fed-mobile.png') });
  assert.equal(context.pages().length, 1); assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'verification.json'), JSON.stringify({ status: 'passed', touchDrag: 201, clickAfterCancel: 201, uniqueHandle: true, pages: 1, errors }, null, 2));
  console.log(JSON.stringify({ status: 'passed', output }));
} catch (error) {
  await page.screenshot({ path: resolve(output, 'failure.png') }).catch(() => {});
  await writeFile(resolve(output, 'failure.json'), JSON.stringify({ error: String(error), errors }, null, 2));
  throw error;
} finally { await context.close(); await browser.close(); }
