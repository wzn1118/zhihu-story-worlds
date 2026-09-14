import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import { originalSeed, type DraftScene, type GeneratedDraft, type ImportedSource } from '../shared/workshop.ts';
import { buildGeneratedWorld } from '../server/workshop-compiler.ts';
import { runCreative } from '../server/workshop-creative.ts';
import {
  assertEditorialPass, editorialHash, editorialReviewPrompt, reviewAndRepairStory, validateEditorialReview,
  type CreativeEditorialReview, type EditorialEvidence, type EditorialFinding,
} from '../server/workshop-editorial.ts';
import type { Schema } from '../server/workshop-schema.ts';

const projectId = 'import-00000000-0000-4000-8000-000000000001';
const text = '这段仅供自动化测试使用的场景文本，绝不作为真实模型生成的小说交付。测试要检查图结构、资源和线索约束，并验证句子保持为数据。';
const warning = `陆遥按住对讲键，刚刚向韩砚喊完警告，枪声还留在听筒里。${text}`;
const aftermath = `邵勤护着受伤的右腕，枪已经锁进工具箱，报警盒的碎玻璃落在脚边。${text}`;
const bridge = `邵勤向报警盒开枪，陆遥用扳手挡开枪口，韩砚在争抢中扭伤他的右腕，把枪锁进工具箱；韩穗随后报出姓名，三人听她说完各项操作的代价。${text}`;
function fixture(): GeneratedDraft {
  const ids = ['route_a', 'route_b', 'route_c'];
  return { outline: {
    title: '编辑关卡测试稿', subtitle: '仅限自动化验证', summary: text, introduction: [text, text],
    objective: text, player: { name: '陆遥', role: '值班工程师' }, beginnerTip: text,
    facts: ['值班钟每天慢七秒', '她接到自己的电话', '备用电池只够维持闸门和录音台中的一个'].map(quote => ({ quote, fact: text })),
    characters: ['engineer', 'witness'].map(id => ({ id, name: id, role: '测试角色', description: text, motive: text })),
    resources: [{ id: 'battery', label: '电量', initial: 12, min: 0, max: 12, description: text }],
    routes: ids.map(id => ({ id, title: `路线${id}`, commitment: text, premise: text,
      beats: Array.from({ length: 10 }, (_, i) => `${i}${text}`),
      endings: (['good', 'bad'] as const).map(kind => ({ id: `${id}_${kind}`, title: '测试结局', kind, resolution: text.repeat(2), cause: text })) })),
    opening: { title: '警告刚说完', location: '测试值班室', time: '午夜之前', text: [text, warning] },
  }, routes: ids.map(routeId => ({ routeId, entry: `${routeId}_s0`, scenes: [
    ...Array.from({ length: 10 }, (_, i): DraftScene => ({ id: `${routeId}_s${i}`, title: `测试场景${i}`, location: '测试值班室', time: '午夜之前', speaker: '旁白',
      text: [i === 0 ? aftermath : text, text], purpose: `${i}${text}`, artBrief: text, ending: null,
      choices: [{ id: 'continue_path', text: '检查现场留下的痕迹', hint: `电量消耗一格。${text}`, next: i < 9 ? `${routeId}_s${i + 1}` : `${routeId}_good`,
        costs: [{ resource: 'battery', delta: -1 }], gains: i === 0 ? [`${routeId}证据`] : [], needs: i === 2 ? [`${routeId}证据`] : [], feedback: text },
      { id: 'exit_path', text: '沿着掩护撤回出口', hint: text, next: `${routeId}_bad`, costs: [], gains: [], needs: [], feedback: text }] })),
    ...(['good', 'bad'] as const).map((kind): DraftScene => ({ id: `${routeId}_${kind}`, title: '测试结局', location: '测试岸边', time: '次日清晨', speaker: '旁白',
      text: [text, text], purpose: `${kind}${text}`, artBrief: text, choices: [], ending: { kind, title: '测试结局', resolution: text.repeat(2) } })),
  ] })) };
}
function review(draft: GeneratedDraft, findings: EditorialFinding[] = []): CreativeEditorialReview {
  return { summary: '测试用独立审校响应；生成器由回调替代。', findings,
    coverage: { opening: 'reviewed', outline: 'reviewed', routes: draft.routes.map(r => ({ routeId: r.routeId, sceneIds: r.scenes.map(s => s.id) })) } };
}
function sceneEvidence(draft: GeneratedDraft, routeIndex = 0): EditorialEvidence {
  const route = draft.routes[routeIndex], scene = route.scenes[0];
  return { kind: 'scene', routeId: route.routeId, sceneId: scene.id, choiceId: null, path: '/text/0', quote: scene.text[0] };
}
function openingFinding(draft: GeneratedDraft): EditorialFinding {
  return { id: 'missing_common_action', severity: 'blocking', category: 'continuity', basis: 'invented_continuation',
    problem: '共通开场只写出警告，三条入口同时假定枪响、腕伤和夺枪已经发生。', sourceQuotes: [],
    evidence: [{ kind: 'opening', routeId: null, sceneId: null, choiceId: null, path: '/text/1', quote: draft.outline.opening.text[1] },
      ...draft.routes.map((_, i) => sceneEvidence(draft, i))],
    repair: { outlineFields: ['opening'], routeIds: [], instruction: '在共通开场写出枪击、夺枪、腕伤和人物相认，并让人物听清三种操作后果后再选择。' } };
}
function routeFinding(draft: GeneratedDraft, index = 0): EditorialFinding {
  const route = draft.routes[index], scene = route.scenes[0], choice = scene.choices[0];
  return { id: `cost_${route.routeId}`, severity: 'blocking', category: 'resource_text', basis: 'invented_continuation',
    problem: '行动代价需要通过具体设备变化表达，并与已有电量消耗保持一致。', sourceQuotes: [],
    evidence: [{ kind: 'choice', routeId: route.routeId, sceneId: scene.id, choiceId: choice.id, path: '/hint', quote: choice.hint }],
    repair: { outlineFields: [], routeIds: [route.routeId], instruction: '保留消耗一格电的条件，写出检修灯变暗与现场调查的结果；其他路线保持原样。' } };
}
interface Request { directory: string; label: string; schema: Schema; prompt: string; source: ImportedSource; draft: GeneratedDraft; target?: { outlineFields: string[]; routeIds: string[] } }
function dataLine<T>(prompt: string, name: string): T {
  const line = prompt.split('\n').find(line => line.startsWith(`${name}=`));
  assert.ok(line, name); return JSON.parse(line.slice(name.length + 1)) as T;
}
function engine(handler: (request: Request) => unknown | Promise<unknown>, calls: Request[] = []): typeof runCreative {
  return async <T>(directory: string, label: string, schema: Schema, prompt: string, onChild?: (pid?: number) => Promise<void>): Promise<T> => {
    const request: Request = { directory, label, schema, prompt,
      source: dataLine(prompt, 'USER_SOURCE_DATA'), draft: dataLine(prompt, 'DRAFT_DATA'),
      ...(label.startsWith('review-') ? {} : { target: dataLine(prompt, 'REPAIR_TARGET_DATA') }) };
    calls.push(request);
    await onChild?.(12345); // Callback only; no process is launched by these tests.
    const result = await handler(request);
    await onChild?.();
    return structuredClone(result) as T;
  };
}
async function staging(context: TestContext): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'workshop-editorial-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('compiled common-opening discontinuity requires an opening-only repair and a full re-review', async context => {
  const draft = fixture(), initial = structuredClone(draft), calls: Request[] = [], pids: (number | undefined)[] = [];
  assert.doesNotThrow(() => buildGeneratedWorld(projectId, 1, originalSeed, draft));
  const generate = engine(request => {
    assert.deepEqual(request.source, originalSeed);
    assert.equal(request.draft.routes.length, 3);
    if (request.label.startsWith('outline-repair')) {
      assert.deepEqual(request.target, { outlineFields: ['opening'], routeIds: [] });
      return { opening: { ...request.draft.outline.opening, text: [text, bridge] } };
    }
    return review(request.draft, request.draft.outline.opening.text[1] === warning ? [openingFinding(request.draft)] : []);
  }, calls);
  const result = await reviewAndRepairStory(originalSeed, draft, { directory: await staging(context), generate, onChild: async pid => { pids.push(pid); } });
  assert.equal(result.report.status, 'passed'); assert.equal(result.report.compilerValidation, 'required');
  assert.deepEqual(calls.map(c => c.label.match(/^(.*)-r\d+-/)![1]), ['review', 'outline-repair', 'review']);
  assert.deepEqual(draft, initial); assert.deepEqual(result.draft.routes, initial.routes);
  assert.equal(result.draft.outline.opening.text[1], bridge);
  assert.equal(result.report.rounds.length, 2); assert.equal(result.report.sourceScope, 'original-seed');
  assert.doesNotThrow(() => assertEditorialPass(originalSeed, result.draft, result.report));
  assert.equal(pids.length, 6);
  const snapshot = JSON.parse(await readFile(join(result.directory, 'input.json'), 'utf8'));
  assert.deepEqual(snapshot.draft, initial); assert.deepEqual(snapshot.source, originalSeed);
  assert.deepEqual(JSON.parse(await readFile(join(result.directory, 'result.json'), 'utf8')).draft, result.draft);
});

