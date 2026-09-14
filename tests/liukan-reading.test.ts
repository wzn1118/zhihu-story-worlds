import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { LiukanInboxPost } from '../shared/liukan-inbox.ts';
import { createLiukanReadingRouter, LiukanReadingService, LIUKAN_READING_SKILLS, MAX_READING_CONTINUATION_DEPTH } from '../server/liukan/reading.ts';
import { callConfiguredLiukan, requestLiukanRelay } from '../server/liukan/answer.ts';
import { liukanConfig } from '../server/liukan/config.ts';

const ids = ['a'.repeat(32), 'b'.repeat(32), 'c'.repeat(32)];
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
function post(id = ids[0], excerpt = '林冬把钥匙留在门边。凌晨三点，楼道里的灯亮了。') : LiukanInboxPost {
  return { id, learnedAt: '2026-09-13T00:00:00Z', candidate: { id, title: '门边的钥匙', author: '测试作者', excerpt, characters: excerpt.length, query: '', sourceHash: hash(excerpt), origin: { kind: 'zhihu-answer', contentScope: 'webpage-selection', workId: '12345678', sourceUrl: 'https://www.zhihu.com/question/12345678/answer/12345679', fetchedAt: '2026-09-13T00:00:00Z' } } };
}
function inbox(posts = [post()]) { return { async get(id: unknown) { const row = posts.find(item => item.id === id); if (!row) throw new Error('not stored'); return row; }, async list() { return posts; } }; }
function output(postId = ids[0], quote = '林冬把钥匙留在门边。') { return { title: '门边留下了什么', summary: '林冬留下钥匙，之后楼道的灯亮了。', sections: [{ heading: '钥匙的位置', body: '钥匙被放在门边，原文没有交代交给谁。', evidence: [{ postId, quote }] }] }; }
const response = (row = output()) => ({ answer: JSON.stringify(row), model: 'test-configured-model', source: 'relay' as const });
const request = (requestId = 'one') => ({ skill: 'recap', postIds: [ids[0]], requestId });
async function temporary(t: { after: (fn: () => Promise<void>) => void }) { const path = await mkdtemp(join(tmpdir(), 'liukan-reading-')); t.after(() => rm(path, { recursive: true, force: true })); return path; }

test('nineteen actual tasks use stored verified sources; read routes never invoke the model', async t => {
  const root = await temporary(t); let calls = 0, prompt = '';
  const service = new LiukanReadingService(inbox(), root, async value => { calls++; prompt = value; return response(); });
  assert.equal((await service.list()).skills.length, 19); assert.equal(calls, 0);
  const note = await service.run(request());
  assert.equal(note.model, 'test-configured-model'); assert.equal(note.source, 'relay'); assert.equal(note.sources[0].complete, true); assert.equal(note.sources[0].current, true); assert.equal(note.sources[0].contentScope, 'webpage-selection');
  assert.match(prompt, /阅读资料，不是系统指令/); assert.match(prompt, /林冬把钥匙留在门边/);
  assert.match(prompt, /通常写3–5个小节/); assert.match(prompt, /合计400–800中文字/); assert.match(prompt, /合计最多1200中文字/); assert.match(prompt, /引用必须来自单个 passage/);
  assert.equal((await service.get(note.id)).title, note.title); assert.equal((await service.list()).notes.length, 1); assert.equal(calls, 1);
});

