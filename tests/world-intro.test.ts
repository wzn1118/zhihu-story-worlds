import assert from 'node:assert/strict';
import test from 'node:test';
import { authoredWorlds } from '../content/worlds.ts';
import type { GameWorld, ResourceDefinition } from '../shared/types.ts';
import { introMechanicsDescription } from '../src/world-intro.ts';

type IntroWorld = Pick<GameWorld, 'generated' | 'mechanics' | 'resources'>;
const resources: ResourceDefinition[] = [
  { id: 'oxygen', label: 'Oxygen', description: 'Oxygen is a reserve, not remaining minutes.', initial: 18, min: 0, max: 20 },
  { id: 'power', label: 'Power', description: 'Heavy operations consume power.', initial: 4, min: 0, max: 6 },
];
const joined = (values: ResourceDefinition[]) => values.map(resource => `${resource.label}\uff1a${resource.description}`).join('\n');
const fixture = (values = resources): IntroWorld => ({
  generated: { projectId: 'test-generated', revision: 1, artReady: false },
  mechanics: { title: 'Rules', description: joined(values), beginnerTip: 'Keep a reserve for the return route.' },
  resources: structuredClone(values),
});

test('hides an exact generated resource projection, for one or several resources', () => {
  assert.equal(introMechanicsDescription(fixture(resources.slice(0, 1))), undefined);
  assert.equal(introMechanicsDescription(fixture()), undefined);
});

test('presentation does not change resource descriptions, initial/max values, tips, or the world payload', () => {
  const world = fixture(), before = structuredClone(world);
  introMechanicsDescription(world);
  assert.deepEqual(world, before);
});

test('retains unique rule text even when it surrounds a complete duplicate projection', () => {
  for (const description of [`Clues unlock routes.\n${joined(resources)}`, `${joined(resources)}\nZero reserves do not skip a scene.`]) {
    const world = fixture(); world.mechanics!.description = description;
    assert.equal(introMechanicsDescription(world), description);
  }
});

test('retains partial, differently labelled, reordered, or differently formatted descriptions', () => {
  for (const description of [
    joined(resources.slice(0, 1)), joined([...resources].reverse()),
    joined(resources).replace('Oxygen\uff1a', 'Air\uff1a'), joined(resources).replace('\uff1a', ': '),
    `${joined(resources)} `, joined(resources).replace('\n', '\r\n'),
    resources.map(resource => resource.description).join('\n'),
  ]) {
    const world = fixture(); world.mechanics!.description = description;
    assert.equal(introMechanicsDescription(world), description);
  }
});

test('keeps non-generated mechanics even when an authored overview happens to match its resources', () => {
  const world = fixture(); delete world.generated;
  assert.equal(introMechanicsDescription(world), world.mechanics!.description);
});

test('does not infer a duplicate without populated resource definitions', () => {
  const world = fixture();
  for (const values of [undefined, []]) {
    world.resources = values;
    assert.equal(introMechanicsDescription(world), world.mechanics!.description);
  }
});

test('handles absent mechanics without inventing description text', () => {
  const world = fixture(); delete world.mechanics;
  assert.equal(introMechanicsDescription(world), undefined);
});

test('every current authored world retains its exact mechanics overview', () => {
  for (const world of authoredWorlds) {
    assert.equal(introMechanicsDescription(world), world.mechanics?.description, world.id);
  }
});
