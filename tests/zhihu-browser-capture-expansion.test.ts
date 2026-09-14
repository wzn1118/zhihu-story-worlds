import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright';
import { ZhihuBrowserService } from '../server/zhihu-browser.ts';
import { ZhihuDiscoveryService } from '../server/zhihu-discovery.ts';

const question = '20734757173969517000', answer = '20734757173969517491';
const sourceUrl = `https://www.zhihu.com/question/${question}/answer/${answer}`;
const excerpt = '这是测试用的原始回答节选。'.padEnd(76, '甲') + '…';
const full = '这是测试用的完整原文。\n\n保留作者在页面展示的段落。'.padEnd(166, '乙');

// Only website responses are fixtures. Chromium runs the site's real click
// handlers; the production browser capture and candidate store are exercised.
test('dragging an unexpanded answer waits for its own full text and matches expanded dragging', async t => {
  const root = await mkdtemp(join(tmpdir(), 'redleaf-expand-capture-'));
  const launch = chromium.launchPersistentContext;
  t.mock.method(chromium, 'launchPersistentContext', async (...args: Parameters<typeof chromium.launchPersistentContext>) => {
    const context = await launch.call(chromium, ...args);
    await context.route('**/*', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<h1 class="QuestionHeader-title">同一条回答的展开测试</h1>' }));
    return context;
  });
  const discovery = new ZhihuDiscoveryService(join(root, 'discovery'));
  const service = new ZhihuBrowserService(discovery, join(root, 'profile'), { defaultChannel: 'chromium', publicMode: true });
  const page = () => Reflect.get(service, 'page') as Page;
  const setAnswer = async (mode: 'async' | 'unchanged' | 'missing' | 'expanded' | 'css' | 'foreign-link') => {
    await page().setContent(`<style>.RichText{white-space:pre-wrap}</style><h1 class="QuestionHeader-title">同一条回答的展开测试</h1>
      <article id="neighbour" class="AnswerItem" data-answer-id="20734757173969517490"><b class="AuthorInfo-name">相邻作者</b>
        <div class="RichContent is-collapsed"><div class="RichContent-inner"><div class="RichText">不能误选相邻回答。<a href="${sourceUrl}">引用另一位作者</a></div></div><button class="ContentItem-more" onclick="window.wrongClicks=(window.wrongClicks||0)+1">阅读全文</button></div>
      </article>
      <article id="target" class="AnswerItem" data-zop='{"type":"answer","itemId":${answer},"authorName":"原作者"}'>
        <div class="AuthorInfo"><b class="AuthorInfo-name">原作者</b><div class="AuthorInfo-headline"><span class="RichText">金融牛马</span></div></div>
        <div class="RichContent${mode === 'expanded' ? '' : ' is-collapsed'}"><div class="RichContent-inner"><div class="RichText"></div></div>
        ${mode === 'missing' ? '' : mode === 'expanded' ? '<button>收起</button>' : mode === 'foreign-link' ? '<a class="ContentItem-more" href="https://www.zhihu.com/question/999999/answer/888888">阅读全文</a>' : '<button class="ContentItem-more">阅读全文</button>'}</div>
      </article>`);
    await page().evaluate(({ mode, excerpt, full }) => {
      const target = document.querySelector('#target')!, content = target.querySelector('.RichContent')!, rich = content.querySelector('.RichText')!;
      (window as unknown as { wrongClicks: number; nativeClicks: number }).wrongClicks = 0;
      (window as unknown as { nativeClicks: number }).nativeClicks = 0;
      rich.textContent = mode === 'expanded' || mode === 'css' ? full : excerpt;
      const button = target.querySelector('button.ContentItem-more');
      button?.addEventListener('click', event => {
        if (event.isTrusted) (window as unknown as { nativeClicks: number }).nativeClicks++;
        content.classList.remove('is-collapsed');
        button.remove();
        if (mode === 'unchanged') return;
        if (mode === 'css') { content.insertAdjacentHTML('beforeend', '<button>收起</button>'); return; }
        // The old excerpt remains after the collapsed class/control disappear.
        // Saving immediately on that DOM change was the reported regression.
        setTimeout(() => { rich.textContent = full; content.insertAdjacentHTML('beforeend', '<button>收起</button>'); }, 1100);
      });
    }, { mode, excerpt, full });
    Reflect.set(service, 'latest', undefined);
    const frame = await service.frame();
    const post = frame.posts.find(row => row.sourceUrl === sourceUrl)!;
    assert.ok(post);
    return { frame, post };
  };
  try {
    await service.open({ url: `https://www.zhihu.com/question/${question}` });
    await t.test('77-character collapsed drag saves 166 real expanded characters, including delayed text', async () => {
      assert.equal(excerpt.length, 77); assert.equal(full.length, 166);
      const collapsed = await setAnswer('async');
      assert.equal(collapsed.post.characters, 77); assert.equal(collapsed.post.visibleScope, 'excerpt');
      const first = await service.capture({ frameId: collapsed.frame.frameId, postId: collapsed.post.id });
      assert.equal(first.excerpt, full); assert.equal(first.characters, 166); assert.equal(first.origin.sourceUrl, sourceUrl);
      assert.equal(await page().evaluate(() => (window as unknown as { nativeClicks: number }).nativeClicks), 1);
      assert.equal(await page().evaluate(() => (window as unknown as { wrongClicks: number }).wrongClicks), 0);
      const expanded = await service.frame(), selected = expanded.posts.find(row => row.sourceUrl === sourceUrl)!;
      assert.equal(selected.visibleScope, 'expanded'); assert.equal(selected.characters, 166);
      const second = await service.capture({ frameId: expanded.frameId, postId: selected.id });
      assert.equal(first.id, second.id); assert.equal(first.sourceHash, second.sourceHash); assert.equal(second.excerpt, first.excerpt);
      assert.equal((await discovery.list()).candidates.length, 1);
      // Already expanded snapshots remain exact when remote prose later changes.
      await page().locator('#target .RichContent .RichText').evaluate(node => { node.textContent = '这段后来改动的内容不属于已选快照。'; });
      const unchanged = await service.capture({ frameId: expanded.frameId, postId: selected.id });
      assert.equal(unchanged.excerpt, full);
    });
    await t.test('old collapsed drag resolves the same answer already expanded by the user', async () => {
      const { frame, post } = await setAnswer('async');
      await page().locator('#target button').click();
      await page().waitForFunction(expected => document.querySelector('#target .RichContent .RichText')?.textContent === expected, full);
      const saved = await service.capture({ frameId: frame.frameId, postId: post.id });
      assert.equal(saved.excerpt, full);
      assert.equal(await page().evaluate(() => (window as unknown as { nativeClicks: number }).nativeClicks), 1, 'capture does not click 收起');
    });
    await t.test('CSS-only collapsed full prose waits for the native expanded completion control', async () => {
      const { frame, post } = await setAnswer('css');
      assert.equal(post.visibleScope, 'excerpt');
      const saved = await service.capture({ frameId: frame.frameId, postId: post.id });
      assert.equal(saved.excerpt, full);
    });
    await t.test('an expansion that never replaces its truncated text saves nothing', async () => {
      const before = (await discovery.list()).candidates.length;
      const { frame, post } = await setAnswer('unchanged');
      await assert.rejects(service.capture({ frameId: frame.frameId, postId: post.id }), { code: 'BROWSER_POST_EXPANSION_FAILED' });
      assert.equal((await discovery.list()).candidates.length, before);
    });
    await t.test('missing controls and an unrelated read-more destination never save another answer', async () => {
      for (const mode of ['missing', 'foreign-link'] as const) {
        const { frame, post } = await setAnswer(mode);
        await assert.rejects(service.capture({ frameId: frame.frameId, postId: post.id }), { code: 'BROWSER_POST_EXPANSION_FAILED' });
        assert.equal(page().url(), `https://www.zhihu.com/question/${question}`);
        assert.equal(await page().evaluate(() => (window as unknown as { wrongClicks: number }).wrongClicks), 0);
      }
    });
  } finally { await service.close(); await rm(root, { recursive: true, force: true }); }
});
