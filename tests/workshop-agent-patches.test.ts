import assert from 'node:assert/strict';
import test from 'node:test';
import type { RouteDraft } from '../shared/workshop.ts';
import { agentContentHash, applyStylePatches, stylePatchInput, stylePatchSchema, type StylePatch, type StylePatchSet } from '../server/workshop-agent-patches.ts';
import { routeRepairSchema, validateSchema } from '../server/workshop-schema.ts';

const prose = 'Synthetic fixture only. The adult station engineer reads the marked cable record and keeps the closed toolbox beside the station door before making a decision.';
const replacement = 'Synthetic revision only. The adult station engineer reads the cable record. The closed toolbox stays beside the station door while the engineer decides.';
function fixture(): RouteDraft {
  const scene = (id: string) => ({ id, title: 'Station record', location: 'Station', time: 'Night', speaker: 'Engineer', text: [prose, prose], purpose: prose, artBrief: prose, choices: [], ending: null });
  return { routeId: 'route_a', entry: 'route_a_start', scenes: [
    { ...scene('route_a_start'), choices: [
      { id: 'inspect', text: 'Inspect the marked cable', hint: prose, feedback: prose, next: 'route_a_end', costs: [{ resource: 'power', delta: -1 }], gains: ['station_record'], needs: ['has:toolbox'] },
      { id: 'leave', text: 'Leave through the station door', hint: prose, feedback: prose, next: 'route_a_end', costs: [], gains: [], needs: [] },
    ] },
    { ...scene('route_a_end'), ending: { kind: 'good', title: 'The station record', resolution: prose } },
  ] };
}
function patches(route: RouteDraft): StylePatchSet {
  const { baseHash, targets } = stylePatchInput(route);
  return { baseHash, patches: ['text', 'hint', 'feedback', 'resolution'].map(field => {
    const { original: _original, ...target } = targets.find(target => target.field === field)!;
    return { ...target, replacement };
  }) };
}

test('style patches edit the four allowed prose fields atomically without changing the game or input', () => {
  const route = fixture(), original = structuredClone(route), patchSet = patches(route);
  validateSchema(routeRepairSchema, route);
  const revised = applyStylePatches(route, patchSet);
  assert.equal(revised.scenes[0].text[0], replacement);
  assert.equal(revised.scenes[0].choices[0].hint, replacement);
  assert.equal(revised.scenes[0].choices[0].feedback, replacement);
  assert.equal(revised.scenes[1].ending!.resolution, replacement);
  const expected = structuredClone(original);
  expected.scenes[0].text[0] = replacement;
  expected.scenes[0].choices[0].hint = replacement;
  expected.scenes[0].choices[0].feedback = replacement;
  expected.scenes[1].ending!.resolution = replacement;
  assert.deepEqual(revised, expected);
  assert.deepEqual(route, original);
  assert.notEqual(revised, route);
  assert.notEqual(revised.scenes[0].choices, route.scenes[0].choices);
});

test('model inputs include only addressable prose targets and hashes supplied by the program', () => {
  const route = fixture(), input = stylePatchInput(route);
  assert.deepEqual(stylePatchInput(route.scenes), input);
  assert.equal(input.targets.length, 9);
  for (const target of input.targets) {
    assert.equal(target.originalHash, agentContentHash(target.original));
    assert.ok(['text', 'hint', 'feedback', 'resolution'].includes(target.field));
    assert.equal(target.index >= 0, target.field === 'text');
    assert.equal(Boolean(target.choiceId), target.field === 'hint' || target.field === 'feedback');
  }
  assert.deepEqual(applyStylePatches(route, { baseHash: input.baseHash, patches: [] }), route);
});

