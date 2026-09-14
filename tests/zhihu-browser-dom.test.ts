import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { ZHIHU_READABLE_POSTS_SCRIPT, readableZhihuPosts } from '../server/zhihu-browser.ts';

test('homepage answer extraction chooses answer identity after question metadata and preserves visible text', async () => {
  const browser = await chromium.launch({ headless: true });
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
