import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { ZhihuBrowserService } from '../server/zhihu-browser.ts';
import { ZhihuDiscoveryService } from '../server/zhihu-discovery.ts';

const questionId = '20734757173969517000';
const sourceUrl = (id: string) => `https://www.zhihu.com/question/${questionId}/answer/${id}`;
const title = '未展开的候选也应取得对应回答的正文';
const fullText = '这是隔离测试页面中作者真正写下的正文。\n\n拖入时自动取得后续段落，保留原样。'.padEnd(166, '文');
const shortText = '测试列表只展示前面一小段内容…';
const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
function answer(id: string, text = fullText, collapsed = false) {
  return `<article class="AnswerItem" data-answer-id="${id}"><meta itemprop="url" content="${sourceUrl(id)}"><div class="AuthorInfo"><b class="AuthorInfo-name">页面真实作者</b><span class="AuthorInfo-headline RichText">不是正文的个人简介</span></div><div class="RichContent${collapsed ? ' is-collapsed' : ''}"><div class="RichContent-inner"><div class="RichText" style="white-space:pre-wrap">${escape(text)}</div></div>${collapsed ? '<button class="ContentItem-more">阅读全文</button>' : ''}</div></article>`;
}
function pageHtml(body: string) { return `<html><head><title>${title}</title></head><body><h1 class="QuestionHeader-title">${title}</h1>${body}</body></html>`; }

