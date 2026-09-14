import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthoredWorld } from '../content/worlds.ts';
import { blueBlood } from '../content/worlds.ts';
import { doublePursuit, velvetAlibi } from '../content/worlds.ts';
import { futureIsland } from '../content/future-island.ts';
import { withCoreInvestigation } from '../content/core-gameplay.ts';
import { compileWorld } from '../server/worlds.ts';
import { choiceBlockers } from '../shared/choice-rules.ts';
import { choose, restoreSession, saveSession, startSession } from '../src/game.ts';

function fixture(): AuthoredWorld {
  return { ...blueBlood, version: 'test', compatibleSaveVersions: [], startNodeId: 'entry', resources: [
    { id: 'time', label: '时间', initial: 2, min: 0, max: 3, description: '行动消耗' },
  ], nodes: {
    entry: { ...blueBlood.nodes.training, id: 'entry', choices: [
      { id: 'inspect', text: '调查', nextNodeId: 'decision', effects: { clues: ['时间戳', '门牌'], resources: { time: -2 } } },
      { id: 'rest', text: '休整', nextNodeId: 'decision', effects: { clues: ['证言'], resources: { time: 5 } } },
    ] },
    decision: { ...blueBlood.nodes.home, id: 'decision', choices: [
      { id: 'deduce', text: '双证据判断', nextNodeId: 'ending', requires: { allClues: ['时间戳', '门牌'], anyClues: ['门牌', '证言'], resources: { time: { max: 1 } }, resolve: { min: 50 }, trust: { max: 30 } } },
      { id: 'cost', text: '消耗最后一点时间', nextNodeId: 'ending', effects: { resources: { time: -1 } } },
      { id: 'leave', text: '保留证据离开', nextNodeId: 'ending' },
    ] },
    ending: { ...blueBlood.nodes.ending_witness, id: 'ending' },
  } };
}

test('Ink enforces combined evidence and resource gates, with an exit after exhaustion', () => {
  const world = compileWorld(fixture());
  let session = startSession(world);
  session = choose(session, session.choices[0]);
  assert.deepEqual(session.resources, { time: 0 });
  assert.deepEqual(session.choices.map(choice => choice.id), ['deduce', 'leave']);
  assert.deepEqual(world.nodes.decision.choices.filter(choice => !choiceBlockers(choice, session, world.resources).length).map(choice => choice.id), ['deduce', 'leave']);
  assert.equal(choose(session, session.choices[1]).node.id, 'ending');
  session = startSession(world);
  session = choose(session, session.choices[1]);
  assert.deepEqual(session.resources, { time: 3 });
  assert.deepEqual(session.choices.map(choice => choice.id), ['cost', 'leave']);
  assert.deepEqual(choose(session, session.choices[0]).resources, { time: 2 });
});

test('resource balances survive replay while forged Ink balances fail', () => {
  const world = compileWorld(fixture());
  let session = startSession(world);
  session = choose(session, session.choices[0]);
  const saved = saveSession(session);
  assert.deepEqual(restoreSession(world, saved).resources, { time: 0 });
  session.engine.variablesState.$('resource_time', 3);
  assert.throws(() => restoreSession(world, { ...saved, inkState: session.engine.state.ToJson() }));
});

test('invalid resource definitions and references fail compilation', () => {
  const world = fixture();
  assert.throws(() => compileWorld({ ...world, resources: [{ ...world.resources![0], initial: 4 }] }), /Invalid resource/);
  assert.throws(() => compileWorld({ ...world, resources: [world.resources![0], world.resources![0]] }), /Invalid resource/);
  world.nodes.entry.choices[0].effects!.resources = { missing: -1 };
  assert.throws(() => compileWorld(world), /Unknown resource/);
});

for (const authored of [blueBlood, doublePursuit, velvetAlibi, futureIsland]) test(`${authored.id}: pre-resource saves migrate without losing decisions`, () => {
  const before = compileWorld(authored);
  let original = startSession(before);
  for (let i = 0; i < 6 && original.choices.length; i++) original = choose(original, original.choices[0]);
  const current = compileWorld(withCoreInvestigation(authored));
  const migrated = restoreSession(current, saveSession(original));
  assert.equal(migrated.node.id, original.node.id);
  assert.deepEqual(migrated.history, original.history);
  assert.deepEqual(migrated.clues, original.clues);
  assert.ok(migrated.resources.focus >= 1);
  assert.equal(migrated.resources.reserve, 2);
});
