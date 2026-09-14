import assert from 'node:assert/strict';
import test from 'node:test';
import { agentPlotSchema, characterNotesSchema, deriveSceneContext, gameplayPlanSchema, validateAgentPlot, validateCharacterNotes, validateGameplayPlan, type AgentPlot, type GameplayPlan } from '../server/workshop-agent-contract.ts';
import { validateSchema } from '../server/workshop-schema.ts';
import { workshopAgentFixture } from './helpers/workshop-agent-fixture.ts';

test('shared author contract preserves quotes, counts the player once and covers every ending reveal', () => {
  const { source, plot, notes, plans } = workshopAgentFixture(), before = JSON.stringify({ source, plot, notes, plans });
  validateAgentPlot(source, plot); validateSchema(agentPlotSchema, plot);
  validateCharacterNotes(plot, notes); validateSchema(characterNotesSchema, notes);
  for (const plan of plans) { validateSchema(gameplayPlanSchema, plan); validateGameplayPlan(plot, plot.outline.routes.find(route => route.id === plan.routeId)!, plan); }
  assert.equal(JSON.stringify({ source, plot, notes, plans }), before);
  for (const mutate of [
    (value: AgentPlot) => { value.outline.facts[0].quote = 'The operator changes the original quote.'; },
    (value: AgentPlot) => { value.canon.cast[0].count = 2; },
    (value: AgentPlot) => { value.canon.cast.push({ id: 'duplicate_operator', name: 'Operator', count: 1 }); },
    (value: AgentPlot) => { value.canon.cast[0].name = 'Someone else'; },
    (value: AgentPlot) => { value.canon.cast[1].id = 'operator'; },
    (value: AgentPlot) => { value.canon.reveals[0].endingId = 'route_a_bad'; },
    (value: AgentPlot) => { value.canon.reveals.push({ ...value.canon.reveals[0], endingId: 'unknown' }); },
    (value: AgentPlot) => { value.outline.routes[0].endings.push({ ...value.outline.routes[0].endings[0], id: 'third' }, { ...value.outline.routes[0].endings[0], id: 'fourth' }); },
  ]) { const changed = structuredClone(plot); mutate(changed); assert.throws(() => validateAgentPlot(source, changed)); }
  const withGroup = structuredClone(plot); withGroup.canon.cast.push({ id: 'crew', name: 'Three unnamed adult crew', count: 3 }); validateAgentPlot(source, withGroup);
  const separatePlayer = structuredClone(plot); separatePlayer.outline.player.name = 'Visitor'; separatePlayer.canon.cast.push({ id: 'player', name: 'Visitor', count: 1 }); validateAgentPlot(source, separatePlayer);
});

test('character work must cover exact identities and cannot silently replace the cast', () => {
  const { plot, notes } = workshopAgentFixture();
  const missing = structuredClone(notes); missing.characters.pop(); assert.throws(() => validateCharacterNotes(plot, missing));
  const unknown = structuredClone(notes); unknown.characters[1].id = 'invented_character'; assert.throws(() => validateCharacterNotes(plot, unknown), /精确覆盖/);
  const duplicate = structuredClone(notes); duplicate.characters[1].id = duplicate.characters[0].id; assert.throws(() => validateCharacterNotes(plot, duplicate), /重复/);
});

test('gameplay plan locks identities, endings, cast and resource semantics before prose requests', () => {
  const { plot, plans } = workshopAgentFixture(), route = plot.outline.routes[0];
  for (const mutate of [
    (plan: GameplayPlan) => { plan.graph.entry = 'route_a_s1'; },
    (plan: GameplayPlan) => { plan.graph.scenes[0].id = 'route_a_invented'; },
    (plan: GameplayPlan) => { plan.graph.scenes.at(-2)!.ending!.kind = 'bad'; },
    (plan: GameplayPlan) => { plan.graph.scenes.at(-2)!.ending!.title = 'Changed ending'; },
    (plan: GameplayPlan) => { plan.scenes[0].castIds.push('invented_actor'); },
    (plan: GameplayPlan) => { plan.scenes[0].castIds.push('operator'); },
    (plan: GameplayPlan) => { plan.scenes[0].id = plan.scenes[1].id; },
    (plan: GameplayPlan) => { plan.graph.scenes[0].choices[1].costs = [{ resource: 'battery', delta: -1 }]; },
    (plan: GameplayPlan) => { plan.graph.scenes[0].choices[0].costs.push({ resource: 'battery', delta: -1 }); },
    (plan: GameplayPlan) => { plan.graph.scenes[0].choices[0].costs[0].resource = 'invented_resource'; },
    (plan: GameplayPlan) => { plan.graph.scenes[0].choices[0].gains = ['!cable_evidence']; },
    (plan: GameplayPlan) => { plan.graph.scenes[5].choices[0].next = 'route_a_s4'; },
    (plan: GameplayPlan) => { plan.graph.scenes[0].choices[0].next = 'route_a_s8'; },
    (plan: GameplayPlan) => { plan.graph.scenes[2].choices[0].needs = []; },
  ]) { const changed = structuredClone(plans[0]); mutate(changed); assert.throws(() => validateGameplayPlan(plot, route, changed)); }
});

