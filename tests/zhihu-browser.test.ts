import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { readableZhihuPosts, zhihuBrowserUrl, ZhihuBrowserService, isZhihuBlockedPage } from '../server/zhihu-browser.ts';

test('a real answer mentioning Forbidden Army remains readable', () => {
  assert.equal(isZhihuBlockedPage(200, '为什么《战锤》在中国推广不开？禁军 = Forbidden Army', 1), false);
  assert.equal(isZhihuBlockedPage(200, '访问受限是本文讨论的话题', 1), false);
  assert.equal(isZhihuBlockedPage(403, 'Forbidden', 0), true);
  assert.equal(isZhihuBlockedPage(200, '请求存在异常，请稍后再试', 0), true);
});

test('embedded browser top-level navigation stays inside HTTPS Zhihu pages', () => {
  assert.equal(zhihuBrowserUrl('https://www.zhihu.com/search?q=%E6%82%AC%E7%96%91'), 'https://www.zhihu.com/search?q=%E6%82%AC%E7%96%91');
  for (const url of ['https://www.zhihu.com.evil.test/', 'http://www.zhihu.com/', 'https://user@www.zhihu.com/', 'https://www.zhihu.com:8443/', 'https://127.0.0.1/', 'file:///C:/private', 'javascript:alert(1)']) assert.throws(() => zhihuBrowserUrl(url));
});

test('browser posts retain exact readable text and require real answer/article identity', () => {
  const original = '第一段，门外有脚步声。\n\n' + '那一晚，我在值班室看见七秒后的自己。'.repeat(8);
  const post = { title: '那七秒发生了什么', author: '原作者', sourceUrl: 'https://www.zhihu.com/question/123456/answer/654321?utm_source=share', text: original };
  const result = readableZhihuPosts([post, post, { ...post, sourceUrl: 'https://www.zhihu.com/question/123456' }, { ...post, author: '' }]);
  assert.equal(result.length, 1); assert.equal(result[0].text, original); assert.equal(result[0].sourceUrl, 'https://www.zhihu.com/question/123456/answer/654321');
});

test('frame and close remain lazy and reject interaction before explicit opening', async () => {
  const profile = join(tmpdir(), `redleaf-zhihu-unopened-${randomUUID()}`);
  const service = new ZhihuBrowserService(undefined, profile);
  assert.equal((await service.frame()).status, 'closed');
  await assert.rejects(service.action({ kind: 'reload' }), { code: 'BROWSER_CLOSED' });
  assert.equal((await service.close()).status, 'closed');
  await assert.rejects(access(profile));
});

test('simultaneous frame readers share one capture and recover after a capture failure', async () => {
  const service = new ZhihuBrowserService();
  let captures = 0, failNext = false;
  // This transport fixture exercises scheduling only; its bytes are not an illustration.
  const page = {
    isClosed: () => false, viewportSize: () => ({ width: 1100, height: 720 }),
    locator: () => ({ innerText: async () => '', count: async () => 0 }),
    evaluate: async () => [], url: () => 'https://www.zhihu.com/signin', title: async () => '知乎登录',
    context: () => ({ newCDPSession: async () => ({ send: async () => { captures++; if (failNext) { failNext = false; throw new Error('renderer stopped'); } return { data: 'transport-fixture' }; }, detach: async () => {} }) }),
  };
  Reflect.set(service, 'page', page);
  const [first, same] = await Promise.all([service.frame(), service.frame()]);
  assert.equal(captures, 1); assert.equal(first.frameId, same.frameId);
  failNext = true;
  await assert.rejects(service.frame(), { code: 'BROWSER_FRAME_TIMEOUT' });
  const recovered = await service.frame();
  assert.equal(captures, 3); assert.notEqual(first.frameId, recovered.frameId);
});

test('a second service leaves a live profile owner untouched', async () => {
  const profile = join(tmpdir(), `redleaf-zhihu-profile-owner-${randomUUID()}`);
  await mkdir(profile);
  const lock = join(profile, 'redleaf-owner.json');
  const record = JSON.stringify({ pid: process.pid, token: randomUUID() });
  await writeFile(lock, record);
  const service = new ZhihuBrowserService(undefined, profile);
  try {
    await assert.rejects(service.open(), { code: 'BROWSER_IN_USE' });
    await service.close();
    assert.equal(await readFile(lock, 'utf8'), record);
  } finally { await rm(profile, { recursive: true, force: true }); }
});

test('native frame readers keep the displayed document and control identities stable', async () => {
  const service = new ZhihuBrowserService();
  const frame = { status: 'ready', frameId: randomUUID(), posts: [{ id: 'selected-source' }], document: { id: randomUUID(), html: '<p>正文</p>' } };
  Reflect.set(service, 'latest', frame);
  Reflect.set(service, 'snapshot', () => { throw new Error('a passive read rebuilt the document'); });
  const [first, second] = await Promise.all([service.frame(), service.frame()]);
  assert.equal(first, frame); assert.equal(second, frame);
});

test('an initial empty document can refresh after the live page finishes loading', async () => {
  const service = new ZhihuBrowserService();
  Reflect.set(service, 'page', {});
  Reflect.set(service, 'latest', { document: { id: randomUUID() }, posts: [] });
  let refreshed = 0;
  Reflect.set(service, 'snapshot', async () => { refreshed++; return { posts: [{ id: 'loaded' }] }; });
  const frame = await service.frame();
  assert.equal(refreshed, 1); assert.equal(frame.posts[0].id, 'loaded');
});

test('dragging a displayed snapshot preserves exact text after another answer changes', async () => {
  const original = { title: '七秒', author: '原作者', sourceUrl: 'https://www.zhihu.com/question/123456/answer/654321', text: '第一段。\n\n第二段，保留空行。', visibleScope: 'expanded' };
  let saved: unknown;
  const service = new ZhihuBrowserService({ capturePage: async (post: unknown) => { saved = post; return post; } } as never);
  const frameId = randomUUID(), postId = 'displayed-source-id';
  Reflect.set(service, 'page', { isClosed: () => false });
  Reflect.set(service, 'documents', new Map([[frameId, new Set([postId])]]));
  Reflect.set(service, 'capturedPosts', new Map([[postId, original]]));
  Reflect.set(service, 'extract', () => { throw new Error('drag must not re-fetch changed remote content'); });
  await service.capture({ frameId, postId });
  assert.equal(saved, original);
  await assert.rejects(service.capture({ frameId: randomUUID(), postId }), { code: 'STALE_BROWSER_POST' });
  await assert.rejects(service.capture({ frameId, postId: 'forged-source' }), { code: 'STALE_BROWSER_POST' });
});
