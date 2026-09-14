import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DraftScene, ImportedSource, RouteDraft, StoryOutline } from '../shared/workshop.ts';
import { jsonFile, writeJson } from '../server/story-workshop.ts';
import { assertSceneGroup, generateWorkshopRoute, routeGraphOf, routeSingleSceneSchema, routeSceneCatalog, assertSingleScene } from '../server/workshop-route-generation.ts';
import { validateSchema } from '../server/workshop-schema.ts';
import type { runCreative } from '../server/workshop-creative.ts';

const prose = 'Explicit synthetic test fixture only. The operator checks the station record, hears the witness describe the damaged cable, and keeps the evidence before moving to the next room.';
function fixture() {
  const source: ImportedSource = { title: 'Synthetic route checkpoint test', author: 'Automated test', scope: 'user-import', text: '\uFEFFThe operator keeps the evidence.\r\nThe cable is damaged.  ' };
  const routeId = 'route_a';
  const outline: StoryOutline = {
    title: source.title, subtitle: 'Fixture only', summary: prose, introduction: [prose, prose], objective: prose,
    player: { name: 'Operator', role: 'Station operator' }, beginnerTip: prose, facts: [],
    characters: ['operator', 'witness'].map(id => ({ id, name: id, role: 'Test character', description: prose, motive: prose })),
    resources: [{ id: 'battery', label: 'Battery', initial: 12, min: 0, max: 12, description: prose }],
    routes: [{ id: routeId, title: 'Inspect the damaged cable', commitment: prose, premise: prose,
      beats: Array.from({ length: 10 }, (_, i) => `${i}: ${prose}`),
      endings: (['good', 'bad'] as const).map(kind => ({ id: `${routeId}_${kind}`, title: `Test ${kind}`, kind, resolution: prose, cause: prose })),
    }], opening: { title: 'Opening', location: 'Station', time: 'Before departure', text: [prose, prose] },
  };
  const draft: RouteDraft = { routeId, entry: `${routeId}_s0`, scenes: [
    ...Array.from({ length: 10 }, (_, i): DraftScene => ({ id: `${routeId}_s${i}`, title: `Test scene ${i}`, location: 'Station', time: 'Before departure', speaker: 'Narrator', text: [prose, `${prose} ${i}`], purpose: `${i}: Check the corresponding cable and preserve the original test evidence.`, artBrief: prose, ending: null,
      choices: [{ id: 'continue_path', text: 'Inspect the next station record', hint: prose.slice(0, 120), next: i < 9 ? `${routeId}_s${i + 1}` : `${routeId}_good`, costs: [{ resource: 'battery', delta: -1 }], gains: i === 0 ? ['cable_evidence'] : [], needs: [2, 3].includes(i) ? ['cable_evidence'] : [], feedback: prose },
        { id: 'exit_path', text: 'Leave through the marked exit', hint: prose.slice(0, 120), next: `${routeId}_bad`, costs: [], gains: [], needs: [], feedback: prose }],
    })),
    ...(['good', 'bad'] as const).map((kind): DraftScene => ({ id: `${routeId}_${kind}`, title: `Test ${kind}`, location: 'Shore', time: 'After departure', speaker: 'Narrator', text: [prose, `${prose} ${kind}`], purpose: `Record the ${kind} outcome and return all surviving operators to shore.`, artBrief: prose, choices: [], ending: { kind, title: `Test ${kind}`, resolution: prose } })),
  ] };
  return { source, outline, route: outline.routes[0], draft };
}
async function temporary(t: { after: (callback: () => Promise<void>) => void }) {
  const directory = await mkdtemp(join(tmpdir(), 'workshop-route-parts-'));
  t.after(() => rm(directory, { recursive: true, force: true })); return directory;
}
const scene = (draft: RouteDraft, prompt: string): DraftScene => {
  const selected = JSON.parse(prompt.split('SELECTED_SCENE_DATA=')[1]) as { id: string };
  return draft.scenes.find(value => value.id === selected.id)!;
};
const expectedCalls = Array.from({ length: 12 }, (_, index) => 'scene-' + (index + 1));
function assertPairOrder(calls: string[], expected: string[]) {
  assert.equal(calls.length, expected.length);
  for (let index = 0; index < expected.length; index += 2) assert.deepEqual(calls.slice(index, index + 2).sort(), expected.slice(index, index + 2).sort());
}

const executor = (callback: (directory: string, label: string, schema: Parameters<typeof runCreative>[2], prompt: string) => Promise<unknown>) => callback as typeof runCreative;

