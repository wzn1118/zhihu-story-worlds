import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getWorld } from '../server/worlds.ts';

test('choice data keeps editorial hints, while the player-facing action is not paired with a result preview', () => {
  const worlds = ['2025684191967294692', '2050600604976803918', '1930445234262750503', '1558118587956662272']
    .map(storyId => getWorld(storyId));
  const choices = worlds.flatMap(world => Object.values(world.nodes).flatMap(node => node.choices));
  assert.ok(choices.length > 100, 'Choice routing data remains present');
  // App.tsx renders choice.text and explicit resource cost only. Hints remain
  // stored for editorial review and are not turned into outcome forecasts.
  const source = readFileSync(resolve('src/App.tsx'), 'utf8');
  assert.doesNotMatch(source, /choice\.hint\s*&&\s*<small>/);
  assert.match(source, /className="choice-action"/);
  assert.match(source, /className="choice-cost"/);
});

test('only negative resource deltas are shown before a choice', async () => {
  const { choiceCostLabels } = await import('../src/choice-presentation.ts');
  const resources = [{ id: 'oxygen', label: '氧气', initial: 5, min: 0, max: 5, description: '' }];
  const choice = { id: 'test', text: '检查', nextNodeId: 'next', effects: { resources: { oxygen: -2, reserve: 1 } } };
  assert.deepEqual(choiceCostLabels(choice, resources), ['氧气 -2']);
});

test('challenge locks keep resource costs precise without disclosing missing clue names', async () => {
  const { choiceLockLabels } = await import('../src/choice-presentation.ts');
  const resources = [{ id: 'oxygen', label: '氧气', initial: 5, min: 0, max: 5, description: '' }];
  const choice = { id: 'test', text: '检查', nextNodeId: 'next', effects: { resources: { oxygen: -2 } }, requires: { allClues: ['未知门牌'], anyClues: ['未知录音', '未知证词'] } };
  const state = { clues: [], resources: { oxygen: 1 }, resolve: 50, trust: 30 };
  assert.deepEqual(choiceLockLabels(choice, state, resources, true), ['还缺少经过核实的线索', '氧气至少 2']);
  assert.deepEqual(choiceLockLabels(choice, state, resources, false), ['缺少线索：未知门牌', '需要任一线索：未知录音、未知证词', '氧气至少 2']);
  assert.deepEqual(choiceLockLabels(choice, { ...state, clues: ['未知门牌', '未知证词'], resources: { oxygen: 2 } }, resources, true), []);
});
