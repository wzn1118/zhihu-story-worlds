import assert from 'node:assert/strict';
import test from 'node:test';
import { authoredWorlds, blueBlood, type AuthoredWorld } from '../content/worlds.ts';
import { compileWorld } from '../server/worlds.ts';
import { choiceBlockers, resourceVariable } from '../shared/choice-rules.ts';
import { CHALLENGE_REWINDS, challengeInitials } from '../src/difficulty.ts';
import {
  choose, encodeSaveFile, isSavedGame, parseSaveFile, restoreSession,
  rewindSession, saveSession, startSession, type Session,
} from '../src/game.ts';

function budgetFixture(): AuthoredWorld {
  return {
    ...blueBlood, version: 'difficulty-test', compatibleSaveVersions: [], startNodeId: 'entry',
    sourcePassages: undefined, operationJournals: undefined,
    resources: [{ id: 'time', label: '余时', description: '调查和交接会消耗。', initial: 3, min: 0, max: 3 }],
    nodes: {
      entry: { ...blueBlood.nodes.training, id: 'entry', choices: [
        { id: 'inspect', text: '花两点余时核验', nextNodeId: 'decision', effects: { resources: { time: -2 }, clues: ['已核验'] } },
        { id: 'leave', text: '保留余时离开', nextNodeId: 'ending' },
      ] },
      decision: { ...blueBlood.nodes.home, id: 'decision', choices: [
        { id: 'submit', text: '花一点余时完成交接', nextNodeId: 'ending', effects: { resources: { time: -1 }, clues: ['已交接'] } },
        { id: 'withdraw', text: '只保留核验记录', nextNodeId: 'ending' },
      ] },
      ending: { ...blueBlood.nodes.ending_witness, id: 'ending' },
    },
  };
}

function step(session: Session, id: string): Session {
  const choice = session.choices.find(candidate => candidate.id === id);
  assert.ok(choice, `${session.world.id}/${session.node.id}: ${id} is unavailable`);
  return choose(session, choice);
}

test('challenge has less spendable time and actual Ink options reflect the tighter budget', () => {
  const world = compileWorld(budgetFixture());
  const classic = step(startSession(world), 'inspect');
  const challenge = step(startSession(world, { difficulty: 'challenge' }), 'inspect');
  assert.equal(classic.resources.time, 1);
  assert.equal(challenge.resources.time, 0);
  assert.equal(challenge.engine.variablesState.$(resourceVariable('time')), 0);
  assert.deepEqual(classic.choices.map(choice => choice.id), ['submit', 'withdraw']);
  assert.deepEqual(challenge.choices.map(choice => choice.id), ['withdraw']);
  assert.deepEqual(challenge.choices.map(choice => choice.id), world.nodes.decision.choices
    .filter(choice => !choiceBlockers(choice, challenge, world.resources).length).map(choice => choice.id));
  const before = challenge.engine.state.ToJson();
  assert.throws(() => choose(challenge, classic.choices[0]), /选项已变化/);
  assert.equal(challenge.engine.state.ToJson(), before);
  assert.equal(step(challenge, 'withdraw').node.id, 'ending');
});

test('risk, progress and full operational capacity retain their authored values', () => {
  const authored = budgetFixture();
  authored.resources!.push(
    { id: 'fear', label: '惊悚值', description: '越高越难冷静行动。', initial: 2, min: 0, max: 6 },
    { id: 'progress', label: '完成进度', description: '已完成的调查进度。', initial: 2, min: 0, max: 6 },
    { id: 'cargo', label: '剩余货位', description: '先保证整班货位为空，再接货。', initial: 4, min: 0, max: 4 },
  );
  authored.nodes.entry.choices[0].effects!.resources = { time: -2, fear: -1, progress: -1, cargo: -1 };
  authored.nodes.entry.choices[0].requires = { resources: { cargo: { min: 4 } } };
  const world = compileWorld(authored);
  const session = startSession(world, { difficulty: 'challenge' });
  assert.deepEqual(session.resources, { time: 2, fear: 2, progress: 2, cargo: 4 });
  assert.deepEqual(challengeInitials(world), session.resources);
  assert.ok(session.choices.some(choice => choice.id === 'inspect'));
});

test('an opening that spends the only budget keeps its legal first action', () => {
  const authored = budgetFixture();
  authored.resources![0].initial = 1;
  authored.nodes.entry.choices = [{ id: 'enter', text: '进入下一站', nextNodeId: 'decision', effects: { resources: { time: -1 } } }];
  const world = compileWorld(authored);
  const session = startSession(world, { difficulty: 'challenge' });
  assert.equal(session.resources.time, 1);
  assert.equal(step(step(session, 'enter'), 'withdraw').node.id, 'ending');
});

test('challenge rewinds stay consumed across earlier timelines, export and restore', () => {
  const world = compileWorld(budgetFixture());
  let session = step(startSession(world, { difficulty: 'challenge' }), 'inspect');
  assert.equal(session.rewindsRemaining, CHALLENGE_REWINDS);
  for (let used = 1; used <= CHALLENGE_REWINDS; used++) {
    const original = session;
    const snapshot = original.engine.state.ToJson();
    const rewind = rewindSession(original, 0);
    assert.equal(original.engine.state.ToJson(), snapshot);
    assert.equal(rewind.rewindsRemaining, CHALLENGE_REWINDS - used);
    assert.equal(rewind.resources.time, 2);
    assert.deepEqual(rewind.clues, []);
    assert.throws(() => rewindSession(original, 0), /进度已经改变/);
    assert.throws(() => saveSession(original), /进度已经改变/);
    const saved = parseSaveFile(encodeSaveFile(saveSession(rewind)));
    assert.equal(saved.difficulty, 'challenge');
    assert.equal(saved.rewindsRemaining, CHALLENGE_REWINDS - used);
    const loaded = restoreSession(world, saved);
    assert.equal(loaded.difficulty, 'challenge');
    assert.equal(loaded.rewindsRemaining, CHALLENGE_REWINDS - used);
    assert.deepEqual(loaded.resources, rewind.resources);
    session = step(loaded, 'inspect');
  }
  const exhausted = session.engine.state.ToJson();
  assert.throws(() => rewindSession(session, 0), /用完/);
  assert.equal(session.engine.state.ToJson(), exhausted);
  assert.equal(session.rewindsRemaining, 0);
  assert.equal(step(session, 'withdraw').node.id, 'ending');
});

