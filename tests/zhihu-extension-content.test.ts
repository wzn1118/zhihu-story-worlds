import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

test('newly loaded recommendation cards are immediately draggable', { timeout: 30_000 }, async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  try {
    const page = await browser.newPage();
    await page.setContent('<main></main>');
    await page.addScriptTag({ content: 'window.chrome={runtime:{sendMessage:async()=>({ok:true})}};' });
    await page.addScriptTag({ content: await readFile('public/zhihu-liukan-extension/content.js', 'utf8') });
    const result = await page.evaluate(() => {
      const card = document.createElement('article'); card.className = 'AnswerItem';
      card.innerHTML = '<a href="https://www.zhihu.com/question/14561083975/answer/2067455568386823766">来源</a><span class="AuthorInfo-name">测试作者</span><div class="RichContent-inner"><div class="RichText">动态加载的推荐正文</div></div>';
      document.querySelector('main')!.append(card);
      card.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      const transfer = new DataTransfer();
      card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
      return { draggable: card.draggable, payload: transfer.getData('application/x-redleaf-zhihu') };
    });
    assert.equal(result.draggable, true);
    assert.match(result.payload, /动态加载的推荐正文/);
  } finally { await browser.close(); }
});