test('review evidence rejects invented IDs, fabricated quotes, ungrounded targets and partial coverage', () => {
  const draft = fixture();
  const mutations: ((r: CreativeEditorialReview) => void)[] = [
    r => { r.findings[0].evidence[1].routeId = 'invented_route'; },
    r => { r.findings[0].evidence[1].sceneId = 'invented_scene'; },
    r => { Object.assign(r.findings[0].evidence[1], { kind: 'choice', choiceId: 'invented_choice', path: '/text' }); },
    r => { r.findings[0].evidence[0].quote = '这句话只存在于审校者的想象'; },
    r => { r.findings[0].evidence[0].path = '/text/99'; },
    r => { r.findings[0].evidence = [{ kind: 'route', routeId: draft.routes[0].routeId, sceneId: null, choiceId: null, path: '/entry', quote: draft.routes[0].entry }]; },
    r => { r.findings[0].repair.outlineFields = ['resources']; },
    r => { r.findings[0].repair.routeIds = ['invented_route']; },
    r => { r.findings[0].severity = 'advisory'; },
    r => { r.findings.push(structuredClone(r.findings[0])); },
    r => { r.coverage.routes[0].sceneIds.pop(); },
    r => { r.coverage.routes[0].sceneIds.push(r.coverage.routes[0].sceneIds[0]); },
    r => { r.findings[0].basis = 'source_fact'; },
    r => { r.findings[0].basis = 'source_fact'; r.findings[0].sourceQuotes = ['种子里不存在的原句']; },
  ];
  for (const mutate of mutations) {
    const value = review(draft, [openingFinding(draft)]); mutate(value);
    assert.throws(() => validateEditorialReview(originalSeed, draft, value));
  }
  const value = review(draft, [openingFinding(draft)]);
  value.findings[0].basis = 'source_fact'; value.findings[0].sourceQuotes = ['她听到七秒之后，一声枪响。'];
  assert.doesNotThrow(() => validateEditorialReview(originalSeed, draft, value));
});

