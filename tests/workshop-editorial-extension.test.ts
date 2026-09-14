import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import test, { type TestContext } from 'node:test';
import type { DraftScene, GeneratedDraft, ImportedSource, RouteDraft } from '../shared/workshop.ts';
import { buildGeneratedWorld } from '../server/workshop-compiler.ts';
import type { runCreative } from '../server/workshop-creative.ts';
import {
  assertEditorialPass, editorialHash, editorialProtocol, extendedEditorialProtocol, reviewAndRepairStory,
  type CreativeEditorialReview, type EditorialFinding,
} from '../server/workshop-editorial.ts';
import {
  editorialPolicyHash, readEditorialNotes, runWorkshopEditorial, type EditorialNotes,
} from '../server/workshop-editorial-job.ts';
import { outlineSchema, validateSchema, type Schema } from '../server/workshop-schema.ts';

const projectId = 'import-00000000-0000-4000-8000-000000000002';
const prose = 'Explicit automated-test fixture only. The operator records the actual action, keeps the acquired evidence, and accounts for the remaining battery before leaving the test station.';
const source: ImportedSource = {
  title: 'Editorial extension test source', author: 'Automated test', scope: 'user-import',
  text: 'The station clock is slow. The operator keeps a paper record. The rescue boat waits outside.',
};
const extraSceneId = 'route_a_rescued_after_search';

function fixture(): GeneratedDraft {
  const ids = ['route_a', 'route_b', 'route_c'];
  return { outline: {
    title: 'Editorial extension test', subtitle: 'Automated fixture only', summary: prose,
    introduction: [prose, prose], objective: prose, player: { name: 'Operator', role: 'Test station operator' }, beginnerTip: prose,
    facts: source.text.split('. ').map(quote => ({ quote, fact: prose })),
    characters: ['operator', 'witness'].map(id => ({ id, name: id, role: 'Test character', description: prose, motive: prose })),
    resources: [{ id: 'battery', label: 'Battery', initial: 12, min: 0, max: 12, description: prose }],
    routes: ids.map(id => ({ id, title: `Test ${id}`, commitment: prose, premise: prose,
      beats: Array.from({ length: 10 }, (_, i) => `${i}: ${prose}`),
      endings: (['good', 'bad'] as const).map(kind => ({ id: `${id}_${kind}`, title: `Test ${kind}`, kind, resolution: prose, cause: prose })) })),
    opening: { title: 'Test opening', location: 'Test station', time: 'Before departure', text: [prose, prose] },
  }, routes: ids.map(routeId => ({ routeId, entry: `${routeId}_s0`, scenes: [
    ...Array.from({ length: 10 }, (_, i): DraftScene => ({
      id: `${routeId}_s${i}`, title: `Test scene ${i}`, location: 'Test station', time: 'Before departure', speaker: 'Narrator',
      text: [prose, prose], purpose: `${i}: ${prose}`, artBrief: prose, ending: null,
      choices: [
        { id: 'continue_path', text: 'Inspect the next station record', hint: prose,
          next: i < 9 ? `${routeId}_s${i + 1}` : `${routeId}_good`, costs: [{ resource: 'battery', delta: -1 }],
          gains: i === 0 ? [`${routeId}_evidence`] : [], needs: i === 2 ? [`${routeId}_evidence`] : [], feedback: prose },
        { id: 'exit_path', text: 'Leave through the marked exit', hint: prose, next: `${routeId}_bad`, costs: [], gains: [], needs: [], feedback: prose },
      ],
    })),
    ...(['good', 'bad'] as const).map((kind): DraftScene => ({
      id: `${routeId}_${kind}`, title: `Test ${kind} ending`, location: 'Test shore', time: 'After departure', speaker: 'Narrator',
      text: [prose, prose], purpose: `${kind}: ${prose}`, artBrief: prose, choices: [],
      ending: { kind, title: `Test ${kind} ending`, resolution: prose },
    })),
  ] })) };
}

