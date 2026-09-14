import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Page } from 'playwright';
import { readableZhihuPosts } from '../server/zhihu-browser.ts';
import { ZHIHU_READABLE_POSTS_SCRIPT, ZHIHU_CAPTURE_POST_SCRIPT, ZHIHU_EXPAND_POST_CONTROL_SCRIPT } from '../server/zhihu-post-dom.ts';

const sourceUrl = 'https://www.zhihu.com/question/123456/answer/654321';
const selected = { sourceUrl, postId: 'fixture' };
const captureState = new Function('return (' + ZHIHU_CAPTURE_POST_SCRIPT + ')')() as (input: typeof selected) => { post: { visibleScope: string; collapsed: boolean; text: string }; loading: boolean; hasCollapseControl: boolean };
const expansionControl = new Function('return (' + ZHIHU_EXPAND_POST_CONTROL_SCRIPT + ')')() as (input: typeof selected) => Element | null;
const render = async (page: Page, body: string, rootAttributes = '') => {
  await page.setContent(`<h1 class="QuestionHeader-title">展开判定</h1><article class="AnswerItem" data-answer-id="654321" ${rootAttributes}><b class="AuthorInfo-name">真实作者</b>${body}</article>`);
};

test('reading controls cover native wording and ARIA variants without selecting quoted or unrelated controls', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('https://www.zhihu.com/**', route => route.fulfill({ contentType: 'text/html', body: '' }));
    await page.goto(sourceUrl);
    for (const control of [
      '<button id="expand" class="ContentItem-more">展开</button>',
      '<button id="expand">展开全部正文 ↓</button>',
      '<div id="expand" class="RichContent-more" role="button">继续阅读…</div>',
      '<button id="expand" aria-label="展开全文"><svg width="12" height="12"></svg></button>',
      '<button id="expand" aria-expanded="false" aria-controls="body"><svg width="12" height="12"></svg></button>',
    ]) {
      await render(page, `<div class="RichContent"><div class="RichContent-inner" id="body"><div class="RichText">当前可见的摘要。<a id="quote" href="/question/777777/answer/888888">阅读全文</a></div></div>${control}</div><div class="CommentItem"><button id="comments" aria-expanded="false">展开</button></div>`);
      const post = readableZhihuPosts(await page.evaluate(ZHIHU_READABLE_POSTS_SCRIPT))[0];
      assert.equal(post.visibleScope, 'excerpt'); assert.equal(post.collapsed, true);
      const handle = await page.evaluateHandle(expansionControl, selected);
      assert.equal(await handle.asElement()!.getAttribute('id'), 'expand'); await handle.dispose();
    }
    await render(page, '<div class="RichContent"><div class="RichContent-inner"><div class="RichText">完整正文里引用了<a href="/question/777777/answer/888888">阅读全文</a>这段链接，也讨论登录后阅读和付费阅读。</div></div><button aria-expanded="true">收起正文</button></div><div class="CommentItem"><button aria-expanded="false">展开</button></div>');
    const state = await page.evaluate(captureState, selected);
    assert.equal(state.post.visibleScope, 'expanded'); assert.equal(state.post.collapsed, false); assert.equal(state.hasCollapseControl, true);
    const handle = await page.evaluateHandle(expansionControl, selected);
    assert.equal(handle.asElement(), null); await handle.dispose();
    await render(page, '<div class="RichContent"><div class="RichContent-inner"><div class="RichText">正文中可以出现收起这个词。<button class="ContentItem-more">收起</button></div></div></div>');
    const inlineUi = await page.evaluate(captureState, selected);
    assert.equal(inlineUi.post.text, '正文中可以出现收起这个词。'); assert.equal(inlineUi.post.visibleScope, 'expanded');
    assert.equal(await page.locator('.ContentItem-more').isVisible(), true);
  } finally { await browser.close(); }
});