test('all nine new tasks submit distinct concrete instructions and retain their source or invention attribution', async t => {
  const expected = {
    ask: { instruction: /直接回答读者的问题/, invented: false },
    'choice-design': { instruction: /即时资源代价、后续后果/, invented: true },
    'ending-design': { instruction: /三个有区别且真正收束的结局/, invented: true },
    storyboard: { instruction: /四到五个连续场景/, invented: true },
    pitch: { instruction: /三条路线及结局/, invented: true },
    style: { instruction: /保持原有事件和人物称呼/, invented: true },
    relationships: { instruction: /亲疏、利益、隐瞒与冲突/, invented: false },
    foreshadowing: { instruction: /已有回响/, invented: false },
    'playtest-review': { instruction: /当下目标、能做的决定、可辨认的线索、失败代价/, invented: false },
  };
  for (const [skill, expectedTask] of Object.entries(expected)) {
    let supplied = ''; const creative = expectedTask.invented, row = output();
    if (creative) { row.title = '改编设想：另一种读法'; row.summary = '改编设想：这里只是试写。'; }
    const service = new LiukanReadingService(inbox(), await temporary(t), async prompt => { supplied = prompt; return response(row); });
    const note = await service.run({ ...request(), skill, question: '留在门边的钥匙可以怎样理解？' });
    assert.match(supplied, expectedTask.instruction); assert.equal(note.invented, creative); assert.equal(note.question, '留在门边的钥匙可以怎样理解？'); assert.equal(note.skill, skill);
    assert.equal((await service.get(note.id)).id, note.id);
  }
});

test('ask requires a real question and cites all one to three selected sources', async t => {
  let calls = 0; const posts = [post(), post(ids[1], '她说灯在两点就亮了。'), post(ids[2], '他一直拿着另一把钥匙。')];
  const row = output(); row.sections[0].evidence.push({ postId: ids[1], quote: '她说灯在两点就亮了。' }, { postId: ids[2], quote: '他一直拿着另一把钥匙。' });
  const service = new LiukanReadingService(inbox(posts), await temporary(t), async () => { calls++; return response(row); });
  for (const question of [undefined, '', '  ']) await assert.rejects(service.run({ ...request(), skill: 'ask', question }), { code: 'INVALID_READING_QUESTION' });
  assert.equal(calls, 0);
  const note = await service.run({ ...request(), skill: 'ask', postIds: [...ids].reverse(), question: '三篇中钥匙与灯有哪些区别？' });
  assert.equal(note.sources.length, 3); assert.deepEqual(note.sources.map(source => source.postId), ids);
  const bad = new LiukanReadingService(inbox(posts), await temporary(t), async () => response());
  await assert.rejects(bad.run({ ...request(), skill: 'ask', postIds: ids, question: '灯为何亮了？' }), { code: 'READING_INVALID_OUTPUT' });
  assert.equal(calls, 1);
});

test('continuation retrieves only saved parent context and has a distinct durable fingerprint', async t => {
  const root = await temporary(t); let calls = 0; const prompts: string[] = [];
  const answerer = async (prompt: string) => { calls++; prompts.push(prompt); return response(); };
  const service = new LiukanReadingService(inbox(), root, answerer);
  const parent = await service.run(request('parent'));
  const input = { ...request('continued'), skill: 'ask', question: '上次说不知道交给谁，能核对一下吗？', parentNoteId: parent.id };
  const child = await service.run(input);
  assert.equal(child.parentNoteId, parent.id); assert.equal(child.question, input.question);
  const payload = JSON.parse(prompts[1].slice(prompts[1].lastIndexOf('\n') + 1));
  assert.equal(payload.previousDiscussion.id, parent.id); assert.equal(payload.previousDiscussion.sections[0].body, parent.sections[0].body); assert.equal(payload.previousDiscussion.sections[0].evidence, undefined);
  assert.match(prompts[1], /不能引用上次手记正文来证明原文事实/);
  const repeated = await new LiukanReadingService(inbox(), root, answerer).run({ ...input, requestId: 'another-delivery' });
  assert.equal(repeated.id, child.id); assert.equal(calls, 2);
  const detached = await service.run({ ...input, requestId: 'without-parent', parentNoteId: undefined });
  assert.notEqual(detached.id, child.id); assert.equal(calls, 3);
  await assert.rejects(service.run({ ...input, requestId: 'client-prose', parentNote: { body: 'made up by caller' } }), { code: 'INVALID_READING_SKILL' });
  await assert.rejects(service.run({ ...input, requestId: 'invalid-parent', parentNoteId: '../notes' }), { code: 'INVALID_READING_PARENT' });
});