function extendRoute(route: RouteDraft, count = 1): RouteDraft {
  const extended = structuredClone(route);
  for (let i = 0; i < count; i++) {
    const id = i === 0 ? extraSceneId : `${route.routeId}_extra_ending_${i}`;
    extended.scenes.push({ ...structuredClone(route.scenes.at(-2)!), id,
      title: `Resolved test ending ${i}`, purpose: `Resolved additional ending ${i}: ${prose}`,
      text: [prose, 'The rescue crew reaches both operators, receives the actual saved records, and returns them to shore. The test station is closed and the abandoned experiment is explicitly recorded as lost.'],
    });
    extended.scenes[0].choices.push({ id: `take_rescue_${i}`, text: 'Wait in the sealed room for rescue', hint: prose,
      next: id, costs: [], gains: [], needs: [], feedback: prose });
  }
  return extended;
}

test('revised outline can describe every ending allowed by the existing scene and decision budgets', () => {
  const draft = fixture();
  validateSchema(outlineSchema, draft.outline);
  draft.routes[0] = extendRoute(draft.routes[0], 6);
  draft.outline.routes[0].endings = draft.routes[0].scenes.filter(scene => scene.ending).map(scene => ({
    id: scene.id, title: scene.ending!.title, kind: scene.ending!.kind, resolution: scene.ending!.resolution, cause: prose,
  }));
  assert.equal(draft.outline.routes[0].endings.length, 8);
  validateSchema(outlineSchema, draft.outline);
  const built = buildGeneratedWorld(projectId, 1, source, draft);
  assert.equal(built.validation.decisions, 31);
  assert.equal(built.validation.endings, 12);
});

test('outline ending capacity remains bounded above the revised-route limit', () => {
  const draft = fixture();
  draft.outline.routes[0].endings = Array.from({ length: 9 }, (_, index) => ({
    ...draft.outline.routes[0].endings[0], id: `route_a_end_${index}`,
  }));
  assert.throws(() => validateSchema(outlineSchema, draft.outline), /endings/);
});

test('revised outline can describe sixteen decision beats but not exceed the scene budget', () => {
  const draft = fixture();
  draft.outline.routes[0].beats = Array.from({ length: 16 }, (_, index) => `${index}: ${prose}`);
  validateSchema(outlineSchema, draft.outline);
  draft.outline.routes[0].beats.push(prose);
  assert.throws(() => validateSchema(outlineSchema, draft.outline), /beats/);
});

