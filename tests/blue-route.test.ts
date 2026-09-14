import assert from 'node:assert/strict';
import test from 'node:test';
import { blueBlood } from '../content/worlds.ts';
import { compileWorld } from '../server/worlds.ts';
import { choose, restoreSession, saveSession, startSession, type Session } from '../src/game.ts';

function take(session: Session, id: string) {
  const choice = session.choices.find(entry => entry.id === id);
  assert.ok(choice, `Choice ${id} must be available at ${session.node.id}`);
  return choose(session, choice);
}

function photographRoute(session: Session) {
  for (const id of ['accept_exam', 'record_test', 'search_landmarks', 'hide_search', 'visit_diner', 'record_alley', 'save_alley']) {
    session = take(session, id);
  }
  return session;
}

function legacyWorld() {
  const world = structuredClone(blueBlood);
  world.version = '1.0.0';
  delete world.compatibleSaveVersions;
  world.nodes.alley.choices.find(choice => choice.id === 'save_alley')!.effects!.clues = ['消失巷口照片'];
  return compileWorld(world);
}

test('the timestamped photograph route reaches both observer proof choices and the return ending', () => {
  const world = compileWorld(blueBlood);
  let session = photographRoute(startSession(world));
  assert.deepEqual(session.clues.filter(clue => ['观察者行程', '消失巷口照片'].includes(clue)).sort(), ['观察者行程', '消失巷口照片'].sort());
  session = take(session, 'meet_observer');
  session = take(session, 'share_proof');
  assert.ok(session.clues.includes('边界参照'));
  session = take(session, 'cross_with_reference');
  assert.equal(session.node.id, 'ending_return');
});

test('old Blue Blood saves replay their existing decisions and receive the missing observation record', () => {
  const legacy = legacyWorld();
  const current = compileWorld(blueBlood);
  const before = photographRoute(startSession(legacy));
  before.paragraphIndex = 1;
  assert.ok(!before.clues.includes('观察者行程'));
  assert.ok(!before.choices.some(choice => choice.id === 'meet_observer'));
  const saved = saveSession(before);
  const restored = restoreSession(current, saved);
  assert.equal(restored.node.id, saved.nodeId);
  assert.equal(restored.paragraphIndex, 1);
  assert.equal(restored.choiceCount, saved.choiceCount);
  assert.equal(restored.startedAt, saved.startedAt);
  assert.equal(restored.resolve, saved.resolve);
  assert.equal(restored.trust, saved.trust);
  assert.ok(restored.clues.includes('观察者行程'));
  assert.ok(restored.choices.some(choice => choice.id === 'meet_observer'));
  assert.equal(saveSession(restored).worldVersion, current.version);
  assert.equal(saved.worldVersion, '1.0.0');
  assert.ok(!saved.clues.includes('观察者行程'), 'Migration must not mutate the imported save.');
});

test('legacy saves before the photograph and at an ending remain readable without inventing unrelated clues', () => {
  const legacy = legacyWorld();
  const current = compileWorld(blueBlood);
  const initial = restoreSession(current, saveSession(startSession(legacy)));
  assert.deepEqual(initial.clues, []);
  let session = photographRoute(startSession(legacy));
  session = take(session, 'keep_living');
  const ending = restoreSession(current, saveSession(session));
  assert.equal(ending.node.id, 'ending_witness');
  assert.deepEqual(ending.choices, []);
  assert.ok(ending.clues.includes('观察者行程'));
  assert.ok(!ending.clues.includes('边界参照'));
});

test('migration accepts only declared versions and still rejects invalid history or Ink data', () => {
  const current = compileWorld(blueBlood);
  const saved = saveSession(photographRoute(startSession(legacyWorld())));
  assert.throws(() => restoreSession({ ...current, compatibleSaveVersions: [] }, saved), /版本/);
  assert.throws(() => restoreSession(current, { ...saved, worldVersion: '0.9.0' }), /版本/);
  assert.throws(() => restoreSession(current, { ...saved, inkState: '{' }));
  assert.throws(() => restoreSession(current, { ...saved, history: saved.history.map((entry, index) => index === 0 ? { ...entry, choice: 'fabricated' } : entry) }), /无法还原/);
});