test('a saved invented parent does not turn its prose into source evidence', async t => {
  const root = await temporary(t); let calls = 0;
  const invented = output(); invented.title = '改编设想：守门的人'; invented.summary = '改编设想：这是新增的情节。'; invented.sections[0].body = '林冬把钥匙交给了来自月亮的守门人。';
  const service = new LiukanReadingService(inbox(), root, async () => { calls++; return calls === 1 ? response(invented) : response(output(ids[0], invented.sections[0].body)); });
  const parent = await service.run({ ...request('invented-parent'), skill: 'dialogue' });
  await assert.rejects(service.run({ ...request('follow-invented'), skill: 'ask', question: '守门人在原文里出现了吗？', parentNoteId: parent.id }), { code: 'READING_INVALID_OUTPUT' });
  assert.equal((await service.list()).notes.length, 1); assert.equal(calls, 2);
});

test('continuation requires identical source identities and current hashes before submission', async t => {
  const rows = [post(), post(ids[1], post().candidate.excerpt)]; let calls = 0;
  const service = new LiukanReadingService(inbox(rows), await temporary(t), async () => { calls++; return response(); });
  const parent = await service.run(request('parent'));
  const next = { ...request('next'), skill: 'ask', question: '钥匙还在吗？', parentNoteId: parent.id };
  await assert.rejects(service.run({ ...next, postIds: [ids[1]] }), { code: 'READING_PARENT_CHANGED' });
  rows[0] = post(ids[0], '原文已更新，钥匙被人拿走。');
  await assert.rejects(service.run({ ...next, requestId: 'changed-text' }), { code: 'READING_PARENT_CHANGED' });
  rows[0] = post(); rows[0].candidate.author = '另一位作者';
  await assert.rejects(service.run({ ...next, requestId: 'changed-author' }), { code: 'READING_PARENT_CHANGED' });
  assert.equal((await service.get(parent.id)).sources[0].current, false); assert.equal(calls, 1);
});

test('parent chains have a finite depth and remain readable as history when sources change', async t => {
  const rows = [post()]; let calls = 0;
  const service = new LiukanReadingService(inbox(rows), await temporary(t), async () => { calls++; return response(); });
  let parent = await service.run(request('root'));
  for (let depth = 1; depth <= MAX_READING_CONTINUATION_DEPTH; depth++) parent = await service.run({ ...request(`chain-${depth}`), skill: 'ask', question: `第${depth}次核对钥匙的位置。`, parentNoteId: parent.id });
  await assert.rejects(service.run({ ...request('too-deep'), skill: 'ask', question: '再继续核对。', parentNoteId: parent.id }), { code: 'READING_PARENT_DEPTH' });
  assert.equal(calls, MAX_READING_CONTINUATION_DEPTH + 1);
  rows[0] = post(ids[0], '更新后的原文。');
  assert.equal((await service.get(parent.id)).sources[0].current, false);
  assert.equal((await service.list()).notes.length, MAX_READING_CONTINUATION_DEPTH + 1);
});

test('parent edits and corrupt persisted optional fields are rejected on reads and continuation', async t => {
  const root = await temporary(t); let calls = 0;
  const service = new LiukanReadingService(inbox(), root, async () => { calls++; return response(); });
  const parent = await service.run(request('parent'));
  const child = await service.run({ ...request('child'), skill: 'ask', question: '留下了什么？', parentNoteId: parent.id });
  const childPath = join(root, 'notes', `${child.id}.json`), parentPath = join(root, 'notes', `${parent.id}.json`);
  await writeFile(childPath, JSON.stringify({ ...child, question: '替换了用户的问题。' }));
  await assert.rejects(service.get(child.id), { code: 'READING_NOTE_CHANGED' });
  await writeFile(childPath, JSON.stringify(child));
  await writeFile(parentPath, JSON.stringify({ ...parent, summary: '这是一段被修改但仍满足文本格式的内容。' }));
  await assert.rejects(service.get(child.id), { code: 'READING_NOTE_CHANGED' });
  await writeFile(parentPath, JSON.stringify({ ...parent, sections: [null] }));
  await assert.rejects(service.run({ ...request('bad-parent'), skill: 'ask', question: '它在哪里？', parentNoteId: parent.id }), { code: 'READING_NOTE_CHANGED' });
  assert.equal(calls, 2);
});

