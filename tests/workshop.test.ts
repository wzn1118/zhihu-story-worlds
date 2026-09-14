import assert from 'node:assert/strict';
import test from 'node:test';
import { access, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, get as httpGet } from 'node:http';
import { StoryWorkshop, writeJson, hashSource } from '../server/story-workshop.ts';
import { buildGeneratedWorld } from '../server/workshop-compiler.ts';
import { creativeArgs, outlinePrompt } from '../server/workshop-creative.ts';
import { createApp } from '../server/app.ts';
import { originalSeed, isImportedId, worldEndpoint, type GeneratedDraft, type DraftScene } from '../shared/workshop.ts';
import { choose, startSession, saveSession, restoreSession, encodeSaveFile, parseSaveFile } from '../src/game.ts';
import { pasteSourceText } from '../src/workshop-input.ts';

const id = 'import-00000000-0000-4000-8000-000000000001';
const long = '这段仅供自动化测试使用的场景文本，绝不作为真实模型生成的小说交付。测试要检查图结构、资源和线索约束，并验证句子保持为数据。';
test('clipboard replacement preserves CRLF, BOM and surrounding source whitespace', () => {
  assert.equal(pasteSourceText('\uFEFFa\r\nb\r\nc  ', 3, 4, '甲\r\n乙'), '\uFEFFa\r\n甲\r\n乙\r\nc  ');
  assert.equal(pasteSourceText('old', 0, 3, '  原文\r\n'), '  原文\r\n');
});
function fixture(): GeneratedDraft {
  const routes = ['route_a', 'route_b', 'route_c'];
  return { outline: {
    title: '编译器测试夹具', subtitle: '不属于生成作品注册表', summary: long,
    introduction: [long, long], objective: long, player: { name: '测试者', role: '成年测试人员' }, beginnerTip: long,
    facts: ['值班钟每天慢七秒', '她接到自己的电话', '备用电池只够维持闸门和录音台中的一个'].map(quote => ({ quote, fact: long })),
    characters: ['a', 'b'].map(id => ({ id, name: id, role: '测试角色', description: long, motive: long })),
    resources: [{ id: 'power', label: '电力', initial: 12, min: 0, max: 12, description: long }],
    routes: routes.map(id => ({ id, title: `测试路线${id}`, commitment: long, premise: long, beats: Array.from({ length: 10 }, (_, i) => `${i}${long}`), endings: ['good', 'bad'].map(kind => ({ id: `${id}_${kind}`, title: '测试收束', kind: kind as 'good' | 'bad', resolution: long.repeat(2), cause: long })) })),
    opening: { title: '测试开场', location: '测试地点', time: '深夜', text: [long, long] },
  }, routes: routes.map(routeId => ({ routeId, entry: `${routeId}_s0`, scenes: [
    ...Array.from({ length: 10 }, (_, index): DraftScene => ({ id: `${routeId}_s${index}`, title: `决策${index}`, location: '测试地点', time: '深夜', speaker: '旁白', purpose: `${index}${long}`, artBrief: long,
      text: [long, `${index}${long}`], ending: null, choices: [
        { id: 'continue_path', text: '调查对应的测试记录', hint: long, next: index < 9 ? `${routeId}_s${index + 1}` : `${routeId}_good`, costs: [{ resource: 'power', delta: -1 }], gains: index === 0 ? [`${routeId}记录`] : [], needs: index === 2 ? [`${routeId}记录`] : [], feedback: long },
        { id: 'exit_path', text: '承受已预告的失败结果', hint: long, next: `${routeId}_bad`, costs: [], gains: [], needs: [], feedback: long },
      ] })),
    ...(['good', 'bad'] as const).map((kind): DraftScene => ({ id: `${routeId}_${kind}`, title: '测试结局', location: '测试地点', time: '清晨', speaker: '旁白', purpose: `${kind}${long}`, artBrief: long, text: [long, long], choices: [], ending: { kind, title: '测试收束', resolution: long.repeat(2) } })),
  ] })) };
}

