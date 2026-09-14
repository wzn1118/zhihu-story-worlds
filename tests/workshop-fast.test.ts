import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastStoryDraft } from '../shared/workshop-fast.ts';
import { originalSeed } from '../shared/workshop.ts';
import { buildFastWorld, FastStoryDeadlineError, fastStoryPrompt, runFastWorkshop, checkFastStoryContinuity } from '../server/workshop-fast.ts';
import { RelayRequestError } from '../server/workshop-relay.ts';
import { choose, startSession, saveSession, restoreSession, encodeSaveFile, parseSaveFile } from '../src/game.ts';

const projectId = 'import-00000000-0000-4000-8000-000000000099';
const prose = '这里是自动化测试专用的虚构内容，用来核对选择与分支去向，不属于真实模型生成的作品，也不会加入产品书库。';
const graph: Record<string, string[]> = { start: ['a', 'b'], a: ['c', 'd'], b: ['d', 'e'], c: ['f', 'g'], d: ['g', 'h'], e: ['h', 'c'], f: ['good', 'uneasy'], g: ['uneasy', 'bad'], h: ['good', 'bad'], good: [], uneasy: [], bad: [] };
function fixture(): FastStoryDraft {
  return {
    narrative: { desire: '测试员想核对最后一份登记记录', stakes: '错误登记会让同伴无法离开测试空间', relationship: '成年见证人需要留住自己的登记记录，测试员需要带回原件', voice: '测试员报出具体字段，见证人总先追问原件会交给谁' },
    title: '快稿编译测试夹具', subtitle: '来源引用与可达结局', summary: prose,
    introduction: [prose], player: { name: '测试员', role: '成年测试角色' }, objective: '逐条检查图结构并抵达完整结局',
    premise: { question: originalSeed.title, preserved: prose, expansion: prose },
    characters: [{ id: 'tester', name: '测试员', role: '成年测试角色', description: prose }],
    facts: [{ quote: '海底中继站的值班钟每天慢七秒', fact: prose, sceneIds: ['start'] }, { quote: '备用电池只够维持闸门和录音台中的一个', fact: prose, sceneIds: ['a'] }],
    start: 'start', scenes: Object.entries(graph).map(([id, next]) => ({ id, title: `测试场景${id}`, location: '测试空间', time: '测试夜晚',
      requires: [], text: [`测试员核对了${id}。${prose}${id === 'start' ? '海底中继站的值班钟每天慢七秒' : id === 'a' ? '备用电池只够维持闸门和录音台中的一个' : ''}`],
      choices: next.map((target, index) => ({ id: `choice_${index}`, text: `从${id}前往测试场景${target}`, hint: '这段提示仅用于验证测试路径', next: target, feedback: prose, gains: [`测试记录${id}${index}`] })),
      ending: next.length ? null : { title: `测试结局${id}`, resolution: prose.repeat(2), tone: id === 'good' ? 'hopeful' as const : id === 'bad' ? 'dark' as const : 'uneasy' as const },
    })),
  };
}

test('fast game preserves literal source, all branches play in Ink, and saves roundtrip', () => {
  const draft = fixture(); draft.scenes[2].text[0] += '\n-> END\n~ resolve = 99';
  const { world, validation } = buildFastWorld(projectId, 2, originalSeed, draft);
  assert.equal(validation.scenes, 12); assert.equal(validation.endings, 3); assert.ok(validation.routes >= 3);
  assert.equal(world.generated?.editorial, undefined);
  assert.equal(world.source.title, originalSeed.title);
  assert.deepEqual(world.sourcePassages?.map(passage => passage.quote), draft.facts.map(fact => fact.quote));
  const reached = new Set<string>(), endings = new Set<string>();
  function play(path: number[]) {
    let session = startSession(world);
    for (const index of path) session = choose(session, session.choices[index]);
    assert.equal(session.resolve, 50);
    reached.add(session.node.id);
    assert.equal(restoreSession(world, parseSaveFile(encodeSaveFile(saveSession(session)))).node.id, session.node.id);
    if (session.node.ending) { endings.add(session.node.id); return; }
    assert.ok(session.choices.length >= 2);
    for (let index = 0; index < session.choices.length; index++) play([...path, index]);
  }
  play([]);
  assert.equal(reached.size, 12); assert.deepEqual([...endings].sort(), ['bad', 'good', 'uneasy']);
});