function review(draft: GeneratedDraft, findings: EditorialFinding[] = []): CreativeEditorialReview {
  return { summary: 'Explicit test-only full editorial coverage.', findings,
    coverage: { opening: 'reviewed', outline: 'reviewed', routes: draft.routes.map(r => ({ routeId: r.routeId, sceneIds: r.scenes.map(s => s.id) })) } };
}
function finding(draft: GeneratedDraft): EditorialFinding {
  const route = draft.routes[0], scene = route.scenes[0];
  return { id: 'missing_resolved_exit', severity: 'blocking', category: 'choice_causality', basis: 'invented_continuation',
    problem: 'The completed shelter action needs its own resolved rescue consequence in this test fixture.', sourceQuotes: [],
    evidence: [{ kind: 'scene', routeId: route.routeId, sceneId: scene.id, choiceId: null, path: '/text/0', quote: scene.text[0] }],
    repair: { outlineFields: [], routeIds: [route.routeId], instruction: 'Retain all existing scenes and choices; add a complete rescue ending reachable by a new shelter choice.' } };
}
interface Request { directory: string; label: string; prompt: string; draft: GeneratedDraft }
function dataLine<T>(prompt: string, name: string): T {
  const line = prompt.split('\n').find(line => line.startsWith(`${name}=`));
  assert.ok(line, name);
  return JSON.parse(line.slice(name.length + 1)) as T;
}
function engine(handler: (request: Request) => unknown | Promise<unknown>, calls: Request[] = []): typeof runCreative {
  return async <T>(directory: string, label: string, _schema: Schema, prompt: string): Promise<T> => {
    const request = { directory, label, prompt, draft: dataLine<GeneratedDraft>(prompt, 'DRAFT_DATA') };
    assert.deepEqual(dataLine<ImportedSource>(prompt, 'USER_SOURCE_DATA'), source);
    calls.push(request);
    return structuredClone(await handler(request)) as T;
  };
}
function extendingEngine(calls: Request[] = [], mutate?: (route: RouteDraft) => void): typeof runCreative {
  return engine(request => {
    if (request.label.startsWith('route-repair')) {
      const route = extendRoute(request.draft.routes[0]);
      mutate?.(route);
      return route;
    }
    return review(request.draft, request.draft.routes[0].scenes.length === 12 ? [finding(request.draft)] : []);
  }, calls);
}
async function staging(context: TestContext): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'workshop-editorial-extension-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
async function json(file: string, value: unknown): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value));
}
async function files(directory: string): Promise<Record<string, { bytes: string; mtimeMs: number }>> {
  const result: Record<string, { bytes: string; mtimeMs: number }> = {};
  for (const name of (await readdir(directory)).sort()) {
    const file = join(directory, name), info = await stat(file);
    if (info.isDirectory()) {
      for (const [child, value] of Object.entries(await files(file))) result[join(name, child)] = value;
    } else result[name] = { bytes: await readFile(file, 'utf8'), mtimeMs: info.mtimeMs };
  }
  return result;
}
function notes(repairMode: EditorialNotes['repairMode'] = 'preserve-and-extend-v2'): EditorialNotes {
  return { sourceHash: editorialHash(source), observedDraftHash: editorialHash({ historical: 'earlier draft' }),
    notes: ['Test-only prior observation: inspect the current rescue decision before repeating this finding.'],
    ...(repairMode ? { repairMode } : {}),
  };
}
async function ancestry(directory: string, observed = notes()): Promise<{ r1: string; r2: string; r3: string }> {
  const r1 = join(directory, 'r1'), r2 = join(directory, 'r2'), r3 = join(directory, 'r3');
  await json(join(r1, 'editorial-notes.json'), observed);
  await json(join(r2, 'revision-origin.json'), { kind: 'editorial-revision', baseVersion: 'r1' });
  await json(join(r3, 'revision-origin.json'), { kind: 'editorial-revision', baseVersion: 'r2' });
  return { r1, r2, r3 };
}

test('opt-in preserves old identities, adds a reachable resolved ending, and fully re-reviews before compilation', async context => {
  const directory = await staging(context), draft = fixture(), initial = structuredClone(draft), calls: Request[] = [];
  const result = await reviewAndRepairStory(source, draft, { directory, allowSceneAdditions: true, generate: extendingEngine(calls) });
  assert.equal(result.report.protocol, extendedEditorialProtocol);
  assert.equal(result.report.status, 'passed');
  assert.equal(result.report.compilerValidation, 'required');
  assert.equal(result.report.rounds.length, 2);
  assert.deepEqual(calls.map(c => c.label.match(/^(.*)-r\d+-/)![1]), ['review', 'route-repair', 'review']);
  assert.equal(calls[2].draft.routes[0].scenes.length, 13);
  assert.deepEqual(result.report.rounds[1].review.coverage, review(result.draft).coverage);
  assert.ok(result.report.rounds[1].review.coverage.routes[0].sceneIds.includes(extraSceneId));
  assert.equal(result.report.draftHash, editorialHash(result.draft));
  assert.notEqual(result.report.inputDraftHash, result.report.draftHash);
  assert.equal(result.draft.routes[0].entry, initial.routes[0].entry);
  for (const scene of initial.routes[0].scenes) {
    const updated = result.draft.routes[0].scenes.find(s => s.id === scene.id)!;
    assert.ok(updated);
    for (const choice of scene.choices) assert.ok(updated.choices.some(c => c.id === choice.id));
  }
  assert.deepEqual(result.draft.routes.slice(1), initial.routes.slice(1));
  assert.deepEqual(result.draft.outline, initial.outline);
  assert.deepEqual(draft, initial);
  assertEditorialPass(source, result.draft, result.report);
  const compiled = buildGeneratedWorld(projectId, 1, source, result.draft);
  assert.equal(compiled.validation.scenes, 38);
  assert.equal(compiled.validation.endings, 7);
  assert.ok(compiled.world.nodes[extraSceneId].ending);
  assert.equal(compiled.world.nodes.route_a_s0.choices.find(c => c.id === 'take_rescue_0')!.nextNodeId, extraSceneId);
  const resumed = await reviewAndRepairStory(source, draft, { directory, allowSceneAdditions: true,
    generate: engine(() => { throw new Error('Unexpected model callback on cached extension'); }) });
  assert.deepEqual(resumed, result);
});