test('invalid model evidence is rejected, retained, and receives bounded unique resume attempts', async context => {
  const draft = fixture(), directory = await staging(context), calls: Request[] = [];
  const generate = engine(request => {
    const value = review(request.draft, [openingFinding(request.draft)]);
    value.findings[0].evidence[1].sceneId = 'fabricated_scene'; return value;
  }, calls);
  for (let i = 0; i < 2; i++) await assert.rejects(reviewAndRepairStory(originalSeed, draft, { directory, generate }), /unknown scene/);
  await assert.rejects(reviewAndRepairStory(originalSeed, draft, { directory, generate }), /budget exhausted/);
  assert.equal(calls.length, 2); assert.notEqual(calls[0].label, calls[1].label);
  assert.match(calls[1].prompt, /OUTPUT_VALIDATION_DATA=.*fabricated_scene/);
  const [run] = await readdir(directory), files = await readdir(join(directory, run));
  assert.equal(files.filter(f => f.endsWith('.rejected.json')).length, 2);
  assert.equal(files.filter(f => f.endsWith('.accepted.json')).length, 0);
  assert.ok(!files.includes('result.json'));
});

test('unresolved blocking review stays blocked at the persisted round limit and after resume', async context => {
  const draft = fixture(), calls: Request[] = [], directory = await staging(context);
  const generate = engine(request => request.label.startsWith('review-')
    ? review(request.draft, [routeFinding(request.draft)]) : request.draft.routes[0], calls);
  const result = await reviewAndRepairStory(originalSeed, draft, { directory, generate, maxRepairRounds: 2 });
  assert.equal(calls.length, 5); assert.equal(result.report.rounds.length, 3);
  assert.equal(result.report.status, 'blocked'); assert.equal(result.report.blockingCount, 1);
  assert.throws(() => assertEditorialPass(originalSeed, result.draft, result.report), /blocking findings/);
  assert.equal(result.report.rounds.at(-1)!.repairs.length, 0);
  const resumed = await reviewAndRepairStory(originalSeed, draft, { directory, generate: engine(() => { throw new Error('unexpected model call'); }), maxRepairRounds: 2 });
  assert.deepEqual(resumed, result);
});

