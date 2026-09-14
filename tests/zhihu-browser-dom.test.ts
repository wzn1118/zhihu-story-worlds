import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readableZhihuPosts } from '../server/zhihu-browser.ts';
import { ZHIHU_READABLE_POSTS_SCRIPT } from '../server/zhihu-post-dom.ts';
import { createZhihuPageDocument } from '../server/zhihu-page-document.ts';

test('homepage answer extraction chooses answer identity after question metadata and preserves visible text', async () => {
  const browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'msedge' } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 1200 } });
    await page.route('https://www.zhihu.com/', route => route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }));
    await page.goto('https://www.zhihu.com/');
    const prose = '第一行，保持原文标点。\n\n' + '低魔世界里，城门边只有一盏需要用火柴点燃的灯。'.repeat(6);
    const excerpt = '这是尚未展开的可见节选。' + '每一段都由实际页面给出，只读取当前展示的文字。'.repeat(5);
    await page.setContent(`<style>.RichContent-inner {white-space:pre-wrap}.hidden{display:none}</style>
      <div class="TopstoryItem"><div class="ContentItem"><h2 class="ContentItem-title"><meta itemprop="url" content="https://www.zhihu.com/question/123456">低魔、中魔、高魔是什么？</h2><a href="/question/123456/answer/654321">阅读全文</a><span class="AuthorInfo-name">真实作者字段</span><div class="RichContent"><div class="RichContent-inner"><div class="RichText ztext" id="expanded"></div><button>收起</button></div></div></div></div>
      <div class="TopstoryItem"><div class="ContentItem AnswerItem" data-zop='{"type":"answer","itemId":2073475717396951749,"authorName":"摘要作者","title":"尚未展开的故事"}'><h2 class="ContentItem-title"><a href="/question/998877">尚未展开的故事</a></h2><div class="RichContent is-collapsed"><div class="RichContent-inner"><div class="RichText ztext" id="excerpt"></div></div><button class="ContentItem-more">阅读全文</button></div></div></div>
      <div class="TopstoryItem"><div class="ContentItem"><h2 class="ContentItem-title"><meta itemprop="url" content="https://www.zhihu.com/question/111111">没有回答身份</h2><span class="AuthorInfo-name">作者</span><div class="RichContent-inner"><span class="RichText ztext" id="invalid"></span></div></div></div>
      <div class="TopstoryItem hidden"><div class="ContentItem AnswerItem"><h2 class="ContentItem-title">隐藏回答</h2><a href="/question/123456/answer/654322">链接</a><span class="AuthorInfo-name">隐藏作者</span><div class="RichContent-inner"><span class="RichText ztext" id="hidden"></span></div></div></div>`);
    await page.locator('#expanded').evaluate((element, value) => { element.textContent = value; }, prose);
    for (const id of ['excerpt', 'invalid', 'hidden']) await page.locator(`#${id}`).evaluate((element, value) => { element.textContent = value; }, excerpt);
    const exactRendered = await page.locator('#expanded').innerText();
    const rows = readableZhihuPosts(await page.evaluate(ZHIHU_READABLE_POSTS_SCRIPT));
    assert.equal(rows.length, 2);
    assert.equal(rows[0].title, '低魔、中魔、高魔是什么？');
    assert.equal(rows[0].author, '真实作者字段');
    assert.equal(rows[0].sourceUrl, 'https://www.zhihu.com/question/123456/answer/654321');
    assert.equal(rows[0].text, exactRendered);
    assert.equal(rows[0].text.includes('收起'), false);
    assert.equal(rows[0].visibleScope, 'expanded');
    assert.equal(rows[1].sourceUrl, 'https://www.zhihu.com/question/998877/answer/2073475717396951749');
    assert.equal(rows[1].author, '摘要作者');
    assert.equal(rows[1].text, await page.locator('#excerpt').innerText());
    assert.equal(rows[1].visibleScope, 'excerpt');
  } finally { await browser.close(); }
});