test('legacy notes and uncertain fingerprints stay compatible without adding optional fields to their identity', async t => {
  const root = await temporary(t); let calls = 0;
  const service = new LiukanReadingService(inbox(), root, async () => { calls++; return response(); });
  const note = await service.run({ ...request('legacy'), question: '旧版问题' });
  const input = JSON.parse(await readFile(join(root, 'attempts', note.id.slice(8), 'input.json'), 'utf8'));
  assert.deepEqual(Object.keys(input), ['version', 'skill', 'question', 'sources']); assert.equal(input.version, 1);
  const { question: _question, ...legacy } = note; await writeFile(join(root, 'notes', `${note.id}.json`), JSON.stringify(legacy));
  const loaded = await new LiukanReadingService(inbox(), root, async () => { calls++; return response(); }).run({ ...request('legacy-replay'), question: '旧版问题' });
  assert.equal(loaded.id, note.id); assert.equal(loaded.question, undefined); assert.equal(calls, 1);
  const unknownRoot = await temporary(t), unknown = new LiukanReadingService(inbox(), unknownRoot, async () => { calls++; throw new Error('unknown outcome'); });
  await assert.rejects(unknown.run(request('old-unknown')), { code: 'READING_UNKNOWN' });
  const oldAttempt = (await readdir(join(unknownRoot, 'attempts')))[0];
  await assert.rejects(new LiukanReadingService(inbox(), unknownRoot, async () => { calls++; return response(); }).run(request('new-delivery')), { code: 'READING_UNKNOWN' });
  assert.deepEqual(await readdir(join(unknownRoot, 'attempts')), [oldAttempt]); assert.equal(calls, 2);
});

test('reading gets its own 180-second relay timeout while ordinary chat stays at 60 seconds with the same model and reasoning', async t => {
  const configured = { transport: 'relay' as const, model: 'zhida-thinking-1p5', relay: { endpoint: 'https://reading-fixture.example/v1', model: 'configured-model', protocol: 'responses' as const, reasoning: 'high', apiKey: 'fixture-not-a-real-key' } };
  const timeouts: number[] = [], sent: Array<{ url: string; body: Record<string, unknown> }> = [];
  t.mock.method(liukanConfig, 'read', async () => structuredClone(configured));
  t.mock.method(AbortSignal, 'timeout', (timeoutMs: number) => { timeouts.push(timeoutMs); return new AbortController().signal; });
  t.mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: String(url), body: JSON.parse(init!.body as string) });
    return new Response(JSON.stringify({ model: 'configured-model', status: 'completed', output_text: JSON.stringify(output()) }));
  });
  const note = await new LiukanReadingService(inbox(), await temporary(t)).run(request());
  const chat = await callConfiguredLiukan('通常聊天', 'a-different-requested-model');
  assert.deepEqual(timeouts, [180_000, 60_000]); assert.equal(note.model, 'configured-model'); assert.equal(chat.model, 'configured-model');
  for (const call of sent) { assert.equal(call.url, 'https://reading-fixture.example/v1/responses'); assert.equal(call.body.model, 'configured-model'); assert.deepEqual(call.body.reasoning, { effort: 'high' }); assert.equal(call.body.stream, false); }
});

test('internal timeout override also preserves Chat Completions requests and rejects invalid values without submitting', async t => {
  const config = { endpoint: 'https://reading-fixture.example/v1', model: 'configured-model', protocol: 'chat-completions' as const, reasoning: 'high', apiKey: 'fixture-not-a-real-key' };
  const timeouts: number[] = []; let calls = 0;
  t.mock.method(AbortSignal, 'timeout', (timeoutMs: number) => { timeouts.push(timeoutMs); return new AbortController().signal; });
  const fetcher: typeof fetch = async (url, init) => {
    calls++; assert.equal(url, 'https://reading-fixture.example/v1/chat/completions'); const body = JSON.parse(init!.body as string);
    assert.equal(body.model, config.model); assert.equal(body.reasoning_effort, 'high');
    return new Response(JSON.stringify({ model: config.model, choices: [{ message: { content: '读完了。' }, finish_reason: 'stop' }] }));
  };
  await requestLiukanRelay(config, '普通问题', fetcher);
  await requestLiukanRelay(config, '阅读问题', fetcher, { timeoutMs: 180_000 });
  await assert.rejects(requestLiukanRelay(config, '错误选项', fetcher, { timeoutMs: 999 }), { code: 'INVALID_LIUKAN_TIMEOUT' });
  assert.deepEqual(timeouts, [60_000, 180_000]); assert.equal(calls, 2);
});

