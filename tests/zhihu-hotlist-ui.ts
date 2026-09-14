import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import type { ZhihuBrowserAction, ZhihuBrowserFrame } from '../shared/zhihu-browser';

// Exercise the actual React workspace and its inert, cloned hot-list links.
// Only the browser API is deterministic; no request is sent to Zhihu.
const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
  import { createElement } from 'react';
  import { createRoot } from 'react-dom/client';
  import { configureAccountStorage } from '/src/account-storage.ts';
  import { ZhihuWorkspace } from '/src/ZhihuWorkspace.tsx';
  configureAccountStorage({ provider: 'zhihu' }, 'hotlist-ui-test');
  createRoot(document.getElementById('root')).render(createElement(ZhihuWorkspace, { onClose: () => {} }));
</script></body></html>`;
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, plugins: [{ name: 'hotlist-ui-test', configureServer(vite) {
  vite.middlewares.use(async (request, response, next) => {
    if (!request.url?.startsWith('/__hotlist-ui-test')) return next();
    response.setHeader('content-type', 'text/html');
    response.end(await vite.transformIndexHtml(request.url, fixture));
  });
} }] });
await server.listen();
const address = server.httpServer!.address(); assert.ok(address && typeof address !== 'string');
const browser = await chromium.launch({ headless: true });
const resultPath = 'output/hotlist-ui-regression.json';
const scenarios: string[] = [];
async function until(predicate: () => boolean) {
  const deadline = Date.now() + 10_000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Expected hot-list UI request did not arrive');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}
try {
  for (const mobile of [false, true]) {
    const prefix = mobile ? 'mobile' : 'desktop';
    const context = await browser.newContext({ viewport: { width: mobile ? 390 : 1280, height: 900 }, isMobile: mobile, hasTouch: mobile });
    const page = await context.newPage();
    await page.clock.install();
    const actions: ZhihuBrowserAction[] = [], errors: string[] = [], externalRequests: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    let state: 'hot' | 'denied' | 'verification' = 'hot', frames = 0, version = 0;
    const questionUrl = 'https://www.zhihu.com/question/1234567890123456789';
    const verificationUrl = 'https://www.zhihu.com/account/unhuman';
    const image = () => `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="700"><rect width="1100" height="700" fill="#eef2f8"/><text x="40" y="80">${state}: ${version}</text><rect x="300" y="520" width="400" height="40" fill="#777"/></svg>`).toString('base64')}`;
    const frame = (): ZhihuBrowserFrame => ({
      status: state === 'hot' ? 'ready' : 'blocked', frameId: `${state}-${version}`, width: 1100, height: 700,
      url: state === 'hot' ? 'https://www.zhihu.com/hot' : state === 'denied' ? questionUrl : verificationUrl,
      title: state === 'hot' ? '知乎热榜' : state === 'denied' ? '访问限制' : '安全验证',
      posts: [], capturedAt: new Date().toISOString(), screenshot: image(),
      ...(state === 'hot' ? { document: { id: 'hot-document', width: 1100, height: 700, scrollY: 0, html: `<!doctype html><html><body><h1>知乎热榜</h1><a data-redleaf-control="hot-document-question" href="${questionUrl}"><h2>回归测试热榜问题</h2></a><a data-redleaf-control="hot-document-verification" href="${verificationUrl}">回归测试验证页面</a></body></html>` } }
        : state === 'denied' ? { httpStatus: 403, accessIssue: { kind: 'request-denied' as const, code: 40362 }, message: '知乎拒绝了这个问题页的访问（40362）。可以返回热榜，或在自己的浏览器打开原页。' }
          : { httpStatus: 403, accessIssue: { kind: 'verification' as const }, message: '请在下方知乎页面完成安全验证。' }),
    });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname !== '127.0.0.1') { externalRequests.push(url.origin + url.pathname); await route.abort(); return; }
      if (!url.pathname.startsWith('/api/')) { await route.continue(); return; }
      try {
        assert.equal(route.request().headers()['x-redleaf-account'], 'hotlist-ui-test');
        if (url.pathname === '/api/zhihu-browser/frame') { frames++; version++; await route.fulfill({ json: frame() }); return; }
        assert.equal(url.pathname, '/api/zhihu-browser/action', 'unexpected browser API request');
        const action = route.request().postDataJSON() as ZhihuBrowserAction;
        actions.push(action);
        if (action.kind === 'link') {
          assert.equal(state, 'hot');
          assert.equal(action.documentId, 'hot-document');
          if (action.url === questionUrl) {
            assert.equal(action.elementId, 'hot-document-question'); state = 'denied';
          } else {
            assert.equal(action.url, verificationUrl);
            assert.equal(action.elementId, 'hot-document-verification'); state = 'verification';
          }
        } else if (action.kind === 'back') { assert.equal(state, 'denied'); state = 'hot'; }
        else if (action.kind === 'navigate') { assert.equal(state, 'denied'); assert.equal(action.url, 'https://www.zhihu.com/hot'); state = 'hot'; }
        else { assert.equal(state, 'verification', 'a request-denied image must not forward pointer or input events'); assert.ok(['click', 'drag'].includes(action.kind)); }
        version++; await route.fulfill({ json: frame() });
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
        await route.fulfill({ status: 500, json: { error: { code: 'TEST_FAILED', message: 'Invalid UI request' } } });
      }
    });
    await page.goto(`http://127.0.0.1:${address.port}/__hotlist-ui-test`);
    const hotLink = () => page.frameLocator('iframe').getByRole('link', { name: '回归测试热榜问题' });
    const waitForHot = async () => {
      await hotLink().waitFor();
      await page.getByText('原网页排版 · 文字可选 · 本地滚动', { exact: true }).waitFor({ state: 'attached' });
    };
    await waitForHot();
    await hotLink().click();
    const denied = page.getByAltText('知乎返回的访问限制');
    await denied.waitFor();
    assert.deepEqual(actions, [{ kind: 'link', url: questionUrl, documentId: 'hot-document', elementId: 'hot-document-question' }], 'a cloned anchor sends the real-link action, never direct navigation');
    assert.equal(await page.locator('iframe').count(), 0, 'denied JSON must not be rendered as an interactive DOM clone');
    assert.equal(await page.getByLabel('直接向知乎网页输入').count(), 0);
    assert.equal(await page.locator('.zhw-web-input').count(), 0);
    assert.equal(await page.getByText('点击网页输入框即可打字，也可以滚动和拖动。', { exact: true }).count(), 0);
    const externalLink = page.getByRole('link', { name: '在自己的浏览器打开原页' });
    assert.equal(await externalLink.getAttribute('href'), questionUrl);
    assert.equal(await externalLink.getAttribute('target'), '_blank');
    assert.ok((await externalLink.getAttribute('rel'))?.split(/\s+/).includes('noreferrer'));
    assert.equal(await page.getByRole('button', { name: '返回上一页', exact: true }).isEnabled(), true);
    assert.equal(await page.getByRole('button', { name: '返回热榜', exact: true }).isEnabled(), true);
    const deniedFrameCount = frames, deniedActionCount = actions.length;
    await denied.click({ position: { x: 30, y: 30 } });
    await page.clock.fastForward(10_000);
    assert.equal(frames, deniedFrameCount, 'request-denied stops automatic frame polling for multiple refresh periods');
    assert.equal(actions.length, deniedActionCount, 'a denied screenshot never sends a click');
    scenarios.push(`${prefix}-cloned-hotlist-link-preserves-control-and-url`, `${prefix}-denied-40362-stops-poll-and-input`, `${prefix}-denied-original-url-and-recovery-controls`);
    await page.getByRole('button', { name: '返回上一页', exact: true }).click();
    await waitForHot();
    assert.deepEqual(actions.at(-1), { kind: 'back' });
    await hotLink().click(); await denied.waitFor();
    await page.getByRole('button', { name: '返回热榜', exact: true }).click();
    await waitForHot();
    assert.deepEqual(actions.at(-1), { kind: 'navigate', url: 'https://www.zhihu.com/hot' });
    assert.equal(actions.filter(action => action.kind === 'navigate').length, 1, 'only the explicit return-to-hot-list control navigates directly');
    scenarios.push(`${prefix}-back-and-hotlist-recovery`);
    await page.frameLocator('iframe').getByRole('link', { name: '回归测试验证页面', exact: true }).click();
    const screen = page.getByAltText('知乎网页实时画面'); await screen.waitFor();
    assert.equal(await page.locator('iframe').count(), 0);
    assert.equal(await page.locator('.zhw-web-input').count(), 1, 'interactive verification retains its keyboard controls');
    assert.equal(await page.getByLabel('直接向知乎网页输入').count(), 1);
    assert.equal(await page.getByRole('button', { name: '返回热榜', exact: true }).count(), 0, 'request-denied controls are not shown for an interactive challenge');
    for (let poll = 0; poll < 2; poll++) {
      const before = frames, source = await screen.getAttribute('src');
      await page.clock.fastForward(1300);
      await until(() => frames > before);
      await page.waitForFunction(previous => document.querySelector<HTMLImageElement>('.zhw-browser-screen img')?.src !== previous, source);
      assert.equal(frames, before + 1, 'verification retains one background request per refresh interval');
    }
    const beforeClick = actions.length;
    const rect = (await screen.boundingBox())!;
    const point = { x: rect.x + rect.width * 0.5, y: rect.y + rect.height * 0.5 };
    if (mobile) await page.touchscreen.tap(point.x, point.y); else await page.mouse.click(point.x, point.y);
    await until(() => actions.length === beforeClick + 1);
    assert.equal(actions.at(-1)?.kind, 'click', 'verification screenshot still forwards actual pointer clicks');
    const click = actions.at(-1) as Extract<ZhihuBrowserAction, { kind: 'click' }>;
    assert.ok(Math.abs(click.x - 550) <= 3 && Math.abs(click.y - 350) <= 3, 'verification click coordinates follow screenshot scaling');
    assert.ok(click.frameId.startsWith('verification-'));
    scenarios.push(`${prefix}-verification-remains-live-and-interactive`);
    assert.deepEqual(errors, []);
    assert.deepEqual(externalRequests, [], 'this deterministic regression must never contact Zhihu or another remote origin');
    await context.close();
  }
  const result = { ok: true, scope: 'Real browser UI with deterministic local browser API; no live Zhihu requests or account login.', scenarios };
  await mkdir('output', { recursive: true });
  await writeFile(resultPath, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ ...result, resultPath }));
} finally { await browser.close(); await server.close(); }
