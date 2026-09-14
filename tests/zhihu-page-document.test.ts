import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser } from 'playwright';
import { createZhihuPageDocument } from '../server/zhihu-page-document.ts';
import type { ZhihuBrowserPost } from '../shared/zhihu-browser.ts';

let browser: Browser;
before(async () => {
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); });

const exactText = '老家在呼伦贝尔。\n\n36斤活羊到羊个子（放血、剥皮、去头蹄下水），大概20斤，剩16斤肉。';
const post: ZhihuBrowserPost = {
  id: 'real-id-from-backend', title: '商家称36斤活羊烤完变6.9斤正常吗？', author: '过期文青',
  sourceUrl: 'https://www.zhihu.com/question/12345678901234567890/answer/98765432109876543210', excerpt: exactText, characters: exactText.length,
};
async function fixture(html: string) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  await context.route('**/*', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
  const page = await context.newPage();
  await page.goto('https://www.zhihu.com/');
  return { context, page };
}

test('inert native document preserves answer text, local style and lossless homepage identity', async () => {
  const { context, page } = await fixture(`<!doctype html><style>.RichText{font-size:23px;color:rgb(12,34,56);white-space:pre-wrap}.ContentItem{width:640px;padding:20px}</style><main class="TopstoryItem"><article class="ContentItem" data-zop='{"type":"answer","itemId":98765432109876543210,"title":"商家称36斤活羊烤完变6.9斤正常吗？"}'><h2><a href="/question/12345678901234567890">问题</a></h2><div class="RichText">${exactText}</div><button>收起</button></article></main>`);
  try {
    const first = await createZhihuPageDocument(page, [post]);
    assert.equal(first.width, 1200); assert.equal(first.height, 800);
    const markup = first.html;
    assert.ok(markup.includes(exactText));
    assert.ok(markup.includes(`data-redleaf-post="${post.id}"`));
    const firstControl = await page.locator('button').getAttribute('data-redleaf-control');
    assert.ok(firstControl?.startsWith(`${first.id}-`));
    await page.setContent('<iframe sandbox="allow-same-origin"></iframe>');
    await page.locator('iframe').evaluate((element, html) => { (element as HTMLIFrameElement).srcdoc = html; }, markup);
    const frame = page.frames().find(value => value !== page.mainFrame())!;
    await frame.locator('.RichText').waitFor();
    assert.equal(await frame.locator('.RichText').textContent(), exactText);
    assert.equal(await frame.locator('.RichText').evaluate(element => getComputedStyle(element).fontSize), '23px');
    assert.equal(await frame.locator('.RichText').evaluate(element => { const range = document.createRange(); range.selectNodeContents(element); getSelection()!.removeAllRanges(); getSelection()!.addRange(range); return getSelection()!.toString(); }), exactText);
    assert.equal(await frame.locator('button').getAttribute('data-redleaf-control'), firstControl);
  } finally { await context.close(); }
});

test('document strips execution, token fields, live input values and outbound form transport', async () => {
  const { context, page } = await fixture('<!doctype html><h1>测试来源</h1>');
  try {
    await page.evaluate(() => {
      document.body.innerHTML = `<script type="application/json">{"access_token":"credential-json"}</script><meta http-equiv="refresh" content="3600;url=https://evil.invalid"><base href="https://evil.invalid"><iframe src="https://evil.invalid"></iframe><object data="https://evil.invalid"></object><div hidden>hidden-token</div><form action="https://evil.invalid" onsubmit="alert(1)"><input type="hidden" name="csrf-token" value="credential-hidden"><input value="credential-value" data-access-token="credential-data" autofocus><textarea>credential-textarea</textarea><button formaction="https://evil.invalid">发送</button></form><a href="javascript:alert(1)" onclick="alert(1)">不可执行</a><svg><use href="#logo"></use><set attributeName="href" to="javascript:alert(1)"></set></svg><div style="background:url(https://evil.invalid/pixel);behavior:url(x);color:red" data-state='{"secret":"credential-state"}'>保留这行原文</div>`;
      const style = document.createElement('style');
      style.textContent = '.original{background:url(https://evil.invalid/pixel)}'; document.head.append(style);
      document.querySelector('input:not([type=hidden])')!.setAttribute('data-redleaf-control', 'forged-control');
    });
    const result = await createZhihuPageDocument(page, []);
    for (const secret of ['credential-json', 'credential-hidden', 'credential-value', 'credential-data', 'credential-textarea', 'credential-state', 'hidden-token', 'forged-control', 'evil.invalid', 'javascript:', 'onsubmit=', 'onclick=', '<script', '<iframe', '<object', '<base', '<set ']) assert.ok(!result.html.includes(secret), secret);
    assert.ok(result.html.includes('保留这行原文'));
    assert.ok(result.html.includes("script-src 'none'"));
    assert.ok(result.html.includes("form-action 'none'"));
    assert.ok(result.html.includes('type="button"'));
    assert.ok(result.html.includes('href="#logo"'));
  } finally { await context.close(); }
});

