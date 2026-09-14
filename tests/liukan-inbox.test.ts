import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import express from 'express';
import { LiukanInboxService, createLiukanInboxRouter, postReadingContext } from '../server/liukan/inbox.ts';
import { ZhihuDiscoveryService } from '../server/zhihu-discovery.ts';
import { StoryWorkshop, hashSource, writeJson } from '../server/story-workshop.ts';
import { LiukanError } from '../server/liukan/zhida.ts';
import type { LiukanInboxPost } from '../shared/liukan-inbox.ts';

// Synthetic source/answer fixtures verify the contract; these tests make no real
// search, Zhida, creative generation or image requests.
const exact = `\uFEFF\r\n${'叶子把红色钥匙塞进信封，约好晚饭后去桥边见哥哥。'.repeat(5)}\r\n<script>inert source text</script> `;
const selection = { title: '收件箱来源测试', author: '测试作者', text: exact, sourceUrl: 'https://www.zhihu.com/question/12345678/answer/87654321' };
type Answerer = (prompt: string, model: string) => Promise<{ answer: string; model: string }>;
async function fixture(t: { after: (fn: () => Promise<void>) => void }, answerer: Answerer = async () => { throw new Error('Unexpected model call'); }) {
  const root = await mkdtemp(join(tmpdir(), 'liukan-inbox-')); t.after(() => rm(root, { recursive: true, force: true }));
  const discovery = new ZhihuDiscoveryService(join(root, 'discovery'), async () => { throw new Error('Unexpected search'); });
  const workshop = new StoryWorkshop(join(root, 'workshop')), inboxRoot = join(root, 'inbox');
  const inbox = new LiukanInboxService(discovery, workshop, inboxRoot, answerer);
  return { discovery, workshop, inbox, inboxRoot };
}
function gate<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }

test('feeding verifies a persisted candidate, preserves exact source and survives reload without a model call', async t => {
  const { discovery, workshop, inbox, inboxRoot } = await fixture(t);
  await assert.rejects(inbox.learn('f'.repeat(32)), { code: 'CANDIDATE_NOT_FOUND' });
  await assert.rejects(inbox.learn('../private'), { code: 'INVALID_POST' });
  const candidate = await discovery.capturePage(selection);
  const copies = await Promise.all([inbox.learn(candidate.id), inbox.learn(candidate.id), inbox.learn(candidate.id)]);
  assert.deepEqual(copies[0], copies[1]); assert.deepEqual(copies[1], copies[2]);
  assert.equal(copies[0].candidate.excerpt, exact); assert.equal(copies[0].candidate.author, selection.author);
  assert.equal(copies[0].candidate.sourceHash, hashSource(await discovery.source(candidate.id)));
  assert.equal(copies[0].candidate.origin.contentScope, 'webpage-selection');
  const reloaded = new LiukanInboxService(discovery, workshop, inboxRoot);
  assert.deepEqual(await reloaded.learn(candidate.id), copies[0]);
  const refreshed = await discovery.capturePage(selection);
  assert.equal(refreshed.id, candidate.id);
  assert.deepEqual(await reloaded.learn(refreshed.id), copies[0]);
  assert.equal((await reloaded.list()).length, 1); assert.equal((await workshop.list()).length, 0);
});

test('altered title, origin, identity and corrupt local JSON are rejected before answering or generation', async t => {
  let calls = 0;
  const { discovery, inbox, inboxRoot } = await fixture(t, async () => { calls++; return { answer: 'fixture', model: 'fixture' }; });
  const candidate = await discovery.capturePage(selection), post = await inbox.learn(candidate.id), path = join(inboxRoot, `${post.id}.json`);
  for (const changed of [
    { ...post, candidate: { ...post.candidate, title: 'forged title' } },
    { ...post, candidate: { ...post.candidate, origin: { ...post.candidate.origin, sourceUrl: 'https://www.zhihu.com/question/12345678/answer/11111111' } } },
    { ...post, candidate: { ...post.candidate, id: 'a'.repeat(32) } },
  ] satisfies LiukanInboxPost[]) {
    await writeJson(path, changed);
    await assert.rejects(inbox.get(post.id), { code: 'POST_CHANGED' });
    await assert.rejects(inbox.chat(post.id, { question: '钥匙在哪？' }), { code: 'POST_CHANGED' });
  }
  await writeFile(path, '{broken');
  await assert.rejects(inbox.learn(post.id), { code: 'POST_CHANGED' });
  assert.equal(calls, 0);
});

