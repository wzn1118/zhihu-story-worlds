import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Locator, type Page } from 'playwright';
import { createServer } from 'vite';
import { ZhihuDiscoveryService } from '../server/zhihu-discovery';
import { LiukanInboxService } from '../server/liukan/inbox';
import { StoryWorkshop } from '../server/story-workshop';
import type { ZhihuBrowserAction, ZhihuBrowserFrame } from '../shared/zhihu-browser';

// Actual Workspace, native-page drag gestures, companion UI, discovery hashes,
// and inbox persistence. Only the remote Zhihu browser is a fixture: capture
// returns the same expanded answer whether its displayed card was collapsed or
// expanded. No site credentials, OAuth requests, or model calls are made.
const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font:16px system-ui}</style></head><body><div id="root"></div><script type="module">
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { configureAccountStorage } from '/src/account-storage.ts';
import { ZhihuWorkspace } from '/src/ZhihuWorkspace.tsx';
import { LiuKanShanPet } from '/src/LiuKanShanPet.tsx';
configureAccountStorage({provider:'zhihu'}, 'drag-consistency-ui');
const browserAvailable = new URL(location.href).searchParams.get('browser') !== '0';
createRoot(document.getElementById('root')).render(createElement('main', null, createElement(ZhihuWorkspace, {onClose:()=>{},browserAvailable}), createElement(LiuKanShanPet, {reducedMotion:true,initialOpen:true,browserAvailable})));
</script></body></html>`;
const server = await createServer({ server: { host: '127.0.0.1', port: 0, watch: { ignored: ['**/releases/**', '**/output/**', '**/.local/**'] } }, plugins: [{ name: 'drag-consistency-ui', configureServer(vite) {
  vite.middlewares.use(async (request, response, next) => {
    if (!request.url?.startsWith('/__drag-consistency-ui')) return next();
    response.setHeader('content-type', 'text/html'); response.end(await vite.transformIndexHtml(request.url, fixture));
  });
} }] });
await server.listen();
const address = server.httpServer!.address(); assert.ok(address && typeof address !== 'string');
const browser = await chromium.launch({ headless: true });
const temporary = await mkdtemp(join(tmpdir(), 'redleaf-drag-consistency-'));
const checks: string[] = [];
async function until(predicate: () => boolean) {
  const deadline = Date.now() + 10_000;
  while (!predicate()) { if (Date.now() > deadline) throw new Error('Expected drag/capture request did not arrive'); await new Promise(resolve => setTimeout(resolve, 20)); }
}
async function dragAnswer(page: Page, author: string, mobile: boolean) {
  const handle = page.frameLocator('iframe').getByRole('button', { name: `把${author}的回答交给刘看山`, exact: true });
  await handle.scrollIntoViewIfNeeded();
  let from = (await handle.boundingBox())!;
  const to = (await page.locator('.liukan-pet').boundingBox())!;
  // A floating pet can cover a short fixture page's final, right-aligned
  // answer handle. Scroll the surrounding reading pane to expose that handle,
  // exactly as a reader does before dragging an obscured answer.
  if (from.x < to.x + to.width && from.x + from.width > to.x && from.y + from.height > to.y) {
    await page.locator('.zhw-browser').evaluate((element, delta) => { element.scrollTop += delta; }, from.y + from.height - to.y + 40);
    from = (await handle.boundingBox())!;
  }
  await dragCoordinates(page, from, to, mobile);
}
async function dragCoordinates(page: Page, from: { x: number; y: number; width: number; height: number }, to: { x: number; y: number; width: number; height: number }, mobile: boolean) {
  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 }, end = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
  if (mobile) {
    const session = await page.context().newCDPSession(page);
    const touch = (x: number, y: number) => [{ x, y, radiusX: 4, radiusY: 4, force: 1, id: 1 }];
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touch(start.x, start.y) });
    for (let step = 1; step <= 14; step++) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touch(start.x + (end.x - start.x) * step / 14, start.y + (end.y - start.y) * step / 14) });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
  } else { await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 16 }); await page.mouse.up(); }
}
async function dragCandidate(page: Page, handle: Locator, mobile: boolean) {
  await handle.scrollIntoViewIfNeeded();
  await dragCoordinates(page, (await handle.boundingBox())!, (await page.locator('.liukan-pet').boundingBox())!, mobile);
}
async function savedText(page: Page) {
  if (!(await page.locator('.liukan-source-preview').evaluate(element => (element as HTMLDetailsElement).open))) await page.locator('.liukan-source-preview summary').click();
  return page.locator('.liukan-source-preview div').innerText();
}
try {
  for (const mobile of [false, true]) {
    const prefix = mobile ? 'mobile' : 'desktop';
    const discovery = new ZhihuDiscoveryService(join(temporary, prefix, 'discovery'));
    const inbox = new LiukanInboxService(discovery, new StoryWorkshop(join(temporary, prefix, 'workshop')), join(temporary, prefix, 'inbox'));
    const title = '同一问题的展开和折叠回答';
    const questionUrl = 'https://www.zhihu.com/question/12345678901234567890';
    const fullText = '这是同一条回答的原文。' + '原文中的人物决定回到码头，向同伴说明事情经过。'.repeat(10);
    const full = fullText.slice(0, 153) + '\n\n最终找到了那封蓝色信。';
    assert.equal(full.length, 166);
    const authorPrefix = '第一位作者：';
    const excerpt = authorPrefix + full.slice(0, 76 - authorPrefix.length) + '…'; assert.equal(excerpt.length, 77);
    const source = { title, author: '第一位作者', sourceUrl: `${questionUrl}/answer/22345678901234567890` };
    const old = await discovery.capturePage({ ...source, text: excerpt }); await inbox.learn(old.id);
    const complete = await discovery.capturePage({ ...source, text: full }, { visibleScope: 'expanded' });
    const second = await discovery.capturePage({ ...source, author: '第二位作者', sourceUrl: `${questionUrl}/answer/22345678901234567891`, text: '这是另一位作者对同一个问题的独立回答，不能合并为第一位作者的回答。' }, { visibleScope: 'expanded' });
    const thirdSource = { title, author: '第三位作者', sourceUrl: `${questionUrl}/answer/22345678901234567892` };
    const thirdText = '官方列表只显示简短预览。第三位作者的完整回答继续叙述了夜航、码头和船员，结尾留下了绿色笔记。';
    const thirdPreview = await discovery.captureOfficialQuestionAnswer({ ...thirdSource, text: thirdText.slice(0, 12) + '…', fetchedAt: new Date().toISOString() });
    const thirdFull = await discovery.capturePage({ ...thirdSource, text: thirdText }, { visibleScope: 'expanded' });
    const fallbackPreview = await discovery.captureOfficialQuestionAnswer({ title, sourceUrl: `${questionUrl}/answer/22345678901234567893`, text: '没有可用浏览器时，这一条仅保存官方节选。', fetchedAt: new Date().toISOString() });
    const context = await browser.newContext({ viewport: { width: mobile ? 390 : 1280, height: 900 }, isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce' });
    const page = await context.newPage(), errors: string[] = [], captures: Array<{ postId: string; candidateId: string; expandedBefore: boolean }> = [];
    page.on('pageerror', error => errors.push(error.message));
    let expanded = false, version = 1, frameRequests = 0;
    let pauseNextCapture = false, failNextCapture = false, pauseNextSave = false;
    let continueCapture: (() => void) | undefined, continueSave: (() => void) | undefined;
    let fallbackMode = false, showCurrentAnswerCandidate = false;
    const candidateCaptures: string[] = [];
    const learnedRequests: string[] = [];
    const posts = () => [expanded ? complete : old, second].map((candidate, index) => ({ id: candidate.id, title: candidate.title, author: candidate.author, sourceUrl: candidate.origin.sourceUrl, excerpt: candidate.excerpt, characters: candidate.characters, visibleScope: index === 0 && !expanded ? 'excerpt' as const : 'expanded' as const }));
    const frame = (): ZhihuBrowserFrame => ({ status: 'ready', frameId: `frame-${version}`, title, url: questionUrl, width: 1100, height: 650, capturedAt: new Date().toISOString(), posts: posts(), document: { id: `doc-${version}`, width: 1100, height: 650, scrollY: 0, html: `<!doctype html><html><head><style>body{margin:0;padding:14px;font:16px/1.7 system-ui}article{padding:12px;border:1px solid #ddd;margin-bottom:12px;box-sizing:border-box}h1{font-size:21px}h2{font-size:18px}p{margin:4px 0}button{padding:8px}</style></head><body><h1>${title}</h1>${posts().map((post, index) => `<article data-redleaf-post="${post.id}"><h2>${post.author}</h2><p>${post.excerpt}</p>${index === 0 ? `<button data-redleaf-control="doc-${version}-${expanded ? 'collapse' : 'expand'}">${expanded ? '收起回答' : '展开阅读全文'}</button>` : ''}</article>`).join('')}</body></html>` } });
    await context.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      assert.equal(route.request().headers()['x-redleaf-account'], 'drag-consistency-ui');
      if (path === '/api/liukan/memories') return route.fulfill({ json: { memories: [] } });
      if (path === '/api/workshop/discovery') return route.fulfill({ json: { candidates: [fallbackMode ? fallbackPreview : showCurrentAnswerCandidate ? old : thirdPreview] } });
      if (path === '/api/zhihu/questions/hotlist') return route.fulfill({ json: { items: [{ title, url: questionUrl, summary: '' }], fetchedAt: new Date().toISOString(), cached: true } });
      if (path === '/api/zhihu/questions/answers') return route.fulfill({ json: { title, questionUrl, candidates: [thirdPreview], paging: { isEnd: true }, fetchedAt: new Date().toISOString(), cached: true } });
      if (path === '/api/zhihu-browser/frame') { frameRequests++; return route.fulfill({ json: frame() }); }
      if (path === '/api/zhihu-browser/action') {
        const action = route.request().postDataJSON() as ZhihuBrowserAction;
        if (action.kind === 'element') { assert.equal(action.documentId, `doc-${version}`); expanded = action.elementId.endsWith('-expand'); version++; }
        else assert.equal(action.kind, 'load-more');
        return route.fulfill({ json: frame() });
      }
      if (path === '/api/zhihu-browser/capture') {
        const body = route.request().postDataJSON(); assert.equal(body.frameId, `frame-${version}`);
        const target = posts().find(post => post.id === body.postId); assert.ok(target, 'the drag must reference an answer from the currently displayed frame');
        const candidate = target.id === second.id ? second : complete;
        captures.push({ postId: body.postId, candidateId: candidate.id, expandedBefore: expanded });
        if (pauseNextCapture) {
          pauseNextCapture = false;
          await new Promise<void>(resolve => { continueCapture = resolve; });
        }
        if (failNextCapture) {
          failNextCapture = false;
          return route.fulfill({ status: 503, json: { error: { code: 'FULL_TEXT_UNAVAILABLE', message: '正文暂时无法读取，请稍后重试。' } } });
        }
        if (target.id !== second.id && !expanded) { expanded = true; version++; }
        return route.fulfill({ json: candidate });
      }
      if (path === '/api/zhihu-browser/capture-candidate') {
        const body = route.request().postDataJSON(); assert.deepEqual(body, { candidateId: showCurrentAnswerCandidate ? old.id : thirdPreview.id });
        candidateCaptures.push(body.candidateId);
        if (pauseNextCapture) {
          pauseNextCapture = false;
          await new Promise<void>(resolve => { continueCapture = resolve; });
        }
        if (failNextCapture) {
          failNextCapture = false;
          return route.fulfill({ status: 503, json: { error: { code: 'FULL_TEXT_UNAVAILABLE', message: '正文暂时无法读取，请稍后重试。' } } });
        }
        if (showCurrentAnswerCandidate) { expanded = true; version++; }
        return route.fulfill({ status: 201, json: showCurrentAnswerCandidate ? complete : thirdFull });
      }
      assert.equal(path, '/api/liukan/inbox');
      if (route.request().method() === 'GET') return route.fulfill({ json: { posts: await inbox.list() } });
      const candidateId = route.request().postDataJSON().candidateId;
      learnedRequests.push(candidateId);
      if (pauseNextSave) {
        pauseNextSave = false;
        await new Promise<void>(resolve => { continueSave = resolve; });
      }
      return route.fulfill({ json: await inbox.learn(candidateId) });
    });
    await page.goto(`http://127.0.0.1:${address.port}/__drag-consistency-ui`);
    const summary = page.locator('.liukan-panel header small');
    await page.locator('.liukan-post-author').filter({ hasText: '77 字' }).waitFor();
    assert.match(await summary.innerText(), /已读 1 篇/);
    await page.getByRole('button', { name: '收起刘看山', exact: true }).click();
    await page.frameLocator('iframe').getByRole('button', { name: '展开阅读全文', exact: true }).waitFor();
    const framesBefore = frameRequests;
    pauseNextCapture = true;
    await dragAnswer(page, '第一位作者', mobile);
    await until(() => captures.length === 1);
    await page.locator('.liukan-thinking').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.liukan-thinking').innerText(), '正在获取回答全文…');
    assert.equal(await page.locator('.zhw-selection-bar button').isDisabled(), true, 'browser controls remain disabled while the full answer is being captured');
    assert.match(await page.locator('.liukan-post-author').innerText(), /77 字/, 'pending retrieval must not pretend that the full answer is saved');
    assert.equal(learnedRequests.length, 0, 'a pending capture cannot write an inbox record');
    assert.equal((await inbox.list()).length, 1);
    pauseNextSave = true;
    assert.ok(continueCapture); continueCapture();
    await page.getByRole('status').filter({ hasText: '正在保存回答…' }).waitFor();
    assert.match(await page.locator('.liukan-post-author').innerText(), /77 字/);
    assert.equal((await inbox.list()).length, 1);
    assert.ok(continueSave); continueSave();
    await page.locator('.liukan-post-author').filter({ hasText: '166 字' }).waitFor();
    assert.match(await summary.innerText(), /已读 1 篇/, 'expanding an existing answer must not add a second book-bag item');
    assert.equal(await page.getByRole('combobox', { name: '选择已读回答' }).locator('option').count(), 1);
    assert.equal(await savedText(page), full);
    await page.frameLocator('iframe').getByRole('button', { name: '收起回答', exact: true }).waitFor();
    assert.ok(frameRequests > framesBefore, 'capture expansion must refresh the displayed browser frame');
    await page.getByRole('button', { name: '收起刘看山', exact: true }).click();
    await page.frameLocator('iframe').getByRole('button', { name: '收起回答', exact: true }).click();
    await page.frameLocator('iframe').getByRole('button', { name: '展开阅读全文', exact: true }).click();
    await page.frameLocator('iframe').getByRole('button', { name: '收起回答', exact: true }).waitFor();
    await dragAnswer(page, '第一位作者', mobile);
    await until(() => captures.length === 2);
    await page.locator('.liukan-thinking').waitFor({ state: 'hidden' });
    assert.match(await summary.innerText(), /已读 1 篇/);
    assert.equal(await savedText(page), full);
    assert.deepEqual(captures.map(capture => capture.expandedBefore), [false, true]);
    assert.deepEqual(captures.map(capture => capture.candidateId), [complete.id, complete.id]);
    assert.equal((await inbox.get(old.id)).candidate.excerpt, excerpt, 'the original immutable captured version remains intact for prior references');
    checks.push(`${prefix}: collapsed and manually expanded native drag both show 166 exact characters and one answer; refreshed frame can be operated immediately`);
    await page.getByRole('button', { name: '收起刘看山', exact: true }).click();
    await mkdir('output/drag-consistency-ui', { recursive: true });
    await page.screenshot({ path: `output/drag-consistency-ui/${prefix}-before-other-answer.png` });
    const learnedBeforeFailure = learnedRequests.length;
    failNextCapture = true;
    await dragAnswer(page, '第二位作者', mobile);
    await until(() => captures.length === 3);
    await page.locator('.liukan-error').filter({ hasText: '正文暂时无法读取，请稍后重试。' }).waitFor();
    assert.match(await summary.innerText(), /已读 1 篇/, 'failed retrieval cannot add an excerpt or empty item to the book bag');
    assert.equal(learnedRequests.length, learnedBeforeFailure);
    assert.equal((await inbox.list()).length, 1);
    await page.getByRole('button', { name: '再交一次', exact: true }).click();
    await until(() => captures.length === 4);
    await page.locator('.liukan-post-author').filter({ hasText: '第二位作者' }).waitFor();
    assert.match(await summary.innerText(), /已读 2 篇/);
    assert.equal(await page.getByRole('combobox', { name: '选择已读回答' }).locator('option').count(), 2);
    await page.reload();
    await page.locator('.liukan-post-author').filter({ hasText: '第二位作者' }).waitFor();
    assert.match(await summary.innerText(), /已读 2 篇/, 'startup reload keeps old duplicate versions consolidated');
    await page.getByRole('combobox', { name: '选择已读回答' }).selectOption(complete.id);
    await page.locator('.liukan-post-author').filter({ hasText: '166 字' }).waitFor();
    assert.equal(await savedText(page), full);
    await page.getByRole('button', { name: '收起刘看山', exact: true }).click();
    // Official answer cards and discovery cards send only a candidate ID.
    // Both must resolve that source to its full browser capture before saving.
    if (mobile) {
      await page.getByRole('tab', { name: '热榜与回答', exact: true }).click();
      await page.locator('.zhq-hot-question').filter({ hasText: title }).click();
      await page.locator('.zhq-answer').waitFor();
    } else {
      await page.getByRole('tab', { name: '知乎内容阅读', exact: true }).click();
      await page.locator('.zhw-post-list article').waitFor();
    }
    const learnedBeforeCandidate = learnedRequests.length;
    pauseNextCapture = true; failNextCapture = true; continueCapture = undefined;
    if (mobile) await dragCandidate(page, page.getByRole('button', { name: '把第 1 条回答交给刘看山', exact: true }), true);
    else await page.locator('.zhw-post-list article').dragTo(page.locator('.liukan-pet'));
    await until(() => candidateCaptures.length === 1);
    await page.getByRole('status').filter({ hasText: '正在获取回答全文…' }).waitFor();
    assert.equal(learnedRequests.length, learnedBeforeCandidate, 'candidate previews must not bypass full-answer retrieval');
    assert.equal((await inbox.list()).length, 2);
    assert.ok(continueCapture); continueCapture();
    await page.locator('.liukan-error').filter({ hasText: '正文暂时无法读取，请稍后重试。' }).waitFor();
    assert.match(await summary.innerText(), /已读 2 篇/);
    assert.equal(learnedRequests.length, learnedBeforeCandidate);
    await page.getByRole('button', { name: '再交一次', exact: true }).click();
    await until(() => candidateCaptures.length === 2);
    await page.locator('.liukan-post-author').filter({ hasText: '第三位作者' }).waitFor();
    assert.equal(await savedText(page), thirdText);
    assert.match(await summary.innerText(), /已读 3 篇/);
    assert.equal(learnedRequests.at(-1), thirdFull.id);
    assert.equal(learnedRequests.includes(thirdPreview.id), false);
    checks.push(`${prefix}: ${mobile ? 'official answer' : 'discovery'} candidate drag fetches full source; pending/failure never save preview; retry saves exact full answer`);
    await page.getByRole('button', { name: '收起刘看山', exact: true }).click();
    await page.getByRole('tab', { name: '知乎网页', exact: true }).click();
    await page.frameLocator('iframe').getByRole('button', { name: '收起回答', exact: true }).click();
    await page.frameLocator('iframe').getByRole('button', { name: '展开阅读全文', exact: true }).waitFor();
    showCurrentAnswerCandidate = true;
    await page.getByRole('tab', { name: '知乎内容阅读', exact: true }).click();
    const currentAnswerCard = page.locator('.zhw-post-list article').filter({ hasText: '第一位作者' });
    await currentAnswerCard.waitFor();
    const framesBeforeHiddenCapture = frameRequests;
    await currentAnswerCard.getByRole('button', { name: '交给看山', exact: true }).click();
    await until(() => candidateCaptures.length === 3);
    await page.locator('.liukan-post-author').filter({ hasText: '166 字' }).waitFor();
    await page.locator('.liukan-thinking').waitFor({ state: 'hidden' });
    assert.equal(frameRequests, framesBeforeHiddenCapture, 'a hidden website view does not need a redundant frame request');
    await page.getByRole('button', { name: '收起刘看山', exact: true }).click();
    await page.getByRole('tab', { name: '知乎网页', exact: true }).click();
    await page.frameLocator('iframe').getByRole('button', { name: '收起回答', exact: true }).waitFor();
    assert.ok(frameRequests > framesBeforeHiddenCapture, 'returning to the website reads the frame changed by candidate capture');
    await page.frameLocator('iframe').getByRole('button', { name: '收起回答', exact: true }).click();
    await page.frameLocator('iframe').getByRole('button', { name: '展开阅读全文', exact: true }).waitFor();
    checks.push(`${prefix}: candidate expansion in the hidden website refreshes on return; new document controls work without navigation`);
    // Without browser capability the existing explicit excerpt behavior stays
    // available; it must not call the capture endpoint or claim full text.
    fallbackMode = true;
    await page.goto(`http://127.0.0.1:${address.port}/__drag-consistency-ui?browser=0`);
    await page.locator('.zhw-post-list article').waitFor();
    if (await page.getByRole('button', { name: '收起刘看山', exact: true }).isVisible()) await page.getByRole('button', { name: '收起刘看山', exact: true }).click();
    await page.locator('.zhw-post-list article').getByRole('button', { name: '交给看山', exact: true }).click();
    await page.locator('.liukan-post-kicker').filter({ hasText: '知乎回答接口节选' }).waitFor();
    assert.equal(await savedText(page), fallbackPreview.excerpt);
    assert.equal(candidateCaptures.length, 3);
    assert.equal(learnedRequests.at(-1), fallbackPreview.id);
    checks.push(`${prefix}: browser-unavailable fallback preserves its honest excerpt label and makes no full-text request`);
    assert.deepEqual(errors, []);
    checks.push(`${prefix}: pending capture visibly waits without writing; failed retrieval does not enter the bag; explicit retry succeeds`);
    checks.push(`${prefix}: other answer of same question remains distinct; reload preserves the full answer and deduplicated count`);
    await mkdir('output/drag-consistency-ui', { recursive: true });
    await page.screenshot({ path: `output/drag-consistency-ui/${prefix}.png` });
    await context.close();
  }
  const result = { passed: true, scope: 'Real Workspace and LiuKanShan UI, real persisted discovery/inbox records, deterministic browser fixture. No live Zhihu or model requests.', checks };
  await writeFile('output/drag-consistency-ui/results.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
} finally { await browser.close(); await server.close(); await rm(temporary, { recursive: true, force: true }); }
