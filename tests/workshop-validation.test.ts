import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeSceneRepair, validateWithRouteRepairs } from '../server/workshop-validation.ts';
import type { DraftScene, RouteDraft } from '../shared/workshop.ts';

test('independent route failures are repaired successively within one production attempt', async () => {
  const errors = ['route_b missing exit', 'route_c unreachable ending'], calls: number[][] = [];
  const result = await validateWithRouteRepairs(['route_a', 'route_b', 'route_c'], () => {
    if (errors.length) throw new Error(errors[0]); return 'validated';
  }, async indices => { calls.push(indices); errors.shift(); });
  assert.equal(result, 'validated'); assert.deepEqual(calls, [[1], [2]]);
});
test('a route that still fails after its one repair surfaces the actual failure', async () => {
  let calls = 0;
  await assert.rejects(validateWithRouteRepairs(['route_a', 'route_b'], () => { throw new Error('route_a still invalid'); }, async () => { calls++; }), /route_a still invalid/);
  assert.equal(calls, 1);
});
test('unlocalized failures repair each remaining route once and model errors propagate', async () => {
  const calls: number[][] = [];
  await assert.rejects(validateWithRouteRepairs(['route_a', 'route_b', 'route_c'], () => { throw new Error('State budget exceeded'); }, async indices => { calls.push(indices); }), /State budget exceeded/);
  assert.deepEqual(calls, [[0, 1, 2]]);
  await assert.rejects(validateWithRouteRepairs(['route_a'], () => { throw new Error('route_a invalid'); }, async () => { throw new Error('MODEL_TIMEOUT'); }), /MODEL_TIMEOUT/);
});
test('localized model repairs accept a fifth real choice and preserve all untouched scenes', () => {
  const text = '自动化测试的场景字段，仅用于验证局部修订合并，不属于实际生成小说。'.repeat(2);
  const scene: DraftScene = { id: 'route_a_first', title: '测试场景', location: '测试地点', time: '午夜', speaker: '旁白', text: [text, text], purpose: text, artBrief: text, ending: null,
    choices: Array.from({ length: 5 }, (_, i) => ({ id: `choice_${i}`, text, hint: text, feedback: text, next: 'route_a_second', needs: [], gains: [], costs: [] })) };
  const original: RouteDraft = { routeId: 'route_a', entry: scene.id, scenes: [{ ...scene, choices: scene.choices.slice(0, 4) }, { ...scene, id: 'route_a_second' }] };
  const patch: RouteDraft = { routeId: 'route_a', entry: original.entry, scenes: [scene] };
  const result = mergeSceneRepair(original, patch);
  assert.equal(result.scenes[0].choices.length, 5); assert.equal(original.scenes[0].choices.length, 4);
  assert.equal(result.scenes[1], original.scenes[1]); assert.equal(result.scenes.length, 2);
  for (const bad of [{ ...patch, routeId: 'wrong' }, { ...patch, entry: 'changed' }, { ...patch, scenes: [{ ...scene, id: 'invented' }] }, { ...patch, scenes: [scene, scene] }]) assert.throws(() => mergeSceneRepair(original, bad));
});

test('explicit structural extension retains old scenes and choices, rejects foreign IDs and caps the merged route', () => {
  const text = 'Automated test fixture only, describing a concrete action and its resolved consequence for validation.';
  const scene: DraftScene = { id: 'route_a_first', title: 'Test scene', location: 'Test station', time: 'Midnight', speaker: 'Narrator', text: [text, text], purpose: text, artBrief: text, ending: null,
    choices: [{ id: 'continue_path', text: 'Inspect the next record', hint: text, feedback: text, next: 'route_a_s1', needs: [], gains: [], costs: [] }] };
  const original: RouteDraft = { routeId: 'route_a', entry: scene.id, scenes: Array.from({ length: 12 }, (_, index) => ({ ...scene, id: index ? `route_a_s${index}` : scene.id })) };
  const added = { ...scene, id: 'route_a_additional', purpose: `Additional: ${text}` };
  const patch: RouteDraft = { ...original, scenes: [{ ...scene, choices: [...scene.choices, { ...scene.choices[0], id: 'take_new_path', next: added.id }] }, added] };
  const result = mergeSceneRepair(original, patch, { allowAdditions: true });
  assert.equal(result.scenes.length, 13);
  assert.equal(result.scenes[0].choices.length, 2);
  assert.equal(result.scenes[1], original.scenes[1]);
  assert.equal(original.scenes.length, 12);
  assert.throws(() => mergeSceneRepair(original, patch));
  assert.throws(() => mergeSceneRepair(original, { ...patch, scenes: [{ ...added, id: 'other_added' }] }, { allowAdditions: true }));
  assert.throws(() => mergeSceneRepair(original, { ...patch, scenes: [{ ...scene, choices: [] }] }, { allowAdditions: true }));
  assert.throws(() => mergeSceneRepair(original, { ...patch, scenes: [added, added] }, { allowAdditions: true }));
  assert.throws(() => mergeSceneRepair(original, { ...patch, scenes: Array.from({ length: 7 }, (_, index) => ({ ...added, id: `route_a_new_${index}` })) }, { allowAdditions: true }));
});