test('each document replaces live control identities and only marks matching answer roots', async () => {
  const { context, page } = await fixture(`<!doctype html><article class="AnswerItem"><meta itemprop="url" content="${post.sourceUrl}?utm_source=share"><div class="RichText">${exactText}</div><button>展开</button></article><article class="AnswerItem"><meta itemprop="url" content="https://www.zhihu.com/question/12345/answer/67890"><p>另一篇</p></article>`);
  try {
    const first = await createZhihuPageDocument(page, [post]);
    const second = await createZhihuPageDocument(page, [post]);
    assert.notEqual(first.id, second.id);
    assert.ok(!(await page.locator('button').getAttribute('data-redleaf-control'))?.startsWith(first.id));
    assert.equal(await page.locator(`[data-redleaf-post="${post.id}"]`).count(), 1);
    assert.ok(second.html.includes(`${second.id}-`));
    assert.ok(!second.html.includes(`${first.id}-`));
  } finally { await context.close(); }
});

test('selected image source remains absolute with original layout and safe stylesheet links', async () => {
  const { context, page } = await fixture('<!doctype html><link rel="stylesheet" href="https://static.zhihu.com/site.css"><style>.cover{width:320px;height:180px}</style><img class="cover" width="320" height="180" src="data:image/png;base64,AA==" data-original="https://pic1.zhimg.com/original.png">');
  try {
    const result = await createZhihuPageDocument(page, []);
    assert.ok(result.html.includes('width="320" height="180"'));
    assert.ok(result.html.includes('.cover'));
    assert.ok(result.html.includes('referrerpolicy="no-referrer"'));
    assert.ok(result.html.includes('https://static.zhihu.com/site.css'));
    assert.ok(!result.html.includes('data-original'));
  } finally { await context.close(); }
});

test('live React mentions inside paragraphs round-trip without truncating RichText', async () => {
  const { context, page } = await fixture('<!doctype html><style>.mention{display:inline}p{margin:0 0 16px}</style><article class="AnswerItem"></article>');
  try {
    await page.locator('article').evaluate(root => {
      const rich = document.createElement('span'); rich.className = 'RichText ztext';
      const p = document.createElement('p'); p.append('我认同 ');
      const mention = document.createElement('div'); mention.className = 'mention'; mention.textContent = '@原作者';
      p.append(mention, ' 的答案。');
      const next = document.createElement('p'); next.textContent = '第二段也应留在原文中。';
      rich.append(p, next); root.append(rich);
    });
    const original = await page.locator('.RichText').innerText();
    const pageDocument = await createZhihuPageDocument(page, []);
    await page.setContent('<iframe sandbox="allow-same-origin"></iframe>');
    await page.locator('iframe').evaluate((element, html) => { (element as HTMLIFrameElement).srcdoc = html; }, pageDocument.html);
    const frame = page.frameLocator('iframe');
    assert.equal(await frame.locator('.RichText').innerText(), original);
    assert.equal(await frame.locator('.mention').evaluate(node => getComputedStyle(node).display), 'inline');
  } finally { await context.close(); }
});