test('default and explicit false keep the exact v1 identity and rejected files untouched when opting in', async context => {
  const directory = await staging(context), draft = fixture(), calls: Request[] = [], generate = extendingEngine(calls);
  const runId = editorialHash({ protocol: editorialProtocol, sourceHash: editorialHash(source), inputDraftHash: editorialHash(draft), maxRepairRounds: 2 });
  const legacyDirectory = join(resolve(directory), `${editorialProtocol}-${runId.slice(0, 24)}`);
  await assert.rejects(reviewAndRepairStory(source, draft, { directory, generate }), /IDs differ/);
  await assert.rejects(reviewAndRepairStory(source, draft, { directory, generate, allowSceneAdditions: false }), /IDs differ/);
  await assert.rejects(reviewAndRepairStory(source, draft, { directory, generate, allowSceneAdditions: false }), /budget exhausted/);
  assert.deepEqual(await readdir(directory), [basename(legacyDirectory)]);
  assert.equal(calls.length, 3);
  const rejectedNames = (await readdir(legacyDirectory)).filter(name => name.endsWith('.rejected.json'));
  assert.equal(rejectedNames.length, 2);
  for (const name of rejectedNames) {
    const rejected = JSON.parse(await readFile(join(legacyDirectory, name), 'utf8'));
    assert.ok(rejected.data.scenes.some((s: DraftScene) => s.id === extraSceneId));
    assert.match(rejected.message, /IDs differ/);
  }
  const before = await files(legacyDirectory);
  const extended = await reviewAndRepairStory(source, draft, { directory, generate, allowSceneAdditions: true });
  assert.equal(extended.report.protocol, extendedEditorialProtocol);
  assert.notEqual(extended.directory, legacyDirectory);
  assert.equal((await readdir(directory)).length, 2);
  assert.deepEqual(await files(legacyDirectory), before);
  assert.equal(calls.length, 6);
  const legacyInput = JSON.parse(await readFile(join(legacyDirectory, 'input.json'), 'utf8'));
  assert.equal(legacyInput.protocol, editorialProtocol);
  assert.equal(Object.hasOwn(legacyInput, 'allowSceneAdditions'), false);
});

