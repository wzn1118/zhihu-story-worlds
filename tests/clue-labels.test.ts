import assert from 'node:assert/strict';
import test from 'node:test';
import { clueLabel } from '../src/clue-labels.ts';
import { choiceBlockers } from '../shared/choice-rules.ts';
import type { Choice, ResourceDefinition } from '../shared/types.ts';

const worldId = 'workshop-0b3ce5e1-1f96-474d-871d-5e2a2a541713-r1';
const suffixes = ['referral_number', 'false_notice', 'transfer_match', 'signature_account', 'home_words',
  'full_recording', 'unauthorized_share', 'two_dates', 'complete_statement', 'personal_invitation',
  'personal_submission', 'written_consent', 'transport_account', 'recall_handled_by_lawyer',
  'share_trace_record', 'date_review_rescheduled'];

test('all published factory clue IDs have distinct Chinese display labels', () => {
  const clues = Object.freeze(suffixes.map(suffix => `return_with_luoli_${suffix}`));
  const labels = clues.map(clue => clueLabel(worldId, clue));
  assert.equal(new Set(labels).size, clues.length);
  assert.ok(labels.every(label => /\p{Script=Han}/u.test(label) && !label.includes('_')));
  assert.equal(clueLabel(worldId, 'return_with_luoli_home_words'), '送医时的原话');
  assert.equal(clueLabel(worldId, 'return_with_luoli_recall_handled_by_lawyer'), '律师接手撤传联系的记录');
  assert.deepEqual(clues, suffixes.map(suffix => `return_with_luoli_${suffix}`));
});

test('display aliases never affect other worlds, revisions, or unknown clues', () => {
  for (const clue of ['return_with_luoli_home_words', '已有的中文线索', 'unknown_id', '__proto__', 'constructor']) {
    assert.equal(clueLabel('authored-world', clue), clue);
    assert.equal(clueLabel(worldId.replace('-r1', '-r2'), clue), clue);
  }
  for (const clue of ['已有的中文线索', 'unknown_id', '__proto__', 'constructor']) assert.equal(clueLabel(worldId, clue), clue);
});

test('clue formatting changes only explanations, never predicates or resource costs', () => {
  const required = 'return_with_luoli_home_words', alternate = 'return_with_luoli_full_recording', excluded = 'return_with_luoli_unauthorized_share';
  const choice: Choice = { id: 'inspect', text: '核对', nextNodeId: 'next', requiresClue: required,
    requires: { allClues: [required], anyClues: [required, alternate], noneClues: [excluded] },
    effects: { resources: { time: -2 } } };
  const resources: ResourceDefinition[] = [{ id: 'time', label: '时间', initial: 3, min: 0, max: 3, description: '核对记录需要时间。' }];
  const state = { clues: [excluded], resources: { time: 1 }, resolve: 50, trust: 50 };
  const before = structuredClone({ choice, state, resources });
  const raw = choiceBlockers(choice, state, resources);
  assert.deepEqual(raw, [`缺少线索：${required}`, `需要任一线索：${required}、${alternate}`, `已经记录：${excluded}`, '时间至少 2']);
  assert.deepEqual(choiceBlockers(choice, state, resources, clue => clueLabel(worldId, clue)),
    ['缺少线索：送医时的原话', '需要任一线索：送医时的原话、完整原始录音', '已经记录：未经同意转发录音的记录', '时间至少 2']);
  assert.deepEqual({ choice, state, resources }, before);
  const enabled = { ...state, clues: [required], resources: { time: 2 } };
  assert.deepEqual(choiceBlockers(choice, enabled, resources), []);
  assert.deepEqual(choiceBlockers(choice, enabled, resources, () => 'same-label'), []);
  assert.equal(choiceBlockers(choice, { ...enabled, clues: ['送医时的原话'] }, resources, clue => clueLabel(worldId, clue)).length, 2);
});
