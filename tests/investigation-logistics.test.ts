import assert from 'node:assert/strict';
import test from 'node:test';
import { authoredWorlds, blueBlood } from '../content/worlds.ts';
import { futureIsland } from '../content/future-island.ts';
import { withCoreInvestigation } from '../content/core-gameplay.ts';
import { compileWorld } from '../server/worlds.ts';
import { choose, encodeSaveFile, isSavedGame, MAX_HISTORY_ENTRIES, restoreSession, rewindSession, saveSession, startSession, type Session } from '../src/game.ts';

const blue = compileWorld(authoredWorlds.find(world => world.id === 'blue-blood')!);
const island = compileWorld(authoredWorlds.find(world => world.id === 'future-island')!);
const blueEntry = ['accept_exam', 'record_test', 'search_landmarks', 'save_map', 'ask_witness', 'visit_diner', 'record_alley', 'save_alley', 'open_case_desk'];
const islandEntry = ['save_rule', 'reserve_transport', 'reserve_relief', 'close_contracts', 'answer_logistics', 'verify_capacity', 'one_verified_contact', 'separate_logistics', 'plan_limited_manifest', 'open_logistics_table', 'check_logistics_stock', 'confirm_logistics_stock', 'open_logistics_terms', 'confirm_logistics_terms'];
function take(session: Session, id: string) {
  const choice = session.choices.find(candidate => candidate.id === id);
  assert.ok(choice, `${session.node.id}: ${id} must be available`);
  return choose(session, choice);
}
function walk(session: Session, ids: string[]) { return ids.reduce(take, session); }
function unavailable(session: Session, id: string) { assert.ok(!session.choices.some(choice => choice.id === id), `${session.node.id}: ${id} must be blocked`); }
function prepareCargo(types: string[]) {
  let session = walk(startSession(island), [...islandEntry, 'open_logistics_contacts']);
  for (const type of types) session = walk(session, [`call_logistics_${type}`, `verify_logistics_${type}`]);
  return walk(session, ['leave_logistics_contacts', 'open_logistics_cargo']);
}
function load(session: Session, type: string) { return walk(session, [`load_logistics_${type}`, `return_logistics_loaded_${type}`]); }
function sail(session: Session) { return walk(session, ['leave_logistics_cargo', 'review_logistics_manifest', 'sail_logistics_manifest']); }

for (const order of [['paper', 'map', 'watch'], ['paper', 'watch', 'map'], ['map', 'paper', 'watch'], ['map', 'watch', 'paper'], ['watch', 'paper', 'map'], ['watch', 'map', 'paper']]) {
  test(`Blue Blood: originals support funded handoff in order ${order.join(', ')}`, () => {
    let session = walk(startSession(blue), blueEntry);
    assert.deepEqual(session.resources, { focus: 1, reserve: 2 });
    for (const [index, kind] of order.entries()) {
      if (index === 1) session = take(session, 'case_rest');
      session = walk(session, [`review_${kind}`, `${kind}_original`]);
      unavailable(session, `review_${kind}`);
    }
    assert.deepEqual(session.resources, { focus: 0, reserve: 1 });
    session = walk(session, ['case_connect', 'case_supported', 'case_full_handoff', 'case_keep_testing']);
    assert.equal(session.node.id, 'ending_case_network');
    assert.equal(session.resources.reserve, 0);
    assert.ok(session.clues.includes('独立材料交接'));
  });
}

test('Blue Blood: an unsupported accusation spends attention and leaves a limited fallback after reserves run out', () => {
  let session = walk(startSession(blue), [...blueEntry, 'review_paper', 'paper_original', 'case_rest', 'review_map', 'map_original', 'case_connect', 'case_overclaim']);
  assert.equal(session.lastOutcome!.feedback!.tone, 'setback');
  assert.equal(session.resources.focus, 0);
  assert.ok(!session.clues.includes('反应试探假说'));
  session = walk(session, ['case_reconsider_back', 'case_rest', 'review_watch', 'watch_original', 'case_connect', 'case_supported']);
  assert.equal(session.resources.reserve, 0);
  unavailable(session, 'case_full_handoff');
  assert.ok(session.choices.some(choice => choice.id === 'case_anonymous_question'));
  session = take(session, 'case_private_record');
  assert.equal(session.node.id, 'ending_case_pause');
});