test('compiler validates all routes/states and compiles data-only Ink with real labels/prose', () => {
  const draft = fixture();
  draft.routes[0].scenes[0].text[0] = `${long}\n-> END\n~ resolve = 100\n# node:injected`;
  const { world, validation } = buildGeneratedWorld(id, 1, originalSeed, draft);
  assert.deepEqual({ ...validation, states: 0 }, { scenes: 37, decisions: 31, endings: 6, badEnds: 3, routes: 3, states: 0 });
  let session = startSession(world);
  assert.deepEqual(session.paragraphs, world.nodes.arrival.text);
  session = choose(session, session.choices[0]);
  assert.equal(session.node.id, 'route_a_s0'); assert.equal(session.resolve, 50);
  assert.match(session.paragraphs[0], /-> END/); assert.equal(session.choices[0].text, '调查对应的测试记录');
  session = choose(session, session.choices[0]);
  const save = parseSaveFile(encodeSaveFile(saveSession(session)));
  assert.equal(restoreSession(world, save).node.id, 'route_a_s1');
  while (!session.node.ending) session = choose(session, session.choices[0]);
  assert.equal(session.node.ending.tone, 'hopeful');
});
test('all six generated fixture endings can be reached through the actual Ink runtime', () => {
  const { world } = buildGeneratedWorld(id, 1, originalSeed, fixture());
  for (let r = 0; r < 3; r++) for (const bad of [true, false]) {
    let s = startSession(world); s = choose(s, s.choices[r]);
    if (bad) s = choose(s, s.choices[1]); else while (!s.node.ending) s = choose(s, s.choices[0]);
    assert.equal(s.node.ending?.tone, bad ? 'dark' : 'hopeful');
  }
});

