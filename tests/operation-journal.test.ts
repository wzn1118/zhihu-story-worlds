import assert from 'node:assert/strict';
import test from 'node:test';
import { authoredWorlds } from '../content/worlds.ts';
import { compileWorld } from '../server/worlds.ts';
import { choose, restoreSession, rewindSession, saveSession, startSession, type Session } from '../src/game.ts';
import { operationJournalViews } from '../src/operation-journal.ts';

const blueDefinition = authoredWorlds.find(world => world.id === 'blue-blood')!;
const islandDefinition = authoredWorlds.find(world => world.id === 'future-island')!;
const blue = compileWorld(blueDefinition), island = compileWorld(islandDefinition);
const blueEntry = ['accept_exam', 'record_test', 'search_landmarks', 'save_map', 'ask_witness', 'visit_diner', 'record_alley', 'save_alley', 'open_case_desk'];
const islandEntry = ['save_rule', 'reserve_transport', 'reserve_relief', 'close_contracts', 'answer_logistics', 'verify_capacity', 'one_verified_contact', 'separate_logistics', 'plan_limited_manifest', 'open_logistics_table', 'check_logistics_stock', 'confirm_logistics_stock', 'open_logistics_terms', 'confirm_logistics_terms'];
function take(session: Session, id: string) {
  const choice = session.choices.find(candidate => candidate.id === id);
  assert.ok(choice, `${session.node.id}: ${id} must be available`);
  return choose(session, choice);
}
function walk(session: Session, ids: string[]) { return ids.reduce(take, session); }
const journal = (session: Session) => operationJournalViews(session)[0];
const item = (session: Session, id: string) => journal(session).items.find(candidate => candidate.id === id)!;
function prepareSpares() {
  return walk(startSession(island), [...islandEntry, 'open_logistics_contacts', 'call_logistics_spares', 'verify_logistics_spares', 'leave_logistics_contacts', 'open_logistics_cargo']);
}

test('operation journals appear only after the player enters the corresponding branch', () => {
  assert.deepEqual(operationJournalViews(startSession(blue)), []);
  const home = walk(startSession(blue), blueEntry.slice(0, -1));
  assert.deepEqual(operationJournalViews(home), []);
  const active = take(home, 'open_case_desk');
  assert.equal(journal(active).status, 'active');
  assert.ok(journal(active).items.every(entry => entry.tone === 'pending' && entry.evidence.length === 0));
  assert.deepEqual(operationJournalViews(rewindSession(active, 0)), []);
});

test('a blank review stays a gap, while original evidence reports the actual verified result', () => {
  const desk = walk(startSession(blue), blueEntry);
  const saved = saveSession(desk);
  const blank = walk(desk, ['review_paper', 'paper_leave_blank']);
  assert.equal(item(blank, 'paper').tone, 'gap');
  assert.deepEqual(item(blank, 'paper').evidence, ['试卷复核完成']);
  assert.equal(item(blank, 'hypothesis').tone, 'pending');
  const verified = walk(restoreSession(blue, saved), ['review_paper', 'paper_original']);
  assert.equal(item(verified, 'paper').label, '已核实');
  assert.deepEqual(item(verified, 'paper').evidence, ['定向试题记录']);
  assert.equal(journal(take(verified, 'case_stop')).status, 'closed');
});

test('cargo records distinguish verified demand from occupied slots', () => {
  let session = prepareSpares();
  assert.equal(item(session, 'spares').label, '已核验');
  assert.equal(journal(session).cargo!.used, 0);
  const engine = session.engine.state.ToJson();
  operationJournalViews(session);
  assert.equal(session.engine.state.ToJson(), engine);
  session = walk(session, ['load_logistics_spares', 'return_logistics_loaded_spares']);
  assert.equal(item(session, 'spares').label, '已装船');
  assert.deepEqual(journal(session).cargo, { capacity: 4, remaining: 1, used: 3, loads: [{ label: '备件', slots: 3 }], closed: false });
  assert.equal(item(session, 'trial').tone, 'pending');
});