test('stale prose and game-state hashes are rejected, including empty patch sets', () => {
  const route = fixture(), patchSet = patches(route);
  const staleHash = structuredClone(patchSet); staleHash.patches[0].originalHash = '0'.repeat(64);
  assert.throws(() => applyStylePatches(route, staleHash), /originalHash/);
  for (const change of [
    (value: RouteDraft) => { value.scenes[0].text[1] += ' Later.'; },
    (value: RouteDraft) => { value.scenes[0].choices[0].next = 'route_a_start'; },
    (value: RouteDraft) => { value.scenes[0].choices[0].needs = []; },
    (value: RouteDraft) => { value.scenes[0].artBrief += ' More detail.'; },
  ]) {
    const changed = structuredClone(route); change(changed);
    assert.throws(() => applyStylePatches(changed, patchSet), /baseHash/);
    assert.throws(() => applyStylePatches(changed, { ...patchSet, patches: [] }), /baseHash/);
  }
});

test('invalid addresses, duplicate targets, unknown fields and whole-route payloads cannot merge', () => {
  const route = fixture(), original = structuredClone(route);
  const mutations: ((value: StylePatchSet) => void)[] = [
    value => { value.patches[0].sceneId = 'missing_scene'; },
    value => { value.patches[0].index = 4; },
    value => { value.patches[0].index = -1; },
    value => { value.patches[0].choiceId = 'inspect'; },
    value => { value.patches[1].choiceId = 'missing_choice'; },
    value => { value.patches[1].choiceId = ''; },
    value => { value.patches[1].index = 0; },
    value => { value.patches[3].sceneId = 'route_a_start'; },
    value => { value.patches[3].choiceId = 'inspect'; },
    value => { value.patches.push(structuredClone(value.patches[0])); },
    value => { (value.patches[0] as unknown as Record<string, unknown>).field = 'next'; },
    value => { (value.patches[0] as unknown as Record<string, unknown>).next = 'route_a_end'; },
    value => { (value as unknown as Record<string, unknown>).scenes = route.scenes; },
    value => { value.patches[0].replacement = 'Too short'; },
    value => { value.patches[1].replacement = 'x'.repeat(301); },
    value => { value.patches[2].replacement = 'x'.repeat(401); },
    value => { value.patches[3].replacement = 'x'.repeat(99); },
  ];
  for (const mutate of mutations) {
    const invalid = patches(route); mutate(invalid);
    assert.throws(() => applyStylePatches(route, invalid));
    assert.deepEqual(route, original);
  }
  assert.throws(() => validateSchema(stylePatchSchema, { ...patches(route), patches: Array(13).fill(patches(route).patches[0]) }));
});

test('ambiguous original identities are rejected before target selection', () => {
  const route = fixture(); route.scenes.push(structuredClone(route.scenes[0]));
  assert.throws(() => stylePatchInput(route), /重复场景/);
  const choices = fixture(); choices.scenes[0].choices.push(structuredClone(choices.scenes[0].choices[0]));
  assert.throws(() => stylePatchInput(choices), /重复选项/);
});

test('canonical content hashes ignore object key ordering and preserve text bytes and array order', () => {
  assert.equal(agentContentHash({ b: [{ y: 2, x: 1 }], a: 'text' }), agentContentHash({ a: 'text', b: [{ x: 1, y: 2 }] }));
  assert.notEqual(agentContentHash(['a', 'b']), agentContentHash(['b', 'a']));
  assert.notEqual(agentContentHash('text\r\n'), agentContentHash('text\n'));
  assert.notEqual(agentContentHash(' text '), agentContentHash('text'));
  assert.throws(() => agentContentHash(undefined), /JSON/);
});

test('replacement schema matches all existing prose field length bounds', () => {
  const route = fixture(), patchSet = patches(route);
  const bounds: [StylePatch['field'], number, number][] = [['text', 30, 2200], ['hint', 12, 300], ['feedback', 15, 400], ['resolution', 100, 2200]];
  for (const [field, min, max] of bounds) {
    const patch = patchSet.patches.find(value => value.field === field)!;
    for (const length of [min, max]) assert.doesNotThrow(() => applyStylePatches(route, { baseHash: patchSet.baseHash, patches: [{ ...patch, replacement: 'x'.repeat(length) }] }));
    for (const length of [min - 1, max + 1]) assert.throws(() => applyStylePatches(route, { baseHash: patchSet.baseHash, patches: [{ ...patch, replacement: 'x'.repeat(length) }] }));
  }
});