test('Blue Blood: repeated inference navigation grants no resources or evidence; a blank review is not proof', () => {
  let session = walk(startSession(blue), [...blueEntry, 'review_paper', 'paper_leave_blank']);
  const before = { resources: session.resources, clues: session.clues, resolve: session.resolve, trust: session.trust };
  for (let i = 0; i < 8; i++) session = walk(session, ['case_connect', 'case_return_to_desk']);
  assert.deepEqual({ resources: session.resources, clues: session.clues, resolve: session.resolve, trust: session.trust }, before);
  unavailable(session, 'review_paper');
  session = take(session, 'case_connect');
  unavailable(session, 'case_supported');
  unavailable(session, 'case_geography_only');
  session = take(session, 'case_end_inference');
  assert.equal(session.node.id, 'ending_case_pause');
});

test('Future Island: spares consume three slots and exclude both two-slot loads', () => {
  let session = load(prepareCargo(['spares', 'water', 'rescue']), 'spares');
  assert.equal(session.resources.cargo, 1);
  for (const id of ['load_logistics_spares', 'load_logistics_water', 'load_logistics_rescue']) unavailable(session, id);
  session = walk(sail(session), ['keep_logistics_schedule', 'deliver_logistics_spares', 'return_logistics_spare_delivery']);
  unavailable(session, 'deliver_logistics_spares');
  unavailable(session, 'trial_logistics_pump');
  assert.equal(session.resources.focus, 0);
  session = walk(session, ['finish_logistics_handover', 'close_logistics_spares_only', 'keep_partial_archive']);
  unavailable(session, 'choose_maintenance_pact');
});

test('Future Island: water plus transfer fills four slots and unloading does not create new capacity', () => {
  let session = load(load(prepareCargo(['water', 'rescue']), 'water'), 'rescue');
  assert.equal(session.resources.cargo, 0);
  unavailable(session, 'load_logistics_water');
  session = walk(sail(session), ['keep_logistics_schedule', 'deliver_logistics_water', 'return_logistics_water_delivery']);
  assert.equal(session.resources.cargo, 0);
  unavailable(session, 'deliver_logistics_water');
  unavailable(session, 'deliver_logistics_spares');
  session = walk(session, ['deliver_logistics_rescue', 'return_logistics_rescue_delivery', 'finish_logistics_handover', 'close_logistics_water']);
  assert.equal(session.node.id, 'council');
  assert.equal(session.resources.cargo, 4);
  assert.ok(session.clues.includes('配载饮水签收单'));
  assert.ok(session.clues.includes('配载转移交接单'));
  assert.ok(session.clues.includes('配载支线已收束'));
});

test('Future Island: the maintenance ending requires real delivery and a separate pump trial', () => {
  let session = walk(sail(load(prepareCargo(['spares']), 'spares')), ['keep_logistics_schedule', 'deliver_logistics_spares', 'return_logistics_spare_delivery']);
  const beforeTrial = saveSession(session);
  assert.ok(!session.clues.includes('配载机组试机回单'));
  session = walk(session, ['trial_logistics_pump', 'return_logistics_pump_trial', 'finish_logistics_handover', 'close_logistics_maintenance', 'publish_small_ledger', 'keep_partial_archive', 'choose_maintenance_pact']);
  assert.equal(session.node.id, 'ending_maintenance_pact');
  assert.deepEqual(session.resources, { focus: 1, reserve: 1, cargo: 4 });
  const restored = restoreSession(island, beforeTrial);
  assert.ok(!restored.clues.includes('配载机组试机回单'));
  assert.equal(restored.resources.cargo, 1);
});