test('full water and transfer load preserves its four occupied slots during delivery', () => {
  const session = walk(startSession(island), [...islandEntry, 'open_logistics_contacts', 'call_logistics_water', 'verify_logistics_water', 'call_logistics_rescue', 'verify_logistics_rescue', 'leave_logistics_contacts', 'open_logistics_cargo', 'load_logistics_water', 'return_logistics_loaded_water', 'load_logistics_rescue', 'return_logistics_loaded_rescue', 'leave_logistics_cargo', 'review_logistics_manifest', 'sail_logistics_manifest', 'keep_logistics_schedule', 'deliver_logistics_water']);
  assert.equal(journal(session).cargo!.used, 4);
  assert.equal(journal(session).cargo!.remaining, 0);
  assert.deepEqual(journal(session).cargo!.loads, [{ label: '饮水', slots: 2 }, { label: '转移', slots: 2 }]);
  assert.equal(item(session, 'water').label, '已签收');
  assert.equal(item(session, 'rescue').label, '已装船');
});

test('receipt, trial, save restoration and rewind retain distinct journal states', () => {
  let session = walk(prepareSpares(), ['load_logistics_spares', 'return_logistics_loaded_spares', 'leave_logistics_cargo', 'review_logistics_manifest', 'sail_logistics_manifest', 'keep_logistics_schedule', 'deliver_logistics_spares', 'return_logistics_spare_delivery']);
  assert.equal(item(session, 'spares').label, '已签收');
  assert.equal(item(session, 'trial').tone, 'pending');
  const before = operationJournalViews(session), index = session.choiceCount;
  session = take(session, 'trial_logistics_pump');
  assert.equal(item(session, 'trial').label, '有试机回单');
  assert.deepEqual(operationJournalViews(restoreSession(island, saveSession(session))), operationJournalViews(session));
  assert.deepEqual(operationJournalViews(rewindSession(session, index)), before);
});

test('a failed voyage keeps historical load distinct from restored capacity and unearned receipts', () => {
  const session = walk(prepareSpares(), ['load_logistics_spares', 'return_logistics_loaded_spares', 'leave_logistics_cargo', 'review_logistics_manifest', 'sail_logistics_manifest', 'promise_logistics_detour', 'return_logistics_undelivered', 'close_logistics_failed']);
  assert.equal(journal(session).status, 'closed');
  assert.deepEqual(journal(session).cargo, { capacity: 4, remaining: 4, used: 3, loads: [{ label: '备件', slots: 3 }], closed: true });
  assert.equal(item(session, 'spares').label, '已装船');
  assert.equal(item(session, 'trial').tone, 'pending');
  assert.ok(!journal(session).items.flatMap(entry => entry.evidence).some(clue => /签收单|试机回单/.test(clue)));
  assert.equal(item(session, 'trial').label, '未执行');
});

test('declining the optional voyage closes it without fabricating shipment or return documents', () => {
  const session = walk(startSession(island), [...islandEntry.slice(0, 9), 'decline_logistics']);
  assert.equal(journal(session).status, 'closed');
  assert.equal(journal(session).cargo!.used, 0);
  assert.equal(item(session, 'voyage').label, '已收束');
  assert.deepEqual(item(session, 'voyage').evidence, ['配载支线已收束']);
});

test('journal compilation rejects unknown nodes, evidence and invalid cargo metadata', () => {
  const invalidNode = structuredClone(blueDefinition);
  invalidNode.operationJournals![0].nodeIds.push('missing_scene');
  assert.throws(() => compileWorld(invalidNode), /Invalid journal/);
  const invalidClue = structuredClone(blueDefinition);
  invalidClue.operationJournals![0].items[0].stages[0].allClues = ['invented'];
  assert.throws(() => compileWorld(invalidClue), /Invalid journal evidence/);
  const unconditional = structuredClone(blueDefinition);
  delete unconditional.operationJournals![0].items[0].stages[0].allClues;
  assert.throws(() => compileWorld(unconditional), /Invalid journal evidence/);
  const invalidResource = structuredClone(islandDefinition);
  invalidResource.operationJournals![0].cargo!.resourceId = 'invented';
  assert.throws(() => compileWorld(invalidResource), /Unknown cargo resource/);
  for (const slots of [0, -1, 1.5, 5]) {
    const invalidSlots = structuredClone(islandDefinition);
    invalidSlots.operationJournals![0].cargo!.loads[0].slots = slots;
    assert.throws(() => compileWorld(invalidSlots), /Invalid cargo load/);
  }
});