test('a relay route writes one complete scene per request from the real outline, preserving source and legacy receipts', async t => {
  const directory = await temporary(t), f = fixture(), calls: string[] = [], sourceBytes = JSON.stringify(f.source);
  const legacyDirectory = join(directory, 'creative'); await mkdir(legacyDirectory);
  const receipt = join(legacyDirectory, 'route-route_a.receipt.json'), receiptBytes = '{"failure":"prior-relay-timeout","characters":15797}';
  await writeFile(receipt, receiptBytes);
  let active = 0, ceiling = 0;
  const execute = executor(async (_dir, label, schema, prompt) => {
    calls.push(label); active++; ceiling = Math.max(ceiling, active);
    try {
      await new Promise(resolve => setTimeout(resolve, 10));
      assert.ok(prompt.includes(`USER_SOURCE_DATA=${sourceBytes}`));
      const output = scene(f.draft, prompt);
      assert.equal(schema, routeSingleSceneSchema); assert.equal('scenes' in output, false);
      assert.ok(prompt.includes('SCENE_CATALOG_DATA='));
      validateSchema(schema, output); return output;
    } finally { active--; }
  });
  const result = await generateWorkshopRoute(f.source, f.outline, f.route, { directory, attempt: 1, execute });
  assert.deepEqual(result, f.draft); assert.deepEqual(await jsonFile(join(directory, 'route-route_a.json')), f.draft);
  assertPairOrder(calls, expectedCalls); assert.equal(ceiling, 2);
  assert.equal(JSON.stringify(f.source), sourceBytes); assert.equal(await readFile(receipt, 'utf8'), receiptBytes);
  await generateWorkshopRoute(f.source, f.outline, f.route, { directory, attempt: 2, execute: executor(async () => { throw new Error('A completed route must be reused'); }) });
});

test('an existing validated route or completed legacy output bypasses all small requests byte-for-byte', async t => {
  const directory = await temporary(t), f = fixture(), file = join(directory, 'route-route_a.json');
  const bytes = JSON.stringify(f.draft, null, 4); await writeFile(file, bytes);
  const execute = executor(async () => { throw new Error('Unexpected provider call'); });
  assert.deepEqual(await generateWorkshopRoute(f.source, f.outline, f.route, { directory, attempt: 1, execute }), f.draft);
  assert.equal(await readFile(file, 'utf8'), bytes);
  await rm(file); await mkdir(join(directory, 'creative'));
  const output = join(directory, 'creative/route-route_a.output.json'); await writeFile(output, bytes);
  assert.deepEqual(await generateWorkshopRoute(f.source, f.outline, f.route, { directory, attempt: 2, execute }), f.draft);
  assert.equal(await readFile(output, 'utf8'), bytes);
});

test('one failed group preserves its sibling and retries only missing work on a later explicit attempt', async t => {
  const directory = await temporary(t), f = fixture(), calls: string[] = [], failures: string[] = [];
  const execute = executor(async (dir, label, _schema, prompt) => {
    calls.push(label);
    if (label === 'scene-2') { const receipt = join(dir, `${label}.receipt.json`); await writeFile(receipt, '{"failure":"fixture-only-timeout"}'); failures.push(receipt); throw new Error('fixture-only-timeout'); }
    await new Promise(resolve => setTimeout(resolve, 10));
    return scene(f.draft, prompt);
  });
  await assert.rejects(generateWorkshopRoute(f.source, f.outline, f.route, { directory, attempt: 1, execute }), /fixture-only-timeout/);
  assertPairOrder(calls, ['scene-1', 'scene-2']);
  await assert.rejects(readFile(join(directory, 'route-route_a.json')), { code: 'ENOENT' });
  await assert.rejects(generateWorkshopRoute(f.source, f.outline, f.route, { directory, attempt: 1, execute }), /显式续跑/);
  assert.equal(calls.length, 2);
  const retried: string[] = [];
  const result = await generateWorkshopRoute(f.source, f.outline, f.route, { directory, attempt: 2, execute: executor(async (_dir, label, _schema, prompt) => { retried.push(label); return scene(f.draft, prompt); }) });
  assert.deepEqual(result, f.draft); assert.equal(retried[0], 'scene-2'); assertPairOrder(retried.slice(1), expectedCalls.slice(2));
  assert.equal(await readFile(failures[0], 'utf8'), '{"failure":"fixture-only-timeout"}');
});