test('Future Island: an unverified detour can return undelivered or spend the last reserve on repair', () => {
  const missed = walk(sail(load(prepareCargo(['spares']), 'spares')), ['promise_logistics_detour']);
  const saved = saveSession(missed);
  let failed = walk(missed, ['return_logistics_undelivered', 'close_logistics_failed']);
  assert.equal(failed.node.id, 'archive');
  assert.ok(!failed.clues.some(clue => /配载.*(签收单|交接单|试机回单)/.test(clue)));
  failed = take(failed, 'keep_partial_archive');
  unavailable(failed, 'choose_maintenance_pact');
  const repaired = walk(restoreSession(island, saved), ['repair_logistics_schedule', 'deliver_logistics_spares', 'return_logistics_spare_delivery', 'trial_logistics_pump']);
  assert.equal(repaired.resources.focus, 0);
  assert.equal(repaired.resources.reserve, 0);
});

test('outcome history is reconstructed from real decisions on load and truncated on rewind', () => {
  let session = walk(startSession(blue), [...blueEntry, 'review_paper', 'paper_original', 'case_rest']);
  assert.equal(session.outcomes.length, session.choiceCount);
  const saved = saveSession(session);
  const loaded = restoreSession(blue, { ...saved, outcomes: [{ feedback: { text: 'forged' } }] } as typeof saved);
  assert.deepEqual(loaded.outcomes, session.outcomes);
  const rewound = rewindSession(loaded, blueEntry.length);
  assert.deepEqual(rewound.outcomes, session.outcomes.slice(0, blueEntry.length));
  assert.deepEqual(rewound.resources, { focus: 1, reserve: 2 });
  assert.ok(!rewound.clues.includes('试卷复核完成'));
  session = walk(rewound, ['review_map', 'map_original']);
  assert.equal(session.outcomes.at(-1)!.choiceId, 'map_original');
  assert.ok(!session.outcomes.some(outcome => outcome.choiceId === 'paper_original'));
});

for (const [authored, world, path] of [
  [blueBlood, blue, blueEntry.slice(0, -1)],
  [futureIsland, island, islandEntry.slice(0, 8)],
] as const) test(`${authored.id}: version 1.1 saves enter the expanded world without losing decisions`, () => {
  const previous = compileWorld(withCoreInvestigation(authored));
  assert.equal(previous.version, '1.1.0');
  const original = walk(startSession(previous), [...path]);
  const saved = saveSession(original);
  const migrated = restoreSession(world, saved);
  assert.equal(migrated.node.id, original.node.id);
  // Compatible revisions retain decisions, but replay current authored prose.
  assert.deepEqual(migrated.history.map(entry => entry.choiceId), original.history.map(entry => entry.choiceId));
  assert.deepEqual(migrated.history, walk(startSession(world), [...path]).history);
  assert.deepEqual(migrated.clues, original.clues);
  assert.equal(migrated.resources.focus, original.resources.focus);
  assert.equal(migrated.resources.reserve, original.resources.reserve);
  if (world.id === 'future-island') assert.equal(migrated.resources.cargo, 4);
  assert.equal(saveSession(migrated).worldVersion, world.version);
  assert.equal(saved.worldVersion, '1.1.0');
});

test('repeatable navigation stops before the existing save history limit and remains recoverable', () => {
  const world = compileWorld({ ...blueBlood, version: 'test', startNodeId: 'loop', nodes: {
    loop: { ...blueBlood.nodes.home, id: 'loop', text: ['等待。'], choices: [{ id: 'wait', text: '继续等待', nextNodeId: 'loop', repeatable: true }] },
  } });
  let session = startSession(world);
  for (let i = 0; i < MAX_HISTORY_ENTRIES - 1; i++) session = take(session, 'wait');
  const snapshot = session.engine.state.ToJson();
  assert.throws(() => take(session, 'wait'), /仍可保存/);
  assert.equal(session.engine.state.ToJson(), snapshot);
  assert.ok(isSavedGame(saveSession(session)));
  assert.ok(encodeSaveFile(saveSession(session)).length > 0);
  const loaded = restoreSession(world, saveSession(session));
  const rewound = rewindSession(loaded, 10);
  assert.equal(take(rewound, 'wait').choiceCount, 11);
});
