import assert from 'node:assert/strict';
import test from 'node:test';
import { authoredWorlds } from '../content/worlds.ts';
import { gameplayContract } from './world-prose-support.ts';

const original = authoredWorlds.find(world => world.id === 'blue-blood')!;

test('resource description edits leave the gameplay contract and input unchanged', () => {
  const before = structuredClone(original);
  const revised = structuredClone(original);
  for (const resource of revised.resources ?? []) resource.description = 'Revised player-facing resource description.';

  assert.deepEqual(gameplayContract(revised), gameplayContract(original));
  assert.deepEqual(original, before);
  assert.ok(revised.resources?.every(resource => resource.description === 'Revised player-facing resource description.'));
});

test('resource identity, labels, balances and limits remain in the prose gameplay contract', () => {
  for (const field of ['id', 'label', 'initial', 'min', 'max'] as const) {
    const revised = structuredClone(original);
    const resource = revised.resources![0];
    if (field === 'id' || field === 'label') resource[field] += '_changed';
    else resource[field] += 1;
    assert.notDeepEqual(gameplayContract(revised), gameplayContract(original), field);
  }
  const removed = structuredClone(original);
  removed.resources!.pop();
  assert.notDeepEqual(gameplayContract(removed), gameplayContract(original), 'removed resource');
});

test('resource costs remain in the prose gameplay contract', () => {
  const revised = structuredClone(original);
  const choice = Object.values(revised.nodes).flatMap(node => node.choices)
    .find(choice => Object.values(choice.effects?.resources ?? {}).some(delta => delta < 0));
  assert.ok(choice?.effects?.resources);
  const resourceId = Object.keys(choice.effects.resources)[0];
  choice.effects.resources[resourceId] -= 1;
  assert.notDeepEqual(gameplayContract(revised), gameplayContract(original));
});

test('resource gates remain in the prose gameplay contract', () => {
  const revised = structuredClone(original);
  const choice = revised.nodes[revised.startNodeId].choices[0];
  const resource = revised.resources![0];
  const prior = choice.requires?.resources?.[resource.id];
  choice.requires = {
    ...choice.requires,
    resources: {
      ...choice.requires?.resources,
      [resource.id]: { ...prior, min: (prior?.min ?? resource.min) + 1 },
    },
  };
  assert.notDeepEqual(gameplayContract(revised), gameplayContract(original));
});
