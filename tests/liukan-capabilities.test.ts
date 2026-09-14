import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { LiukanConfigStore } from '../server/liukan/config.ts';
import { requestLiukanRelay } from '../server/liukan/answer.ts';
import { LiukanCapabilitiesService, capabilityArguments, normalizeCapabilityResult } from '../server/liukan/capabilities.ts';
import { LiukanGeneralChatService } from '../server/liukan/general-chat.ts';
import { createLiukanCapabilitiesRouter } from '../server/liukan/capabilities-router.ts';
import { LIUKAN_ABILITIES } from '../shared/liukan-capabilities.ts';

async function temporary(t: { after: (fn: () => Promise<void>) => void }) { const path = await mkdtemp(join(tmpdir(), 'liukan-capabilities-')); t.after(() => rm(path, { recursive: true, force: true })); return path; }
const fixtureKey = 'fixture-key-not-a-real-secret';
const relay = { endpoint: 'https://relay.example/v1', model: 'fixture-model', protocol: 'chat-completions' as const, apiKey: fixtureKey };

test('capability dispatch is a fixed bounded CLI argument list and private reads require the explicit flag', () => {
  assert.throws(() => capabilityArguments({ ability: 'shell', query: 'echo hello' }), { code: 'INVALID_ABILITY' });
  assert.throws(() => capabilityArguments({ ability: 'hot', args: ['upload'] }), { code: 'INVALID_ABILITY' });
  for (const ability of LIUKAN_ABILITIES.filter(row => row.private)) assert.throws(() => capabilityArguments({ ability: ability.id }), { code: 'ACCOUNT_ACCESS_REQUIRED' });
  const query = '冰岛; echo $TOKEN';
  assert.deepEqual(capabilityArguments({ ability: 'search-zhihu', query, limit: 1 }).args, ['search', 'zhihu', '--query', query, '--count', '1', '--offset', '0', '--limit', '1', '--timeout', '15s']);
  assert.throws(() => capabilityArguments({ ability: 'search-zhihu', query: '故事', limit: 31 }), { code: 'INVALID_PAGE' });
  assert.throws(() => capabilityArguments({ ability: 'knowledge-items', confirmPrivateAccess: true, baseId: '../../private' }), { code: 'INVALID_RESOURCE_ID' });
  assert.deepEqual(capabilityArguments({ ability: 'knowledge-search', query: '雨夜', confirmPrivateAccess: true, baseId: '7526139256098382426' }).args, ['knowledge', 'search', '--query', '雨夜', '--limit', '5', '--base-id', '7526139256098382426', '--timeout', '15s']);
});

test('normalizer preserves documented excerpts, nested authors, followee names and string pagination', () => {
  const result = normalizeCapabilityResult({ ability: 'favorites-recent', confirmPrivateAccess: true }, { Code: 0, Data: { Items: [{ Title: '雨夜', Summary: '<b>原摘要</b>', Author: { Name: '叶子' }, Url: 'https://www.zhihu.com/question/12345678' }], Paging: { IsEnd: false, NextOffset: '20' } } });
  assert.equal(result.items[0].text, '<b>原摘要</b>'); assert.equal(result.items[0].author, '叶子'); assert.equal(result.nextOffset, 20); assert.equal(result.scope, 'configured-account');
  const user = normalizeCapabilityResult({ ability: 'my-followees' }, { Code: 0, Data: { Items: [{ Fullname: '小叶', Headline: '爱读故事', Url: 'javascript:alert(1)' }] } });
  assert.equal(user.items[0].title, '小叶'); assert.equal(user.items[0].text, '爱读故事'); assert.equal(user.items[0].url, undefined);
  assert.throws(() => normalizeCapabilityResult({ ability: 'hot' }, { Code: 30001 }), { status: 429 });
});

test('normalizer accepts camelCase paging and advances full pages without a paging envelope', () => {
  const camel = normalizeCapabilityResult({ ability: 'hot', limit: 2, offset: 2 }, { Code: 0, Data: { Items: [{ Title: '一' }, { Title: '二' }], paging: { isEnd: false, nextOffset: '4' } } });
  assert.equal(camel.nextOffset, 4);
  const implicit = normalizeCapabilityResult({ ability: 'search-zhihu', query: '夜', limit: 2, offset: 4 }, { Code: 0, Data: { Items: [{ Title: '三' }, { Title: '四' }] } });
  assert.equal(implicit.nextOffset, 6);
});

test('knowledge chunks keep order and no raw unknown credential-shaped fields escape normalization', () => {
  const result = normalizeCapabilityResult({ ability: 'knowledge-search', query: '答案', confirmPrivateAccess: true }, { Code: 0, Data: { Items: [{ Title: '资料', Content: ['先读第一段', '再读第二段'], AccessSecret: fixtureKey, RecallContentID: '123456789' }] } });
  assert.equal(result.items[0].text, '先读第一段\n\n再读第二段'); assert.doesNotMatch(JSON.stringify(result), new RegExp(fixtureKey));
});

test('concurrent identical capability requests share one CLI child; changed request id conflicts', async () => {
  let calls = 0; let finish!: (raw: unknown) => void;
  const gate = new Promise(resolve => { finish = resolve; });
  const service = new LiukanCapabilitiesService(async () => { calls++; return gate; });
  const request = { ability: 'hot', requestId: 'one' };
  const a = service.run(request), b = service.run(request);
  await assert.rejects(service.run({ ...request, limit: 1 }), { code: 'REQUEST_CHANGED' });
  finish({ Code: 0, Data: { Items: [] } });
  assert.deepEqual(await a, await b); assert.equal(calls, 1);
});