function branchFixture() {
  const f = workshopAgentFixture(), plan = f.plans[0], [start, left, right, merge] = plan.graph.scenes;
  // Both sides of the fork are reachable. The private record belongs only to
  // the left side, while the common cable evidence is gained on both sides.
  start.choices[0] = { ...start.choices[0], next: left.id, gains: ['cable_evidence', 'private_record'], costs: [{ resource: 'battery', delta: -2 }] };
  start.choices[1] = { ...start.choices[1], next: right.id, gains: ['cable_evidence'], costs: [] };
  left.choices[0].next = merge.id;
  plan.scenes[1].requires = ['cable_evidence', 'private_record'];
  plan.scenes[2].requires = ['cable_evidence', '!private_record'];
  return { ...f, plan, start, left, right, merge };
}

test('parallel scene context intersects actual branch arrivals rather than accumulating all generated evidence', () => {
  const { plot, plan, merge } = branchFixture(), before = JSON.stringify({ plot, plan });
  validateGameplayPlan(plot, plot.outline.routes[0], plan);
  const context = deriveSceneContext(plot, plan, merge.id);
  assert.deepEqual(context.sharedClues, ['cable_evidence']);
  assert.deepEqual(context.resourceRanges, { battery: { min: 9, max: 11 } });
  assert.deepEqual(context.incomingChoices.map(edge => edge.fromSceneId), ['route_a_s1', 'route_a_s2']);
  assert.deepEqual(context.incomingChoices.map(edge => edge.sharedClues), [['cable_evidence', 'private_record'], ['cable_evidence']]);
  assert.equal(JSON.stringify(context).includes('AUTHOR_ONLY_TRUTH'), false);
  assert.deepEqual(context.cast.map(character => character.id), ['operator', 'witness']);
  assert.deepEqual(deriveSceneContext(plot, plan, plan.graph.entry).incomingChoices, []);
  assert.equal(JSON.stringify({ plot, plan }), before);
  const invalid = structuredClone(plan); invalid.scenes[3].requires.push('private_record');
  assert.throws(() => validateGameplayPlan(plot, plot.outline.routes[0], invalid), /并非所有实际入口共有/);
});

test('negative clues and numeric conditions filter arrivals before their shared state is computed', () => {
  const f = branchFixture(), { plot, plan, merge } = f;
  // Only the private-record branch can pass this gate. The alternative remains
  // available to every state; downstream prose may then rely on the record.
  merge.choices[0].needs = ['private_record', 'battery<=9'];
  plan.scenes[4].requires = ['private_record', 'battery<=8'];
  validateGameplayPlan(plot, plot.outline.routes[0], plan);
  assert.deepEqual(deriveSceneContext(plot, plan, 'route_a_s4').sharedClues, ['cable_evidence', 'private_record']);
  const right = deriveSceneContext(plot, plan, 'route_a_s2');
  assert.ok(right.absentClues.includes('private_record'));
  assert.deepEqual(right.resourceRanges, { battery: { min: 12, max: 12 } });
  merge.choices[0].needs = ['!private_record', 'battery>=11'];
  plan.scenes[4].requires = ['!private_record', 'battery>=10'];
  validateGameplayPlan(plot, plot.outline.routes[0], plan);
  assert.deepEqual(deriveSceneContext(plot, plan, 'route_a_s4').sharedClues, ['cable_evidence']);
  assert.ok(deriveSceneContext(plot, plan, 'route_a_s4').absentClues.includes('private_record'));
  // A cached plan cannot bypass revalidation after the caller changes it.
  plan.scenes[4].requires = ['private_record'];
  assert.throws(() => deriveSceneContext(plot, plan, 'route_a_s4'), /并非所有实际入口共有/);
});

test('unreachable graph edges fail before writers can refer to impossible arrivals', () => {
  const { plot, plans } = workshopAgentFixture(), route = plot.outline.routes[0], plan = plans[0];
  plan.graph.scenes[0].choices.push({ id: 'impossible_gate', text: 'Check a record that has not yet been acquired', next: 'route_a_s2', costs: [], gains: [], needs: ['cable_evidence'] });
  assert.throws(() => validateGameplayPlan(plot, route, plan), /选项永远锁住/);
  plan.graph.scenes[0].choices.pop();
  plan.graph.scenes[5].choices[0].needs = ['battery>=12'];
  assert.throws(() => validateGameplayPlan(plot, route, plan), /场景不可达/);
});
