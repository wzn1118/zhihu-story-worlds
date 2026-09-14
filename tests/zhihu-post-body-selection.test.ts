import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readableZhihuPosts } from '../server/zhihu-browser.ts';
import { ZHIHU_READABLE_POSTS_SCRIPT } from '../server/zhihu-post-dom.ts';
import { createZhihuPageDocument } from '../server/zhihu-page-document.ts';

test('author RichText before an answer body never replaces its collapsed or expanded prose', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('https://www.zhihu.com/**', route => route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }));
    await page.goto('https://www.zhihu.com/question/123456');
    for (const bio of ['金融牛马', '这是十三个字的作者个人简介']) {
      assert.ok([4, 13].includes(bio.length));
      await page.setContent(`<h1 class="QuestionHeader-title">正文与作者简介的回归测试</h1>
        <article class="AnswerItem" data-answer-id="654321">
          <div class="AuthorInfo"><b class="AuthorInfo-name">原作者</b><div class="AuthorInfo-headline"><span class="RichText">${bio}</span></div></div>
          <div class="RichContent is-collapsed"><div class="RichContent-inner"><div class="RichText"></div></div><button class="ContentItem-more">阅读全文</button></div>
        </article>
        <article class="AnswerItem" id="bio-only" data-answer-id="654322"><div class="AuthorInfo"><b class="AuthorInfo-name">只有个人简介</b><div class="AuthorInfo-headline"><div class="RichText">${bio}</div></div></div></article>`);
      for (const [scope, prose] of [['excerpt', '答'.repeat(76) + '…'], ['expanded', '全'.repeat(166)]] as const) {
        await page.locator('.RichContent-inner .RichText').evaluate((node, value) => { node.textContent = value; }, prose);
        if (scope === 'expanded') await page.locator('.RichContent').evaluate(node => { node.classList.remove('is-collapsed'); node.querySelector('button')?.remove(); });
        const rows = readableZhihuPosts(await page.evaluate(ZHIHU_READABLE_POSTS_SCRIPT));
        assert.equal(rows.length, 1, 'a profile biography alone cannot become a draggable answer');
        assert.equal(rows[0].author, '原作者'); assert.equal(rows[0].text, prose); assert.equal(rows[0].visibleScope, scope);
        assert.equal(rows[0].sourceUrl, 'https://www.zhihu.com/question/123456/answer/654321');
        const cloned = await createZhihuPageDocument(page, rows.map((row, index) => ({ id: `body-${index}`, ...row, excerpt: row.text, characters: row.text.length })));
        assert.equal((cloned.html.match(/data-redleaf-post=/g) || []).length, 1);
        assert.equal(await page.locator('#bio-only').getAttribute('data-redleaf-post'), null);
      }
    }
  } finally { await browser.close(); }
});

test('an article body keeps paragraphs around nested RichText and ignores its author headline', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('https://zhuanlan.zhihu.com/**', route => route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }));
    await page.goto('https://zhuanlan.zhihu.com/p/123456');
    await page.setContent('<article class="Post-Main"><h1 class="Post-Title">文章正文</h1><div class="AuthorInfo"><b class="AuthorInfo-name">作者</b><div class="AuthorInfo-headline RichText">金融牛马</div></div><div class="Post-RichText"><p>开头正文。</p><blockquote class="RichText">中间引用。</blockquote><p>结尾正文。</p></div></article>');
    const expected = await page.locator('.Post-RichText').innerText();
    const rows = readableZhihuPosts(await page.evaluate(ZHIHU_READABLE_POSTS_SCRIPT));
    assert.equal(rows.length, 1); assert.equal(rows[0].text, expected); assert.equal(rows[0].visibleScope, 'expanded');
    assert.ok(rows[0].text.includes('开头正文。')); assert.ok(rows[0].text.includes('结尾正文。')); assert.equal(rows[0].text.includes('金融牛马'), false);
  } finally { await browser.close(); }
});

test('answer body keeps surrounding paragraphs and sibling RichText blocks without reading controls', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('https://www.zhihu.com/**', route => route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }));
    await page.goto('https://www.zhihu.com/question/123456');
    await page.setContent('<h1 class="QuestionHeader-title">多段正文</h1><article class="AnswerItem" data-answer-id="654321"><div class="AuthorInfo"><b class="AuthorInfo-name">作者</b><div class="RichText AuthorInfo-headline">金融牛马</div></div><div class="RichContent"><div class="RichContent-inner"><p>开头正文包含收起这个词。</p><blockquote class="RichText">中间引用。</blockquote><div class="RichText">另一段正文。</div><p>结尾正文。</p><button style="color:red">收起</button></div></div></article>');
    const expected = await page.locator('.RichContent-inner').evaluate(node => {
      const control = node.querySelector('button')!;
      control.style.display = 'none';
      const text = (node as HTMLElement).innerText;
      control.style.removeProperty('display');
      return text;
    });
    const style = await page.locator('.RichContent-inner button').getAttribute('style');
    const rows = readableZhihuPosts(await page.evaluate(ZHIHU_READABLE_POSTS_SCRIPT));
    assert.equal(rows.length, 1); assert.equal(rows[0].text, expected); assert.equal(rows[0].visibleScope, 'expanded');
    assert.ok(rows[0].text.includes('开头正文包含收起这个词。')); assert.ok(rows[0].text.includes('另一段正文。')); assert.ok(rows[0].text.includes('结尾正文。'));
    assert.equal(await page.locator('.RichContent-inner button').getAttribute('style'), style, 'reading restores the original control style');
    assert.equal(await page.locator('.RichContent-inner button').isVisible(), true);
  } finally { await browser.close(); }
});
