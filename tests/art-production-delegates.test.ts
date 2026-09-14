import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authoredWorlds } from '../content/worlds.ts';
import { ART_WORLD_OWNERS } from '../server/art-production-delegates.ts';

test('independent art conversations cover every authored story exactly once', () => {
  assert.equal(authoredWorlds.length, 20);
  assert.deepEqual(Object.keys(ART_WORLD_OWNERS).sort(), authoredWorlds.map(world => world.id).sort());
  const counts = ['cel-drawing', 'painted-background', 'scene-composition'].map(owner =>
    Object.values(ART_WORLD_OWNERS).filter(value => value === owner).length);
  assert.deepEqual(counts, [7, 7, 6]);
  assert.ok(authoredWorlds.every(world => Object.keys(world.nodes).length >= 30));
});