test('extension rejects removal, duplicate identities, foreign namespaces, identity changes, and the schema cap', async context => {
  const cases: [string, (route: RouteDraft) => void, RegExp][] = [
    ['old scene removed', route => { route.scenes.splice(1, 1); }, /extension changed or reused scene IDs/],
    ['scene duplicated', route => { route.scenes.at(-1)!.id = route.scenes[0].id; }, /extension changed or reused scene IDs/],
    ['foreign prefix', route => { route.scenes.at(-1)!.id = 'route_ab_new_ending'; }, /extension changed or reused scene IDs/],
    ['old choice removed', route => { route.scenes[0].choices.shift(); }, /removed choice/],
    ['choice duplicated', route => { route.scenes[0].choices.push(structuredClone(route.scenes[0].choices[0])); }, /ambiguous choices/],
    ['route identity changed', route => { route.routeId = 'route_b'; }, /changed identity\/entry/],
    ['entry changed', route => { route.entry = 'route_a_s1'; }, /changed identity\/entry/],
    ['nineteen scenes', route => { Object.assign(route, extendRoute(fixture().routes[0], 7)); }, /\$\.scenes/],
  ];
  for (const [name, mutate, expected] of cases) await context.test(name, async child => {
    const directory = await staging(child), draft = fixture(), initial = structuredClone(draft);
    await assert.rejects(reviewAndRepairStory(source, draft, { directory, allowSceneAdditions: true, generate: extendingEngine([], mutate) }), expected);
    assert.deepEqual(draft, initial);
    const [run] = await readdir(directory), retained = await readdir(join(directory, run));
    assert.equal(retained.filter(file => file.endsWith('.rejected.json')).length, 1);
    assert.ok(!retained.includes('result.json'));
  });
});

test('exactly eighteen route scenes remain valid and all new endings are compiled', async context => {
  const draft = fixture(), directory = await staging(context);
  const result = await reviewAndRepairStory(source, draft, { directory, allowSceneAdditions: true,
    generate: extendingEngine([], route => { Object.assign(route, extendRoute(draft.routes[0], 6)); }) });
  assert.equal(result.draft.routes[0].scenes.length, 18);
  assert.equal(result.report.rounds.at(-1)!.review.coverage.routes[0].sceneIds.length, 18);
  assertEditorialPass(source, result.draft, result.report);
  assert.equal(buildGeneratedWorld(projectId, 1, source, result.draft).validation.endings, 12);
});

test('new scenes cannot inherit an old review that omits their coverage', async context => {
  const directory = await staging(context), draft = fixture();
  await assert.rejects(reviewAndRepairStory(source, draft, { directory, allowSceneAdditions: true, generate: engine(request => {
    if (request.label.startsWith('route-repair')) return extendRoute(request.draft.routes[0]);
    if (request.draft.routes[0].scenes.length === 12) return review(request.draft, [finding(request.draft)]);
    return review(draft);
  }) }), /IDs differ/);
  const [run] = await readdir(directory), runDirectory = join(directory, run), names = await readdir(runDirectory);
  assert.ok(names.some(name => name.startsWith('route-repair-') && name.endsWith('.accepted.json')));
  assert.ok(names.some(name => name.startsWith('review-r1-') && name.endsWith('.rejected.json')));
  assert.ok(!names.includes('result.json'));
});

test('extended acceptance and cached re-review remain bound to full new-scene content and coverage', async context => {
  const directory = await staging(context), draft = fixture();
  const result = await reviewAndRepairStory(source, draft, { directory, allowSceneAdditions: true, generate: extendingEngine() });
  const changed = structuredClone(result.draft);
  changed.routes[0].scenes.at(-1)!.text[0] = `Changed ending prose. ${prose}`;
  assert.throws(() => assertEditorialPass(source, changed, result.report), /different source\/draft\/protocol/);
  const omitted = structuredClone(result.report);
  omitted.rounds.at(-1)!.review.coverage.routes[0].sceneIds.pop();
  assert.throws(() => assertEditorialPass(source, result.draft, omitted), /IDs differ/);
  const file = join(result.directory, `${result.report.rounds.at(-1)!.reviewCheckpoint}.accepted.json`);
  const cached = JSON.parse(await readFile(file, 'utf8'));
  cached.data.coverage.routes[0].sceneIds.pop();
  await writeFile(file, JSON.stringify(cached));
  const options = { directory, allowSceneAdditions: true, generate: engine(() => { throw new Error('Unexpected model callback'); }) };
  await assert.rejects(reviewAndRepairStory(source, draft, options), /cached output hash mismatch/);
  cached.outputHash = editorialHash(cached.data);
  await writeFile(file, JSON.stringify(cached));
  await assert.rejects(reviewAndRepairStory(source, draft, options), /IDs differ/);
});

