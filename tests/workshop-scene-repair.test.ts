import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DraftScene, ImportedSource, RouteDraft, StoryOutline } from '../shared/workshop.ts';
import { jsonFile, writeJson } from '../server/story-workshop.ts';
import { assertSceneStructureRepair, repairWorkshopSceneStructure, sceneStructureIssues, singleSceneRepairSchema } from '../server/workshop-scene-repair.ts';
import type { runCreative } from '../server/workshop-creative.ts';

const prose = 'Synthetic test fixture only. An adult engineer reads the station record and checks the marked cable before making a concrete decision.';
function fixture(broken = 4) {
  const source: ImportedSource = { title: 'Synthetic preflight fixture', author: 'Automated test', scope: 'user-import', text: '\uFEFFKeep exact source bytes.\r\n Do not rewrite.  ' };
  const outline: StoryOutline = {
    title: source.title, subtitle: prose, summary: prose, introduction: [prose, prose], objective: prose,
    player: { name: 'Engineer', role: 'Adult engineer' }, beginnerTip: prose, facts: [], characters: [],
    resources: [{ id: 'power', label: 'Power', initial: 12, min: 0, max: 12, description: prose }],
    routes: [{ id: 'route_a', title: 'Inspect the cable', commitment: prose, premise: prose, beats: Array(10).fill(prose),
      endings: (['good', 'bad'] as const).map(kind => ({ id: `route_a_${kind}`, title: `Fixture ${kind}`, kind, resolution: prose, cause: prose })) }],
    opening: { title: 'Test opening', location: 'Station', time: 'Night', text: [prose, prose] },
  };
  const route: RouteDraft = { routeId: 'route_a', entry: 'route_a_s0', scenes: [
    ...Array.from({ length: 4 }, (_, index): DraftScene => ({ id: `route_a_s${index}`, title: `Fixture scene ${index}`, location: 'Station', time: 'Night', speaker: 'Engineer', text: [prose, prose], purpose: prose, artBrief: prose, ending: null,
      choices: [{ id: 'continue_path', text: 'Inspect the next marked cable', hint: prose, feedback: prose, next: index < 3 ? `route_a_s${index + 1}` : 'route_a_good', costs: [{ resource: 'power', delta: -1 }], gains: [], needs: [] },
        { id: 'manual_exit', text: 'Leave through the marked stairway', hint: prose, feedback: prose, next: 'route_a_bad', costs: [], gains: [], needs: [] }],
    })),
    ...(['good', 'bad'] as const).map((kind): DraftScene => ({ id: `route_a_${kind}`, title: `Fixture ${kind}`, location: 'Shore', time: 'Morning', speaker: 'Engineer', text: [prose, prose], purpose: prose, artBrief: prose, choices: [], ending: { kind, title: `Fixture ${kind}`, resolution: prose } })),
  ] };
  for (const scene of route.scenes.slice(0, broken)) scene.choices[1].next = scene.choices[0].next;
  if (broken > 1) route.scenes[1].choices[1].costs = [{ resource: 'power', delta: -1 }];
  return { source, outline, route };
}
const selected = (prompt: string) => JSON.parse(prompt.split('SELECTED_SCENE_DATA=')[1]) as DraftScene;
function repaired(original: RouteDraft, scene: DraftScene): RouteDraft {
  const fixed = structuredClone(scene); fixed.choices[1].next = 'route_a_bad'; fixed.choices[1].costs = []; fixed.choices[1].needs = [];
  return { routeId: original.routeId, entry: original.entry, scenes: [fixed] };
}
const executor = (callback: (directory: string, label: string, schema: Parameters<typeof runCreative>[2], prompt: string) => Promise<unknown>) => callback as typeof runCreative;
async function temporary(t: { after: (callback: () => Promise<void>) => void }) {
  const directory = await mkdtemp(join(tmpdir(), 'workshop-structure-repair-'));
  t.after(() => rm(directory, { recursive: true, force: true })); return directory;
}