test('question list gives every loaded answer its own lossless identity and matching drag handle', async () => {
  const browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'msedge' } : {}) });
  const questionId = '20734757173969517000';
  const answerIds = ['20734757173969517491', '20734757173969517492', '20734757173969517493'];
  try {
    const page = await browser.newPage();
    await page.route('https://www.zhihu.com/**', route => route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }));
    await page.goto(`https://www.zhihu.com/question/${questionId}`);
    // Question list cards usually have no question hyperlink of their own.
    // Quoted answer hyperlinks inside their prose must not become their identity.
    await page.setContent(`<h1 class="QuestionHeader-title">题目来自当前问题页面</h1>
      <div class="List-item"><article class="ContentItem AnswerItem" data-zop='{"type":"answer","itemId":${answerIds[0]},"authorName":"第一位作者"}'>
        <div class="RichContent"><div class="RichContent-inner"><div class="RichText">第一条完整可见回答。<a href="/question/999999/answer/888888">这里引用了其他回答</a></div></div></div>
      </article></div>
      <div class="List-item"><article class="ContentItem AnswerItem" data-zop='{"type":"answer","itemId":"${answerIds[1]}"}'>
        <span class="AnonymousAuthor">匿名用户</span><div class="RichContent is-collapsed"><div class="RichContent-inner"><div class="RichText">第二条尚未展开的回答。</div></div><button class="ContentItem-more">阅读全文</button></div>
      </article></div>`);
    const verify = async (count: number) => {
      const rows = readableZhihuPosts(await page.evaluate(ZHIHU_READABLE_POSTS_SCRIPT));
      assert.equal(rows.length, count);
      assert.deepEqual(rows.map(row => row.sourceUrl), answerIds.slice(0, count).map(id => `https://www.zhihu.com/question/${questionId}/answer/${id}`));
      assert.ok(rows.every(row => row.title === '题目来自当前问题页面'));
      const posts = rows.map((row, index) => ({ id: `answer-${index}`, ...row, excerpt: row.text, characters: row.text.length }));
      const cloned = await createZhihuPageDocument(page, posts);
      for (let i = 0; i < count; i++) {
        assert.equal(await page.locator('.AnswerItem').nth(i).getAttribute('data-redleaf-post'), `answer-${i}`);
        assert.equal(cloned.html.split(`data-redleaf-post="answer-${i}"`).length - 1, 1);
      }
      return rows;
    };
    const initial = await verify(2);
    assert.equal(initial[0].author, '第一位作者');
    assert.equal(initial[1].author, '匿名用户');
    assert.equal(initial[0].visibleScope, 'expanded');
    assert.equal(initial[1].visibleScope, 'excerpt');
    await page.locator('.AnswerItem').nth(1).evaluate(root => {
      root.querySelector('.RichText')!.textContent = '第二条展开后显示的全部当前原文。';
      root.querySelector('.RichContent')!.classList.remove('is-collapsed');
      root.querySelector('button')!.remove();
    });
    // A later page of answers can identify the answer directly on the root.
    await page.locator('body').evaluate((body, answerId) => {
      body.insertAdjacentHTML('beforeend', `<div class="List-item"><article class="AnswerItem ContentItem" data-answer-id="${answerId}"><div class="RichContent"><div class="RichContent-inner"><div class="RichText">刚加载出来的第三条原文。</div></div></div></article></div>`);
    }, answerIds[2]);
    const expanded = await verify(3);
    assert.equal(expanded[1].text, '第二条展开后显示的全部当前原文。');
    assert.equal(expanded[1].visibleScope, 'expanded');
    assert.equal(expanded[2].author, '作者未显示');
  } finally { await browser.close(); }
});

test('an answer detail URL never aliases a different loaded answer or a link in its prose', async () => {
  const browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'msedge' } : {}) });
  try {
    const page = await browser.newPage();
    await page.route('https://www.zhihu.com/**', route => route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }));
    await page.goto('https://www.zhihu.com/question/123456/answer/654321');
    await page.setContent(`<h1 class="QuestionHeader-title">问题标题</h1>
      <article class="AnswerItem" data-zop='{"type":"answer","itemId":654321,"authorName":"甲"}'><div class="RichText">主回答的内容。</div></article>
      <article class="AnswerItem" data-zop='{"type":"answer","itemId":654322,"authorName":"乙"}'><div class="RichText">另一条回答的内容。</div></article>
      <article class="AnswerItem"><div class="RichText">缺少自身身份的内容。<a href="/question/777777/answer/888888">引用他人的回答</a></div></article>`);
    const rows = readableZhihuPosts(await page.evaluate(ZHIHU_READABLE_POSTS_SCRIPT));
    assert.deepEqual(rows.map(row => row.sourceUrl), ['https://www.zhihu.com/question/123456/answer/654321', 'https://www.zhihu.com/question/123456/answer/654322']);
    const cloned = await createZhihuPageDocument(page, rows.map((row, i) => ({ id: `detail-${i}`, ...row, excerpt: row.text, characters: row.text.length })));
    assert.equal(await page.locator('.AnswerItem').nth(2).getAttribute('data-redleaf-post'), null);
    assert.equal((cloned.html.match(/data-redleaf-post=/g) || []).length, 2);
  } finally { await browser.close(); }
});