test('long-source retrieval finds question-specific later passages and states incomplete coverage', () => {
  const text = '大雨下了一夜。'.repeat(7000) + '叶子把红色钥匙交给哥哥，哥哥藏进蓝色信箱。' + '钟声响了。'.repeat(6000);
  const reading = postReadingContext(text, '红色钥匙最后放哪了？');
  assert.equal(reading.complete, false); assert.ok(reading.text.includes('哥哥藏进蓝色信箱'));
  assert.ok(reading.text.length <= 14500);
  assert.equal(postReadingContext(exact, '钥匙').text, exact);
  assert.equal(postReadingContext(exact, '钥匙').complete, true);
  assert.ok(postReadingContext(text, '红色钥匙最后放哪了？', 2400).text.includes('哥哥藏进蓝色信箱'));
});

test('concurrent repeated messages share one answer and changed active/cached request IDs are rejected', async t => {
  const entered = gate<void>(), release = gate<{ answer: string; model: string }>(); let calls = 0, prompt = '';
  const { discovery, inbox } = await fixture(t, async (input, model) => { calls++; prompt = input; assert.equal(model, 'zhida-fast-1p5'); entered.resolve(); return release.promise; });
  const post = await inbox.learn((await discovery.capturePage(selection)).id), request = { question: '叶子把钥匙放哪里？', requestId: 'same-message' };
  const first = inbox.chat(post.id, request); await entered.promise;
  const duplicate = inbox.chat(post.id, request);
  await assert.rejects(inbox.chat(post.id, { ...request, question: '哥哥去了哪里？' }), { code: 'REQUEST_CHANGED' });
  release.resolve({ answer: '模拟直答：叶子把钥匙塞进了信封。', model: 'mock-zhida' });
  const replies = await Promise.all([first, duplicate]); assert.equal(calls, 1); assert.deepEqual(replies[0], replies[1]);
  assert.equal(replies[0].answer, '模拟直答：叶子把钥匙塞进了信封。'); assert.equal(replies[0].model, 'mock-zhida');
  assert.equal(replies[0].source, 'zhihu-zhida'); assert.equal(replies[0].postId, post.id); assert.ok(Number.isFinite(Date.parse(replies[0].answeredAt)));
  assert.ok(prompt.includes('检索出的阅读资料')); assert.ok(prompt.includes('不要声称看过完整原作、经过训练'));
  const data = JSON.parse(prompt.split('\n阅读资料：\n')[1]); assert.equal(data.reading.text, exact); assert.equal(data.sourceUrl, selection.sourceUrl);
  assert.deepEqual(await inbox.chat(post.id, request), replies[0]); assert.equal(calls, 1);
  await assert.rejects(inbox.chat(post.id, { ...request, question: '另一个问题' }), { code: 'REQUEST_CHANGED' });
});

