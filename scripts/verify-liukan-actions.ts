import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';

// This component-only harness uses an ephemeral listener and one isolated headless tab.
// It never touches the shared application listener, its data, or the user's browser.
const root = process.cwd();
const output = path.join(root, 'output/playwright/liukan-actions');
await mkdir(output, { recursive: true });
await build({ entryPoints: ['tests/fixtures/liukan-actions-browser.tsx'], absWorkingDir: root, outdir: output, bundle: true, format: 'esm', jsx: 'automatic', sourcemap: false });
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  try {
    if (url.pathname === '/') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/liukan-actions-browser.css"><style>body{margin:0;padding:24px;box-sizing:border-box;background:#0c171b;font-family:system-ui}*{box-sizing:border-box}[data-testid=avatar]{position:fixed;z-index:5;bottom:12px;right:12px}@media(max-width:680px){body{padding:10px}}</style><div id="root"></div><script type="module" src="/liukan-actions-browser.js"></script></html>');
      return;
    }
    const asset = /^\/assets\/liukan\/(greeting|sway|idle|computer|sleep|ball)\.(gif|png)$/.test(url.pathname);
    const bundle = /^\/liukan-actions-browser\.(js|css)$/.test(url.pathname);
    if (!asset && !bundle) { res.writeHead(404).end(); return; }
    const file = asset ? path.join(root, 'public', url.pathname) : path.join(output, url.pathname);
    res.setHeader('Content-Type', url.pathname.endsWith('.js') ? 'text/javascript' : url.pathname.endsWith('.css') ? 'text/css' : url.pathname.endsWith('.png') ? 'image/png' : 'image/gif');
    res.end(await readFile(file));
  } catch { res.writeHead(500).end(); }
});
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const port = (server.address() as { port: number }).port;
let executablePath = process.env.LIUKAN_TEST_CHROMIUM;
if (!executablePath && !existsSync(chromium.executablePath()) && process.platform === 'win32' && process.env.LOCALAPPDATA) {
  const cache = path.join(process.env.LOCALAPPDATA, 'ms-playwright');
  for (const revision of (await readdir(cache)).filter(name => /^chromium-\d+$/.test(name)).sort().reverse()) {
    const candidate = path.join(cache, revision, 'chrome-win64/chrome.exe');
    if (existsSync(candidate)) { executablePath = candidate; break; }
  }
}
const browser = await chromium.launch({ headless: true, executablePath });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors: string[] = [];
const checks: string[] = [];
page.on('pageerror', error => errors.push(error.message));
const avatar = page.locator('[data-testid=avatar] .liukan-avatar');
const settle = async () => page.waitForFunction(() => !document.querySelector('[data-testid=avatar] .liukan-avatar.is-playing'));
try {
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => Boolean((window as any).actionTest));
  await settle();
  assert.equal(await page.locator('[data-action-id]').count(), 56);
  assert.equal(await avatar.getAttribute('data-liukan-motion'), 'reduced');
  assert.match(await avatar.locator('img').getAttribute('src') ?? '', /\.png$/);
  checks.push('56 actions and explicit reduced-motion PNG');

  await page.evaluate(() => { (window as any).actionTest.completed.length = 0; (window as any).actionTest.render({ playKey: 1 }, true); });
  await page.waitForFunction(() => document.querySelector('[data-testid=avatar] .liukan-avatar')?.getAttribute('data-liukan-motion') === 'full');
  await page.evaluate(() => (window as any).actionTest.performLiukanAction('hello'));
  await page.waitForFunction(() => document.querySelector('[data-testid=avatar] .liukan-avatar')?.getAttribute('data-liukan-action') === 'hello');
  await settle();
  assert.deepEqual(await page.evaluate(() => (window as any).actionTest.completed), ['hello']);
  assert.equal(await avatar.getAttribute('data-liukan-action'), 'hello');
  assert.match(await avatar.locator('img').getAttribute('src') ?? '', /\.png$/);
  checks.push('event completion once, no unsolicited baseline replay');

  await page.evaluate(() => { (window as any).actionTest.completed.length = 0; (window as any).actionTest.performLiukanAction('happy-hop'); });
  await page.waitForFunction(() => Boolean(document.querySelector('[data-testid=avatar] .liukan-avatar.is-playing')));
  await page.evaluate(() => { (window as any).priorActionImage = document.querySelector('[data-testid=avatar] img'); (window as any).actionTest.performLiukanAction('happy-hop'); });
  await page.waitForFunction(() => (window as any).priorActionImage !== document.querySelector('[data-testid=avatar] img'));
  await settle();
  assert.deepEqual(await page.evaluate(() => (window as any).actionTest.completed), ['happy-hop']);
  await page.evaluate(() => (window as any).actionTest.performLiukanAction('happy-hop'));
  await page.waitForFunction(() => Boolean(document.querySelector('[data-testid=avatar] .liukan-avatar.is-playing')));
  await settle();
  assert.deepEqual(await page.evaluate(() => (window as any).actionTest.completed), ['happy-hop', 'happy-hop']);
  checks.push('rapid identical events restart and separate completed events replay');

  await page.evaluate(() => { (window as any).actionTest.performLiukanAction('hello', 'different-pet'); window.dispatchEvent(new CustomEvent('liukan:action', { detail: { action: '__proto__', target: 'pet' } })); });
  await page.waitForTimeout(50);
  assert.equal(await avatar.getAttribute('data-liukan-action'), 'happy-hop');
  checks.push('foreign targets and invalid action events ignored');

  const ids = await page.evaluate(() => (window as any).actionTest.actions.map((item: { id: string }) => item.id));
  const loaded = [];
  for (const id of ids) {
    await page.evaluate(action => (window as any).actionTest.performLiukanAction(action), id);
    await page.waitForFunction(action => document.querySelector('[data-testid=avatar] .liukan-avatar.is-playing')?.getAttribute('data-liukan-action') === action, id);
    await avatar.locator('img').evaluate(async image => { await (image as HTMLImageElement).decode(); });
    const state = await avatar.evaluate(element => ({ action: element.getAttribute('data-liukan-action'), animationCount: element.getAnimations({ subtree: true }).length, width: (element.querySelector('img') as HTMLImageElement).naturalWidth, height: (element.querySelector('img') as HTMLImageElement).naturalHeight }));
    assert.equal(state.action, id); assert.ok(state.animationCount > 0); assert.equal(state.width, 320); assert.equal(state.height, 320);
    loaded.push(state);
  }
  checks.push('all 56 actual GIF-backed actions decode and start Web Animations');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await settle();
  assert.equal(await avatar.getAttribute('data-liukan-motion'), 'reduced');
  assert.equal(await avatar.evaluate(element => element.getAnimations({ subtree: true }).length), 0);
  assert.match(await avatar.locator('img').getAttribute('src') ?? '', /\.png$/);
  const completedBefore = await page.evaluate(() => (window as any).actionTest.completed.length);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForTimeout(100);
  assert.equal(await avatar.evaluate(element => element.classList.contains('is-playing')), false);
  assert.equal(await page.evaluate(() => (window as any).actionTest.completed.length), completedBefore);
  checks.push('live OS motion changes cancel animation without replaying settled actions');

  await page.getByRole('button', { name: '想一想', exact: true }).click();
  assert.equal(await page.locator('[data-action-id]').count(), 8);
  await page.getByRole('button', { name: '全部', exact: true }).click();
  await page.getByRole('textbox', { name: '搜索看山动作' }).fill('认真鞠躬');
  assert.equal(await page.locator('[data-action-id]').count(), 1);
  await page.locator('[data-action-id=bow]').click();
  await page.getByRole('button', { name: '让身边的看山表演' }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid=avatar] .liukan-avatar')?.getAttribute('data-liukan-action') === 'bow');
  await page.getByRole('textbox', { name: '搜索看山动作' }).fill('');
  checks.push('gallery filters, search and real pet event dispatch');
  await page.screenshot({ path: path.join(output, 'desktop.png'), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.getByRole('button', { name: '静止观看' }).click();
  assert.equal(await page.locator('.liukan-gallery-floor .liukan-avatar').getAttribute('data-liukan-motion'), 'reduced');
  await page.getByRole('button', { name: '播放动作' }).click();
  await page.waitForFunction(() => Boolean(document.querySelector('.liukan-gallery-floor .liukan-avatar.is-playing')));
  await page.screenshot({ path: path.join(output, 'mobile.png'), fullPage: true });
  checks.push('390px layout fits, gallery still mode and explicit replay work');

  await page.evaluate(() => { (window as any).actionTest.completed.length = 0; (window as any).actionTest.render({ action: 'happy-hop', playKey: 2 }); });
  await page.waitForFunction(() => document.querySelector('[data-testid=avatar] .liukan-avatar.is-playing')?.getAttribute('data-liukan-action') === 'happy-hop');
  await settle();
  await page.evaluate(() => (window as any).actionTest.render({ action: 'happy-hop', playKey: 3 }));
  await page.waitForFunction(() => Boolean(document.querySelector('[data-testid=avatar] .liukan-avatar.is-playing')));
  await settle();
  assert.deepEqual(await page.evaluate(() => (window as any).actionTest.completed), ['happy-hop', 'happy-hop']);
  checks.push('controlled playKey replays the same action exactly once');
  await page.evaluate(() => { (window as any).actionTest.performLiukanAction('hello'); });
  await page.waitForFunction(() => Boolean(document.querySelector('[data-testid=avatar] .liukan-avatar.is-playing')));
  await page.evaluate(() => { (window as any).actionTest.completed.length = 0; (window as any).actionTest.unmount(); });
  await page.waitForTimeout(2600);
  assert.deepEqual(await page.evaluate(() => (window as any).actionTest.completed), []);
  checks.push('unmount cancels the animation and its completion callback');
  assert.deepEqual(errors, []);
  checks.push('no browser page errors');
  await writeFile(path.join(output, 'report.json'), JSON.stringify({ scope: 'isolated real component harness; not whole-app acceptance', checks, loaded, errors, screenshots: ['desktop.png', 'mobile.png'], completedAt: new Date().toISOString() }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, actionsPlayed: loaded.length, output }));
} finally {
  await browser.close();
  await new Promise<void>(resolve => server.close(() => resolve()));
}
