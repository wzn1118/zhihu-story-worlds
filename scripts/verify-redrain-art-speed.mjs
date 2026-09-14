import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { freshPlatformState } from '../public/games/redrain/src/platform-state.js';

const base = process.argv[2] || 'http://127.0.0.1:18081/games/redrain';
const label = process.argv[3] || 'optimized';
const output = new URL('../output/redrain-art-speed/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const seed = { ...freshPlatformState(), mode: 'game', tutorialSeen: true, readingCursor: { identity: 'first-proof:', page: 3, complete: true, reachedEnd: false } };
await context.addInitScript(seed => {
  localStorage.setItem('doomsday-45-degree-save-v2', JSON.stringify(seed));
  localStorage.setItem('doomsday-45-degree-reading-v1', JSON.stringify({ speed: 'instant', reducedMotion: true }));
}, seed);
const page = await context.newPage();
const failures = [];
page.on('pageerror', error => failures.push(error.message));
const cdp = await context.newCDPSession(page);
await cdp.send('Network.enable');
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 120, downloadThroughput: 200000, uploadThroughput: 100000 });
try {
  await page.goto(`${base}/index.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => document.querySelector('#character-stage').dataset.status === 'ready', null, { timeout: 120000 });
  const cold = await page.evaluate(() => ({
    elapsedMs: Math.round(performance.now()),
    speaker: document.querySelector('#speaker-name').textContent,
    stage: { ...document.querySelector('#character-stage').dataset },
    requests: performance.getEntriesByType('resource').map(item => ({ url: item.name, bytes: item.encodedBodySize, durationMs: Math.round(item.duration) })),
  }));
  assert.equal(cold.stage.character, '崔语心');
  if (label !== 'baseline') assert.match(cold.stage.asset, /\.webp$/);
  await page.screenshot({ path: new URL(`${label}-cold.png`, output).pathname });
  // Read the current paragraph while upcoming speakers load in the background.
  await page.waitForTimeout(7000);
  const started = Date.now();
  await page.locator('#reading-advance').click();
  await page.waitForFunction(() => {
    const stage = document.querySelector('#character-stage');
    return stage.dataset.status === 'ready' && stage.dataset.character === '楼绎';
  }, null, { timeout: 120000 });
  const nextSpeakerMs = Date.now() - started;
  await page.locator('#reading-prev').click();
  await page.waitForFunction(() => document.querySelector('#character-stage').dataset.character === '崔语心');
  assert.deepEqual(failures, []);
  const report = { base, label, network: { latencyMs: 120, downloadBytesPerSecond: 200000 }, cold, nextSpeakerMs, errors: failures };
  await writeFile(new URL(`${label}-browser-report.json`, output), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ label, coldMs: cold.elapsedMs, nextSpeakerMs, bytesAtPortraitReady: cold.requests.reduce((sum, item) => sum + item.bytes, 0), errors: failures }));
} finally { await browser.close(); }