test('full editorial coverage does not bypass compiler reachability for new or retained scenes', async context => {
  for (const target of ['new', 'retained'] as const) await context.test(target, async child => {
    const result = await reviewAndRepairStory(source, fixture(), { directory: await staging(child), allowSceneAdditions: true,
      generate: extendingEngine([], route => {
        if (target === 'new') route.scenes[0].choices.pop();
        else route.scenes[0].choices[0].next = 'route_a_good';
      }) });
    assert.equal(result.report.status, 'passed');
    assert.equal(result.report.compilerValidation, 'required');
    assertEditorialPass(source, result.draft, result.report);
    assert.throws(() => buildGeneratedWorld(projectId, 1, source, result.draft), /\u4ece\u5165\u53e3\u5230\u4e0d\u4e86/);
  });
});

test('notes inherit transitively from earlier revisions without writing or changing historical observations', async context => {
  const directory = await staging(context), observed = notes(), { r3 } = await ancestry(directory, observed);
  const before = await files(directory);
  assert.deepEqual(await readEditorialNotes(r3, source), observed);
  assert.notEqual(observed.observedDraftHash, editorialHash(fixture()));
  assert.deepEqual(await files(directory), before);
  assert.ok(!Object.hasOwn(before, join('r3', 'editorial-notes.json')));
});

test('invalid revision ancestry is rejected before inheriting or writing notes', async context => {
  const cases: [string, string, unknown][] = [
    ['same revision', 'r3', { kind: 'editorial-revision', baseVersion: 'r3' }],
    ['future revision', 'r3', { kind: 'editorial-revision', baseVersion: 'r4' }],
    ['zero revision', 'r3', { kind: 'editorial-revision', baseVersion: 'r0' }],
    ['parent traversal', 'r3', { kind: 'editorial-revision', baseVersion: '../r1' }],
    ['invalid origin kind', 'r3', { kind: 'copied-draft', baseVersion: 'r1' }],
    ['invalid current name', 'working', { kind: 'editorial-revision', baseVersion: 'r1' }],
  ];
  for (const [name, revision, origin] of cases) await context.test(name, async child => {
    const directory = await staging(child), current = join(directory, revision);
    await json(join(directory, 'r1', 'editorial-notes.json'), notes());
    await json(join(current, 'revision-origin.json'), origin);
    const before = await files(directory);
    await assert.rejects(readEditorialNotes(current, source), /revision ancestry is invalid/);
    assert.deepEqual(await files(directory), before);
  });
});

test('inherited notes validate the exact source, observed hash, note content, and repair mode', async context => {
  const cases: [string, (value: Record<string, unknown>) => void][] = [
    ['different source', value => { value.sourceHash = editorialHash({ ...source, text: `${source.text} Extra source text.` }); }],
    ['invalid observation hash', value => { value.observedDraftHash = 'not-a-draft-hash'; }],
    ['empty observations', value => { value.notes = []; }],
    ['invalid repair mode', value => { value.repairMode = 'replace-all-scenes'; }],
  ];
  for (const [name, mutate] of cases) await context.test(name, async child => {
    const directory = await staging(child), { r1, r3 } = await ancestry(directory);
    const invalid: Record<string, unknown> = { ...notes() };
    mutate(invalid);
    await json(join(r1, 'editorial-notes.json'), invalid);
    const before = await files(directory);
    await assert.rejects(readEditorialNotes(r3, source), /do not match the source or expected structure/);
    let called = false;
    await assert.rejects(runWorkshopEditorial(source, fixture(), { directory: r3, attempt: 1,
      generate: engine(() => { called = true; throw new Error('Unexpected model callback'); }) }), /do not match the source or expected structure/);
    assert.equal(called, false);
    assert.deepEqual(await files(directory), before);
  });
});

