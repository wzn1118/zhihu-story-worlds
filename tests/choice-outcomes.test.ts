import assert from 'node:assert/strict';
import test from 'node:test';
import { authoredWorlds, blueBlood, type AuthoredWorld } from '../content/worlds.ts';
import { compileWorld } from '../server/worlds.ts';
import { choose, encodeSaveFile, parseSaveFile, restoreSession, rewindSession, saveSession, startSession } from '../src/game.ts';

function fixture(): AuthoredWorld {
  return { ...blueBlood, version: 'test', startNodeId: 'entry', calendar: { firstWeekday: 1 }, resources: [
    { id: 'focus', label: '专注', initial: 2, min: 0, max: 3, description: '调查消耗' },
  ], nodes: {
    entry: { ...blueBlood.nodes.training, id: 'entry', clock: { minuteOfDay: 600 }, choices: [
      { id: 'inspect', text: '调查门牌', nextNodeId: 'decision', effects: { clues: ['门牌'], resources: { focus: -2 }, trust: 90 } },
      { id: 'rest', text: '休息', nextNodeId: 'decision', effects: { clues: ['证言'], resources: { focus: 5 } } },
    ] },
    decision: { ...blueBlood.nodes.home, id: 'decision', clock: { minuteOfDay: 590 }, choices: [
      { id: 'deduce', text: '核对门牌', nextNodeId: 'ending', requires: { allClues: ['门牌'] }, effects: { clues: ['门牌', '结论'], resolve: -80 }, feedback: { tone: 'success', text: '门牌的日期与现场记录一致。' } },
      { id: 'leave', text: '暂时离开', nextNodeId: 'ending' },
    ] },
    ending: { ...blueBlood.nodes.ending_witness, id: 'ending', clock: { minuteOfDay: 610 } },
  } };
}

test('outcomes report actual capped deltas and only newly acquired clues', () => {
  const world = compileWorld(fixture());
  let session = startSession(world);
  session = choose(session, session.choices[1]);
  assert.equal(session.lastOutcome!.resources[0].delta, 1);
  assert.deepEqual(session.lastOutcome!.clues, ['证言']);
  session = startSession(world);
  session = choose(session, session.choices[0]);
  assert.equal(session.lastOutcome!.trust, 70);
  assert.equal(session.lastOutcome!.resources[0].delta, -2);
  session = choose(session, session.choices[0]);
  assert.deepEqual(session.lastOutcome!.clues, ['结论']);
  assert.equal(session.lastOutcome!.resolve, -50);
  assert.equal(session.lastOutcome!.feedback!.tone, 'success');
});

test('canonical choice controls feedback and stale or duplicated actions cannot advance Ink', () => {
  const world = compileWorld(fixture());
  const initial = startSession(world);
  const staleChoice = initial.choices[0];
  const session = choose(initial, { ...staleChoice, text: 'forged', effects: { resources: { focus: 99 } }, feedback: { tone: 'success', text: 'forged' } });
  assert.equal(session.lastOutcome!.choiceText, '调查门牌');
  assert.equal(session.lastOutcome!.feedback, undefined);
  assert.equal(session.resources.focus, 0);
  const snapshot = session.engine.state.ToJson();
  assert.throws(() => choose(initial, staleChoice), /选项已变化/);
  assert.throws(() => choose(session, staleChoice), /选项已变化/);
  assert.equal(session.engine.state.ToJson(), snapshot);
});

test('rewind reconstructs a prior decision without retaining future rewards or mutating the old route', () => {
  const world = compileWorld(fixture());
  let session = startSession(world);
  session = choose(session, session.choices[0]);
  const decision = saveSession(session);
  const time = session.timeLabel;
  session = choose(session, session.choices[0]);
  const snapshot = session.engine.state.ToJson();
  const oldHistory = structuredClone(session.history);
  const rewind = rewindSession(session, 1);
  assert.equal(session.engine.state.ToJson(), snapshot);
  assert.deepEqual(session.history, oldHistory);
  assert.equal(rewind.node.id, 'decision');
  assert.deepEqual(rewind.resources, decision.resources);
  assert.deepEqual(rewind.clues, ['门牌']);
  assert.equal(rewind.timeLabel, time);
  assert.equal(rewind.startedAt, session.startedAt);
  assert.equal(rewind.paragraphIndex, rewind.paragraphs.length - 1);
  assert.equal(rewind.lastOutcome, null);
  assert.equal(rewind.history.at(-1)!.choice, undefined);
  const first = rewindSession(session, 0);
  assert.deepEqual(first.resources, { focus: 2 });
  assert.deepEqual(first.clues, []);
  const alternate = choose(first, first.choices[1]);
  assert.equal(alternate.resources.focus, 3);
  assert.deepEqual(alternate.clues, ['证言']);
  assert.ok(!alternate.choices.some(choice => choice.id === 'deduce'));
  const loaded = restoreSession(world, parseSaveFile(encodeSaveFile(saveSession(alternate))));
  assert.deepEqual(loaded.history, alternate.history);
  assert.deepEqual(loaded.lastOutcome, alternate.lastOutcome);
});

test('invalid rewind positions leave the active engine unchanged', () => {
  const initial = startSession(compileWorld(fixture()));
  const session = choose(initial, initial.choices[0]);
  const snapshot = session.engine.state.ToJson();
  for (const index of [-1, .5, 1, 9, NaN]) assert.throws(() => rewindSession(session, index), /已经做过选择/);
  assert.equal(session.engine.state.ToJson(), snapshot);
});

test('declared legacy text loads before and after the changed choice, while undeclared edits fail', () => {
  const original = fixture();
  const oldWorld = compileWorld(original);
  const before = saveSession(startSession(oldWorld));
  let oldSession = startSession(oldWorld);
  oldSession = choose(oldSession, oldSession.choices[0]);
  const after = saveSession(oldSession);
  after.history = after.history.map(({ choiceId: _id, ...entry }) => entry);
  const revised = structuredClone(original);
  revised.nodes.entry.choices[0].text = '花两点专注调查门牌';
  revised.nodes.entry.choices[0].legacyTexts = ['调查门牌'];
  const world = compileWorld(revised);
  assert.equal(restoreSession(world, before).choices[0].text, '花两点专注调查门牌');
  const loaded = restoreSession(world, after);
  assert.equal(loaded.history[0].choiceId, 'inspect');
  assert.equal(loaded.history[0].choice, '花两点专注调查门牌');
  assert.equal(rewindSession(loaded, 0).node.id, 'entry');
  const tampered = structuredClone(after);
  tampered.history[0].choice = '任意修改';
  assert.throws(() => restoreSession(world, tampered), /无法还原/);
  const wrongId = structuredClone(after);
  wrongId.history[0].choiceId = 'rest';
  assert.throws(() => restoreSession(world, wrongId), /无法还原/);
});

for (const authored of authoredWorlds) test(`${authored.id}: rewind and replay preserve actual state`, () => {
  const world = compileWorld(authored);
  let session = startSession(world);
  for (let step = 0; step < 5 && session.choices.length; step++) session = choose(session, session.choices[0]);
  const rewind = rewindSession(session, session.history.length - 2);
  const choice = rewind.choices.find(candidate => candidate.id === session.history.at(-2)!.choiceId)!;
  const replay = choose(rewind, choice);
  assert.equal(replay.node.id, session.node.id);
  assert.deepEqual(replay.resources, session.resources);
  assert.deepEqual(replay.clues, session.clues);
  assert.deepEqual(replay.lastOutcome, session.lastOutcome);
  assert.equal(replay.timeLabel, session.timeLabel);
});
