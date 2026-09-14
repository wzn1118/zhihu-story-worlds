import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { ZhihuBrowserService } from '../server/zhihu-browser.ts';

// Only the website responses are fixtures. Navigation, popups, pointer events,
// screenshots, browser close/reopen, routing, and persistent cookies are real.
test('real Chromium login controls, popup routing, challenges and retained sessions remain operable', async t => {
  const profile = await mkdtemp(join(tmpdir(), 'redleaf-browser-controls-'));
  const launch = chromium.launchPersistentContext;
  let context: BrowserContext, noFrameNavigations = 0, externalRequests = 0;
  t.mock.method(chromium, 'launchPersistentContext', async (...args: Parameters<typeof chromium.launchPersistentContext>) => {
    context = await launch.call(chromium, ...args);
    await context.route('**/*', async route => {
      const request = route.request();
      if (request.isNavigationRequest()) { try { request.frame(); } catch { noFrameNavigations++; } }
      const url = new URL(request.url());
      if (url.hostname !== 'www.zhihu.com') { externalRequests++; return route.fulfill({ body: 'unexpected external navigation' }); }
      const body = url.pathname === '/reading' ? `<h1>阅读测试</h1><div class="AnswerItem"><h2 class="ContentItem-title">已展开的文章</h2><a href="/question/123456/answer/654321">来源</a><b class="AuthorInfo-name">测试作者</b><div class="RichContent"><div class="RichContent-inner"><div class="RichText ztext">这段文字是隔离测试页面内容。</div></div></div></div>` : `
        <style>body{margin:0}.SignFlow{padding:20px}input,button{display:block;margin:10px;width:260px;height:38px}#slider{position:absolute;left:30px;top:430px;width:45px;height:40px;background:blue}</style>
        <div class="SignFlow"><input id="phone" inputmode="tel"><input id="password" type="password"><button id="popup" onclick="window.open('https://www.zhihu.com/signin/popup')">登录窗口</button><button id="outside" onclick="window.open('https://outside.invalid/')">外站</button><div id="slider"></div></div>
        <script>document.querySelector('#slider').addEventListener('mousedown',()=>window.dragHeld=true);document.addEventListener('mousemove',event=>{if(window.dragHeld)window.dragX=event.clientX});document.addEventListener('mouseup',()=>{window.dragHeld=false;window.dragFinished=true});</script>`;
      return route.fulfill({ contentType: 'text/html', body });
    });
    return context;
  });
  const service = new ZhihuBrowserService(undefined, profile, { defaultChannel: 'chromium', publicMode: true });
  const activePage = () => Reflect.get(service, 'page') as Page;
  try {
    const initial = await service.open({ width: 900, height: 700 });
    assert.equal(initial.status, 'login-required'); assert.ok(initial.screenshot); assert.equal(initial.document, undefined);
    assert.equal(initial.inputs?.length, 2);
    assert.deepEqual(initial.inputs?.map(input => input.type), ['text', 'password']);
    const initialPage = activePage();
    const box = await initialPage.locator('#phone').boundingBox(); assert.ok(box);
    await service.frame(); // Polling advanced, but the displayed geometry is still usable.
    const focused = await service.action({ kind: 'click', frameId: initial.frameId, x: box.x + 8, y: box.y + 8 });
    assert.deepEqual(focused.focusedInput, { type: 'text', inputMode: 'tel' });
    await service.action({ kind: 'text', text: '13800000000' });
    assert.equal(await initialPage.locator('#phone').inputValue(), '13800000000');
    const password = await service.action({ kind: 'key', key: 'Tab' });
    assert.deepEqual(password.focusedInput, { type: 'password' });
    await service.action({ kind: 'text', text: 'fixture-password' });
    assert.equal(JSON.stringify(await service.frame()).includes('fixture-password'), false);
    const dragFrame = await service.frame();
    await service.action({ kind: 'drag', frameId: dragFrame.frameId, points: [{ x: 40, y: 450 }, { x: 120, y: 450 }, { x: 240, y: 450 }], durationMs: 80 });
    assert.deepEqual(await initialPage.evaluate(() => ({ x: (window as any).dragX, finished: (window as any).dragFinished, held: (window as any).dragHeld })), { x: 240, finished: true, held: false });
    await assert.rejects(service.action({ kind: 'click', frameId: dragFrame.frameId, x: 40, y: 450 }), { code: 'STALE_BROWSER_FRAME' });

    const popupFrame = await service.frame(), popupBox = await initialPage.locator('#popup').boundingBox(); assert.ok(popupBox);
    await service.action({ kind: 'click', frameId: popupFrame.frameId, x: popupBox.x + 20, y: popupBox.y + 20 });
    const popupPage = activePage();
    assert.notEqual(popupPage, initialPage);
    assert.equal(popupPage.url(), 'https://www.zhihu.com/signin/popup');
    assert.equal(initialPage.isClosed(), false);
    assert.ok(noFrameNavigations > 0, 'the regression must actually exercise a navigation without an available Frame');
    await service.action({ kind: 'back' });
    assert.equal(popupPage.isClosed(), true, 'back returns from a popup with no own history');
    assert.equal(activePage(), initialPage);
    assert.equal((await service.frame()).status, 'login-required');

    const outsideFrame = await service.frame(), outsideBox = await initialPage.locator('#outside').boundingBox(); assert.ok(outsideBox);
    await service.action({ kind: 'click', frameId: outsideFrame.frameId, x: outsideBox.x + 20, y: outsideBox.y + 20 });
    assert.equal(externalRequests, 0);
    assert.equal(activePage(), initialPage);
    await assert.rejects(service.action({ kind: 'navigate', url: 'https://outside.invalid/' }), { code: 'ZHIHU_ONLY' });

    const beforeNavigation = await service.frame();
    const reading = await service.action({ kind: 'navigate', url: 'https://www.zhihu.com/reading' });
    assert.equal(reading.status, 'ready'); assert.ok(reading.document); assert.equal(reading.posts.length, 1);
    await assert.rejects(service.action({ kind: 'click', frameId: beforeNavigation.frameId, x: 40, y: 40 }), { code: 'STALE_BROWSER_FRAME' });
    await activePage().evaluate(() => { const challenge = document.createElement('div'); challenge.className = 'CaptchaContainer'; challenge.textContent = '请拖动验证'; document.body.append(challenge); });
    const challenged = await service.frame();
    assert.equal(challenged.status, 'blocked'); assert.ok(challenged.screenshot); assert.equal(challenged.document, undefined);

    await context!.addCookies([{ name: 'fixture-session', value: 'persistent-marker', domain: 'www.zhihu.com', path: '/', expires: Math.floor(Date.now() / 1000) + 3600, secure: true }]);
    await service.close();
    assert.equal((await service.frame()).status, 'closed');
    await service.open();
    assert.equal((await context!.cookies('https://www.zhihu.com/')).find(cookie => cookie.name === 'fixture-session')?.value, 'persistent-marker');
    await context!.close();
    assert.equal((await service.frame()).status, 'closed');
    assert.equal((await service.open()).status, 'login-required');
    await activePage().close();
    assert.equal((await service.frame()).status, 'closed');
    assert.equal((await service.open()).status, 'login-required');
  } finally { await service.close(); await rm(profile, { recursive: true, force: true }); }
});