test('preflight collects all known structure blockers and repairs only affected scenes with at most two requests together', async t => {
  const directory = await temporary(t), f = fixture(), originalBytes = JSON.stringify(f.route), sourceBytes = JSON.stringify(f.source), calls: string[] = [];
  assert.deepEqual(sceneStructureIssues(f.route).map(issue => issue.sceneId), f.route.scenes.slice(0, 4).map(scene => scene.id));
  assert.equal(sceneStructureIssues(f.route)[1].problems.length, 2);
  let active = 0, ceiling = 0, releasePair: () => void = () => {};
  let pairReady = new Promise<void>(resolve => { releasePair = resolve; });
  const result = await repairWorkshopSceneStructure(f.source, f.outline, f.route, { directory, attempt: 1, execute: executor(async (_dir, _label, schema, prompt) => {
    const scene = selected(prompt); calls.push(scene.id); active++; ceiling = Math.max(ceiling, active);
    try {
      const ready = pairReady;
      if (active === 2) { releasePair(); pairReady = new Promise<void>(resolve => { releasePair = resolve; }); }
      await ready;
      assert.equal(schema, singleSceneRepairSchema); assert.equal(schema.properties!.scenes.maxItems, 1);
      assert.ok(prompt.includes(`USER_SOURCE_DATA=${sourceBytes}`)); assert.ok(prompt.includes('VALIDATOR_FEEDBACK_DATA='));
      return repaired(f.route, scene);
    } finally { active--; }
  }) });
  assert.equal(ceiling, 2); assert.deepEqual(calls.slice(0, 2).sort(), ['route_a_s0', 'route_a_s1']); assert.deepEqual(calls.slice(2).sort(), ['route_a_s2', 'route_a_s3']);
  assert.equal(sceneStructureIssues(result).length, 0); assert.deepEqual(result.scenes.slice(4), f.route.scenes.slice(4));
  for (let index = 0; index < 4; index++) { assert.deepEqual(result.scenes[index].text, f.route.scenes[index].text); assert.deepEqual(result.scenes[index].choices.map(choice => choice.id), f.route.scenes[index].choices.map(choice => choice.id)); }
  assert.deepEqual(await jsonFile(join(directory, 'route-route_a.json')), result);
  assert.equal(JSON.stringify(f.source), sourceBytes); assert.equal(JSON.stringify(f.route), originalBytes);
  assert.equal(await repairWorkshopSceneStructure(f.source, f.outline, result, { directory, attempt: 2, execute: executor(async () => { throw new Error('No repair needed'); }) }), result);
});

test('a rejected repair preserves its accepted sibling and original response; explicit resume repairs only missing scenes', async t => {
  const directory = await temporary(t), f = fixture(), calls: string[] = [];
  let failedFile = '', failedBytes = '';
  await assert.rejects(repairWorkshopSceneStructure(f.source, f.outline, f.route, { directory, attempt: 1, execute: executor(async (dir, _label, _schema, prompt) => {
    const scene = selected(prompt); calls.push(scene.id);
    const patch = repaired(f.route, scene);
    if (scene.id === 'route_a_s1') {
      patch.scenes[0].choices[1].costs = [{ resource: 'power', delta: -1 }];
      failedFile = join(dir, 'scene.output.json'); failedBytes = JSON.stringify(patch);
      await writeFile(failedFile, failedBytes); await writeFile(join(dir, 'scene.receipt.json'), '{"completed":true,"fixture":true}');
    }
    return patch;
  }) }), /免费出口/);
  assert.deepEqual(calls.sort(), ['route_a_s0', 'route_a_s1']);
  await assert.rejects(repairWorkshopSceneStructure(f.source, f.outline, f.route, { directory, attempt: 1, execute: executor(async () => { throw new Error('Same-attempt request must not repeat'); }) }), /显式续跑/);
  const saved = await jsonFile<RouteDraft>(join(directory, 'route-route_a.json'));
  assert.deepEqual(saved.scenes[0], repaired(f.route, f.route.scenes[0]).scenes[0]); assert.deepEqual(saved.scenes.slice(1), f.route.scenes.slice(1));
  const acceptedBytes = JSON.stringify(saved.scenes[0]), resumed: string[] = [];
  const result = await repairWorkshopSceneStructure(f.source, f.outline, saved, { directory, attempt: 2, execute: executor(async (_dir, _label, _schema, prompt) => {
    const scene = selected(prompt); resumed.push(scene.id);
    if (scene.id === 'route_a_s1') { assert.ok(prompt.includes('PREVIOUS_REJECTED_REPAIR_DATA=')); assert.ok(prompt.includes('免费出口')); }
    return repaired(saved, scene);
  }) });
  assert.deepEqual(resumed.sort(), ['route_a_s1', 'route_a_s2', 'route_a_s3']); assert.equal(sceneStructureIssues(result).length, 0);
  assert.equal(JSON.stringify(result.scenes[0]), acceptedBytes); assert.equal(await readFile(failedFile, 'utf8'), failedBytes);
  assert.equal(await readFile(failedFile.replace('output.json', 'receipt.json'), 'utf8'), '{"completed":true,"fixture":true}');
  assert.equal((await readdir(join(directory, 'scene-repairs/route_a/route_a_s1'))).length, 1);
});