test('invalid rewinds do not spend allowance or mutate the active challenge run', () => {
  const session = step(startSession(compileWorld(budgetFixture()), { difficulty: 'challenge' }), 'inspect');
  const before = session.engine.state.ToJson();
  for (const index of [-1, .5, 1, 9, NaN]) assert.throws(() => rewindSession(session, index), /已经做过选择/);
  assert.equal(session.rewindsRemaining, CHALLENGE_REWINDS);
  assert.equal(session.engine.state.ToJson(), before);
  const inconsistent = { ...session, history: session.history.map((entry, index) => index === 0 ? { ...entry, nodeId: 'absent' } : entry) };
  assert.throws(() => rewindSession(inconsistent, 0), /目标章节/);
  assert.equal(rewindSession(session, 0).rewindsRemaining, CHALLENGE_REWINDS - 1);
});

test('malformed challenge metadata and cross-mode Ink state are rejected', () => {
  const world = compileWorld(budgetFixture());
  const saved = saveSession(startSession(world, { difficulty: 'challenge' }));
  for (const rewindsRemaining of [-1, .5, CHALLENGE_REWINDS + 1, Infinity, NaN, undefined]) {
    const malformed = { ...saved, rewindsRemaining };
    assert.equal(isSavedGame(malformed), false);
    assert.throws(() => restoreSession(world, malformed), /不完整/);
  }
  assert.equal(isSavedGame({ ...saved, difficulty: 'impossible' }), false);
  assert.equal(isSavedGame({ ...saved, difficulty: undefined }), false);
  const classic = saveSession(startSession(world));
  assert.throws(() => restoreSession(world, { ...saved, inkState: classic.inkState }), /状态与选择记录/);
  assert.throws(() => restoreSession(world, { ...classic, inkState: saved.inkState }), /状态与选择记录/);
});

test('pre-challenge saves restore classic resources and unlimited rewinds', () => {
  const world = compileWorld(budgetFixture());
  const old = saveSession(step(startSession(world), 'inspect'));
  delete old.difficulty;
  delete old.rewindsRemaining;
  const loaded = restoreSession(world, parseSaveFile(encodeSaveFile(old)));
  assert.equal(loaded.difficulty, 'classic');
  assert.equal(loaded.rewindsRemaining, Infinity);
  assert.equal(loaded.resources.time, 1);
  assert.ok(loaded.choices.some(choice => choice.id === 'submit'));
  for (let index = 0; index < CHALLENGE_REWINDS + 2; index++) {
    assert.equal(rewindSession(loaded, 0).resources.time, 3);
  }
  assert.equal(saveSession(loaded).difficulty, undefined);
});

test('a failed Ink continuation rolls back engine state and permits a valid retry', () => {
  const world = compileWorld(budgetFixture());
  const session = startSession(world, { difficulty: 'challenge' });
  const target = session.world.nodes.decision;
  const before = session.engine.state.ToJson();
  delete session.world.nodes.decision;
  assert.throws(() => step(session, 'inspect'), /无法找到当前章节/);
  assert.equal(session.engine.state.ToJson(), before);
  session.world.nodes.decision = target;
  assert.equal(step(session, 'inspect').node.id, 'decision');
});

for (const authored of authoredWorlds) test(`${authored.id}: a real challenge route reaches an ending and survives save and rewind`, context => {
  const world = compileWorld(authored);
  let session = startSession(world, { difficulty: 'challenge' });
  assert.ok((world.resources ?? []).some(resource => session.resources[resource.id] < resource.initial), 'the world must receive actual resource pressure');
  assert.ok(session.choices.length, 'challenge opening must remain playable');
  const route: string[] = [];
  for (let stepIndex = 0; !session.node.ending && stepIndex < 100; stepIndex++) {
    assert.ok(session.choices.length, `${session.node.id}: no legal continuation`);
    for (const resource of world.resources ?? []) {
      assert.ok(session.resources[resource.id] >= resource.min);
      assert.equal(session.resources[resource.id], session.engine.variablesState.$(resourceVariable(resource.id)));
    }
    route.push(session.choices[0].id);
    session = choose(session, session.choices[0]);
  }
  assert.ok(session.node.ending, 'real Ink play must reach an authored ending');
  const loaded = restoreSession(world, parseSaveFile(encodeSaveFile(saveSession(session))));
  assert.equal(loaded.node.id, session.node.id);
  assert.deepEqual(loaded.resources, session.resources);
  assert.deepEqual(loaded.history, session.history);
  const rewound = rewindSession(loaded, loaded.history.length - 2);
  const replay = step(rewound, route.at(-1)!);
  assert.equal(replay.node.id, session.node.id);
  assert.equal(replay.rewindsRemaining, CHALLENGE_REWINDS - 1);
  assert.deepEqual(replay.resources, session.resources);
  context.diagnostic(`${route.length} legal choices -> ${session.node.id}; start ${JSON.stringify(challengeInitials(world))}`);
});
