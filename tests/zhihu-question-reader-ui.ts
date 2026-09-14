import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import type { ZhihuCandidate } from '../shared/zhihu-discovery';
import type { ZhihuQuestionAnswersResult } from '../shared/zhihu-questions';

// Actual React component and desktop/touch gestures, deterministic API fixtures.
// No remote account, invented production content or Zhihu cookies are used.
const fixture = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:Arial}#root{height:100vh;display:flex}.liukan-pet{position:fixed;right:12px;bottom:14px;width:82px;height:76px;background:#c4e5ff;z-index:400;border:2px solid #177eda;border-radius:20px;display:grid;place-items:center}</style></head><body><div id="root"></div><aside class="liukan-pet">刘看山</aside><script type="module">
import React,{useState} from 'react'; import{createRoot}from'react-dom/client';
import{configureAccountStorage}from'/src/account-storage.ts';
import{ZhihuQuestionReader}from'/src/ZhihuQuestionReader.tsx';
configureAccountStorage({provider:'zhihu'},'question-reader-ui-test');
window.feeds=[];window.drops=[];window.originals=[];window.backs=0;
window.addEventListener('redleaf:feed-post',event=>window.feeds.push(event.detail));
const pet=document.querySelector('.liukan-pet');pet.addEventListener('dragover',event=>event.preventDefault());pet.addEventListener('drop',event=>{event.preventDefault();window.drops.push(JSON.parse(event.dataTransfer.getData('application/x-redleaf-zhihu-candidate')))});
function App(){const[url,setUrl]=useState(null),[active,setActive]=useState(true);window.selectQuestion=setUrl;window.setReaderActive=setActive;return React.createElement('div',{style:{display:'flex',flex:1,minHeight:0,visibility:active?'visible':'hidden'}},React.createElement(ZhihuQuestionReader,{questionUrl:url,active,onQuestion:value=>setUrl(value),onBack:()=>window.backs++,onOriginal:value=>window.originals.push(value)}))};
createRoot(document.getElementById('root')).render(React.createElement(App));
</script></body></html>`;
const server = await createServer({ cacheDir: '/tmp/zhihu-question-reader-ui-vite', optimizeDeps: { entries: ['src/ZhihuQuestionReader.tsx'], include: ['react', 'react-dom/client', 'react/jsx-runtime', 'lucide-react'] }, server: { host: '127.0.0.1', port: 0, watch: { ignored: ['**/releases/**', '**/output/**', '**/shared/backups/**', '**/shared/snapshot-*/**'] } }, plugins: [{ name: 'question-reader-ui-test', configureServer(vite) {
  vite.middlewares.use(async (request, response, next) => {
    if (!request.url?.startsWith('/__question-reader-test')) return next();
    response.setHeader('content-type', 'text/html'); response.end(await vite.transformIndexHtml(request.url, fixture));
  });
} }] });
await server.listen();
const address = server.httpServer!.address(); assert.ok(address && typeof address !== 'string');
const browser = await chromium.launch({ headless: true });
const scenarios: string[] = [];
const question = 'https://www.zhihu.com/question/20734757173969517000';
const other = 'https://www.zhihu.com/question/20734757173969517001';
const delayed = 'https://www.zhihu.com/question/20734757173969517002';
const candidate = (index: number): ZhihuCandidate => ({ id: `candidate-${index}`, title: '问题标题', author: index === 1 ? '接口未提供作者信息' : `测试作者 ${index}`, excerpt: `第 ${index} 条接口节选，只展示实际返回的文字。\n\n这是 UI 回归测试数据。`, characters: 42, query: question, origin: { kind: 'zhihu-answer', workId: `2073475717396951790${index}`, sourceUrl: `${question}/answer/2073475717396951790${index}`, contentScope: 'question-answer-excerpt', fetchedAt: new Date().toISOString() } });
const result = (url: string, offset: number): ZhihuQuestionAnswersResult => ({ questionUrl: url, title: url === question ? '如何让每条回答都能拖给刘看山？' : url === other ? '第二个问题的新回答' : '旧请求不应覆盖当前问题', candidates: offset === 0 ? [candidate(1), candidate(2)] : [candidate(2), candidate(3)], paging: offset === 0 ? { isEnd: false, nextOffset: 2 } : { isEnd: true }, fetchedAt: new Date().toISOString(), cached: false });
try {
  for (const mobile of [false, true]) {
    const prefix = mobile ? 'touch' : 'desktop';
    const context = await browser.newContext({ viewport: { width: mobile ? 390 : 1280, height: 850 }, isMobile: mobile, hasTouch: mobile });
    const page = await context.newPage(), errors: string[] = [], requests: string[] = [];
    let failNext = false, failHot = false;
    let releaseDelayed: (() => void) | undefined;
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname !== '127.0.0.1') { errors.push(`Unexpected external request: ${url.origin}`); await route.abort(); return; }
      if (!url.pathname.startsWith('/api/')) return route.continue();
      assert.equal(route.request().headers()['x-redleaf-account'], 'question-reader-ui-test');
      requests.push(url.pathname + url.search);
      if (url.pathname.endsWith('/hotlist')) {
        if (failHot) { failHot = false; return route.fulfill({ status: 429, json: { error: { code: 'TEST_QUOTA', message: '今日热榜接口额度已用完。' } } }); }
        return route.fulfill({ json: { items: [{ title: '如何让每条回答都能拖给刘看山？', url: question, summary: '点击后在内部打开问题回答列表' }, { title: '热榜中的知乎文章', url: 'https://zhuanlan.zhihu.com/p/123456', summary: '文章应打开原网页' }], fetchedAt: new Date().toISOString(), cached: true } });
      }
      assert.equal(url.pathname, '/api/zhihu/questions/answers');
      if (url.searchParams.get('url') === delayed) await new Promise<void>(resolve => { releaseDelayed = resolve; });
      if (failNext) { failNext = false; return route.fulfill({ status: 503, json: { error: { code: 'TEST_UNAVAILABLE', message: '本次请求失败，可以重试。' } } }); }
      return route.fulfill({ json: result(url.searchParams.get('url')!, Number(url.searchParams.get('offset'))) });
    });
    await page.goto(`http://127.0.0.1:${address.port}/__question-reader-test`);
    await page.getByText(/缓存 · 更新于/).waitFor();
    await page.getByRole('button', { name: /热榜中的知乎文章/ }).click();
    assert.deepEqual(await page.evaluate(() => (window as any).originals), ['https://zhuanlan.zhihu.com/p/123456']);
    await page.evaluate(() => { (window as any).originals = []; });
    await page.getByRole('button', { name: /如何让每条回答都能拖给刘看山/ }).click();
    await page.getByText('已加载 2 条回答，每条都可以拖给刘看山').waitFor();
    assert.equal(await page.locator('.zhq-answer').count(), 2);
    assert.equal(await page.locator('.zhq-answer').first().innerText().then(text => text.includes('官方回答节选（非全文）')), true);
    scenarios.push(`${prefix}: hotlist opens account-bound official question list`);
    await page.getByRole('button', { name: '把第 1 条回答交给刘看山' }).click();
    assert.deepEqual(await page.evaluate(() => (window as any).feeds), [{ candidateId: 'candidate-1' }]);
    await page.getByRole('button', { name: '继续加载回答' }).click();
    await page.getByText('已加载 3 条回答，每条都可以拖给刘看山').waitFor();
    assert.equal(await page.locator('.zhq-answer').count(), 3);
    assert.equal(await page.getByRole('button', { name: '继续加载回答' }).count(), 0);
    assert.deepEqual(await page.locator('.zhq-answer').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-candidate-id'))), ['candidate-1', 'candidate-2', 'candidate-3']);
    scenarios.push(`${prefix}: pagination preserves answers, deduplicates source and stops at end`);
    const handle = page.getByRole('button', { name: '把第 2 条回答交给刘看山' });
    await handle.scrollIntoViewIfNeeded();
    const from = await handle.boundingBox(), to = await page.locator('.liukan-pet').boundingBox(); assert.ok(from && to);
    const sx = from.x + from.width / 2, sy = from.y + from.height / 2, tx = to.x + to.width / 2, ty = to.y + to.height / 2;
    if (mobile) {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy }] });
      for (let step = 1; step <= 8; step++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sx + (tx - sx) * step / 8, y: sy + (ty - sy) * step / 8 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
    } else {
      await page.mouse.move(sx, sy); await page.mouse.down(); await page.mouse.move(tx, ty, { steps: 8 }); await page.mouse.up();
    }
    assert.deepEqual(await page.evaluate(() => (window as any).drops), [{ candidateId: 'candidate-2' }]);
    assert.deepEqual(await page.evaluate(() => (window as any).feeds), [{ candidateId: 'candidate-1' }], 'drag must not also fire a click feed');
    scenarios.push(`${prefix}: actual pointer drag delivers only that answer identifier to LiuKanShan`);
    await mkdir('output/question-reader-ui', { recursive: true });
    await page.screenshot({ path: `output/question-reader-ui/${prefix}-answers.png` });
    await page.locator('.zhq-answer').nth(2).evaluate(node => { const transfer = new DataTransfer(); node.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer })); (window as any).nativeDrag = transfer.getData('application/x-redleaf-zhihu-candidate'); });
    assert.deepEqual(JSON.parse(await page.evaluate(() => (window as any).nativeDrag)), { candidateId: 'candidate-3' });
    await page.getByRole('button', { name: '打开第 3 条回答原文' }).click();
    assert.deepEqual(await page.evaluate(() => (window as any).originals), [candidate(3).origin.sourceUrl]);
    scenarios.push(`${prefix}: each card also supports native drag and opens its own source`);
    const beforeHidden = requests.length;
    await page.evaluate(() => (window as any).setReaderActive(false));
    await page.locator('.zhq-reader[hidden]').waitFor({ state: 'attached' });
    assert.equal(await page.locator('.zhq-reader').isVisible(), false);
    await page.evaluate(() => (window as any).setReaderActive(true));
    await page.getByText('已加载 3 条回答，每条都可以拖给刘看山').waitFor();
    assert.equal(requests.length, beforeHidden);
    scenarios.push(`${prefix}: hiding and restoring retains loaded answers without refetch`);
    failNext = true;
    await page.getByRole('button', { name: '刷新', exact: true }).click();
    await page.getByRole('alert').getByText('本次请求失败，可以重试。').waitFor();
    assert.equal(await page.locator('.zhq-answer').count(), 3);
    await page.getByRole('button', { name: '重试', exact: true }).click();
    await page.getByText('已加载 2 条回答，每条都可以拖给刘看山').waitFor();
    assert.equal(await page.getByRole('alert').count(), 0);
    scenarios.push(`${prefix}: request failure retains readable answers and retry recovers`);
    await page.evaluate(value => (window as any).selectQuestion(value), delayed);
    await page.waitForFunction(() => document.querySelector('.zhq-heading h2')?.textContent === '正在打开问题…');
    for (let i = 0; !releaseDelayed && i < 100; i++) await page.waitForTimeout(10);
    assert.ok(releaseDelayed);
    await page.evaluate(value => (window as any).selectQuestion(value), other);
    await page.getByRole('heading', { name: '第二个问题的新回答' }).waitFor();
    releaseDelayed(); await page.waitForTimeout(120);
    await page.getByRole('heading', { name: '第二个问题的新回答' }).waitFor();
    scenarios.push(`${prefix}: delayed old question response cannot replace current question`);
    await page.getByRole('button', { name: '返回热榜', exact: true }).click();
    await page.getByRole('heading', { name: '知乎热榜', exact: true }).waitFor();
    failHot = true;
    await page.getByRole('button', { name: '刷新', exact: true }).click();
    await page.getByRole('alert').getByText('今日热榜接口额度已用完。').waitFor();
    await page.getByRole('button', { name: '打开知乎热榜', exact: true }).click();
    assert.equal(await page.evaluate(() => (window as any).originals.at(-1)), 'https://www.zhihu.com/hot');
    assert.equal(await page.locator('.zhq-hot-question').count(), 2);
    await page.getByRole('button', { name: '重试', exact: true }).click();
    await page.getByRole('alert').waitFor({ state: 'detached' });
    scenarios.push(`${prefix}: exhausted hotlist quota keeps snapshot and original hotlist accessible`);
    await page.getByRole('button', { name: '返回知乎网页', exact: true }).click();
    assert.equal(await page.evaluate(() => (window as any).backs), 1);
    assert.deepEqual(errors, []);
    scenarios.push(`${prefix}: question and hotlist back navigation remains usable`);
    await mkdir('output/question-reader-ui', { recursive: true });
    await page.screenshot({ path: `output/question-reader-ui/${prefix}.png` });
    await context.close();
  }
  await writeFile('output/question-reader-ui/results.json', JSON.stringify({ passed: scenarios.length, scenarios }, null, 2));
  console.log(JSON.stringify({ passed: scenarios.length, scenarios }, null, 2));
} finally { await browser.close(); await server.close(); }
