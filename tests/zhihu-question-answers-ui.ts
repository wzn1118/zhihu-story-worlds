import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, type Page } from 'playwright';
import { createServer } from 'vite';
import type { ZhihuBrowserAction, ZhihuBrowserFrame } from '../shared/zhihu-browser';

// Real native-page component and real LiuKanShan capture/inbox UI. The remote
// browser API is a deterministic fixture, never a claim of website access.
const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:12px;box-sizing:border-box;background:#eef3f9}</style></head><body><div id="root"></div><script type="module">
import { createElement, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { configureAccountStorage } from '/src/account-storage.ts';
import { ZhihuLivePage } from '/src/ZhihuLivePage.tsx';
import { LiuKanShanPet } from '/src/LiuKanShanPet.tsx';
configureAccountStorage({provider:'zhihu'}, 'question-answer-ui');
function Harness() {
  const [frame, setFrame] = useState(null), [busy, setBusy] = useState(false);
  useEffect(() => { fetch('/fixture/frame').then(r => r.json()).then(setFrame); }, []);
  const action = async payload => { setBusy(true); try { const response = await fetch('/fixture/action', {method:'POST',body:JSON.stringify(payload)}); setFrame(await response.json()); } finally { setBusy(false); } };
  return createElement('main', null, frame && createElement(ZhihuLivePage, {frame, busy, onAction:action, onFeed:postId => window.dispatchEvent(new CustomEvent('redleaf:feed-post',{detail:{kind:'browser',postId,frameId:frame.frameId}}))}), createElement(LiuKanShanPet, {reducedMotion:true}));
}
createRoot(document.getElementById('root')).render(createElement(Harness));
</script></body></html>`;
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, plugins: [{ name: 'question-answer-ui', configureServer(vite) {
  vite.middlewares.use(async (request, response, next) => {
    if (!request.url?.startsWith('/__question-answer-ui')) return next();
    response.setHeader('content-type', 'text/html'); response.end(await vite.transformIndexHtml(request.url, fixture));
  });
} }] });
await server.listen();
const address = server.httpServer!.address(); assert.ok(address && typeof address !== 'string');
const browser = await chromium.launch({ headless: true });
const scenarios: string[] = [];
async function until(predicate: () => boolean) {
  const deadline = Date.now() + 10_000;
  while (!predicate()) { if (Date.now() > deadline) throw new Error('Expected answer-list UI action did not arrive'); await new Promise(resolve => setTimeout(resolve, 20)); }
}
async function dragHandle(page: Page, answer: number, mobile: boolean) {
  const handle = page.frameLocator('iframe').getByRole('button', { name: `把作者${answer}的回答交给刘看山`, exact: true });
  await handle.scrollIntoViewIfNeeded();
  const from = (await handle.boundingBox())!, to = (await page.locator('.liukan-pet').boundingBox())!;
  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 }, end = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
  if (mobile) {
    const session = await page.context().newCDPSession(page);
    const touch = (x: number, y: number) => [{ x, y, radiusX: 4, radiusY: 4, force: 1, id: 1 }];
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touch(start.x, start.y) });
    for (let step = 1; step <= 12; step++) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touch(start.x + (end.x - start.x) * step / 12, start.y + (end.y - start.y) * step / 12) });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
  } else { await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 16 }); await page.mouse.up(); }
}
try {
  for (const mobile of [false, true]) {
    const prefix = mobile ? 'mobile' : 'desktop';
    const context = await browser.newContext({ viewport: { width: mobile ? 390 : 1280, height: 900 }, isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce' });
    const page = await context.newPage(), errors: string[] = [], actions: ZhihuBrowserAction[] = [], captured: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    let question = false, expanded = false, count = 2, version = 1;
    const questionUrl = 'https://www.zhihu.com/question/12345678901234567890';
    const posts = () => Array.from({ length: count }, (_, index) => ({ id: `answer-${index + 1}${index === 0 && expanded ? '-expanded' : ''}`, title: '同一个问题下的回答', author: `作者${index + 1}`, sourceUrl: `${questionUrl}/answer/2234567890123456789${index}`, excerpt: index === 0 && expanded ? '展开后完整可见的测试回答，结尾有蓝色信封。' : `第${index + 1}条真实页面测试文字。`, characters: index === 0 && expanded ? 150 : 15, visibleScope: index === 0 && !expanded ? 'excerpt' as const : 'expanded' as const }));
    const frame = (): ZhihuBrowserFrame => ({ status: 'ready', frameId: `frame-${version}`, title: question ? '问题回答列表' : '知乎热榜', url: question ? questionUrl : 'https://www.zhihu.com/hot', width: 1100, height: 650, capturedAt: new Date().toISOString(), posts: question ? posts() : [], document: { id: `doc-${version}`, width: 1100, height: 650, scrollY: count === 3 ? 9999 : 0, html: `<!doctype html><html><head><style>body{margin:0;padding:16px;font:16px/1.7 system-ui}article{padding:20px;border:1px solid #ddd;margin-bottom:16px;min-height:170px;box-sizing:border-box}h1{font-size:22px}h2{font-size:18px}button{padding:8px}</style></head><body>${question ? `<h1 class="QuestionHeader-title">问题回答列表</h1>${posts().map((post, index) => `<article data-redleaf-post="${post.id}"><h2>${post.author}</h2><p>${post.excerpt}</p>${index === 0 && !expanded ? `<button data-redleaf-control="doc-${version}-expand">展开阅读全文</button>` : ''}</article>`).join('')}` : `<h1>知乎热榜</h1><a data-redleaf-control="doc-${version}-question" href="${questionUrl}">进入问题回答列表</a>`}</body></html>` } });
    await context.route('**/fixture/**', async route => {
      if (route.request().method() === 'POST') {
        const action = route.request().postDataJSON() as ZhihuBrowserAction; actions.push(action);
        if (action.kind === 'link') { assert.equal(action.url, questionUrl); question = true; }
        else if (action.kind === 'element') { assert.equal(action.event, 'click'); assert.ok(action.elementId.endsWith('-expand')); expanded = true; }
        else { assert.equal(action.kind, 'load-more', 'the live page must load the real list bottom, never a small relative wheel step'); count = 3; }
        version++;
      }
      await route.fulfill({ json: frame() });
    });
    await context.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      assert.equal(route.request().headers()['x-redleaf-account'], 'question-answer-ui');
      if (path === '/api/liukan/memories') return route.fulfill({ json: { memories: [] } });
      if (path === '/api/zhihu-browser/capture') {
        const body = route.request().postDataJSON(); assert.equal(body.frameId, `frame-${version}`); assert.ok(posts().some(post => post.id === body.postId)); captured.push(body.postId);
        return route.fulfill({ json: { id: body.postId } });
      }
      assert.equal(path, '/api/liukan/inbox');
      if (route.request().method() === 'GET') return route.fulfill({ json: { posts: [] } });
      const post = posts().find(item => item.id === route.request().postDataJSON().candidateId)!; assert.ok(post);
      return route.fulfill({ json: { id: post.id, receivedAt: new Date().toISOString(), candidate: { ...post, query: '', origin: { sourceUrl: post.sourceUrl, workId: post.sourceUrl.split('/').at(-1), kind: 'zhihu-answer', contentScope: 'webpage-selection', fetchedAt: new Date().toISOString() } } } });
    });
    await page.goto(`http://127.0.0.1:${address.port}/__question-answer-ui`);
    await page.frameLocator('iframe').getByRole('link', { name: '进入问题回答列表' }).click();
    await page.getByText('已读取 2 条回答，每条都可拖给刘看山', { exact: true }).waitFor();
    assert.equal(await page.frameLocator('iframe').locator('[data-redleaf-feed]').count(), 2);
    await page.frameLocator('iframe').getByRole('button', { name: '展开阅读全文' }).click();
    await page.frameLocator('iframe').getByText('展开后完整可见的测试回答，结尾有蓝色信封。', { exact: true }).waitFor();
    await page.getByRole('button', { name: '继续加载回答', exact: true }).click();
    await page.getByText('已读取 3 条回答，每条都可拖给刘看山', { exact: true }).waitFor();
    assert.equal(await page.frameLocator('iframe').locator('[data-redleaf-feed]').count(), 3);
    assert.equal(await page.frameLocator('iframe').locator('body').evaluate(() => window.scrollY), 0, 'loading the remote list bottom preserves the reader’s local position');
    scenarios.push(`${prefix}-hotlist-question-with-separate-answer-handles`, `${prefix}-expand-before-drag-captures-updated-frame`, `${prefix}-explicit-load-more-appends-answers`);
    for (let answer = 1; answer <= 3; answer++) {
      await dragHandle(page, answer, mobile);
      await until(() => captured.length === answer);
      await page.locator('.liukan-post-author').filter({ hasText: `作者${answer}` }).waitFor();
      if (answer === 1) { await page.locator('.liukan-source-preview summary').click(); await page.locator('.liukan-source-preview').getByText('展开后完整可见的测试回答，结尾有蓝色信封。', { exact: true }).waitFor(); }
      await page.getByRole('button', { name: '收起刘看山', exact: true }).click();
    }
    assert.deepEqual(captured, ['answer-1-expanded', 'answer-2', 'answer-3']);
    scenarios.push(`${prefix}-every-answer-drag-enters-real-liukan-inbox`);
    await page.frameLocator('iframe').locator('body').evaluate(body => window.scrollTo(0, body.scrollHeight));
    await until(() => actions.filter(action => action.kind === 'load-more').length >= 2);
    const afterNoop = actions.length;
    await page.waitForTimeout(750);
    assert.equal(actions.length, afterNoop, 'restoring an unchanged answer-list snapshot must not repeatedly fetch its end');
    assert.deepEqual(errors, []);
    scenarios.push(`${prefix}-bottom-load-no-op-does-not-loop`);
    await mkdir('output/question-answer-ui', { recursive: true });
    await page.screenshot({ path: `output/question-answer-ui/${prefix}.png` });
    await context.close();
  }
  const result = { ok: true, scope: 'Actual native-reading and LiuKanShan UI; deterministic remote API responses, no live Zhihu requests.', scenarios };
  await writeFile('output/question-answer-ui/results.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
} finally { await browser.close(); await server.close(); }
