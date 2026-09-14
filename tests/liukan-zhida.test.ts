import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Compiler } from 'inkjs/full';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { LiukanZhidaService, parseZhidaResponse, promptFor, replay } from '../server/liukan/zhida.ts';
import { LiukanMemoryStore } from '../server/liukan/memory.ts';
import { createLiukanRouter } from '../server/liukan/router.ts';
import type { GameWorld } from '../shared/types.ts';

function world(): GameWorld {
  const base = { id: 'start', chapter: '第一章', title: '入口', location: '走廊', time: '夜', background: '', text: ['门后传来一声轻响。'], choices: [{ id: 'open', text: '推门', nextNodeId: 'end' }] } as const;
  const end = { id: 'end', chapter: '第一章', title: '回声', location: '门后', time: '夜', background: '', text: ['你看见一盏亮着的灯。'], choices: [], ending: { title: '灯下', text: '结束', tone: 'hopeful' as const } };
  const nodes = { start: base, end } as unknown as GameWorld['nodes'];
  const lines = ['VAR resolve = 50', 'VAR trust = 30', '-> start', '', '=== start ===', '# node:start', '门后传来一声轻响。', '* [推门 # choice:open]', '  -> end', '', '=== end ===', '# node:end', '你看见一盏亮着的灯。', '# ending:end', '-> END'];
  const compiled = new Compiler(lines.join('\n')).Compile().ToJson();
  assert.equal(typeof compiled, 'string');
  const ink = JSON.parse(compiled as string) as Record<string, unknown>;
  return { id: 'test-world', storyId: '123456789', title: '测试', subtitle: '', introduction: [], player: { name: '我', role: '调查者' }, objective: '', startNodeId: 'start', nodes, characters: [], source: { title: '测试', author: '本地', url: '' }, version: '1', cover: '', background: '', summary: '', ink, clueVariables: {}, adaptation: { scope: 'original-seed', adultCast: true, note: '' } };
}

test('replay only exposes visited scenes and rejects divergent history', () => {
  const result = replay(world(), []);
  assert.equal(result.length, 1); assert.equal(result[0].nodeId, 'start');
  assert.throws(() => replay(world(), [{ nodeId: 'start', choiceId: 'future' }]));
});

test('recall injects bounded visited context and persists completion memory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'liukan-'));
  const memory = new LiukanMemoryStore(root);
  let received = '';
  const service = new LiukanZhidaService(() => world(), memory, async (prompt, model) => { received = prompt; return { answer: '只看到入口。', model }; });
  const first = await service.recall({ storyId: '123456789', worldId: 'test-world', question: '我走到哪了？', history: [] });
  assert.equal(first.answer, '只看到入口。'); assert.match(received, /入口/); assert.doesNotMatch(received, /灯下/);
  await assert.rejects(service.remember({ playerId: 'player', storyId: '123456789', worldId: 'test-world', history: [] }), { code: 'ENDING_NOT_REACHED' });
  const completed = await service.remember({ playerId: 'player', storyId: '123456789', worldId: 'test-world', history: [{ nodeId: 'start', choiceId: 'open' }] });
  assert.equal(completed.length, 1); assert.match(await readFile(join(root, 'player.json'), 'utf8'), /灯下/);
});

test('promptFor trims conversation and includes only completion records', () => {
  const text = promptFor({ storyId: '123456789', worldId: 'test-world', question: '提示', history: [], conversation: Array.from({ length: 12 }, (_, i) => ({ role: 'user' as const, content: `${i}` })) }, { worldId: 'test-world', visited: [], completed: [{ storyId: '123456789', worldId: 'test-world', worldVersion: '1', title: '测试', endingTitle: '灯下', completedAt: '2026-01-01', scenes: [] }] });
  assert.match(text, /灯下/); assert.doesNotMatch(text, /"content":"0"/); assert.match(text, /"content":"11"/);
});