test('unknown IDs and malformed source/task input fail before upstream submission', async t => {
  let calls = 0; const service = new LiukanReadingService(inbox(), await temporary(t), async () => { calls++; return response(); });
  await assert.rejects(service.run({ ...request(), postIds: [ids[1]] }));
  await assert.rejects(service.run({ ...request(), sourceText: 'caller-controlled text' }), { code: 'INVALID_READING_SKILL' });
  await assert.rejects(service.run({ ...request(), skill: 'compare' }), { code: 'INVALID_READING_SOURCES' });
  await assert.rejects(service.run({ ...request(), requestId: '../../secret' }), { code: 'INVALID_READING_REQUEST' });
  await assert.rejects(service.run({ ...request(), question: 'x'.repeat(1001) }), { code: 'INVALID_READING_QUESTION' });
  assert.equal(calls, 0);
});

test('durable fingerprint reuse survives a new service and request ID changes are rejected', async t => {
  let calls = 0; const root = await temporary(t), answerer = async () => { calls++; return response(); };
  const first = await new LiukanReadingService(inbox(), root, answerer).run(request());
  const next = await new LiukanReadingService(inbox(), root, answerer).run(request('new-delivery'));
  assert.deepEqual(next, first); assert.equal(calls, 1);
  await assert.rejects(new LiukanReadingService(inbox(), root, answerer).run({ ...request(), question: '变了的问题' }), { code: 'READING_REQUEST_CHANGED' });
});

test('independent service instances share a filesystem submission claim', async t => {
  const root = await temporary(t); let calls = 0, release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let entered!: () => void; const started = new Promise<void>(resolve => { entered = resolve; });
  const answerer = async () => { calls++; entered(); await gate; return response(); };
  const a = new LiukanReadingService(inbox(), root, answerer), b = new LiukanReadingService(inbox(), root, answerer);
  const first = a.run(request()); await started;
  await assert.rejects(b.run(request('second-process')), { code: 'READING_RUNNING' });
  release(); const note = await first;
  assert.equal((await b.run(request('third-delivery'))).id, note.id); assert.equal(calls, 1);
});

test('simultaneous deliveries with exactly the same request ID share one outcome', async t => {
  let calls = 0;
  const service = new LiukanReadingService(inbox(), await temporary(t), async () => { calls++; return response(); });
  const [a, b, c] = await Promise.all([service.run(request()), service.run(request()), service.run(request())]);
  assert.deepEqual(a, b); assert.deepEqual(b, c); assert.equal(calls, 1);
});

test('a busy service does not submit a third distinct upstream request', async t => {
  let calls = 0; const releases: Array<() => void> = [];
  const service = new LiukanReadingService(inbox(), await temporary(t), async () => { calls++; await new Promise<void>(resolve => releases.push(resolve)); return response(); });
  const first = service.run({ ...request('first'), question: '第一个问题' });
  const second = service.run({ ...request('second'), question: '第二个问题' });
  while (calls < 2) await new Promise(resolve => setTimeout(resolve, 10));
  await assert.rejects(service.run({ ...request('third'), question: '第三个问题' }), { code: 'READING_BUSY' });
  releases.forEach(release => release()); await Promise.all([first, second]); assert.equal(calls, 2);
});