test('an invalid sixth scene is repaired with its actual error while five accepted checkpoints and the original output remain intact', async t => {
  const directory = await temporary(t), f = fixture(), firstCalls: string[] = [];
  let invalidFile = '', invalidBytes = '';
  const execute = executor(async (dir, label, _schema, prompt) => {
    firstCalls.push(label);
    const result = structuredClone(scene(f.draft, prompt));
    if (label === 'scene-6') {
      result.choices[1].costs = [{ resource: 'battery', delta: -1 }];
      invalidFile = join(dir, `${label}.output.json`); invalidBytes = JSON.stringify(result);
      await writeFile(invalidFile, invalidBytes);
    }
    return result;
  });
  await assert.rejects(generateWorkshopRoute(f.source, f.outline, f.route, { directory, attempt: 1, execute }), /缺少免费出口/);
  assertPairOrder(firstCalls, expectedCalls.slice(0, 6));
  const partDirectory = join(directory, 'route-parts/route_a', (await readdir(join(directory, 'route-parts/route_a')))[0]);
  const acceptedBefore = await Promise.all(Array.from({ length: 5 }, (_, i) => readFile(join(partDirectory, `scene-${i + 1}.json`), 'utf8')));
  const validation = await jsonFile<{ accepted: boolean; reason: string }>(invalidFile.replace('.output.json', '.validation.json'));
  assert.equal(validation.accepted, false); assert.match(validation.reason, /needs=\[\]/);
  await assert.rejects(generateWorkshopRoute(f.source, f.outline, f.route, { directory, attempt: 1, execute }), /显式续跑/);
  assert.equal(firstCalls.length, 6);
  const repairedCalls: string[] = [];
  const result = await generateWorkshopRoute(f.source, f.outline, f.route, { directory, attempt: 2, execute: executor(async (_dir, label, _schema, prompt) => {
    repairedCalls.push(label);
    if (label === 'scene-6') {
      assert.ok(prompt.includes('VALIDATION_ERROR_DATA='));
      assert.ok(prompt.includes('缺少免费出口'));
      assert.ok(prompt.includes(`PRIOR_INVALID_SCENE_DATA=${invalidBytes}`));
    } else assert.equal(prompt.includes('PRIOR_INVALID_SCENE_DATA='), false);
    return scene(f.draft, prompt);
  }) });
  assert.deepEqual(result, f.draft); assert.equal(repairedCalls[0], 'scene-6');
  assertPairOrder(repairedCalls.slice(1), expectedCalls.slice(6));
  assert.equal(await readFile(invalidFile, 'utf8'), invalidBytes);
  assert.deepEqual(await Promise.all(Array.from({ length: 5 }, (_, i) => readFile(join(partDirectory, `scene-${i + 1}.json`), 'utf8'))), acceptedBefore);
  assert.equal((await readdir(join(directory, 'route-parts/route_a'))).length, 1);
});

test('a saved complete response rejected inside the creative schema validator becomes correction input on explicit resume', async t => {
  const directory = await temporary(t), f = fixture();
  let rejectedFile = '', rejectedBytes = '';
  await assert.rejects(generateWorkshopRoute(f.source, f.outline, f.route, { directory, attempt: 1, execute: executor(async (dir, label, schema, prompt) => {
    const output = structuredClone(scene(f.draft, prompt));
    if (label === 'scene-2') {
      output.text = [prose];
      rejectedFile = join(dir, `${label}.output.json`); rejectedBytes = JSON.stringify(output);
      await writeFile(rejectedFile, rejectedBytes);
      validateSchema(schema, output);
    }
    return output;
  }) }), /数组长度不符合约定/);
  const retried: string[] = [];
  const result = await generateWorkshopRoute(f.source, f.outline, f.route, { directory, attempt: 2, execute: executor(async (_dir, label, _schema, prompt) => {
    retried.push(label);
    if (label === 'scene-2') {
      assert.ok(prompt.includes(`PRIOR_INVALID_SCENE_DATA=${rejectedBytes}`));
      assert.ok(prompt.includes('数组长度不符合约定'));
    }
    return scene(f.draft, prompt);
  }) });
  assert.deepEqual(result, f.draft); assert.equal(retried[0], 'scene-2'); assert.equal(retried.includes('scene-1'), false);
  assertPairOrder(retried.slice(1), expectedCalls.slice(2));
  assert.equal(await readFile(rejectedFile, 'utf8'), rejectedBytes);
});