test('independent relay settings persist but public config omits secrets and endpoint changes require a new key', async t => {
  const path = join(await temporary(t), 'config.json'), store = new LiukanConfigStore(path);
  assert.equal((await store.status()).transport, 'zhihu');
  const saved = await store.set({ transport: 'relay', relay });
  assert.equal(saved.relay?.hasKey, true); assert.doesNotMatch(JSON.stringify(saved), new RegExp(fixtureKey));
  assert.equal((await new LiukanConfigStore(path).status()).model, 'fixture-model');
  await store.set({ transport: 'relay', relay: { ...relay, apiKey: '', model: 'other-model' } });
  assert.equal((await store.read()).relay?.apiKey, fixtureKey);
  await assert.rejects(store.set({ transport: 'relay', relay: { ...relay, apiKey: '', endpoint: 'https://another.example/v1' } }), { code: 'INVALID_RELAY_CONFIG' });
  assert.equal((await store.status()).relay?.endpoint, relay.endpoint);
  await store.set({ transport: 'zhihu', model: 'zhida-thinking-1p5' });
  assert.equal((await store.status()).transport, 'zhihu');
});

test('chat-completion relay sends only selected model/config, accepts complete text and rejects error without leaking upstream body', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (input, init) => {
    calls++; assert.equal(input, 'https://relay.example/v1/chat/completions');
    const body = JSON.parse(init!.body as string); assert.equal(body.model, 'fixture-model'); assert.equal(body.stream, false); assert.equal(init?.redirect, 'error');
    return new Response(JSON.stringify({ model: 'fixture-model', choices: [{ message: { content: '先从工作台选一篇故事。' }, finish_reason: 'stop' }] }), { headers: { 'content-type': 'application/json' } });
  };
  const result = await requestLiukanRelay(relay, '怎么开始？', fetcher);
  assert.equal(result.source, 'relay'); assert.equal(calls, 1);
  await assert.rejects(requestLiukanRelay(relay, '问题', async () => new Response(JSON.stringify({ error: fixtureKey }), { status: 403 })), error => { assert.doesNotMatch((error as Error).message, new RegExp(fixtureKey)); return (error as { code: string }).code === 'LIUKAN_RELAY_HTTP'; });
  await assert.rejects(requestLiukanRelay(relay, '问题', async () => new Response(JSON.stringify({ choices: [{ message: { content: '半句' }, finish_reason: 'length' }] }))), { code: 'ZHIDA_INCOMPLETE' });
});

test('Responses relay requires completed state and extracts output text only', async () => {
  const config = { ...relay, protocol: 'responses' as const };
  const result = await requestLiukanRelay(config, '问题', async () => new Response(JSON.stringify({ status: 'completed', output: [{ content: [{ type: 'reasoning', text: 'private reasoning' }, { type: 'output_text', text: '可以先读一段故事。' }] }] })));
  assert.equal(result.answer, '可以先读一段故事。');
  await assert.rejects(requestLiukanRelay(config, '问题', async () => new Response(JSON.stringify({ status: 'incomplete', output_text: '一半' }))), { code: 'LIUKAN_RELAY_INCOMPLETE' });
});

test('general pet chat bounds history, does not fabricate progress, and deduplicates messages', async () => {
  let calls = 0; let received = '';
  const service = new LiukanGeneralChatService(async prompt => { calls++; received = prompt; return { answer: '先点“怎么开始”，我陪你看一遍。', model: 'fixture', source: 'relay' }; });
  const request = { question: '怎么开始', requestId: 'first' };
  const [a, b] = await Promise.all([service.chat(request), service.chat(request)]);
  assert.equal(calls, 1); assert.deepEqual(a, b); assert.equal(a.source, 'relay'); assert.match(received, /不要声称你已执行未调用的操作/);
  await assert.rejects(service.chat({ ...request, question: '新的问题' }), { code: 'REQUEST_CHANGED' });
  await assert.rejects(service.chat({ question: '怎么开始', conversation: Array.from({ length: 9 }, () => ({ role: 'user', content: 'hi' })) }), { code: 'INVALID_CONVERSATION' });
});

test('real HTTP router publishes sanitized config and only explicit run route executes the capability', async t => {
  const store = new LiukanConfigStore(join(await temporary(t), 'config.json')); let calls = 0;
  const service = new LiukanCapabilitiesService(async () => { calls++; return { Code: 0, Data: { Items: [] } }; });
  const app = express(); app.use(express.json()); app.use('/api/liukan', createLiukanCapabilitiesRouter(store, service, new LiukanGeneralChatService(async () => ({ answer: '你好。', model: 'fixture' }))));
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve)); t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/liukan`;
  assert.equal((await fetch(`${base}/capabilities`).then(r => r.json())).abilities.length, LIUKAN_ABILITIES.length);
  await fetch(`${base}/config`); assert.equal(calls, 0);
  const invalid = await fetch(`${base}/capabilities/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ability: 'my-followees' }) }); assert.equal(invalid.status, 400); assert.equal(calls, 0);
  const valid = await fetch(`${base}/capabilities/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ability: 'hot' }) }); assert.equal(valid.status, 200); assert.equal(calls, 1);
});
