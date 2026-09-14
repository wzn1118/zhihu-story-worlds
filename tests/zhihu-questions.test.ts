import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ZhihuQuestionsService, canonicalZhihuQuestion } from '../server/zhihu-questions.ts';
import { ZhihuDiscoveryService } from '../server/zhihu-discovery.ts';

const questionUrl = 'https://www.zhihu.com/question/2081163395638760993';
const answerId = '2082540998396268632';
const title = '官方接口集成测试问题';
const exact = '\uFEFF\r\n一字不改的接口节选。<script>仅作为文字</script>\r\n ';
const answer = { ContentType: 'answer', ContentToken: answerId, Url: `${questionUrl}/answer/${answerId}`, Summary: exact };
const hot = { Code: 0, Data: { Items: [{ Title: title, Url: questionUrl, Summary: '测试问题摘要', ThumbnailUrl: '' }] } };
function response(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } }); }
async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const root = await mkdtemp(join(tmpdir(), 'redleaf-question-answers-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
test('question URLs are canonical and never accept arbitrary upstream addresses or answers', () => {
  assert.equal(canonicalZhihuQuestion(`${questionUrl}/?utm_source=hot#answer`), questionUrl);
  for (const url of ['http://www.zhihu.com/question/123456', 'https://www.zhihu.com.evil.test/question/123456', 'https://x@www.zhihu.com/question/123456', 'https://www.zhihu.com:444/question/123456', `${questionUrl}/answer/${answerId}`, 'https://www.zhihu.com/api/v4/questions/123456']) assert.throws(() => canonicalZhihuQuestion(url), { code: 'INVALID_QUESTION_URL' });
});
test('official answers preserve exact short excerpts and identifiers, and save each authenticated account separately', async t => {
  const root = await fixture(t), a = new ZhihuDiscoveryService(join(root, 'alice')), b = new ZhihuDiscoveryService(join(root, 'bob'));
  const requests: { url: URL; init?: RequestInit }[] = [];
  const service = new ZhihuQuestionsService({ cacheRoot: null, accessSecret: 'fixture-secret', fetch: async (input, init) => {
    const url = new URL(String(input)); requests.push({ url, init });
    if (url.pathname.endsWith('/hot_list')) return response(hot);
    return response({ Code: 0, Data: { Items: [answer, { ...answer, ContentToken: '2082540998396268633', Url: `${questionUrl}/answer/2082540998396268633`, Summary: '短' }], Paging: { IsEnd: false, NextOffset: 20, Totals: 101 } } });
  } });
  const page = await service.questionAnswers(questionUrl, 0, a);
  assert.equal(page.title, title); assert.equal(page.candidates.length, 2);
  assert.deepEqual(page.paging, { isEnd: false, nextOffset: 20, totals: 101 });
  assert.equal(page.candidates[0].origin.workId, answerId);
  assert.equal(page.candidates[0].origin.contentScope, 'question-answer-excerpt');
  assert.equal(page.candidates[0].excerpt, exact);
  assert.equal(page.candidates[1].excerpt, '短');
  assert.equal((await a.source(page.candidates[0].id)).text, exact);
  await assert.rejects(b.source(page.candidates[0].id), { code: 'CANDIDATE_NOT_FOUND' });
  const secondAccountPage = await service.questionAnswers(questionUrl, 0, b);
  assert.equal(secondAccountPage.cached, true);
  assert.equal((await b.source(page.candidates[0].id)).text, exact);
  assert.equal(requests.length, 2);
  for (const { url, init } of requests) {
    assert.equal(url.origin, 'https://developer.zhihu.com');
    assert.equal(init?.redirect, 'error');
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('authorization'), 'Bearer fixture-secret');
    assert.equal(headers.has('cookie'), false); assert.equal(headers.has('x-oauth-token'), false);
  }
  assert.doesNotMatch(JSON.stringify(page), /fixture-secret/);
});
test('pagination uses returned offsets even on empty filtered pages and stops safely on malformed cursors', async t => {
  const root = await fixture(t), discovery = new ZhihuDiscoveryService(root), requestedOffsets: string[] = [];
  const pages = new Map([
    ['0', { Items: [], Paging: { IsEnd: false, NextOffset: 27 } }],
    ['27', { Items: [answer], Paging: { IsEnd: false } }],
    ['28', { Items: [answer], Paging: { IsEnd: false, NextOffset: 28 } }],
    ['29', { Items: [answer], Paging: { IsEnd: true } }],
  ]);
  const service = new ZhihuQuestionsService({ cacheRoot: null, accessSecret: 'fixture-secret', fetch: async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/hot_list')) return response(hot);
    const offset = url.searchParams.get('Offset')!; requestedOffsets.push(offset);
    return response({ Code: 0, Data: pages.get(offset) });
  } });
  const first = await service.questionAnswers(questionUrl, 0, discovery);
  assert.equal(first.candidates.length, 0); assert.deepEqual(first.paging, { isEnd: false, nextOffset: 27 });
  const second = await service.questionAnswers(questionUrl, first.paging.nextOffset, discovery);
  assert.equal(second.candidates.length, 1); assert.equal(second.paging.nextOffset, undefined); assert.match(second.warning!, /暂停翻页/);
  const repeated = await service.questionAnswers(questionUrl, 28, discovery);
  assert.equal(repeated.paging.nextOffset, undefined); assert.match(repeated.warning!, /暂停翻页/);
  const last = await service.questionAnswers(questionUrl, 29, discovery);
  assert.deepEqual(last.paging, { isEnd: true }); assert.equal(last.warning, undefined);
  assert.deepEqual(requestedOffsets, ['0', '27', '28', '29']);
});
test('answers cannot attach content to a different question, mismatched token, malicious URL or absent excerpt', async t => {
  const root = await fixture(t), discovery = new ZhihuDiscoveryService(root);
  const service = new ZhihuQuestionsService({ cacheRoot: null, accessSecret: 'fixture-secret', fetch: async input => {
    if (String(input).includes('/hot_list')) return response(hot);
    return response({ Code: 0, Data: { Items: [answer, answer,
      { ...answer, ContentToken: '2082540998396268633' },
      { ...answer, Url: `https://www.zhihu.com/question/999999/answer/${answerId}` },
      { ...answer, Url: 'https://evil.example' },
      { ...answer, Summary: '' }, { ...answer, Summary: '\u0000' },
    ], Paging: { IsEnd: true } } });
  } });
  const result = await service.questionAnswers(questionUrl, 0, discovery);
  assert.equal(result.candidates.length, 1); assert.equal(result.candidates[0].excerpt, exact);
});
test('long numeric token JSON is read losslessly and unsafe pagination numbers are never rounded', async t => {
  const root = await fixture(t), discovery = new ZhihuDiscoveryService(root);
  const service = new ZhihuQuestionsService({ cacheRoot: null, accessSecret: 'fixture-secret', fetch: async input => {
    if (String(input).includes('/hot_list')) return response(hot);
    const json = JSON.stringify({ Code: 0, Data: { Items: [answer], Paging: { IsEnd: false, NextOffset: '9223372036854775807' } } }).replace(`"ContentToken":"${answerId}"`, `"ContentToken":${answerId}`).replace('"NextOffset":"9223372036854775807"', '"NextOffset":9223372036854775807');
    return new Response(json, { headers: { 'Content-Type': 'application/json' } });
  } });
  const result = await service.questionAnswers(questionUrl, 0, discovery);
  assert.equal(result.candidates[0].origin.workId, answerId);
  assert.equal(result.paging.nextOffset, undefined); assert.ok(result.warning);
  await assert.rejects(service.questionAnswers(questionUrl, '9223372036854775807', discovery), { code: 'INVALID_QUESTION_OFFSET' });
});
test('provider auth, limits and malformed responses use safe errors and do not leak upstream content', async t => {
  const root = await fixture(t), discovery = new ZhihuDiscoveryService(root);
  for (const [code, expected] of [[20001, 'ZHIHU_QUESTIONS_AUTH_FAILED'], [30001, 'ZHIHU_QUESTIONS_RATE_LIMITED'], [30002, 'ZHIHU_QUESTIONS_RATE_LIMITED'], [30003, 'ZHIHU_QUESTIONS_RESTRICTED'], [10001, 'ZHIHU_QUESTION_UNAVAILABLE'], [90001, 'ZHIHU_QUESTIONS_FAILED']] as const) {
    const service = new ZhihuQuestionsService({ cacheRoot: null, accessSecret: 'fixture-secret', fetch: async () => response({ Code: code, Message: 'fixture-secret-upstream-private' }) });
    await assert.rejects(service.questionAnswers(questionUrl, 0, discovery), (error: any) => { assert.equal(error.code, expected); assert.doesNotMatch(error.message, /fixture-secret/); return true; });
  }
  const oversized = new ZhihuQuestionsService({ cacheRoot: null, accessSecret: 'fixture-secret', fetch: async () => new Response(' '.repeat(2 * 1024 * 1024 + 1)) });
  await assert.rejects(oversized.questionAnswers(questionUrl, 0, discovery), { code: 'ZHIHU_QUESTIONS_TOO_LARGE' });
});
test('concurrent accounts coalesce public upstream requests but independently receive saved selections', async t => {
  const root = await fixture(t); let calls = 0;
  const service = new ZhihuQuestionsService({ cacheRoot: null, accessSecret: 'fixture-secret', fetch: async input => {
    calls++; await new Promise(resolve => setTimeout(resolve, 15));
    return response(String(input).includes('/hot_list') ? hot : { Code: 0, Data: { Items: [answer], Paging: { IsEnd: true } } });
  } });
  const discoveryA = new ZhihuDiscoveryService(join(root, 'a')), discoveryB = new ZhihuDiscoveryService(join(root, 'b'));
  const [a, b] = await Promise.all([service.questionAnswers(questionUrl, 0, discoveryA), service.questionAnswers(questionUrl, 0, discoveryB)]);
  assert.equal(calls, 2); assert.equal(a.candidates[0].id, b.candidates[0].id);
  assert.equal((await discoveryA.source(a.candidates[0].id)).text, exact);
  assert.equal((await discoveryB.source(b.candidates[0].id)).text, exact);
});
test('public response caches survive restart and retain readable data when daily quota is unavailable', async t => {
  const root = await fixture(t), cacheRoot = join(root, 'public-cache'), discovery = new ZhihuDiscoveryService(join(root, 'discovery'));
  let now = Date.UTC(2026, 8, 14), calls = 0;
  const first = new ZhihuQuestionsService({ cacheRoot, now: () => now, accessSecret: 'fixture-secret', fetch: async input => {
    calls++;
    return response(String(input).includes('/hot_list') ? hot : { Code: 0, Data: { Items: [answer], Paging: { IsEnd: true } } });
  } });
  const page = await first.questionAnswers(questionUrl, 0, discovery); assert.equal(calls, 2);
  const restarted = new ZhihuQuestionsService({ cacheRoot, now: () => now, accessSecret: 'fixture-secret', fetch: async () => {
    calls++; return response({ Code: 30001, Message: 'quota exhausted' });
  } });
  const cached = await restarted.questionAnswers(questionUrl, 0, discovery);
  assert.equal(cached.cached, true); assert.equal(calls, 2); assert.equal(cached.candidates[0].id, page.candidates[0].id);
  now += 25 * 60 * 60_000;
  const stale = await restarted.questionAnswers(questionUrl, 0, discovery);
  assert.equal(stale.cached, true); assert.equal(stale.fetchedAt, page.fetchedAt); assert.equal(stale.title, title);
  assert.equal(calls, 4);
  await restarted.questionAnswers(questionUrl, 0, discovery); assert.equal(calls, 4);
});