test('local notes take precedence and absent ancestry does not manufacture observations', async context => {
  const directory = await staging(context), { r3 } = await ancestry(directory);
  const local = { ...notes(), notes: ['Current revision observation replaces the inherited observations.'] };
  delete local.repairMode;
  await json(join(r3, 'editorial-notes.json'), local);
  assert.deepEqual(await readEditorialNotes(r3, source), local);
  const fresh = join(directory, 'r4');
  await mkdir(fresh);
  assert.equal(await readEditorialNotes(fresh, source), undefined);
  assert.deepEqual(await readdir(fresh), []);
});

test('worker snapshots inherited opt-in notes before review and resumes independently of later ancestor edits', async context => {
  const directory = await staging(context), observed = notes(), { r1, r3 } = await ancestry(directory, observed);
  const draft = fixture(), calls: Request[] = [];
  const generate = engine(async request => {
    assert.deepEqual(JSON.parse(await readFile(join(r3, 'editorial-notes.json'), 'utf8')), observed);
    assert.deepEqual(dataLine<EditorialNotes>(request.prompt, 'REVIEWER_OBSERVATIONS_DATA'), observed);
    if (calls.length === 1) await json(join(r1, 'editorial-notes.json'), { ...observed, notes: ['Later ancestor observation, not part of this run.'] });
    if (request.label.startsWith('route-repair')) return extendRoute(request.draft.routes[0]);
    return review(request.draft, request.draft.routes[0].scenes.length === 12 ? [finding(request.draft)] : []);
  }, calls);
  const result = await runWorkshopEditorial(source, draft, { directory: r3, attempt: 1, allowSceneAdditions: false, generate });
  assert.equal(result.report.protocol, extendedEditorialProtocol);
  assert.ok(result.directory.includes(`run-1-${editorialPolicyHash(observed).slice(0, 12)}`));
  assert.equal(calls.length, 3);
  assertEditorialPass(source, result.draft, result.report);
  assert.equal(buildGeneratedWorld(projectId, 3, source, result.draft).validation.scenes, 38);
  const resumed = await runWorkshopEditorial(source, draft, { directory: r3, attempt: 2,
    generate: engine(() => { throw new Error('Unexpected model callback after notes snapshot'); }) });
  assert.deepEqual(resumed, result);
  assert.deepEqual(await readEditorialNotes(r3, source), observed);
  const ledger = JSON.parse(await readFile(join(r3, 'editorial-run.json'), 'utf8'));
  assert.equal(ledger.policyHash, editorialPolicyHash(observed));
  assert.equal(ledger.series, 1);
  assert.equal(ledger.status, 'passed');
});

test('worker without notes mode stays v1, while adding the mode creates a separate policy and protocol run', async context => {
  const directory = await staging(context), draft = fixture();
  const legacyNotes = notes();
  delete legacyNotes.repairMode;
  await json(join(directory, 'editorial-notes.json'), legacyNotes);
  const first = await runWorkshopEditorial(source, draft, { directory, attempt: 1, allowSceneAdditions: true,
    generate: engine(request => review(request.draft)) });
  assert.equal(first.report.protocol, editorialProtocol);
  const before = await files(first.directory), extendedNotes = notes();
  await json(join(directory, 'editorial-notes.json'), extendedNotes);
  assert.notEqual(editorialPolicyHash(legacyNotes), editorialPolicyHash(extendedNotes));
  const second = await runWorkshopEditorial(source, draft, { directory, attempt: 2, generate: extendingEngine() });
  assert.equal(second.report.protocol, extendedEditorialProtocol);
  assert.ok(second.directory.includes(`run-2-${editorialPolicyHash(extendedNotes).slice(0, 12)}`));
  assert.notEqual(second.directory, first.directory);
  assert.deepEqual(await files(first.directory), before);
});
