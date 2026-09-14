import assert from 'node:assert/strict';
import test from 'node:test';
import { isWorkshopPredicate, parseWorkshopNeeds, workshopReferencedClues } from '../shared/workshop-conditions.ts';
import { choiceBlockers } from '../shared/choice-rules.ts';
import type { ResourceDefinition } from '../shared/types.ts';

const resources: ResourceDefinition[] = [{ id: 'oxygen', label: 'Oxygen', min: 0, max: 20, initial: 18, description: 'Automated test resource.' }];

test('plain clue arrays retain exact spelling, order and duplicate identity', () => {
  assert.deepEqual(parseWorkshopNeeds(['record', 'aa,bb', 'record'], resources), { allClues: ['record', 'aa,bb', 'record'] });
  assert.deepEqual(parseWorkshopNeeds([], resources), { allClues: [] });
});

test('absence and bounded comparisons project onto existing typed conditions', () => {
  assert.deepEqual(parseWorkshopNeeds(['record', '!sealed', 'oxygen>=3', 'oxygen<4'], resources), {
    allClues: ['record'], noneClues: ['sealed'], resources: { oxygen: { min: 3, max: 3 } },
  });
  assert.deepEqual(parseWorkshopNeeds(['oxygen>1', 'oxygen<=5', 'oxygen>=3'], resources).resources, { oxygen: { min: 3, max: 5 } });
  assert.deepEqual(workshopReferencedClues(['record', '!sealed', 'oxygen<3'], resources), ['record', 'sealed']);
});

test('all resource boundary states and absent/present clues agree with typed gating', () => {
  const choice = { id: 'retreat', text: 'Test retreat', nextNodeId: 'resolved', requires: parseWorkshopNeeds(['!sealed', 'oxygen>=3', 'oxygen<5'], resources) };
  for (let oxygen = 0; oxygen <= 20; oxygen++) for (const sealed of [false, true]) {
    const blocked = choiceBlockers(choice, { resources: { oxygen }, clues: sealed ? ['sealed'] : [], resolve: 50, trust: 30 }, resources);
    assert.equal(blocked.length === 0, !sealed && oxygen >= 3 && oxygen < 5);
  }
});

test('undefined, contradictory, impossible and unsafe numeric conditions are rejected', () => {
  for (const needs of [['!'], ['!!sealed'], ['!oxygen<3'], ['record', '!record'], ['fuel<3'], ['oxygen<0'], ['oxygen>20'], ['oxygen>=5', 'oxygen<5'], ['oxygen>9007199254740991']]) {
    assert.throws(() => parseWorkshopNeeds(needs, resources));
  }
});

test('code-shaped and boolean-expression labels remain inert clue data, never evaluated', () => {
  const labels = ['oxygen<3 || process.exit(1)', 'globalThis.injected=true', '-> END', 'record && other'];
  assert.deepEqual(parseWorkshopNeeds(labels, resources), { allClues: labels });
  assert.equal(isWorkshopPredicate('!sealed'), true);
  assert.equal(isWorkshopPredicate('oxygen<3'), true);
  assert.equal(isWorkshopPredicate('oxygen<3 || process.exit(1)'), false);
});
