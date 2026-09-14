import assert from 'node:assert/strict';
import test from 'node:test';
import type { Choice, ResourceDefinition } from '../shared/types.ts';
import type { ChoiceState } from '../shared/choice-rules.ts';
import { costPressure, freeUnconditional, observePressure, pressureAtState, pressureKey, type PressureCoverage } from '../scripts/verify-generated-story.ts';

const oxygen: ResourceDefinition = { id: 'oxygen', label: 'Oxygen', initial: 18, min: 0, max: 20, description: 'Test resource only.' };
const costly: Choice = { id: 'measure', text: 'Measure before closing', nextNodeId: 'resolved', requires: { allClues: ['checked'] }, effects: { resources: { oxygen: -3 } } };
const exit: Choice = { id: 'retreat', text: 'Retreat now', nextNodeId: 'retreated', effects: { resources: {} } };
const secondExit: Choice = { id: 'wait', text: 'Wait here', nextNodeId: 'waited' };
const node = { id: 'route_a_final', choices: [costly, exit] };
const state = (value: number, clues = ['checked']): ChoiceState => ({ resolve: 50, trust: 30, resources: { oxygen: value }, clues });
const emptyCoverage = (): PressureCoverage => ({ routeId: 'route_a', resourceId: 'oxygen', minimum: 0,
  minimumObserved: null, minimumDecisionObserved: null, depletedDecisionReachable: false,
  affordabilityPressureReachable: false, status: 'no-pressure-reachable', caseCount: 0 });

test('positive resources below a satisfied action cost produce specific affordability evidence', () => {
  const path = ['enter_route_a', 'inspect'];
  const cases = pressureAtState('route_a', node, path, state(1), [oxygen]);
  assert.deepEqual(cases, [{ routeId: 'route_a', resourceId: 'oxygen', minimum: 0, value: 1, nodeId: node.id,
    path, kind: 'unaffordable', costlyChoiceId: 'measure', cost: 3, requiredValue: 3, exitChoiceId: 'retreat', nextNodeId: 'retreated' }]);
  cases[0].path.push('later');
  assert.deepEqual(path, ['enter_route_a', 'inspect']);
});

test('missing clue and non-resource prerequisites do not masquerade as affordability pressure', () => {
  assert.equal(costPressure(costly, oxygen, state(1, []), [oxygen]), null);
  assert.deepEqual(pressureAtState('route_a', node, [], state(1, []), [oxygen]), []);
  const requires = [{ anyClues: ['other'] }, { noneClues: ['checked'] }, { resolve: { min: 80 } }, { trust: { min: 80 } }];
  for (const requirement of requires) assert.equal(costPressure({ ...costly, requires: requirement }, oxygen, state(1), [oxygen]), null);
});

test('exactly affordable actions and default initial resources are not pressure cases', () => {
  assert.deepEqual(pressureAtState('route_a', node, [], state(3), [oxygen]), []);
  assert.equal(costPressure(costly, oxygen, { ...state(1), resources: {} }, [oxygen]), null);
  assert.equal(costPressure({ ...costly, effects: { resources: { oxygen: 3 } } }, oxygen, state(0), [oxygen]), null);
});

test('depletion and unaffordability preserve each real free exit rather than only the first', () => {
  const cases = pressureAtState('route_a', { ...node, choices: [costly, exit, secondExit] }, [], state(0), [oxygen]);
  assert.equal(cases.length, 4);
  assert.deepEqual(cases.map(item => [item.kind, item.exitChoiceId]), [
    ['depleted', 'retreat'], ['depleted', 'wait'], ['unaffordable', 'retreat'], ['unaffordable', 'wait'],
  ]);
  assert.equal(new Set(cases.map(pressureKey)).size, 4);
  assert.ok(cases.every(item => item.value === 0));
});

test('an ending at zero lowers observed minimum but never claims a playable depleted exit', () => {
  const ended = { ...node, choices: [], ending: { title: 'Resolved', text: 'Resolved test ending.', tone: 'hopeful' as const } };
  assert.deepEqual(pressureAtState('route_a', ended, [], state(0), [oxygen]), []);
  const prior = observePressure(emptyCoverage(), 2, false, []);
  const result = observePressure(prior, 0, true, []);
  assert.equal(result.minimumObserved, 0);
  assert.equal(result.minimumDecisionObserved, 2);
  assert.equal(result.depletedDecisionReachable, false);
  assert.equal(result.affordabilityPressureReachable, false);
  assert.equal(result.status, 'no-pressure-reachable');
  assert.equal(prior.minimumObserved, 2);
});

test('coverage keeps actual minima and separates affordability from depletion', () => {
  const cases = pressureAtState('route_a', node, [], state(1), [oxygen]);
  const result = observePressure(observePressure(emptyCoverage(), 18, false, []), 1, false, cases);
  assert.equal(result.minimumObserved, 1);
  assert.equal(result.minimumDecisionObserved, 1);
  assert.equal(result.depletedDecisionReachable, false);
  assert.equal(result.affordabilityPressureReachable, true);
  assert.equal(result.status, 'cases-recorded');
  const other = observePressure({ ...emptyCoverage(), routeId: 'route_b' }, 18, false, cases);
  assert.equal(other.status, 'no-pressure-reachable');
});

test('conditional or costly exits do not satisfy the unconditional free-exit requirement', () => {
  for (const candidate of [costly, { ...exit, requires: { allClues: ['checked'] } }, { ...exit, requires: { noneClues: ['absent'] } },
    { ...exit, requires: { resources: { oxygen: { min: 1 } } } }]) assert.equal(freeUnconditional(candidate), false);
  assert.equal(freeUnconditional({ ...exit, effects: { resources: { oxygen: 3 } } }), true);
  assert.throws(() => pressureAtState('route_a', { ...node, choices: [costly] }, [], state(1), [oxygen]), /genuinely free unconditional exit/);
});

test('cost pressure is attributed independently to each insufficient resource', () => {
  const battery: ResourceDefinition = { ...oxygen, id: 'battery', label: 'Battery' };
  const both = { ...costly, effects: { resources: { oxygen: -3, battery: -2 } } };
  const cases = pressureAtState('route_a', { ...node, choices: [both, exit] }, [], { ...state(1), resources: { oxygen: 1, battery: 1 } }, [oxygen, battery]);
  assert.deepEqual(cases.map(item => [item.resourceId, item.cost, item.value]), [['oxygen', 3, 1], ['battery', 2, 1]]);
});

test('case identity separates scenes, costly choices and exits but can reuse a lower-value witness', () => {
  const [first] = pressureAtState('route_a', node, ['first'], state(2), [oxygen]);
  const [lower] = pressureAtState('route_a', node, ['other'], state(1), [oxygen]);
  assert.equal(pressureKey(first), pressureKey(lower));
  for (const changed of [{ ...first, nodeId: 'route_a_other' }, { ...first, costlyChoiceId: 'other_action' }, { ...first, exitChoiceId: 'other_exit' }]) {
    assert.notEqual(pressureKey(first), pressureKey(changed));
  }
});
