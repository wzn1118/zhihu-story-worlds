import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright';
import { ZhihuBrowserService } from '../server/zhihu-browser.ts';

// Fixtures serve only website bytes. Chromium itself dispatches the clicks,
// runs website handlers and supplies navigation headers and popup lifecycle.
test('reading links retain native handlers, referrers, recycled nodes and popup navigation', async t => {
  const profile = await mkdtemp(join(tmpdir(), 'redleaf-browser-navigation-'));
  const launch = chromium.launchPersistentContext;
  const requests: Array<{ path: string; referer?: string }> = [];
  let externalRequests = 0;
  const article = '<h1 class="QuestionHeader">问题正文</h1><div class="AnswerItem"><h2 class="ContentItem-title">测试回答</h2><a href="/question/123456/answer/654321">来源</a><b class="AuthorInfo-name">测试作者</b><div class="RichContent"><div class="RichContent-inner"><div class="RichText ztext">这段文字是隔离导航测试页面内容。</div></div></div></div>';
  const hot = `<div class="HotItem"><h1>热榜</h1>
    <a id="ordinary" href="/question/123456" onclick="sessionStorage.setItem('native-click','yes')">问题原文</a>
    <a id="spa" href="/question/234567" onclick="event.preventDefault();history.pushState({},'',this.href);document.querySelector('h1').textContent='站内路由已运行'">站内路由问题</a>
    <a id="popup" href="/question/345678" target="_blank">新窗口问题</a>
    <a id="private" href="/question/456789" rel="noreferrer">站点指定不发来源</a>
    <a id="denied" href="/question/denied" target="_blank">当前无法访问的问题</a>
    <a id="verification" href="/account/unhuman">安全验证页面</a>
    <a id="outside" href="https://outside.invalid/question">外站</a></div>`;
  t.mock.method(chromium, 'launchPersistentContext', async (...args: Parameters<typeof chromium.launchPersistentContext>) => {
    const context = await launch.call(chromium, ...args);
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.hostname !== 'www.zhihu.com') { externalRequests++; return route.fulfill({ body: 'unexpected external navigation' }); }
      if (!request.isNavigationRequest()) return route.fulfill({ body: '' });
      const referer = (await request.allHeaders()).referer;
      requests.push({ path: url.pathname, referer });
      const body = url.pathname === '/hot' ? hot : url.pathname === '/signin' ? `<div class="SignFlow"><a id="login-popup" target="_blank" href="/question/567890">登录后阅读窗口</a></div>` : url.pathname === '/account/unhuman' ? '<h1>安全验证</h1><button>开始验证</button>' : article;
      // Opening a reading link by page.goto would lose this source and return
      // a refusal. There is no injected Referer header or anti-bot emulation.
      const denied = url.pathname === '/question/denied' || (['/question/123456', '/question/345678', '/question/567890'].includes(url.pathname) && !referer);
      return route.fulfill({ status: denied ? 403 : 200, contentType: denied ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8', body: denied ? JSON.stringify({ error: { code: 40362, message: '请求存在异常' } }) : body });
    });
    return context;
  });
  const service = new ZhihuBrowserService(undefined, profile, { defaultChannel: 'chromium', publicMode: true });
  const activePage = () => Reflect.get(service, 'page') as Page;
  try {
    const initial = await service.open({ url: 'https://www.zhihu.com/hot', width: 900, height: 700 });
    const initialPage = activePage();
    const originalId = await initialPage.locator('#ordinary').getAttribute('data-redleaf-control');
    assert.ok(initial.document); assert.ok(originalId);
    // Site lists can replace nodes after the inert client snapshot was sent.
    await initialPage.locator('#ordinary').evaluate(node => { const copy = node.cloneNode(true) as Element; copy.removeAttribute('data-redleaf-control'); node.replaceWith(copy); });
    const reading = await service.action({ kind: 'link', url: 'https://www.zhihu.com/question/123456', documentId: initial.document.id, elementId: originalId });
    assert.equal(reading.httpStatus, 200); assert.equal(reading.posts.length, 1);
    assert.equal(requests.at(-1)?.referer, 'https://www.zhihu.com/hot');
    assert.equal(await initialPage.evaluate(() => sessionStorage.getItem('native-click')), 'yes');

    let hotFrame = await service.action({ kind: 'back' });
    await service.action({ kind: 'link', url: 'https://www.zhihu.com/question/234567', documentId: hotFrame.document!.id });
    assert.equal(activePage().url(), 'https://www.zhihu.com/question/234567');
    assert.equal(await activePage().locator('h1').innerText(), '站内路由已运行');
    assert.equal(requests.some(request => request.path === '/question/234567'), false, 'the website router must handle the click without an unrelated document fetch');

    hotFrame = await service.action({ kind: 'navigate', url: 'https://www.zhihu.com/hot' });
    const opener = activePage();
    const popup = await service.action({ kind: 'link', url: 'https://www.zhihu.com/question/345678', documentId: hotFrame.document!.id });
    assert.equal(popup.httpStatus, 200); assert.notEqual(activePage(), opener);
    assert.equal(opener.isClosed(), false); assert.equal(requests.at(-1)?.referer, 'https://www.zhihu.com/hot');
    await service.action({ kind: 'back' });
    assert.equal(activePage(), opener);

    // Existing element clients also activate the live anchor rather than goto.
    hotFrame = await service.frame();
    const currentId = await activePage().locator('#ordinary').getAttribute('data-redleaf-control');
    const elementReading = await service.action({ kind: 'element', documentId: hotFrame.document!.id, elementId: currentId!, event: 'click' });
    assert.equal(elementReading.httpStatus, 200); assert.equal(requests.at(-1)?.referer, 'https://www.zhihu.com/hot');
    await service.action({ kind: 'back' });

    const beforeMissing = requests.length;
    await assert.rejects(service.action({ kind: 'link', url: 'https://www.zhihu.com/question/999999' }), { code: 'STALE_BROWSER_LINK' });
    await assert.rejects(service.action({ kind: 'link', url: 'https://outside.invalid/question' }), { code: 'ZHIHU_ONLY' });
    assert.equal(requests.length, beforeMissing); assert.equal(externalRequests, 0);

    await service.action({ kind: 'link', url: 'https://www.zhihu.com/question/456789' });
    assert.equal(requests.at(-1)?.referer, undefined, 'native noreferrer must remain honored');

    const login = await service.action({ kind: 'navigate', url: 'https://www.zhihu.com/signin' });
    assert.equal(login.status, 'login-required');
    const loginPage = activePage(), box = await loginPage.locator('#login-popup').boundingBox(); assert.ok(box);
    const screenReading = await service.action({ kind: 'click', frameId: login.frameId, x: box.x + 3, y: box.y + 3 });
    assert.equal(screenReading.httpStatus, 200); assert.notEqual(activePage(), loginPage);
    assert.equal(loginPage.isClosed(), false); assert.equal(requests.at(-1)?.referer, 'https://www.zhihu.com/signin');

    await service.action({ kind: 'back' });
    await service.action({ kind: 'navigate', url: 'https://www.zhihu.com/hot' });
    const denied = await service.action({ kind: 'link', url: 'https://www.zhihu.com/question/denied' });
    assert.equal(denied.status, 'blocked'); assert.equal(denied.httpStatus, 403);
    assert.deepEqual(denied.accessIssue, { kind: 'request-denied', code: 40362 });
    assert.equal(denied.document, undefined); assert.deepEqual(denied.posts, []);
    assert.equal((await service.frame()).frameId, denied.frameId, 'unchanged rejection JSON does not need screenshot polling');
    await service.action({ kind: 'back' });
    assert.equal(activePage().url(), 'https://www.zhihu.com/hot');
    const verification = await service.action({ kind: 'link', url: 'https://www.zhihu.com/account/unhuman' });
    assert.equal(verification.status, 'blocked'); assert.deepEqual(verification.accessIssue, { kind: 'verification' });
    assert.notEqual((await service.frame()).frameId, verification.frameId, 'verification pages remain interactive and can refresh');
    assert.equal(externalRequests, 0);
  } finally { await service.close(); await rm(profile, { recursive: true, force: true }); }
});
