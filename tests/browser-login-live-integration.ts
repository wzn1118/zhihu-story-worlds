/** Explicit live-network check. No real app identity, credentials, SMS or consent. */
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Page, type BrowserContext } from 'playwright';

const candidate = resolve(process.env.BROWSER_REPAIR_RELEASE ?? 'releases/browser-repair-20260914');
const [{ ZhihuBrowserAccounts, createZhihuAccountBrowserRouter }, { ZhihuBrowserService }, { ZhihuDiscoveryService }] = await Promise.all([
  import(pathToFileURL(join(candidate, 'server/zhihu-browser-accounts.ts')).href),
  import(pathToFileURL(join(candidate, 'server/zhihu-browser.ts')).href),
  import(pathToFileURL(join(candidate, 'server/zhihu-discovery.ts')).href),
]);
const temporary = await mkdtemp(join(tmpdir(), 'redleaf-live-ui-'));
const output = resolve('output/browser-login-live-20260914/integration');
await mkdir(output, { recursive: true });
const services: any[] = [];
const account = { id: 'live-browser-diagnostic-account', provider: 'zhihu', name: '浏览器验证' };
const discovery = new ZhihuDiscoveryService(join(temporary, 'discovery'), async () => ({ Code: 0, Data: { Items: [] } }));
const manager = new ZhihuBrowserAccounts({ root: join(temporary, 'browsers'), createService: (d: any, profile: string) => {
  const service = new ZhihuBrowserService(d, profile, { defaultChannel: 'chromium', publicMode: true });
  services.push(service); return service;
} });
const app = express(); app.use(express.json());
app.get('/api/auth/me', (_req, res) => res.json({ user: account, authentication: { required: true, provider: 'zhihu', configured: true, browserAvailable: true, loginUrl: '/api/oauth/start' } }));
let publishedFrames = 0, publishedHttpStatus: number | undefined;
const apiFailures: { path: string; status: number; code?: string }[] = [], actions: string[] = [];
app.use('/api', (req, res, next) => {
  if (req.header('x-redleaf-account') !== account.id) return res.status(409).json({ error: { code: 'ACCOUNT_CHANGED' } });
  if (req.path === '/zhihu-browser/action') actions.push(String(req.body?.kind));
  const json = res.json.bind(res);
  res.json = function(body: any) { if (body?.frameId) { publishedFrames++; publishedHttpStatus = body.httpStatus; } if (res.statusCode >= 400) apiFailures.push({ path: req.path, status: res.statusCode, code: body.error?.code }); return json(body); };
  next();
});
app.use('/api/zhihu-browser', createZhihuAccountBrowserRouter(manager, () => account.id, () => discovery));
app.get('/api/stories', (_req, res) => res.json({ stories: [], source: 'cache' }));
app.get('/api/workshop/projects', (_req, res) => res.json({ projects: [], capabilities: { creativeConfigEditable: false } }));
app.get('/api/workshop/discovery', (_req, res) => res.json({ candidates: [], cached: true }));
app.get('/api/liukan/memories', (_req, res) => res.json({ memories: [] }));
app.get('/api/liukan/inbox', (_req, res) => res.json({ posts: [] }));
app.use('/api', (_req, res) => res.json({}));
app.use(express.static(join(candidate, 'dist')));
app.use(express.static(join(candidate, 'public')));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(done => server.once('listening', done));
const base = `http://127.0.0.1:${(server.address() as any).port}`;
const browser = await chromium.launch({ headless: true });
const checks: { name: string; pass: boolean; detail?: unknown }[] = [];
const errors: string[] = [];
const record = (name: string, detail?: unknown) => { checks.push({ name, pass: true, ...(detail === undefined ? {} : { detail }) }); console.log(JSON.stringify({ check: name, pass: true })); };
let ui: Page | undefined, context: BrowserContext | undefined;
function remote(): Page { const page = services.at(-1)?.page; assert.ok(page && !page.isClosed(), 'Remote browser is open'); return page; }
async function waitFor(predicate: () => Promise<boolean> | boolean, message: string, timeout = 15000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) { if (await predicate()) return; await new Promise(done => setTimeout(done, 150)); }
  throw new Error(message);
}
async function clickRemote(selector: string) {
  const inner = remote();
  const box = await inner.locator(selector).first().boundingBox(); assert.ok(box, `Remote selector visible: ${selector}`);
  const image = ui!.getByAltText('知乎网页实时画面', { exact: true });
  await image.scrollIntoViewIfNeeded();
  const outer = await image.boundingBox(); assert.ok(outer);
  const viewport = inner.viewportSize()!;
  const responded = ui!.waitForResponse(response => new URL(response.url()).pathname === '/api/zhihu-browser/action' && response.request().method() === 'POST');
  await ui!.mouse.click(outer.x + (box.x + box.width / 2) * outer.width / viewport.width, outer.y + (box.y + box.height / 2) * outer.height / viewport.height);
  const response = await responded;
  const next = await response.json();
  assert.equal(response.status(), 200, `Remote click failed: ${next.error?.code ?? response.status()}`);
  if (next.screenshot) await waitFor(async () => await image.getAttribute('src') === next.screenshot, 'New screenshot was not shown after click');
}
try {
  context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce' });
  await context.addInitScript(id => localStorage.setItem(`redleaf.account.v1:${id}:redleaf.liukan.introduction.v1`, JSON.stringify({ seen: true })), account.id);
  ui = await context.newPage(); ui.on('pageerror', error => errors.push(error.message));
  await ui.goto(base, { waitUntil: 'domcontentloaded' });
  const openingSkip = ui.getByRole('button', { name: /跳过开篇/ });
  await openingSkip.or(ui.getByRole('button', { name: '新故事工作台', exact: true })).first().waitFor();
  if (await openingSkip.isVisible()) await openingSkip.click();
  await ui.getByRole('button', { name: '新故事工作台', exact: true }).click();
  await ui.locator('[data-tour="workshop-zhihu-browser"]').click();
  await ui.getByAltText('知乎网页实时画面', { exact: true }).waitFor({ timeout: 40000 });
  await remote().locator('input[name="username"]').waitFor({ state: 'visible', timeout: 20000 });
  record('actual_ui_opens_real_zhihu_login', { status: publishedHttpStatus });
  await remote().locator('canvas').first().waitFor({ state: 'visible', timeout: 20000 });
  record('actual_zhihu_qr_canvas_loaded');
  await clickRemote('.SignFlow-tab:has-text("密码登录")');
  await remote().locator('input[name="password"]').waitFor({ state: 'visible', timeout: 15000 });
  record('password_tab_click_forwarded');
  await clickRemote('.SignFlow-tab:has-text("验证码登录")');
  await remote().locator('input[name="digits"]').waitFor({ state: 'visible', timeout: 15000 });
  record('sms_tab_click_forwarded');
  await clickRemote('input[name="username"]');
  await waitFor(() => remote().locator('input[name="username"]').evaluate(node => document.activeElement === node), 'Phone input did not receive remote focus');
  await ui.keyboard.insertText('00000000000');
  await waitFor(async () => await remote().locator('input[name="username"]').inputValue() === '00000000000', 'Desktop text not forwarded');
  record('desktop_direct_input_forwarded');
  await ui.keyboard.press('Control+A'); await ui.keyboard.press('Backspace');
  await waitFor(async () => await remote().locator('input[name="username"]').inputValue() === '', 'Desktop clear not forwarded');
  record('desktop_keyboard_clear_forwarded');
  const entry = ui.locator('#zhw-page-input');
  await entry.fill('00000000000');
  await ui.getByRole('button', { name: '输入到网页', exact: true }).click();
  await waitFor(async () => await remote().locator('input[name="username"]').inputValue() === '00000000000', 'Visible helper text not forwarded');
  await ui.getByRole('button', { name: '清空当前输入框', exact: true }).click();
  await waitFor(async () => await remote().locator('input[name="username"]').inputValue() === '', 'Visible helper clear not forwarded');
  record('mobile_input_helper_and_clear_forwarded');
  await waitFor(async () => await ui!.getByRole('button', { name: '更新画面', exact: true }).isEnabled(), 'Input action still busy');
  const dragImage = ui.getByAltText('知乎网页实时画面', { exact: true });
  await dragImage.scrollIntoViewIfNeeded();
  const dragBox = await dragImage.boundingBox(); assert.ok(dragBox);
  const dragViewport = remote().viewportSize()!;
  const gestureResponse = ui.waitForResponse(response => new URL(response.url()).pathname === '/api/zhihu-browser/action' && response.request().postDataJSON()?.kind === 'drag');
  await ui.mouse.move(dragBox.x + 70 / dragViewport.width * dragBox.width, dragBox.y + 40 / dragViewport.height * dragBox.height);
  await ui.mouse.down();
  await ui.mouse.move(dragBox.x + 170 / dragViewport.width * dragBox.width, dragBox.y + 40 / dragViewport.height * dragBox.height, { steps: 12 });
  await ui.mouse.up();
  const dragged = await gestureResponse; assert.equal(dragged.status(), 200);
  const draggedFrame = await dragged.json();
  await waitFor(async () => await dragImage.getAttribute('src') === draggedFrame.screenshot, 'Drag result screenshot was not shown');
  record('actual_remote_drag_gesture_forwarded_without_submit');
  const framesBefore = publishedFrames;
  await ui.getByRole('button', { name: '更新画面', exact: true }).click();
  await waitFor(() => publishedFrames > framesBefore, 'Frame did not refresh');
  await new Promise(done => setTimeout(done, 5000));
  await clickRemote('.SignFlow-tab:has-text("密码登录")');
  await remote().locator('input[name="password"]').waitFor({ state: 'visible', timeout: 15000 });
  record('click_works_after_repeated_qr_refresh');
  await ui.screenshot({ path: join(output, 'desktop-real-login.png'), fullPage: false });
  await remote().context().addCookies([{ name: 'redleaf_diagnostic_only', value: 'profile-persistence-check', domain: 'example.invalid', path: '/', expires: Math.floor(Date.now() / 1000) + 300 }]);
  const previousServices = services.length;
  await manager.close(account.id);
  await waitFor(() => services.length > previousServices && services.at(-1)?.page && !services.at(-1).page.isClosed(), 'Automatic reconnect did not launch browser', 30000);
  await remote().locator('input[name="username"]').waitFor({ state: 'visible', timeout: 20000 });
  record('closed_browser_can_reconnect');
  assert.ok((await remote().context().cookies('https://example.invalid/')).some(cookie => cookie.name === 'redleaf_diagnostic_only' && cookie.value === 'profile-persistence-check'));
  record('own_browser_cookies_persist_after_reconnect');
  await context.close();
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  await context.addInitScript(id => localStorage.setItem(`redleaf.account.v1:${id}:redleaf.liukan.introduction.v1`, JSON.stringify({ seen: true })), account.id);
  ui = await context.newPage(); ui.on('pageerror', error => errors.push(error.message));
  await ui.goto(base, { waitUntil: 'domcontentloaded' });
  const mobileOpeningSkip = ui.getByRole('button', { name: /跳过开篇/ });
  await mobileOpeningSkip.or(ui.getByRole('button', { name: '新故事工作台', exact: true })).first().waitFor();
  if (await mobileOpeningSkip.isVisible()) await mobileOpeningSkip.click();
  await ui.getByRole('button', { name: '新故事工作台', exact: true }).click();
  await ui.locator('[data-tour="workshop-zhihu-browser"]').click();
  await ui.getByAltText('知乎网页实时画面', { exact: true }).waitFor();
  const remotePhone = await remote().locator('input[name="username"]').boundingBox(); assert.ok(remotePhone);
  const mobileImage = ui.getByAltText('知乎网页实时画面', { exact: true });
  await mobileImage.scrollIntoViewIfNeeded();
  const mobileBox = await mobileImage.boundingBox(); assert.ok(mobileBox);
  const mobileViewport = remote().viewportSize()!;
  await ui.touchscreen.tap(mobileBox.x + (remotePhone.x + remotePhone.width / 2) * mobileBox.width / mobileViewport.width, mobileBox.y + (remotePhone.y + remotePhone.height / 2) * mobileBox.height / mobileViewport.height);
  await waitFor(() => remote().locator('input[name="username"]').evaluate(node => document.activeElement === node), 'Mobile tap did not focus remote input');
  await waitFor(() => ui!.locator('textarea[aria-label="直接向知乎网页输入"]').evaluate(node => document.activeElement === node), 'Mobile tap did not activate local keyboard input');
  await ui.keyboard.insertText('00000000000');
  await waitFor(async () => await remote().locator('input[name="username"]').inputValue() === '00000000000', 'Touch text not forwarded');
  await ui.getByRole('button', { name: '清空当前输入框', exact: true }).click();
  await waitFor(async () => await remote().locator('input[name="username"]').inputValue() === '', 'Mobile helper clear not forwarded');
  record('mobile_touch_direct_input_and_clear_forwarded');
  for (const gestureKind of ['scroll', 'drag']) {
    await waitFor(async () => await ui!.getByRole('button', { name: '更新画面', exact: true }).isEnabled(), 'Mobile input action still busy');
    await mobileImage.scrollIntoViewIfNeeded();
    const bounds = await mobileImage.boundingBox(); assert.ok(bounds);
    const first = { x: bounds.x + 24, y: bounds.y + 90 };
    const last = gestureKind === 'scroll' ? { x: first.x, y: first.y - 55 } : { x: first.x + 85, y: first.y };
    const gestureResponse = ui.waitForResponse(response => new URL(response.url()).pathname === '/api/zhihu-browser/action' && response.request().postDataJSON()?.kind === gestureKind);
    const touch = await context.newCDPSession(ui);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first] });
    for (let step = 1; step <= 8; step++) await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: first.x + (last.x - first.x) * step / 8, y: first.y + (last.y - first.y) * step / 8 }] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await touch.detach();
    const response = await gestureResponse; assert.equal(response.status(), 200);
    const gestureFrame = await response.json();
    await waitFor(async () => await mobileImage.getAttribute('src') === gestureFrame.screenshot, 'Mobile gesture result screenshot was not shown');
    record(gestureKind === 'scroll' ? 'mobile_vertical_touch_scroll_forwarded' : 'mobile_horizontal_touch_drag_forwarded');
  }
  await ui.getByRole('button', { name: '放大画面', exact: true }).click();
  assert.ok(await ui.locator('.zhw-browser-screen.is-zoomed').count());
  await ui.getByRole('button', { name: '适应宽度', exact: true }).click();
  record('mobile_zoom_controls_work');
  await ui.screenshot({ path: join(output, 'mobile-real-login.png'), fullPage: false });
  await manager.open('second-live-diagnostic-account', discovery, { url: 'https://www.zhihu.com/signin' });
  assert.ok(!(await remote().context().cookies('https://example.invalid/')).some(cookie => cookie.name === 'redleaf_diagnostic_only'));
  record('second_account_uses_separate_browser_cookies');
  assert.deepEqual(errors, []);
  assert.ok(!apiFailures.some(row => row.code !== 'BROWSER_CLOSED'), JSON.stringify(apiFailures));
  record('no_ui_errors_or_unexpected_api_failures');
} catch (error) {
  checks.push({ name: 'integration', pass: false, detail: error instanceof Error ? error.message.slice(0,1500) : String(error) });
  if (ui) await ui.screenshot({ path: join(output, 'failure.png'), fullPage: false }).catch(() => undefined);
  process.exitCode = 1;
} finally {
  await context?.close(); await browser.close(); await manager.closeAll();
  await new Promise<void>(done => server.close(() => done())); await rm(temporary, { recursive: true, force: true });
  const report = { candidate, actualUpstream: 'https://www.zhihu.com/', auth: 'temporary test identity only', noSmsOrLoginSubmitted: true, checks, errors, apiFailures, actions };
  await writeFile(join(output, 'results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