test('uncertain upstream outcomes survive restart and never auto-resubmit', async t => {
  const root = await temporary(t); let calls = 0;
  const answerer = async () => { calls++; throw new Error('timeout including private endpoint token'); };
  await assert.rejects(new LiukanReadingService(inbox(), root, answerer).run(request()), error => { assert.equal((error as { code: string }).code, 'READING_UNKNOWN'); assert.doesNotMatch((error as Error).message, /private endpoint token/); return true; });
  await assert.rejects(new LiukanReadingService(inbox(), root, answerer).run(request('new-delivery')), { code: 'READING_UNKNOWN' });
  const dirs = await readdir(join(root, 'attempts')); const state = JSON.parse(await readFile(join(root, 'attempts', dirs[0], 'attempt.json'), 'utf8'));
  assert.equal(state.status, 'unknown'); assert.equal(calls, 1);
});

test('orphaned durable claim is quarantined without model submission', async t => {
  const root = await temporary(t); let calls = 0;
  const first = new LiukanReadingService(inbox(), root, async () => { calls++; throw new Error('lost outcome'); });
  await assert.rejects(first.run(request()));
  const dir = join(root, 'attempts', (await readdir(join(root, 'attempts')))[0]);
  const file = join(dir, 'attempt.json'), attempt = JSON.parse(await readFile(file, 'utf8'));
  await writeFile(file, JSON.stringify({ ...attempt, status: 'running', pid: 2147483647 }));
  await assert.rejects(new LiukanReadingService(inbox(), root, async () => { calls++; return response(); }).run(request('after-crash')), { code: 'READING_UNKNOWN' });
  assert.equal(JSON.parse(await readFile(file, 'utf8')).status, 'unknown'); assert.equal(calls, 1);
});

test('invalid JSON, invented evidence, foreign post IDs and empty analytical evidence are not published', async t => {
  const invalid: unknown[] = [
    '```json\n' + JSON.stringify(output()) + '\n```',
    JSON.stringify(output(ids[0], '原文没有这句话。')),
    JSON.stringify(output(ids[1])),
    JSON.stringify({ ...output(), sections: [{ heading: '没有依据', body: '未经证实', evidence: [] }] }),
    JSON.stringify({ ...output(), execute: 'arbitrary code' }),
  ];
  for (const answer of invalid) {
    const root = await temporary(t); let calls = 0;
    const service = new LiukanReadingService(inbox(), root, async () => { calls++; return { ...response(), answer: answer as string }; });
    await assert.rejects(service.run(request()), { code: 'READING_INVALID_OUTPUT' });
    await assert.rejects(service.run(request('retry')), { code: 'READING_ATTEMPT_FAILED' });
    assert.equal((await service.list()).notes.length, 0); assert.equal(calls, 1);
    const dir = (await readdir(join(root, 'attempts')))[0];
    assert.equal(JSON.parse(await readFile(join(root, 'attempts', dir, 'reply.json'), 'utf8')).answer, answer);
  }
});

test('source changes are reported as stale without losing the original note or calling a model', async t => {
  const rows = [post()]; let calls = 0;
  const service = new LiukanReadingService(inbox(rows), await temporary(t), async () => { calls++; return response(); });
  const note = await service.run(request()); rows[0] = post(ids[0], '原文后来更新了。');
  const reloaded = await service.get(note.id);
  assert.equal(reloaded.sources[0].current, false); assert.equal(reloaded.sources[0].sourceHash, note.sources[0].sourceHash); assert.equal(calls, 1);
});