test('group prose cannot alter graph identity, choices, conditions, costs, endings or selected scene coverage', () => {
  const f = fixture(), graph = routeGraphOf(f.draft), ids = [f.draft.scenes[0].id, f.draft.scenes[10].id];
  const original: RouteDraft = { routeId: f.draft.routeId, entry: f.draft.entry, scenes: [f.draft.scenes[0], f.draft.scenes[10]] };
  for (const mutate of [
    (draft: RouteDraft) => { draft.routeId = 'other_route'; }, (draft: RouteDraft) => { draft.entry = 'route_a_s1'; },
    (draft: RouteDraft) => { draft.scenes[0].choices[0].id = 'different_choice'; },
    (draft: RouteDraft) => { draft.scenes[0].choices[0].next = 'route_a_bad'; },
    (draft: RouteDraft) => { draft.scenes[0].choices[0].costs[0].delta = -2; },
    (draft: RouteDraft) => { draft.scenes[0].choices[0].gains = ['different_evidence']; },
    (draft: RouteDraft) => { draft.scenes[0].choices[0].needs = ['missing_evidence']; },
    (draft: RouteDraft) => { draft.scenes[1].ending!.kind = 'bad'; },
    (draft: RouteDraft) => { draft.scenes.pop(); }, (draft: RouteDraft) => { draft.scenes[1] = structuredClone(draft.scenes[0]); },
  ]) { const altered = structuredClone(original); mutate(altered); assert.throws(() => assertSceneGroup(graph, ids, altered)); }
  const proseOnly = structuredClone(original); proseOnly.scenes[0].text = [prose, `${prose} Newly written dialogue.`];
  assertSceneGroup(graph, ids, proseOnly);
});

test('completed raw group responses survive a crash before checkpoint commit', async t => {
  const directory = await temporary(t), f = fixture();
  await generateWorkshopRoute(f.source, f.outline, f.route, { directory, attempt: 1, execute: executor(async (dir, label, _schema, prompt) => {
    const result = scene(f.draft, prompt); await writeJson(join(dir, `${label}.output.json`), result); return result;
  }) });
  const hashes = await readdir(join(directory, 'route-parts/route_a')), partDirectory = join(directory, 'route-parts/route_a', hashes[0]);
  await rm(join(directory, 'route-route_a.json')); await rm(join(partDirectory, 'scene-1.json')); await rm(join(partDirectory, 'scene-2.json'));
  const restored = await generateWorkshopRoute(f.source, f.outline, f.route, { directory, attempt: 2, execute: executor(async () => { throw new Error('No duplicate request after completed output'); }) });
  assert.deepEqual(restored, f.draft);
});

test('changed source context cannot reuse incomplete route parts from an earlier input', async t => {
  const directory = await temporary(t), f = fixture();
  await assert.rejects(generateWorkshopRoute(f.source, f.outline, f.route, { directory, attempt: 1, execute: executor(async (_dir, label, _schema, prompt) => {
    if (label === 'scene-1') return scene(f.draft, prompt); throw new Error('fixture interruption');
  }) }), /fixture interruption/);
  const calls: string[] = [];
  await generateWorkshopRoute({ ...f.source, text: `${f.source.text}\r\nA new source fact.` }, f.outline, f.route, { directory, attempt: 2, execute: executor(async (_dir, label, _schema, prompt) => {
    calls.push(label); return scene(f.draft, prompt);
  }) });
  assertPairOrder(calls, expectedCalls); assert.equal((await readdir(join(directory, 'route-parts/route_a'))).length, 2);
});


test('single-scene checkpoints reject backward jumps, missing spine links and unavailable clues', () => {
  const f = fixture(), catalog = routeSceneCatalog(f.route), valid = f.draft.scenes[0];
  assertSingleScene(valid, 0, catalog, f.outline, new Set());
  for (const mutate of [
    (value: DraftScene) => { value.id = 'wrong_scene'; },
    (value: DraftScene) => { value.choices[0].next = 'route_a_s0'; },
    (value: DraftScene) => { value.choices[0].next = 'route_a_s2'; },
    (value: DraftScene) => { value.choices[0].needs = ['not_collected']; },
    (value: DraftScene) => { value.choices[0].costs[0].resource = 'invented'; },
    (value: DraftScene) => { value.choices[1].needs = ['cable_evidence']; },
  ]) { const changed = structuredClone(valid); mutate(changed); assert.throws(() => assertSingleScene(changed, 0, catalog, f.outline, new Set())); }
  const extra = structuredClone(f.route); extra.beats.push(prose, prose, prose, prose);
  assert.deepEqual(routeSceneCatalog(extra).filter(slot => !slot.ending).flatMap(slot => slot.beats), extra.beats);
  const oldEndingId = structuredClone(f.route); oldEndingId.endings[0].id = 'legacy_good';
  assert.equal(routeSceneCatalog(oldEndingId).at(-2)!.id, 'route_a_legacy_good');
});