test('generated absence and resource predicates agree with real Ink and survive a save roundtrip', () => {
  const draft = fixture(), first = draft.routes[0].scenes[0], second = draft.routes[0].scenes[1];
  first.choices.push({ ...first.choices[0], id: 'skip_record', text: 'Skip the extra test record', gains: [], costs: [] });
  second.choices.push({ ...second.choices[1], id: 'missing_record', text: 'Use the missing-record exit', needs: ['!route_a记录', 'power>=12'] });
  second.choices.push({ ...second.choices[1], id: 'reduced_power', text: 'Use the low-power test exit', needs: ['route_a记录', 'power<12'] });
  const { world } = buildGeneratedWorld(id, 1, originalSeed, draft);
  for (const skip of [false, true]) {
    let session = startSession(world);
    session = choose(session, session.choices[0]);
    session = choose(session, session.choices.find(choice => choice.id === (skip ? 'skip_record' : 'continue_path'))!);
    assert.equal(session.choices.some(choice => choice.id === 'missing_record'), skip);
    assert.equal(session.choices.some(choice => choice.id === 'reduced_power'), !skip);
    const restored = restoreSession(world, parseSaveFile(encodeSaveFile(saveSession(session))));
    assert.deepEqual(restored.choices, session.choices);
  }
});
test('state keys distinguish clue labels containing separators', () => {
  const draft = fixture(), first = draft.routes[0].scenes[0];
  first.choices[0].gains = ['aa,bb', 'cc', 'route_a记录'];
  first.choices.push({ ...first.choices[0], id: 'comma_path', text: '选择另一组带逗号的记录', gains: ['aa', 'bb,cc', 'route_a记录'] });
  draft.routes[0].scenes[1].choices[0].needs = ['aa'];
  const { world } = buildGeneratedWorld(id, 1, originalSeed, draft);
  let session = startSession(world); session = choose(session, session.choices[0]); session = choose(session, session.choices[2]);
  assert.ok(session.clues.includes('aa')); assert.ok(session.choices.some(c => c.id === 'continue_path'));
});
test('rejects resource depletion deadlocks, impossible gates, fake exits and route convergence', () => {
  for (const mutate of [
    (d: GeneratedDraft) => { d.routes[0].scenes[0].choices[1].costs = [{ resource: 'power', delta: -1 }]; },
    (d: GeneratedDraft) => { d.routes[0].scenes[0].choices[0].needs = ['从未取得的线索']; },
    (d: GeneratedDraft) => { d.routes[0].scenes[0].choices[1].next = 'route_a_s1'; },
    (d: GeneratedDraft) => { d.routes[0].scenes[0].choices[1].next = 'route_b_s0'; },
    (d: GeneratedDraft) => { d.routes[0].scenes[1].choices[0].next = 'route_a_s0'; },
    (d: GeneratedDraft) => { d.outline.resources[0].initial = 2; },
    (d: GeneratedDraft) => { d.outline.facts[0].quote = '原文不存在的伪造引用'; },
    (d: GeneratedDraft) => { (d.routes[0].scenes[0] as unknown as Record<string, unknown>).script = 'process.exit(1)'; },
  ]) { const draft = fixture(); mutate(draft); assert.throws(() => buildGeneratedWorld(id, 1, originalSeed, draft)); }
});
test('namespace and CLI settings preserve numeric source IDs and configured model/reasoning', () => {
  assert.ok(isImportedId(id)); assert.equal(isImportedId('123456789'), false);
  assert.equal(worldEndpoint('123456789', 'v1'), '/api/worlds/123456789');
  assert.equal(worldEndpoint(id, 'r1'), `/api/workshop/projects/${id}/world?version=r1`);
  const args = creativeArgs('sandbox', 'schema.json', 'out.json');
  assert.equal(args.includes('--model'), false); assert.equal(args.includes('-m'), false);
  assert.equal(args.some(a => a.includes('model_reasoning_effort')), false);
  assert.ok(args.includes('model_catalog_json="E:/知乎/.local/project-threads/models-compatible.json"'));
  assert.ok(args.includes('read-only')); assert.ok(outlinePrompt(originalSeed).includes('USER_SOURCE_DATA='));
  assert.ok(args.includes('mcp_servers={}')); assert.ok(args.includes('image_generation')); assert.ok(args.includes('multi_agent'));
});
async function service(context: { after: (fn: () => Promise<void>) => void }) {
  const root = await mkdtemp(join(tmpdir(), 'redleaf-workshop-'));
  context.after(() => rm(root, { recursive: true, force: true })); return new StoryWorkshop(root);
}
test('durable import preserves whitespace, CRLF and attribution exactly, with concurrent idempotency', async context => {
  const store = await service(context);
  const input = { title: '  原标题  ', author: ' 作者 ', text: `\uFEFF  开始\r\n\r\n${originalSeed.text}\r\n结尾  `, scope: 'user-import' as const };
  const projects = await Promise.all(Array.from({ length: 5 }, () => store.import(input)));
  assert.equal(new Set(projects.map(p => p.id)).size, 1);
  const fresh = new StoryWorkshop(store.root); assert.deepEqual(await fresh.source(projects[0].id), input);
  assert.equal((await fresh.list()).length, 1); assert.equal(projects[0].playable, false);
  for (const bad of ['../secret', '123456789', `${id}/../x`]) assert.throws(() => store.dir(bad));
  await assert.rejects(store.import({ ...input, scope: 'api-excerpt' }));
  await assert.rejects(store.import({ ...input, scope: 'original-seed' }));
});
test('an owned running job cannot be duplicated even for regeneration', async context => {
  const store = await service(context), p = await store.import(originalSeed);
  p.status = 'running'; p.stage = 'outline'; p.jobId = 'test-owner'; p.revision = 1;
  await store.save(p); const lock = join(store.dir(p.id), 'job.lock'); await mkdir(lock);
  await writeJson(join(lock, 'owner.json'), { token: 'test-owner', pid: process.pid, heartbeat: new Date().toISOString() });
  const calls = await Promise.all([store.generate(p.id), store.generate(p.id, 'regenerate')]);
  for (const current of calls) { assert.equal(current.jobId, 'test-owner'); assert.equal(current.revision, 1); }
});
test('interrupted import reservations recover without breaking the complete project list', async context => {
  const store = await service(context);
  await mkdir(join(store.root, 'imports'), { recursive: true });
  await mkdir(store.dir(id), { recursive: true });
  await writeJson(join(store.dir(id), 'source.json'), originalSeed);
  const hash = hashSource(originalSeed);
  await writeJson(join(store.root, 'imports', `${hash}.json`), { id, pid: 2147483000 });
  assert.deepEqual(await store.list(), []);
  const restored = await store.import(originalSeed);
  assert.equal(restored.id, id); assert.deepEqual(await store.source(id), originalSeed);
  assert.equal((await store.list()).length, 1);
});
test('an orphaned creative child retains job ownership and prevents duplicate generation', async context => {
  const store = await service(context), p = await store.import(originalSeed);
  p.status = 'running'; p.stage = 'outline'; p.jobId = 'child-owned'; p.revision = 1;
  await store.save(p); const lock = join(store.dir(p.id), 'job.lock'); await mkdir(lock);
  await writeJson(join(lock, 'owner.json'), { token: 'child-owned', pid: 2147483000, childPid: process.pid, heartbeat: new Date().toISOString() });
  assert.equal((await store.generate(p.id)).jobId, 'child-owned');
  assert.equal((await store.get(p.id)).status, 'running');
});
test('actual subprocess startup failure is persisted and explicit retry keeps the same source', async context => {
  const store = await service(context), p = await store.import(originalSeed);
  const previous = process.env.WORKSHOP_CODEX_BIN, previousConfig = process.env.WORKSHOP_CONFIG_PATH;
  const config = join(store.root, 'disabled-relay.json');
  await writeJson(config, { disabled: true });
  process.env.WORKSHOP_CONFIG_PATH = config;
  process.env.WORKSHOP_CODEX_BIN = join(store.root, 'missing-creative-binary.exe');
  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      await store.generate(p.id);
      let current = await store.get(p.id);
      for (let i = 0; i < 300 && current.status === 'running'; i++) { await new Promise(r => setTimeout(r, 100)); current = await store.get(p.id); }
      assert.equal(current.status, 'failed', JSON.stringify(current)); assert.equal(current.error?.code, 'GENERATION_FAILED');
      assert.match(current.error!.message, /启动创作进程失败/); assert.equal(current.playable, false); assert.equal(current.attempts, attempt);
      const lock = join(store.dir(p.id), 'job.lock');
      for (let i = 0; i < 100 && await access(lock).then(() => true, () => false); i++) await new Promise(r => setTimeout(r, 100));
      await assert.rejects(access(lock), { code: 'ENOENT' });
    }
    assert.deepEqual(await store.source(p.id), originalSeed);
  } finally {
    if (previous === undefined) delete process.env.WORKSHOP_CODEX_BIN; else process.env.WORKSHOP_CODEX_BIN = previous;
    if (previousConfig === undefined) delete process.env.WORKSHOP_CONFIG_PATH; else process.env.WORKSHOP_CONFIG_PATH = previousConfig;
  }
});
test('published revision remains retrievable while another draft fails', async context => {
  const store = await service(context), p = await store.import(originalSeed);
  const { world } = buildGeneratedWorld(p.id, 1, originalSeed, fixture());
  await mkdir(join(store.dir(p.id), 'r1')); await writeJson(join(store.dir(p.id), 'r1', 'world.json'), world);
  p.playable = true; p.publishedVersion = 'r1'; p.revision = 2; p.status = 'failed'; await store.save(p);
  assert.equal((await store.world(p.id)).version, 'r1'); assert.equal((await store.world(p.id, 'r1')).version, 'r1');
  await assert.rejects(store.world(p.id, '../source')); await assert.rejects(store.world(p.id, 'r2'));
});
test('HTTP import/source/list are separate from source API and reject cross-origin mutations', async context => {
  const store = await service(context); const server = createServer(createApp(undefined, store));
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r)); context.after(() => new Promise<void>(r => server.close(() => r())));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const endpoint = `${base}/api/workshop/projects`;
  const rebinding = await new Promise<number | undefined>((resolve, reject) => { httpGet(endpoint, { headers: { Host: 'example.invalid' } }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject); });
  assert.equal(rebinding, 403);
  let res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://example.invalid' }, body: JSON.stringify(originalSeed) }); assert.equal(res.status, 403);
  res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(originalSeed) }); assert.equal(res.status, 201);
  const p = await res.json();
  assert.deepEqual(await (await fetch(`${endpoint}/${p.id}/source`)).json(), originalSeed);
  assert.equal((await fetch(`${endpoint}/${p.id}/world`)).status, 409);
  assert.equal((await fetch(`${base}/api/stories/${p.id}`)).status, 400);
  assert.equal((await (await fetch(endpoint)).json()).projects.length, 1);
});