test('large excerpts stay within the shared context budget and skipped text cannot serve as evidence', async t => {
  const text = '林冬把钥匙留在门边。' + '甲'.repeat(16000) + '秘密只在这里。' + '乙'.repeat(16000);
  let supplied = '';
  const service = new LiukanReadingService(inbox([post(ids[0], text)]), await temporary(t), async prompt => { supplied = prompt; return response(); });
  const note = await service.run(request()); assert.equal(note.sources[0].complete, false);
  const data = JSON.parse(supplied.slice(supplied.lastIndexOf('\n') + 1));
  assert.ok(data.sources.flatMap((source: { passages: string[] }) => source.passages).join('').length <= 14000); assert.doesNotMatch(supplied, /秘密只在这里/);
  const bad = new LiukanReadingService(inbox([post(ids[0], text)]), await temporary(t), async () => response(output(ids[0], '秘密只在这里。')));
  await assert.rejects(bad.run(request()), { code: 'READING_INVALID_OUTPUT' });
  const focused = new LiukanReadingService(inbox([post(ids[0], text)]), await temporary(t), async () => response(output(ids[0], '秘密只在这里。')));
  const focusedNote = await focused.run({ ...request(), question: '秘密出现在哪里？' });
  assert.equal(focusedNote.sources[0].complete, false); assert.equal(focusedNote.sections[0].evidence[0].quote, '秘密只在这里。');
});

test('corrupt stored evidence and malformed sections never escape through read routes', async t => {
  const root = await temporary(t); let calls = 0;
  const service = new LiukanReadingService(inbox(), root, async () => { calls++; return response(); });
  const note = await service.run(request());
  const file = join(root, 'notes', `${note.id}.json`);
  await writeFile(file, JSON.stringify({ ...note, sections: [{ heading: '伪造的引用', body: '修改后的内容', evidence: [{ postId: ids[0], quote: '原文里没有这句话。' }] }] }));
  await assert.rejects(service.get(note.id), { code: 'READING_NOTE_CHANGED' });
  assert.equal((await service.list()).notes.length, 0);
  await writeFile(file, JSON.stringify({ ...note, sections: [null] }));
  await assert.rejects(service.get(note.id), { code: 'READING_NOTE_CHANGED' }); assert.equal(calls, 1);
});

test('comparisons cite every supplied source and preserve distinct source identities', async t => {
  const posts = [post(), post(ids[1], '她说灯在两点就亮了。')];
  const row = output(); row.sections.push({ heading: '另一篇的时间', body: '这一篇声称两点亮灯，和第一篇记述不同。', evidence: [{ postId: ids[1], quote: '她说灯在两点就亮了。' }] });
  const service = new LiukanReadingService(inbox(posts), await temporary(t), async () => response(row));
  assert.equal((await service.run({ ...request(), skill: 'compare', postIds: ids.slice(0, 2) })).sources.length, 2);
  const invalid = new LiukanReadingService(inbox(posts), await temporary(t), async () => response());
  await assert.rejects(invalid.run({ ...request(), skill: 'compare', postIds: ids.slice(0, 2) }), { code: 'READING_INVALID_OUTPUT' });
});

test('adaptation and dialogue remain explicitly invented and are never presented as original prose', async t => {
  for (const skill of ['adaptation', 'dialogue']) {
    const root = await temporary(t), row = output(); row.title = '改编设想：门边的钥匙'; row.summary = '改编设想：以下剧情和对白为试写。';
    const service = new LiukanReadingService(inbox(), root, async () => response(row));
    const note = await service.run({ ...request(), skill }); assert.equal(note.invented, true); assert.match(note.title, /^改编设想：/);
    const bad = new LiukanReadingService(inbox(), await temporary(t), async () => response());
    await assert.rejects(bad.run({ ...request(), skill }), { code: 'READING_INVALID_OUTPUT' });
  }
});

test('HTTP router exposes durable notes with standard errors and no generation on reads', async t => {
  let calls = 0; const source = inbox(), service = new LiukanReadingService(source, await temporary(t), async () => { calls++; return response(); });
  const app = express(); app.use(express.json()); app.use('/api/liukan/reading', createLiukanReadingRouter(source, service));
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/liukan/reading`;
  assert.equal((await (await fetch(url)).json()).skills.length, LIUKAN_READING_SKILLS.length); assert.equal(calls, 0);
  const created = await fetch(url + '/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request()) }); assert.equal(created.status, 200);
  const note = await created.json(); assert.equal((await fetch(url + '/' + note.id)).status, 200); assert.equal(calls, 1);
  const invalid = await fetch(url + '/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); assert.equal(invalid.status, 400); assert.equal((await invalid.json()).error.code, 'INVALID_READING_SKILL');
});
