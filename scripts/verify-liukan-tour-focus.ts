import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const output = resolve(process.argv[3] ?? 'output/liukan-tour-focus');
await mkdir(output, { recursive: true });
const base = process.argv[2] ?? process.env.TOUR_QA_URL ?? 'http://127.0.0.1:4186';
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
// Exercise the application's declared local font fallback so an unavailable
// Google Fonts stylesheet cannot hold the module-navigation checks open.
await context.route('https://fonts.googleapis.com/**', route => route.abort());
await context.route('https://fonts.gstatic.com/**', route => route.abort());
const page = await context.newPage();
const errors: string[] = [], forbidden: string[] = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => {
  if (request.method() === 'POST' && /\/(generate|image-launch|creative-config)(?:\?|$)|\/liukan\/.*chat/.test(request.url())) forbidden.push(request.url());
});
const rows: unknown[] = [];
async function ready() {
  await page.waitForFunction(() => document.querySelector('.liukan-tour')?.getAttribute('data-ready') === 'true', undefined, { timeout: 70000 });
  await page.waitForTimeout(180);
}
async function measure(label: string, index: number) {
  const result = await page.locator('.liukan-tour').evaluate(element => {
    const target = element.getAttribute('data-target')!;
    const matches = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`)).filter(item => item.getClientRects().length && !item.closest('[hidden]'));
    const spot = element.querySelector('.liukan-tour-spotlight')!.getBoundingClientRect();
    const card = element.querySelector('.liukan-tour-card')!.getBoundingClientRect();
    const next = element.querySelector('.liukan-tour-next')!.getBoundingClientRect();
    return { step: element.getAttribute('data-step'), target, count: matches.length,
      inModal: Boolean(matches[0]?.closest('.modal')), inNavigation: Boolean(matches[0]?.closest('.primary-nav')),
      relayOpen: document.querySelector<HTMLDetailsElement>('.relay-config')?.open,
      hasProject: Boolean(document.querySelector('.workshop-detail')),
      overlap: Math.max(0, Math.min(spot.right, card.right) - Math.max(spot.left, card.left)) * Math.max(0, Math.min(spot.bottom, card.bottom) - Math.max(spot.top, card.top)),
      cardVisible: card.left >= 0 && card.top >= 0 && card.right <= innerWidth + 1 && card.bottom <= innerHeight + 1,
      nextVisible: next.top >= card.top && next.bottom <= card.bottom + 1,
    };
  });
  rows.push({ label, index, ...result });
  console.log(JSON.stringify({ label, step: result.step, target: result.target, overlap: result.overlap }));
  await writeFile(resolve(output, 'progress.json'), JSON.stringify({ rows, errors, forbidden }, null, 2));
  assert.equal(result.count, 1, `${label}/${result.step}: one exact visible module`);
  assert.equal(result.inNavigation, false, `${label}/${result.step}: content, not navigation`);
  assert.ok(result.overlap < 1, `${label}/${result.step}: card overlaps spotlight by ${result.overlap}`);
  assert.ok(result.cardVisible && result.nextVisible, `${label}/${result.step}: controls within viewport`);
  if (result.step === 'relay') assert.equal(result.relayOpen, true);
  if (['play', 'source', 'saves', 'settings'].includes(result.step!)) assert.equal(result.inModal, true);
  if (['source', 'relay', 'art', 'saves', 'zhihu'].includes(result.step!)) await page.screenshot({ path: resolve(output, `${label}-${result.step}.png`) });
  return result;
}
async function runTour(label: string, width: number, height: number) {
  await page.setViewportSize({ width, height });
  if (!(await page.locator('.liukan-tour').count())) await page.getByRole('button', { name: '怎么开始', exact: true }).first().click();
  for (let index = 0; index < 14; index++) {
    await ready(); await measure(label, index);
    await page.keyboard.press('Tab');
    assert.ok(await page.evaluate(() => Boolean(document.activeElement?.closest('.liukan-tour-card'))));
    if (index < 13) await page.locator('.liukan-tour-next').click();
  }
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.liukan-tour').count(), 0);
  assert.equal(await page.locator('#root').evaluate(element => (element as HTMLElement).inert), false);
  assert.equal(await page.locator('.modal').count(), 0);
}
try {
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await runTour('desktop', 1440, 1000);
  await runTour('mobile', 390, 844);
  await runTour('small', 320, 568);
  await runTour('landscape', 844, 390);

  // Exercise an empty project list without mutating any stored user project.
  await page.route('**/api/workshop/projects', async route => {
    const response = await route.fetch(); const data = await response.json();
    await route.fulfill({ response, json: { ...data, projects: [] } });
  });
  await page.getByRole('button', { name: '怎么开始', exact: true }).first().click();
  for (let index = 0; index <= 10; index++) {
    await ready();
    if (index >= 9) { const result = await measure('empty-project-fixture', index); assert.equal(result.hasProject, false); }
    if (index < 10) await page.locator('.liukan-tour-next').click();
  }
  await page.keyboard.press('Escape');
  await page.unrouteAll({ behavior: 'wait' });

  // A slow subpage must not reopen after the user leaves the guide.
  await page.route('**/api/worlds/*', async route => { await new Promise(resolve => setTimeout(resolve, 1000)); await route.continue(); });
  await page.getByRole('button', { name: '怎么开始', exact: true }).first().click();
  await ready(); await page.locator('.liukan-tour-next').click(); await ready();
  await page.locator('.liukan-tour-next').click(); await page.keyboard.press('Escape');
  await page.waitForTimeout(2500);
  assert.equal(await page.locator('.liukan-tour, .modal').count(), 0);
  await page.unrouteAll({ behavior: 'wait' });
  assert.deepEqual(errors, []); assert.deepEqual(forbidden, []); assert.equal(context.pages().length, 1);
  await writeFile(resolve(output, 'verification.json'), JSON.stringify({ status: 'passed', base, liveModuleCases: rows.length - 2, fixtureCases: 2, pages: context.pages().length, errors, forbiddenProductionCalls: forbidden, delayedClose: 'passed', rows }, null, 2));
  console.log(JSON.stringify({ status: 'passed', cases: rows.length, output }));
} catch (error) {
  await page.screenshot({ path: resolve(output, 'failure.png') }).catch(() => {});
  await writeFile(resolve(output, 'failure.json'), JSON.stringify({ error: String(error), errors, forbidden, rows }, null, 2));
  throw error;
} finally { await browser.close(); }