test('completed raw repairs recover after a checkpoint gap while a changed source cannot reuse the old repair', async t => {
  const directory = await temporary(t), f = fixture(1);
  await repairWorkshopSceneStructure(f.source, f.outline, f.route, { directory, attempt: 1, execute: executor(async (dir, _label, _schema, prompt) => {
    const patch = repaired(f.route, selected(prompt)); await writeJson(join(dir, 'scene.output.json'), patch); return patch;
  }) });
  const base = join(directory, 'scene-repairs/route_a/route_a_s0'), inputHash = (await readdir(base))[0]; await rm(join(base, inputHash, 'patch.json'));
  const recovered = await repairWorkshopSceneStructure(f.source, f.outline, f.route, { directory, attempt: 2, execute: executor(async () => { throw new Error('Valid raw repair must be reused'); }) });
  assert.equal(sceneStructureIssues(recovered).length, 0);
  let changedRequests = 0;
  await repairWorkshopSceneStructure({ ...f.source, text: f.source.text + '\r\nA changed source fact.' }, f.outline, f.route, { directory, attempt: 3, execute: executor(async (_dir, _label, _schema, prompt) => { changedRequests++; return repaired(f.route, selected(prompt)); }) });
  assert.equal(changedRequests, 1); assert.equal((await readdir(base)).length, 2);
});

test('single-scene repairs reject identity changes, deleted choices, unknown destinations and unresolved structure', () => {
  const f = fixture(1), patch = repaired(f.route, f.route.scenes[0]);
  assertSceneStructureRepair(f.route, 'route_a_s0', patch, f.outline);
  for (const mutate of [
    (value: RouteDraft) => { value.routeId = 'other_route'; }, (value: RouteDraft) => { value.entry = 'route_a_s1'; },
    (value: RouteDraft) => { value.scenes.push(structuredClone(value.scenes[0])); },
    (value: RouteDraft) => { value.scenes[0].id = 'route_a_s1'; },
    (value: RouteDraft) => { value.scenes[0].choices[0].id = 'replacement_id'; },
    (value: RouteDraft) => { value.scenes[0].choices[1].next = 'route_a_missing'; },
    (value: RouteDraft) => { value.scenes[0].choices[1].next = 'route_a_s0'; },
    (value: RouteDraft) => { value.scenes[0].choices[0].next = 'route_a_good'; },
    (value: RouteDraft) => { value.scenes[0].choices[1].next = value.scenes[0].choices[0].next; },
    (value: RouteDraft) => { value.scenes[0].choices[1].costs = [{ resource: 'power', delta: -1 }]; },
  ]) { const invalid = structuredClone(patch); mutate(invalid); assert.throws(() => assertSceneStructureRepair(f.route, 'route_a_s0', invalid, f.outline)); }
  const single = structuredClone(f.route); single.scenes[0].choices.pop(); assert.equal(sceneStructureIssues(single)[0].problems.length, 3);
});
