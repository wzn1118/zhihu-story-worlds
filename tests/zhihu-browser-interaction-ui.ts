import assert from 'node:assert/strict';
import { chromium, type Route } from 'playwright';
import { createServer } from 'vite';

// Tests the real React controls with a deterministic local browser API. No
// credentials, login, SMS or consent requests are sent to Zhihu in this test.
const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
  import { createElement } from 'react';
  import { createRoot } from 'react-dom/client';
  import { configureAccountStorage } from '/src/account-storage.ts';
  import { ZhihuWorkspace } from '/src/ZhihuWorkspace.tsx';
  configureAccountStorage({ provider: 'zhihu' }, 'browser-interaction-test');
  createRoot(document.getElementById('root')).render(createElement(ZhihuWorkspace, { onClose: () => {} }));
</script></body></html>`;
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, plugins: [{ name: 'browser-interaction-test', configureServer(vite) {
  vite.middlewares.use(async (request, response, next) => {
    if (!request.url?.startsWith('/__browser-interaction-test')) return next();
    response.setHeader('content-type', 'text/html');
    response.end(await vite.transformIndexHtml(request.url, fixture));
  });
} }] });
await server.listen();
const address = server.httpServer!.address(); assert.ok(address && typeof address !== 'string');
const browser = await chromium.launch({ headless: true });
async function until(predicate: () => boolean) {
  const deadline = Date.now() + 10_000;
  while (!predicate()) { if (Date.now() > deadline) throw new Error('Expected UI request did not arrive'); await new Promise(resolve => setTimeout(resolve, 20)); }
}
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({ viewport: { width: mobile ? 390 : 1280, height: 900 }, isMobile: mobile, hasTouch: mobile });
    const page = await context.newPage();
    await page.clock.install();
    const actions: Record<string, unknown>[] = [], errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    let opened = false, opens = 0, frames = 0, version = 0, failNextAction = false, failNextFrame = false, holdFrame = false, heldRoute: Route | undefined;
    const screenshot = () => `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="700"><rect width="1100" height="700" fill="#e1f2fa"/><text x="100" y="100">Login QR ${version}</text><rect x="500" y="220" width="400" height="55" fill="white"/><rect x="500" y="310" width="400" height="55" fill="white"/><rect x="300" y="520" width="400" height="40" fill="#888"/></svg>`).toString('base64')}`;
    const loginFrame = () => ({ status: 'login-required', frameId: `login-${version}`, url: 'https://www.zhihu.com/signin', title: '知乎登录', width: 1100, height: 700, screenshot: screenshot(), posts: [], capturedAt: new Date().toISOString(), inputs: [{ type: 'tel', inputMode: 'tel', x: 500, y: 220, width: 400, height: 55 }, { type: 'password', x: 500, y: 310, width: 400, height: 55 }], focusedInput: { type: 'password' }, document: { id: 'inert-login-must-not-render', width: 1100, height: 700, scrollY: 0, html: '<html><body><h1>Inert login is unusable</h1></body></html>' } });
    await context.route('**/api/**', async route => {
      assert.equal(route.request().headers()['x-redleaf-account'], 'browser-interaction-test');
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/zhihu-browser/frame') {
        frames++;
        if (holdFrame) { heldRoute = route; return; }
        if (failNextFrame) { failNextFrame = false; return route.fulfill({ status: 502, contentType: 'text/html', body: 'Bad Gateway' }); }
        version++;
        return route.fulfill({ json: opened ? loginFrame() : { status: 'closed', frameId: '', url: '', title: '', width: 1100, height: 700, posts: [] } });
      }
      if (path === '/api/zhihu-browser/open') { opened = true; opens++; version++; return route.fulfill({ json: loginFrame() }); }
      if (path === '/api/zhihu-browser/action') {
        actions.push(route.request().postDataJSON());
        if (failNextAction) { failNextAction = false; opened = false; return route.fulfill({ status: 409, json: { error: { code: 'BROWSER_CLOSED', message: '这个知乎窗口已经关闭，请重新连接。' } } }); }
        version++; return route.fulfill({ json: loginFrame() });
      }
      throw new Error(`Unexpected request ${path}`);
    });
    await page.goto(`http://127.0.0.1:${address.port}/__browser-interaction-test`);
    const screen = page.getByAltText('知乎网页实时画面'); await screen.waitFor();
    assert.equal(await page.locator('iframe').count(), 0, 'dynamic login never uses an inert DOM clone');
    const originalScreenshot = await screen.getAttribute('src');
    await page.clock.fastForward(1300);
    await page.waitForFunction(previous => document.querySelector<HTMLImageElement>('.zhw-browser-screen img')?.src !== previous, originalScreenshot);
    assert.equal(await page.getByRole('button', { name: '刷新知乎画面' }).isEnabled(), true, 'background QR updates do not disable controls');
    const rect = (await screen.boundingBox())!;
    const point = (x: number, y: number) => ({ x: rect.x + x / 1100 * rect.width, y: rect.y + y / 700 * rect.height });
    const phone = point(650, 245);
    if (mobile) await page.touchscreen.tap(phone.x, phone.y); else await page.mouse.click(phone.x, phone.y);
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '直接向知乎网页输入');
    assert.equal(await page.getByLabel('直接向知乎网页输入').getAttribute('inputmode'), 'tel');
    await page.keyboard.insertText('虚构输入甲'); await page.clock.fastForward(160);
    await until(() => actions.some(action => action.kind === 'text'));
    assert.deepEqual(actions.find(action => action.kind === 'text'), { kind: 'text', text: '虚构输入甲' });
    await page.keyboard.press('Control+A'); await page.keyboard.press('Backspace');
    await page.waitForFunction(() => !document.querySelector('.zhw-busy-label'));
    assert.ok(actions.some(action => action.kind === 'key' && action.key === 'Control+A'));
    assert.ok(actions.some(action => action.kind === 'key' && action.key === 'Backspace'));
    // Composition uses one committed text action, never a half-built IME word.
    await page.getByLabel('直接向知乎网页输入').evaluate(element => {
      const input = element as HTMLTextAreaElement;
      input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      input.value = '中'; input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
      input.value = '中文'; input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '中文' }));
    });
    await page.clock.fastForward(160);
    await until(() => actions.some(action => action.text === '中文'));
    assert.equal(actions.filter(action => action.text === '中').length, 0);
    const heldBefore = frames;
    holdFrame = true; await page.clock.fastForward(1300);
    await until(() => Boolean(heldRoute));
    await page.clock.fastForward(5000);
    assert.equal(frames, heldBefore + 1, 'only one background request may be in flight');
    assert.ok(heldRoute); holdFrame = false; await heldRoute.fulfill({ json: loginFrame() }); heldRoute = undefined;
    await page.waitForFunction(() => !document.querySelector('.zhw-busy-label'));
    if (!mobile) {
      const from = point(325, 540), to = point(645, 540), beforeGesture = frames;
      await page.mouse.move(from.x, from.y); await page.mouse.down();
      await page.clock.fastForward(1500);
      assert.equal(frames, beforeGesture, 'polling pauses while the pointer is held');
      await page.mouse.move(to.x, to.y, { steps: 24 }); await page.mouse.up();
      await until(() => actions.some(action => action.kind === 'drag'));
      const drag = actions.find(action => action.kind === 'drag')!;
      const points = drag.points as { x: number; y: number }[];
      assert.ok(points.length >= 2 && points.length <= 120);
      assert.ok(Math.abs(points[0].x - 325) <= 2 && Math.abs(points.at(-1)!.x - 645) <= 2, 'slider coordinates follow the scaled screenshot');
    }
    if (mobile) {
      // Real touch events exercise pointer capture and the browser's gesture
      // dispatch, including touch-action:none on the scaled remote image.
      const cdp = await context.newCDPSession(page);
      const swipe = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...from, id: 1 }] });
        for (let step = 1; step <= 12; step++) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (to.x - from.x) * step / 12, y: from.y + (to.y - from.y) * step / 12, id: 1 }] });
        }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      };
      const verticalBefore = actions.length;
      await swipe(point(400, 580), point(410, 310));
      await until(() => actions.length > verticalBefore);
      const scroll = actions[verticalBefore];
      assert.equal(scroll.kind, 'scroll', 'a vertical finger swipe scrolls the real page');
      assert.ok(Math.abs(Number(scroll.deltaY) - 270) <= 4, 'touch scroll follows the remote viewport scale');
      await page.waitForFunction(() => !document.querySelector('.zhw-busy-label'));
      const horizontalBefore = actions.length;
      await swipe(point(325, 540), point(645, 540));
      await until(() => actions.length > horizontalBefore);
      const drag = actions[horizontalBefore];
      assert.equal(drag.kind, 'drag', 'a horizontal finger swipe still moves verification sliders');
      const points = drag.points as { x: number; y: number }[];
      assert.ok(Math.abs(points[0].x - 325) <= 4 && Math.abs(points.at(-1)!.x - 645) <= 4);
      await cdp.detach();
    }
    failNextAction = true;
    const submittedBefore = actions.filter(action => action.kind === 'key' && action.key === 'Enter').length;
    await page.getByRole('button', { name: '回车', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: '已重新连接' }).waitFor();
    assert.equal(opens, 2, 'closed browser is really reopened');
    assert.equal(actions.filter(action => action.kind === 'key' && action.key === 'Enter').length, submittedBefore + 1, 'a failed form submit is not replayed during recovery');
    await page.getByRole('button', { name: '重新连接', exact: true }).click();
    await screen.waitFor(); assert.equal(opens, 3, 'manual reconnect invokes open even when a prior frame exists');
    failNextFrame = true; await page.clock.fastForward(1300);
    await page.getByRole('alert').filter({ hasText: '502' }).waitFor();
    assert.equal(await screen.count(), 0, 'a lost connection removes the stale interactive screenshot');
    await page.getByRole('button', { name: '重新连接', exact: true }).click();
    await screen.waitFor(); assert.equal(opens, 4);
    await page.getByRole('button', { name: '放大画面', exact: true }).click();
    assert.ok((await screen.boundingBox())!.width >= 1100, 'mobile pages can be enlarged for accurate input');
    await page.getByRole('button', { name: '适应宽度', exact: true }).click();
    assert.ok((await screen.boundingBox())!.width < 1300);
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(JSON.stringify({ ok: true, scenarios: ['desktop-and-touch-direct-input', 'dynamic-login-screenshot', 'automatic-qr-refresh', 'background-single-flight', 'ime-commit', 'keyboard-editing', 'scaled-slider-drag', 'touch-vertical-scroll', 'touch-horizontal-slider', 'pause-poll-during-gesture', 'closed-window-reopen', 'no-form-submit-replay', 'network-disconnect-removes-stale-screen', 'zoom-for-mobile'] }));
} finally { await browser.close(); await server.close(); }