// Only remote website bytes are fixtures. Browser contexts, page/popup events,
// DOM extraction, native expansion and account-local persistence are real.
test('candidate full text uses a background page without changing the visible account browser', async t => {
  const temporary = await mkdtemp(join(tmpdir(), 'redleaf-candidate-fulltext-'));
  const launch = chromium.launchPersistentContext;
  const navigations: string[] = [], createdPages: Page[] = [];
  let launches = 0, externalRequests = 0;
  const modes = new Map<string, 'full' | 'collapsed' | 'delayed' | 'anchor' | 'popupanchor' | 'denied' | 'login' | 'excerpt' | 'wrong'>();
  const visibleId = '20734757173969517111';
  const feed = pageHtml(`<button id="visible-control" onclick="document.body.dataset.clicked='yes'">页面原有控件</button>${answer(visibleId, '当前页面原有的另一条回答。')}<div style="height:4200px">保留列表滚动位置</div>`);
  t.mock.method(chromium, 'launchPersistentContext', async (...args: Parameters<typeof chromium.launchPersistentContext>) => {
    launches++;
    const context = await launch.call(chromium, ...args);
    context.on('page', page => createdPages.push(page));
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.hostname !== 'www.zhihu.com') { externalRequests++; return route.fulfill({ status: 403, body: 'Unexpected external fixture request' }); }
      if (!request.isNavigationRequest()) return route.fulfill({ body: '' });
      navigations.push(url.pathname);
      const id = url.pathname.match(/\/answer\/(\d+)$/)?.[1];
      const mode = id ? modes.get(id) : undefined;
      if (!id) return route.fulfill({ contentType: 'text/html; charset=utf-8', body: url.pathname === '/related-popup' ? pageHtml('<p>后台详情自己的弹出窗口</p>') : feed });
      if (mode === 'denied') return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: { code: 40362, message: 'Fixture denied' } }) });
      if (mode === 'login') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: pageHtml(`<div class="SignFlow">请先登录</div>${answer(id)}`) });
      if (mode === 'excerpt') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: pageHtml(`<article class="AnswerItem" data-answer-id="${id}"><b class="AuthorInfo-name">页面真实作者</b><div class="RichContent-excerpt">只有摘要，未取得正文…</div></article>`) });
      if (mode === 'wrong') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: pageHtml(answer('20734757173969517999', '这是另一条回答，不能替代被拖入的回答。')) });
      if (mode === 'popupanchor' && !url.searchParams.has('expanded')) return route.fulfill({ contentType: 'text/html; charset=utf-8', body: pageHtml(answer(id, shortText, true).replace('<button class="ContentItem-more">阅读全文</button>', `<a class="ContentItem-more" href="${sourceUrl(id)}?expanded=1" target="_blank">阅读全文</a>`)) });
      const collapsed = ['collapsed', 'delayed', 'anchor'].includes(mode ?? '');
      const script = collapsed ? `<script>
        if (${mode === 'anchor'}) { const button = document.querySelector('.ContentItem-more'); button.outerHTML = '<a class="ContentItem-more" href="${sourceUrl(id)}">阅读全文</a>'; }
        if (${mode === 'delayed'}) { const content = document.querySelector('.RichContent'); content.setAttribute('aria-busy','true'); const button = content.querySelector('.ContentItem-more'); button.style.display='none'; setTimeout(() => { content.removeAttribute('aria-busy'); button.style.display=''; }, 600); }
        document.querySelector('.ContentItem-more').addEventListener('click', event => {
          if (!event.isTrusted) throw new Error('Expected actual browser click');
          event.preventDefault();
          const content = event.target.closest('.RichContent');
          content.classList.remove('is-collapsed'); event.target.remove();
          setTimeout(() => { content.querySelector('.RichText').textContent = ${JSON.stringify(fullText)}; content.insertAdjacentHTML('beforeend','<button class="RichContent-collapse">收起</button>'); }, 700);
        });
        window.open('/related-popup', '_blank');
      </script>` : '';
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: pageHtml(answer(id, collapsed ? shortText : fullText, collapsed) + script) });
    });
    return context;
  });
  const discovery = new ZhihuDiscoveryService(join(temporary, 'discovery'), async () => ({ Code: 0, Data: { Items: [{ Title: title, AuthorName: '搜索记录作者', ContentText: '官方搜索展示的内容节选。'.repeat(8), Url: sourceUrl('20734757173969517222') }] } }));
  const service = new ZhihuBrowserService(discovery, join(temporary, 'profile'), { defaultChannel: 'chromium', publicMode: true });
  const active = () => Reflect.get(service, 'page') as Page;
  const context = () => Reflect.get(service, 'context') as BrowserContext;
  const candidatesOnDisk = async () => (await readdir(join(discovery.root, 'candidates'))).sort();
  const official = (id: string) => discovery.captureOfficialQuestionAnswer({ sourceUrl: sourceUrl(id), title, text: shortText, fetchedAt: new Date().toISOString() });
  const services = [service];
  try {
    await service.open({ url: 'https://www.zhihu.com/hot', width: 1000, height: 700 });
    await service.action({ kind: 'scroll', deltaY: 760 });
    const visible = active(), before = await service.frame();
    const scroll = await visible.evaluate(() => scrollY), control = await visible.locator('#visible-control').getAttribute('data-redleaf-control');
    assert.ok(scroll > 0); assert.ok(before.document); assert.ok(control); assert.equal(before.posts.length, 1);
    const unchanged = async () => {
      assert.equal(active(), visible); assert.equal(visible.url(), 'https://www.zhihu.com/hot');
      assert.equal(await visible.evaluate(() => scrollY), scroll);
      const after = await service.frame();
      assert.equal(after.frameId, before.frameId); assert.equal(after.document?.id, before.document?.id);
      assert.equal(await visible.locator('#visible-control').getAttribute('data-redleaf-control'), control);
      assert.deepEqual(context().pages(), [visible], 'temporary detail pages and their popups close after capture');
      assert.equal(Reflect.get(service, 'notice'), undefined);
    };
    await t.test('official excerpt becomes exact body and actual author, including collapsed detail and its popup', async () => {
      const id = '20734757173969517333'; modes.set(id, 'collapsed');
      const candidate = await official(id), pagesBefore = createdPages.length;
      const result = await service.captureCandidate(candidate.id);
      assert.equal(result.excerpt, fullText); assert.equal(result.characters, 166);
      assert.equal(result.author, '页面真实作者'); assert.equal(result.origin.sourceUrl, sourceUrl(id)); assert.equal(result.origin.webpageScope, 'expanded');
      assert.ok(createdPages.length >= pagesBefore + 2, 'real background page and real site popup both existed');
      assert.ok(createdPages.slice(pagesBefore).every(page => page.isClosed()));
      await unchanged();
      const navCount = navigations.length;
      assert.equal((await service.captureCandidate(result.id)).id, result.id);
      assert.equal(navigations.length, navCount, 'expanded saved candidate reads without another navigation');
      await unchanged();
    });
    await t.test('search candidate selects its own answer and leaves page controls usable', async () => {
      modes.set('20734757173969517222', 'full');
      const candidate = (await discovery.search('测试搜索'))!.candidates[0];
      const result = await service.captureCandidate(candidate.id);
      assert.equal(result.excerpt, fullText); assert.equal(result.author, '页面真实作者'); assert.equal(result.origin.sourceUrl, candidate.origin.sourceUrl);
      await unchanged();
    });
    await t.test('waits for late controls and uses native same-URL anchor handlers', async () => {
      for (const [id, mode] of [['20734757173969517001', 'delayed'], ['20734757173969517002', 'anchor']] as const) {
        modes.set(id, mode); const candidate = await official(id), start = navigations.length;
        assert.equal((await service.captureCandidate(candidate.id)).excerpt, fullText);
        assert.equal(navigations.slice(start).filter(path => path === new URL(sourceUrl(id)).pathname).length, 1, 'native anchor expansion must not reload the detail');
        await unchanged();
      }
    });
    await t.test('current answer behind a login overlay is not captured through the expanded fast path', async () => {
      const candidate = await official(visibleId), files = await candidatesOnDisk();
      await visible.evaluate(() => { const div = document.createElement('div'); div.className = 'SignFlowModal'; div.textContent = '请登录'; document.body.prepend(div); });
      await assert.rejects(service.captureCandidate(candidate.id), { code: 'BROWSER_FULLTEXT_AUTH_REQUIRED' });
      assert.deepEqual(await candidatesOnDisk(), files);
      await visible.locator('.SignFlowModal').evaluate(node => node.remove());
      await unchanged();
    });
    await t.test('denial, login, summary-only body and a different answer do not persist expanded content', async () => {
      const cases = [['20734757173969517444', 'denied', 'BROWSER_FULLTEXT_RESTRICTED'], ['20734757173969517555', 'login', 'BROWSER_FULLTEXT_AUTH_REQUIRED'], ['20734757173969517666', 'excerpt', 'BROWSER_POST_EXPANSION_FAILED'], ['20734757173969517777', 'wrong', 'BROWSER_POST_EXPANSION_FAILED']] as const;
      for (const [id, mode, code] of cases) {
        modes.set(id, mode); const candidate = await official(id), files = await candidatesOnDisk();
        await assert.rejects(service.captureCandidate(candidate.id), { code });
        assert.deepEqual(await candidatesOnDisk(), files, `${mode}: no full-text candidate was created`);
        await unchanged();
      }
    });
    await t.test('another account cannot use an existing candidate and does not launch a browser', async () => {
      const foreign = new ZhihuBrowserService(new ZhihuDiscoveryService(join(temporary, 'other-account')), join(temporary, 'other-profile'), { defaultChannel: 'chromium', publicMode: true }); services.push(foreign);
      const candidate = await official('20734757173969517333'), beforeLaunch = launches;
      await assert.rejects(foreign.captureCandidate(candidate.id), { code: 'CANDIDATE_NOT_FOUND' });
      assert.equal(launches, beforeLaunch); assert.equal(Reflect.get(foreign, 'context'), undefined);
      await unchanged();
    });
    await t.test('cold-start capture opens only the own profile and cached expanded content needs no browser', async () => {
      const own = new ZhihuDiscoveryService(join(temporary, 'cold-account'));
      const id = '20734757173969517888'; modes.set(id, 'full');
      const candidate = await own.captureOfficialQuestionAnswer({ sourceUrl: sourceUrl(id), title, text: shortText, fetchedAt: new Date().toISOString() });
      const cold = new ZhihuBrowserService(own, join(temporary, 'cold-profile'), { defaultChannel: 'chromium', publicMode: true }); services.push(cold);
      const launchCount = launches, result = await cold.captureCandidate(candidate.id);
      assert.equal(launches, launchCount + 1); assert.equal(result.excerpt, fullText); assert.equal(result.author, '页面真实作者');
      assert.equal((Reflect.get(cold, 'context') as BrowserContext).pages().length, 1);
      await cold.close();
      const navCount = navigations.length, cached = await cold.captureCandidate(result.id);
      assert.equal(cached.id, result.id); assert.equal(launches, launchCount + 1); assert.equal(navigations.length, navCount); assert.equal(Reflect.get(cold, 'context'), undefined);
    });
    await service.action({ kind: 'element', documentId: before.document!.id, elementId: control!, event: 'click' });
    assert.equal(await visible.getAttribute('body', 'data-clicked'), 'yes', 'the original visible frame control still targets the same actual page');
    await t.test('native read-more can open the exact answer in a background child tab', async () => {
      const id = '20734757173969517003'; modes.set(id, 'popupanchor');
      assert.equal((await service.captureCandidate((await official(id)).id)).excerpt, fullText);
      assert.equal(active(), visible); assert.deepEqual(context().pages(), [visible]);
    });
    await t.test('a delayed foreground popup stays open during the separate background read', async () => {
      const id = '20734757173969517004'; modes.set(id, 'delayed');
      const candidate = await official(id), newBackground = context().waitForEvent('page');
      const capture = service.captureCandidate(candidate.id);
      await newBackground;
      const popupEvent = visible.waitForEvent('popup');
      await visible.evaluate(() => { window.open('/foreground-popup', '_blank'); });
      const foreground = await popupEvent; await foreground.waitForURL('**/foreground-popup');
      assert.equal((await capture).excerpt, fullText);
      assert.equal(foreground.isClosed(), false); assert.equal(active(), foreground);
      assert.equal(context().pages().length, 2);
      await foreground.close(); assert.equal(active(), visible);
    });
    assert.equal(externalRequests, 0);
  } finally { await Promise.allSettled(services.map(item => item.close())); await rm(temporary, { recursive: true, force: true }); }
});