test('only the affected route is repaired; the next review receives every updated route', async context => {
  const draft = fixture(), initial = structuredClone(draft), calls: Request[] = [];
  const fixed = `检修灯暗下一格，保留的电量按面板读数计算。${text}`;
  const result = await reviewAndRepairStory(originalSeed, draft, { directory: await staging(context), generate: engine(request => {
    if (request.label.startsWith('route-repair')) {
      assert.deepEqual(request.target, { outlineFields: [], routeIds: ['route_b'] });
      const part = structuredClone(request.draft.routes[1]); part.scenes[0].choices[0].hint = fixed; return part;
    }
    return review(request.draft, request.draft.routes[1].scenes[0].choices[0].hint === fixed ? [] : [routeFinding(request.draft, 1)]);
  }, calls) });
  assert.equal(result.report.status, 'passed'); assert.equal(calls.length, 3);
  assert.deepEqual(result.draft.outline, initial.outline);
  assert.deepEqual(result.draft.routes[0], initial.routes[0]); assert.deepEqual(result.draft.routes[2], initial.routes[2]);
  assert.deepEqual(draft, initial);
  assert.equal(calls[2].draft.routes[1].scenes[0].choices[0].hint, fixed);
  assert.equal(calls[2].draft.routes.flatMap(r => r.scenes).length, 36);
});

test('a changed draft or full source invalidates a previously clean review', async context => {
  const directory = await staging(context), draft = fixture(), calls: Request[] = [];
  const generate = engine(request => review(request.draft, request.draft.outline.opening.title === '改过的开场' ? [openingFinding(request.draft)] : []), calls);
  const first = await reviewAndRepairStory(originalSeed, draft, { directory, generate, maxRepairRounds: 0 });
  const changed = structuredClone(draft); changed.outline.opening.title = '改过的开场';
  const second = await reviewAndRepairStory(originalSeed, changed, { directory, generate, maxRepairRounds: 0 });
  assert.equal(second.report.status, 'blocked'); assert.notEqual(first.directory, second.directory);
  assert.notEqual(first.report.draftHash, second.report.draftHash);
  assert.throws(() => assertEditorialPass(originalSeed, changed, first.report), /different source\/draft/);
  const source: ImportedSource = { ...originalSeed, scope: 'user-import', text: `${originalSeed.text}\n追加的原文内容保留在新审校输入中。` };
  const third = await reviewAndRepairStory(source, draft, { directory, generate, maxRepairRounds: 0 });
  assert.notEqual(first.report.sourceHash, third.report.sourceHash); assert.equal(third.report.sourceScope, 'user-import');
  assert.equal(calls.length, 3); assert.equal(new Set(calls.map(c => c.label)).size, 3);
  assert.equal(calls[2].source.text, source.text);
  assert.throws(() => assertEditorialPass(source, first.draft, first.report), /different source\/draft/);
});

test('a clean pass makes one review call, and equivalent JSON resumes without repairs', async context => {
  const draft = fixture(), directory = await staging(context), calls: Request[] = [], reused: boolean[] = [];
  const generate = engine(request => review(request.draft), calls);
  const first = await reviewAndRepairStory(originalSeed, draft, { directory, generate });
  const reordered = { routes: draft.routes, outline: Object.fromEntries(Object.entries(draft.outline).reverse()) } as GeneratedDraft;
  const second = await reviewAndRepairStory(originalSeed, reordered, { directory, generate, onCheckpoint: async c => { reused.push(c.reused); } });
  assert.equal(calls.length, 1); assert.deepEqual(first, second); assert.deepEqual(reused, [true]);
  assert.equal(first.report.rounds[0].repairs.length, 0);
  assert.equal(first.report.remainingFindings.length, 0);
});