test('collapsed class, summary, CSS clipping and asynchronous loading cannot be classified as full text', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('https://www.zhihu.com/**', route => route.fulfill({ contentType: 'text/html', body: '' }));
    await page.goto(sourceUrl);
    for (const attributes of ['class="RichContent-inner is-collapsed"', 'class="RichContent-inner RichContent-inner--excerpt"', 'class="RichContent-inner" aria-expanded="false"', 'class="RichContent-inner" style="height:20px;overflow:hidden"', 'class="RichContent-inner" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden"']) {
      await render(page, `<div class="RichContent"><div ${attributes}><div class="RichText">${'尚未展开的正文。'.repeat(60)}</div></div></div>`);
      const state = await page.evaluate(captureState, selected);
      assert.equal(state.post.visibleScope, 'excerpt'); assert.equal(state.post.collapsed, true);
    }
    await render(page, '<div class="RichContent"><div class="RichContent-summary">试读摘要。</div></div>');
    assert.equal((await page.evaluate(captureState, selected)).post.visibleScope, 'excerpt');
    await render(page, '<div class="RichContent"><div class="RichContent-inner"><div class="RichText">异步加载前仍停留在这里的摘要。</div></div><button>收起</button></div>', 'aria-busy="true"');
    const loading = await page.evaluate(captureState, selected);
    assert.equal(loading.loading, true); assert.equal(loading.post.visibleScope, 'excerpt');
    await page.locator('.AnswerItem').evaluate(root => { root.removeAttribute('aria-busy'); root.querySelector('.RichText')!.textContent = '现在已经渲染完成的全部正文。'; });
    const finished = await page.evaluate(captureState, selected);
    assert.equal(finished.loading, false); assert.equal(finished.post.visibleScope, 'expanded');
    assert.equal(finished.post.text, '现在已经渲染完成的全部正文。');
  } finally { await browser.close(); }
});

test('hidden full text is not read until a native expansion actually displays it', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('https://www.zhihu.com/**', route => route.fulfill({ contentType: 'text/html', body: '' }));
    await page.goto(sourceUrl);
    for (const hidden of ['hidden', 'style="display:none"', 'style="height:0;overflow:hidden"', 'style="opacity:0"']) {
      await render(page, `<div class="RichContent"><div id="full" ${hidden}><div class="RichContent-inner"><div class="RichText">只有展开后才实际展示的完整正文。</div></div></div><div class="RichContent-summary" id="summary">当前实际可见的摘要。</div><button id="expand" class="ContentItem-more">展开全文</button></div>`);
      const before = await page.evaluate(captureState, selected);
      assert.equal(before.post.text, '当前实际可见的摘要。'); assert.equal(before.post.visibleScope, 'excerpt');
      await page.locator('#expand').evaluate(button => button.addEventListener('click', () => {
        const full = document.querySelector('#full')!;
        full.removeAttribute('hidden'); full.removeAttribute('style');
        document.querySelector('#summary')!.remove(); button.textContent = '收起';
      }));
      const control = await page.evaluateHandle(expansionControl, selected);
      await control.asElement()!.click(); await control.dispose();
      const after = await page.evaluate(captureState, selected);
      assert.equal(after.post.text, '只有展开后才实际展示的完整正文。'); assert.equal(after.post.visibleScope, 'expanded');
    }
  } finally { await browser.close(); }
});

test('visible login and paid-reading gates remain excerpts and are never automatic expand targets', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('https://www.zhihu.com/**', route => route.fulfill({ contentType: 'text/html', body: '' }));
    await page.goto(sourceUrl);
    for (const gate of ['<button class="ContentItem-more">登录后继续阅读</button>', '<button class="ContentItem-more">开通盐选会员，查看全文</button>', '<div class="KfeCollection-PaidReadMore"><button class="ContentItem-more">继续阅读</button></div>']) {
      await render(page, `<div class="RichContent"><div class="RichContent-inner"><div class="RichText">现在只能查看的试读部分。</div></div>${gate}</div>`);
      const state = await page.evaluate(captureState, selected);
      assert.equal(state.post.visibleScope, 'excerpt'); assert.equal(state.post.collapsed, true);
      const control = await page.evaluateHandle(expansionControl, selected);
      assert.equal(control.asElement(), null); await control.dispose();
    }
  } finally { await browser.close(); }
});

test('a direct answer body is complete only on that exact answer detail URL', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('https://www.zhihu.com/**', route => route.fulfill({ contentType: 'text/html', body: '' }));
    for (const [url, scope] of [[sourceUrl, 'expanded'], ['https://www.zhihu.com/question/123456', 'excerpt'], ['https://www.zhihu.com/question/123456/answer/654322', 'excerpt']] as const) {
      await page.goto(url);
      await render(page, '<div class="AuthorInfo"><span class="RichText AuthorInfo-headline">不能把简介当正文</span></div><div class="RichText">直接放在当前回答下的完整正文。</div>');
      const state = await page.evaluate(captureState, selected);
      assert.equal(state.post.text, '直接放在当前回答下的完整正文。'); assert.equal(state.post.visibleScope, scope);
    }
  } finally { await browser.close(); }
});