test('identical concurrent chats invoke the real adapter once and changed request IDs conflict', async () => {
  const root = await mkdtemp(join(tmpdir(), 'liukan-'));
  let calls = 0;
  const service = new LiukanZhidaService(() => world(), new LiukanMemoryStore(root), async (_prompt, model) => { calls++; await new Promise(resolve => setTimeout(resolve, 10)); return { answer: '入口有一扇门。', model }; });
  const request = { requestId: 'chat-1', storyId: '123456789', worldId: 'test-world', question: '这是什么地方？', history: [] };
  const [a, b] = await Promise.all([service.recall(request), service.recall(request)]);
  assert.deepEqual(a, b); assert.equal(calls, 1);
  await assert.rejects(service.recall({ ...request, question: '更换问题' }), { code: 'REQUEST_CHANGED' });
});

test('CLI response parser never exposes reasoning and rejects incomplete text', () => {
  assert.deepEqual(parseZhidaResponse({ model: 'zhida-fast-1p5', choices: [{ message: { content: '已到入口。', reasoning_content: 'hidden' }, finish_reason: 'stop' }] }, 'zhida-fast-1p5'), { answer: '已到入口。', model: 'zhida-fast-1p5' });
  assert.throws(() => parseZhidaResponse({ choices: [{ message: { content: '半句' }, finish_reason: 'length' }] }, 'zhida-fast-1p5'), { code: 'ZHIDA_INCOMPLETE' });
});

test('current unread paragraphs and depleted resource choices stay out of recall', () => {
  const game = world();
  game.nodes.start.text.push('下一段才出现的隐藏号码。');
  game.nodes.start.choices.push({ id: 'spend', text: '花一格电量', nextNodeId: 'end', effects: { resources: { battery: -1 } } });
  game.resources = [{ id: 'battery', label: '电量', initial: 0, min: 0, max: 2, description: '开灯要电量' }];
  const lines = ['VAR resolve = 50', 'VAR trust = 30', 'VAR resource_battery = 0', '-> start', '=== start ===', '# node:start', ...game.nodes.start.text, '* [推门 # choice:open]', ' -> end', '* {resource_battery >= 1} [花一格电量 # choice:spend]', ' ~ resource_battery = resource_battery - 1', ' -> end', '=== end ===', '# node:end', '灯亮了。', '-> END'];
  game.ink = JSON.parse(new Compiler(lines.join('\n')).Compile().ToJson() as string);
  const initial = replay(game, []);
  assert.doesNotMatch(initial[0].text, /隐藏号码/); assert.equal(initial[0].choices.length, 0);
  assert.throws(() => replay(game, [{ nodeId: 'start', choiceId: 'spend' }]), { code: 'INVALID_CHOICE' });
  const read = replay(game, [], { currentParagraphIndex: 1 });
  assert.match(read[0].text, /隐藏号码/); assert.deepEqual(read[0].choices, ['推门']);
});

test('router validates malformed progress before calling the adapter', async () => {
  const root = await mkdtemp(join(tmpdir(), 'liukan-'));
  let calls = 0;
  const service = new LiukanZhidaService(() => world(), new LiukanMemoryStore(root), async (_prompt, model) => { calls++; return { answer: '这里是入口。', model }; });
  const app = express(); app.use(express.json()); app.use('/api/liukan', createLiukanRouter(() => world(), service));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/liukan`;
  try {
    const invalid = await fetch(`${url}/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ storyId: '123456789', worldId: 'test-world', question: '未来结局？', history: [{ nodeId: 'end', choiceId: 'open' }] }) });
    assert.equal(invalid.status, 400); assert.equal((await invalid.json()).error.code, 'INVALID_PATH'); assert.equal(calls, 0);
    const response = await fetch(`${url}/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ storyId: '123456789', worldId: 'test-world', question: '到了哪？', history: [] }) });
    assert.equal(response.status, 200); assert.equal((await response.json()).source, 'zhihu-zhida'); assert.equal(calls, 1);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