test('resume preserves a completed first route when the second route has not run', async context => {
  const directory = await staging(context), draft = fixture(), calls: Request[] = [];
  let interrupt = true;
  const fixed = `已经修订的检修灯反馈。${text}`;
  const generate = engine(request => {
    if (request.label.startsWith('route-repair')) {
      const part = structuredClone(request.draft.routes.find(r => r.routeId === request.target!.routeIds[0])!);
      part.scenes[0].choices[0].feedback = fixed; return part;
    }
    return review(request.draft, [0, 1].flatMap(i => request.draft.routes[i].scenes[0].choices[0].feedback === fixed ? [] : [routeFinding(request.draft, i)]));
  }, calls);
  await assert.rejects(reviewAndRepairStory(originalSeed, draft, { directory, generate,
    onCheckpoint: async c => { if (interrupt && c.kind === 'route-repair') { interrupt = false; throw new Error('simulated owner interruption'); } },
  }), /owner interruption/);
  const result = await reviewAndRepairStory(originalSeed, draft, { directory, generate });
  assert.equal(result.report.status, 'passed'); assert.equal(calls.length, 4);
  assert.equal(new Set(calls.map(c => c.label)).size, 4);
  assert.equal(calls.filter(c => c.target?.routeIds[0] === 'route_a').length, 1);
  assert.equal(calls.filter(c => c.target?.routeIds[0] === 'route_b').length, 1);
  assert.equal(result.draft.routes[0].scenes[0].choices[0].feedback, fixed);
  assert.deepEqual(result.draft.routes[2], draft.routes[2]);
});

test('cached review integrity and immutable snapshots are checked on every resume', async context => {
  const draft = fixture(), directory = await staging(context), generate = engine(request => review(request.draft));
  const result = await reviewAndRepairStory(originalSeed, draft, { directory, generate });
  const file = join(result.directory, `${result.report.rounds[0].reviewCheckpoint}.accepted.json`);
  const cached = JSON.parse(await readFile(file, 'utf8'));
  cached.data.findings = [openingFinding(draft)]; cached.data.findings[0].evidence[0].quote = '伪造的审校引文';
  await writeFile(file, JSON.stringify(cached));
  await assert.rejects(reviewAndRepairStory(originalSeed, draft, { directory, generate }), /hash mismatch/);
  cached.outputHash = editorialHash(cached.data); await writeFile(file, JSON.stringify(cached));
  await assert.rejects(reviewAndRepairStory(originalSeed, draft, { directory, generate }), /unverifiable quote/);
  await writeFile(join(result.directory, 'input.json'), '{}');
  await assert.rejects(reviewAndRepairStory(originalSeed, draft, { directory, generate }), /immutable checkpoint mismatch/);
});

test('repair schemas and identity checks prevent unrelated edits or removal of completed scenes', async context => {
  for (const scope of ['outline', 'route'] as const) {
    const directory = await staging(context), draft = fixture(), original = structuredClone(draft);
    await assert.rejects(reviewAndRepairStory(originalSeed, draft, { directory, generate: engine(request => {
      if (request.label.startsWith('review-')) return review(request.draft, [scope === 'outline' ? openingFinding(request.draft) : routeFinding(request.draft)]);
      if (scope === 'outline') return { opening: request.draft.outline.opening, resources: request.draft.outline.resources };
      return { ...request.draft.routes[0], scenes: request.draft.routes[0].scenes.map((s, i) => i === 1 ? { ...s, id: 'invented_replacement' } : s) };
    }) }), /output rejected/);
    assert.deepEqual(draft, original);
  }
});

test('advisory prose stays visible and invalid budgets do not call the generator', async context => {
  const draft = fixture(), directory = await staging(context), finding = routeFinding(draft);
  finding.category = 'prose'; finding.severity = 'advisory';
  const result = await reviewAndRepairStory(originalSeed, draft, { directory, maxRepairRounds: 0, generate: engine(request => review(request.draft, [finding])) });
  assert.equal(result.report.status, 'passed'); assert.equal(result.report.advisoryCount, 1);
  assert.equal(result.report.remainingFindings[0].id, finding.id);
  for (const maxRepairRounds of [-1, 0.5, 4, Infinity]) await assert.rejects(reviewAndRepairStory(originalSeed, draft, {
    directory, maxRepairRounds, generate: engine(() => { throw new Error('unexpected model call'); }),
  }), /repair budget/);
  const prompt = editorialReviewPrompt(originalSeed, draft);
  assert.match(prompt, /original-seed/); assert.match(prompt, /所有路线入口/);
  assert.equal(dataLine<ImportedSource>(prompt, 'USER_SOURCE_DATA').text, originalSeed.text);
});