test('escaped long text stays within the CLI input limit without discarding the relevant clue', async t => {
  let prompt = '';
  const { discovery, inbox } = await fixture(t, async input => { prompt = input; return { answer: '模拟回复', model: 'mock' }; });
  const text = '\"\\\n'.repeat(9000) + '那把橙色钥匙藏在旧钟里。' + '\"\\\n'.repeat(9000);
  const post = await inbox.learn((await discovery.capturePage({ ...selection, text })).id);
  await inbox.chat(post.id, { question: '橙色钥匙藏在哪？', conversation: Array.from({ length: 8 }, () => ({ role: 'user', content: '\"\\'.repeat(8000) })) });
  assert.ok(prompt.length < 22000);
  assert.ok(prompt.replace(/["\\]/g, '\\$&').length < 28000);
  const payload = JSON.parse(prompt.split('\n阅读资料：\n')[1]);
  assert.equal(payload.reading.complete, false); assert.ok(payload.reading.text.includes('橙色钥匙藏在旧钟里'));
});

test('provider failure and malformed output are visible, with no automatic replay or fake success', async t => {
  let calls = 0;
  const { discovery, inbox } = await fixture(t, async () => { calls++; if (calls === 1) throw new LiukanError('ZHIDA_TIMEOUT', 'fixture timeout', 504); return { answer: '', model: 'fixture' }; });
  const post = await inbox.learn((await discovery.capturePage(selection)).id);
  await assert.rejects(inbox.chat(post.id, { question: '钥匙在哪？', requestId: 'first' }), { code: 'ZHIDA_TIMEOUT' }); assert.equal(calls, 1);
  await assert.rejects(inbox.chat(post.id, { question: '钥匙在哪？', requestId: 'retry' }), { code: 'ZHIDA_INVALID_RESPONSE' }); assert.equal(calls, 2);
  await assert.rejects(inbox.chat(post.id, { question: '坏\u0000问题' }), { code: 'INVALID_QUESTION' });
});

test('repeat game requests reuse a single imported project and leave an existing worker untouched', async t => {
  const { discovery, workshop, inbox, inboxRoot } = await fixture(t);
  let starts = 0;
  workshop.generate = async id => {
    starts++; const project = await workshop.get(id); project.status = 'running'; project.jobId = 'fixture-existing-worker'; project.stage = 'outline';
    const lock = join(workshop.dir(id), 'job.lock'); await mkdir(lock, { recursive: true });
    await writeJson(join(lock, 'owner.json'), { token: project.jobId, pid: process.pid, heartbeat: new Date().toISOString() });
    await workshop.save(project); return project;
  };
  const post = await inbox.learn((await discovery.capturePage(selection)).id);
  const projects = await Promise.all([inbox.generate(post.id), inbox.generate(post.id)]);
  assert.equal(starts, 1); assert.equal(projects[0].id, projects[1].id);
  const reloaded = new LiukanInboxService(discovery, workshop, inboxRoot);
  const running = await reloaded.generate(post.id);
  assert.equal(starts, 1); assert.equal(running.jobId, 'fixture-existing-worker');
  assert.equal((await reloaded.get(post.id)).projectId, running.id); assert.equal((await workshop.list()).length, 1);
  assert.equal((await workshop.source(running.id)).text, exact);
  const ready = await workshop.get(running.id); ready.status = 'ready'; ready.playable = true; await workshop.save(ready);
  assert.equal((await reloaded.generate(post.id)).id, running.id); assert.equal(starts, 1);
});

test('HTTP inbox ignores client replacement prose and exposes an answer from the injected provider', async t => {
  const { discovery, workshop, inbox } = await fixture(t, async () => ({ answer: '接口模拟回复', model: 'mock' }));
  const candidate = await discovery.capturePage(selection), app = express(); app.use(express.json()); app.use('/api/liukan/inbox', createLiukanInboxRouter(discovery, workshop, inbox));
  const server = createServer(app); await new Promise<void>(yes => server.listen(0, '127.0.0.1', yes)); t.after(() => new Promise<void>(yes => server.close(() => yes())));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/liukan/inbox`;
  const post = (path: string, data: unknown) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
  const learned = await post('', { candidateId: candidate.id, text: 'client replacement' }); assert.equal(learned.status, 201); assert.equal((await learned.json()).candidate.excerpt, exact);
  const answered = await post(`/${candidate.id}/chat`, { question: '钥匙在哪？' }); assert.equal(answered.status, 200); assert.equal((await answered.json()).answer, '接口模拟回复');
  assert.equal((await post(`/${'f'.repeat(32)}/chat`, { question: 'unknown' })).status, 404);
});