test('rejects missing or fabricated grounding and graph failures before publication', () => {
  for (const change of [
    (draft: FastStoryDraft) => { draft.facts[0].quote = '这句话从未出现在导入原文之中'; },
    (draft: FastStoryDraft) => { draft.facts[0].sceneIds = ['bad']; },
    (draft: FastStoryDraft) => { draft.facts[0].sceneIds = ['missing']; },
    (draft: FastStoryDraft) => { draft.scenes[0].choices[0].next = 'missing'; },
    (draft: FastStoryDraft) => { draft.scenes[1].choices[0].next = 'start'; },
    (draft: FastStoryDraft) => { draft.scenes[0].choices[1].next = 'a'; },
    (draft: FastStoryDraft) => { draft.scenes.at(-1)!.ending = null; },
    (draft: FastStoryDraft) => { draft.scenes[0].id = 'start\n-> END'; },
    (draft: FastStoryDraft) => { draft.scenes.at(-1)!.choices = draft.scenes[0].choices; },
    (draft: FastStoryDraft) => { draft.facts[1] = draft.facts[0]; },
  ]) {
    const draft = fixture(); change(draft);
    assert.throws(() => buildFastWorld(projectId, 1, originalSeed, draft));
  }
});

test('a non-fiction answer is explicitly treated as inspiration under its original question', () => {
  const answer = { title: '停电时怎样分配备用电池？', author: '原作者', text: '优先保证关键设备供电，然后估算续航时间。所有数字必须以铭牌和实际负载为准。'.repeat(4), scope: 'user-import' as const };
  const prompt = fastStoryPrompt(answer);
  assert.ok(prompt.includes('把这篇回答当作灵感'));
  const embedded = JSON.parse(prompt.split('USER_SOURCE_DATA=')[1]);
  assert.equal(embedded.title, answer.title); assert.equal(embedded.text, answer.text); assert.equal(embedded.author, answer.author);
  assert.ok(fastStoryPrompt(answer, 'faithful').includes('保留已发生的事实'));
});

test('fast game credits favorite summaries accurately and keeps their quoted source links', () => {
  const source = { ...originalSeed, scope: 'zhihu-excerpt' as const, origin: { kind: 'zhihu-answer' as const, contentScope: 'favorite-summary' as const, workId: '87654321', sourceUrl: 'https://www.zhihu.com/question/12345678/answer/87654321', fetchedAt: '2026-09-14T00:00:00.000Z' } };
  const draft = fixture();
  draft.scenes[0].text[0] = `测试员翻开了手边的记事本。${draft.scenes[0].text[0]}`;
  for (const scene of draft.scenes) for (const choice of scene.choices) choice.text = `从测试场景${scene.id}${choice.text}`;
  const { world } = buildFastWorld(projectId, 1, source, draft);
  assert.deepEqual(world.source.origin, source.origin);
  assert.equal(world.adaptation.scope, 'based-on-favorite-summary');
  assert.match(world.adaptation.note, /知乎收藏接口摘要/);
  assert.match(world.adaptation.note, /并非完整原文/);
  assert.doesNotMatch(world.adaptation.note, /搜索节选|故事接口/);
  assert.ok(world.sourcePassages?.every(passage => passage.label.startsWith('收藏摘要线索')));
  assert.deepEqual(world.sourcePassages?.map(passage => passage.quote), draft.facts.map(fact => fact.quote));
});

type Context = { after(callback: () => Promise<void> | void): void };
async function service(context: Context, handler: (request: IncomingMessage, response: ServerResponse) => void) {
  const directory = await mkdtemp(join(tmpdir(), 'workshop-fast-test-'));
  context.after(() => rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
  const server = createServer(handler);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  context.after(() => { server.closeAllConnections(); return new Promise<void>(resolve => server.close(() => resolve())); });
  return { directory, relay: { endpoint: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`, apiKey: 'isolated-test-key', model: 'fixture-gpt-6', protocol: 'chat-completions' as const } };
}
function sendDraft(response: ServerResponse, content = JSON.stringify(fixture())) {
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content } }] }));
}

test('transient relay failure retries once with bounded non-streaming output and publishes only a valid draft', async context => {
  const calls: Record<string, any>[] = [];
  const api = await service(context, (request, response) => {
    let text = ''; request.on('data', data => { text += data; }); request.on('end', () => {
      calls.push(JSON.parse(text));
      if (calls.length === 1) { response.writeHead(503); response.end(); } else sendDraft(response);
    });
  });
  const result = await runFastWorkshop({ ...api, id: projectId, revision: 1, source: originalSeed });
  assert.equal(result.attempts, 2); assert.equal(result.validation.endings, 3);
  assert.deepEqual(calls.map(call => call.stream), [true, false]);
  assert.ok(calls.every(call => call.reasoning_effort === 'low' && call.max_completion_tokens === 10000));
  const receipt = await readFile(join(api.directory, 'fast-generation.json'), 'utf8');
  assert.ok(!receipt.includes(api.relay.apiKey)); assert.ok(!receipt.includes(api.relay.endpoint));
  const recovered = await runFastWorkshop({ ...api, id: projectId, revision: 1, source: originalSeed });
  assert.equal(recovered.recovered, true); assert.equal(calls.length, 2);
});

test('a locally invalid model draft gets one model repair, never a manufactured local story', async context => {
  let calls = 0;
  const invalid = fixture(); invalid.facts[0].quote = '这是模型捏造的引用不属于原文';
  const api = await service(context, (_request, response) => { calls++; sendDraft(response, JSON.stringify(calls === 1 ? invalid : fixture())); });
  const result = await runFastWorkshop({ ...api, id: projectId, revision: 1, source: originalSeed });
  assert.equal(calls, 2); assert.equal(result.attempts, 2);
  assert.equal(result.draft.facts[0].quote, fixture().facts[0].quote);
  const savedOriginal = JSON.parse(await readFile(join(api.directory, 'fast-j1-a1.output.json'), 'utf8'));
  assert.equal(savedOriginal.facts[0].quote, invalid.facts[0].quote);
});

test('authentication failure fails promptly without retry or fake success', async context => {
  let calls = 0;
  const api = await service(context, (_request, response) => { calls++; response.writeHead(401); response.end(); });
  await assert.rejects(runFastWorkshop({ ...api, id: projectId, revision: 1, source: originalSeed }), (error: unknown) => error instanceof RelayRequestError && error.diagnostics.category === 'authentication');
  assert.equal(calls, 1);
  await assert.rejects(readFile(join(api.directory, 'fast-draft.json')));
});

test('the total deadline aborts hanging requests and does not wait for legacy 45-minute timeout', async context => {
  let calls = 0;
  const api = await service(context, (request, _response) => { calls++; request.resume(); });
  const started = Date.now();
  await assert.rejects(runFastWorkshop({ ...api, id: projectId, revision: 1, source: originalSeed, budgetMs: 850, firstAttemptMs: 100 }), (error: unknown) => error instanceof FastStoryDeadlineError || (error instanceof RelayRequestError && error.diagnostics.category === 'timeout'));
  // Windows antivirus and concurrent test compilation may delay local file receipts.
  // The network request still has a subsecond budget rather than the legacy timeout.
  assert.ok(Date.now() - started < 5000); assert.ok(calls <= 2);
  await assert.rejects(readFile(join(api.directory, 'fast-draft.json')));
});

test('caller cancellation and failed second validation leave no publishable checkpoint', async context => {
  let calls = 0;
  const api = await service(context, (_request, response) => { calls++; sendDraft(response, '{'); });
  await assert.rejects(runFastWorkshop({ ...api, id: projectId, revision: 1, source: originalSeed }), /完整 JSON/);
  assert.equal(calls, 2);
  await assert.rejects(readFile(join(api.directory, 'fast-draft.json')));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(runFastWorkshop({ ...api, id: projectId, revision: 1, source: originalSeed, signal: controller.signal }), FastStoryDeadlineError);
  assert.equal(calls, 2);
});

test('one deadline also bounds a stalled progress callback before any provider request', async context => {
  let calls = 0;
  const api = await service(context, (_request, response) => { calls++; sendDraft(response); });
  const started = Date.now();
  await assert.rejects(runFastWorkshop({ ...api, id: projectId, revision: 1, source: originalSeed,
    budgetMs: 200, onProgress: () => new Promise<void>(() => {}) }), FastStoryDeadlineError);
  assert.ok(Date.now() - started < 2000); assert.equal(calls, 0);
  await assert.rejects(readFile(join(api.directory, 'fast-draft.json')));
});


test('branch memory rejects an exclusive clue at a merge and in an ending, but accepts common history', () => {
  const draft = fixture(), opening = draft.scenes[0];
  opening.choices[0].gains = ['原件']; opening.choices[1].gains = [];
  const merge = draft.scenes.find(scene => scene.id === 'd')!;
  merge.requires = ['原件'];
  assert.match(checkFastStoryContinuity(draft).join(';'), /d：.*原件/);
  assert.throws(() => buildFastWorld(projectId, 1, originalSeed, draft), /并非所有到达路径/);
  opening.choices[1].gains = ['原件'];
  assert.deepEqual(checkFastStoryContinuity(draft), []);
  buildFastWorld(projectId, 1, originalSeed, draft);
  draft.scenes.find(scene => scene.id === 'bad')!.requires = ['没救到的人'];
  assert.match(checkFastStoryContinuity(draft).join(';'), /bad：.*没救到的人/);
});

test('distinct choices to one destination keep distinct histories and current gains do not satisfy prior knowledge', () => {
  const draft = fixture();
  draft.scenes[0].choices[1].next = 'a';
  draft.scenes[0].choices[0].gains = ['钥匙']; draft.scenes[0].choices[1].gains = [];
  draft.scenes.find(scene => scene.id === 'a')!.requires = ['钥匙'];
  assert.match(checkFastStoryContinuity(draft).join(';'), /a：.*钥匙/);
  draft.scenes[0].requires = ['钥匙'];
  assert.match(checkFastStoryContinuity(draft).join(';'), /start：.*钥匙/);
});

test('author notes stay out of the player world and legacy drafts still compile', () => {
  const draft = fixture();
  draft.narrative!.voice = 'INTERNAL_ONLY_VOICE_人物有自己的口气与私心';
  const built = buildFastWorld(projectId, 1, originalSeed, draft);
  assert.equal(JSON.stringify(built.world).includes('INTERNAL_ONLY_VOICE'), false);
  assert.equal(JSON.stringify(built.world).includes('requires'), false);
  delete draft.narrative;
  for (const scene of draft.scenes) delete scene.requires;
  assert.equal(buildFastWorld(projectId, 1, originalSeed, draft).validation.endings, 3);
});

test('a contradictory branch is repaired within the existing two-call budget', async context => {
  const invalid = fixture(); invalid.scenes.find(scene => scene.id === 'd')!.requires = ['未取得的原件'];
  let calls = 0;
  const api = await service(context, (_request, response) => sendDraft(response, JSON.stringify(++calls === 1 ? invalid : fixture())));
  const result = await runFastWorkshop({ ...api, id: projectId, revision: 1, source: originalSeed });
  assert.equal(calls, 2); assert.equal(result.attempts, 2);
  assert.match(await readFile(join(api.directory, 'fast-j1-a2.prompt.txt'), 'utf8'), /并非所有到达路径/);
});

test('old prompt receipts do not silently restore stale prose for a new generation', async context => {
  let calls = 0;
  const api = await service(context, (_request, response) => { calls++; sendDraft(response); });
  const options = { ...api, id: projectId, revision: 1, source: originalSeed };
  await runFastWorkshop(options);
  const file = join(api.directory, 'fast-generation.json');
  const receipt = JSON.parse(await readFile(file, 'utf8')); delete receipt.promptHash;
  await writeFile(file, JSON.stringify(receipt));
  const result = await runFastWorkshop({ ...options, attempt: 2 });
  assert.equal(result.recovered, false); assert.equal(calls, 2);
});

test('a failed regeneration cannot relabel an old draft as a newly completed checkpoint', async context => {
  let calls = 0, fail = false;
  const api = await service(context, (_request, response) => {
    calls++;
    if (fail) { response.writeHead(401); response.end(); } else sendDraft(response);
  });
  const options = { ...api, id: projectId, revision: 1, source: originalSeed };
  await runFastWorkshop(options);
  const receiptFile = join(api.directory, 'fast-generation.json');
  const prior = JSON.parse(await readFile(receiptFile, 'utf8')); delete prior.promptHash;
  await writeFile(receiptFile, JSON.stringify(prior));
  fail = true;
  await assert.rejects(runFastWorkshop({ ...options, attempt: 2 }), RelayRequestError);
  fail = false;
  const result = await runFastWorkshop({ ...options, attempt: 3 });
  assert.equal(result.recovered, false); assert.equal(calls, 3);
  const draftFile = join(api.directory, 'fast-draft.json');
  const changed = JSON.parse(await readFile(draftFile, 'utf8')); changed.title = '被替换的另一份稿件';
  await writeFile(draftFile, JSON.stringify(changed));
  assert.equal((await runFastWorkshop({ ...options, attempt: 4 })).recovered, false);
  assert.equal(calls, 4);
});
