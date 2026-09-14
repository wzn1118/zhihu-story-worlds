import assert from 'node:assert/strict';
import test from 'node:test';
import { catalogWorldsB } from '../content/catalog-b.ts';
import { catalogBExpansions } from '../content/catalog-b-expansions.ts';
import { compileWorld } from '../server/worlds.ts';
import { choiceBlockers } from '../shared/choice-rules.ts';
import { choose, startSession } from '../src/game.ts';
import { auditBGraph } from './catalog-b-graph.ts';

function playTo(worldId: string, nodeId: string) {
  const authored = catalogWorldsB.find(w => w.id === worldId)!;
  const state = auditBGraph(authored).atNode.get(nodeId);
  assert.ok(state, `${worldId}/${nodeId}`);
  let session = startSession(compileWorld(authored));
  for (const id of state.path) session = choose(session, session.choices.find(c => c.id === id)!);
  return session;
}

test('temple: failed bridge crossing and collecting a heart after dinner resolve different causes', () => {
  const rope = playTo('temple-heart', 'b_rope');
  const river = choose(rope, rope.choices.find(c => c.id === 'gamble')!);
  assert.equal(river.node.id, 'b_grain_bad');
  assert.match(river.paragraphs.join(''), /旧绳在半途断了/);
  assert.ok(!river.clues.includes('米送到家'));
  const dinner = playTo('temple-heart', 'b_night');
  assert.ok(dinner.clues.includes('米送到家'));
  const debt = choose(dinner, dinner.choices.find(c => c.id === 'hold')!);
  assert.equal(debt.node.id, 'b_grain_debt');
  assert.match(debt.paragraphs.join(''), /米送到了/);
  assert.doesNotMatch(debt.paragraphs.join(''), /米没按时进门|断绳/);
});

test('temple: working at the village pawnshop brings rice home without inventing a river crossing', () => {
  const pawn = playTo('temple-heart', 'b_pawn');
  const choice = pawn.choices.find(c => c.id === 'buy_time')!;
  assert.ok(choice);
  const home = choose(pawn, choice);
  assert.equal(home.node.id, 'b_home');
  assert.ok(home.clues.includes('米送到家'));
  assert.ok(home.clues.includes('当铺卸货换米'));
  assert.ok(!home.history.some(h => ['b_ferry', 'b_mill', 'b_rope', 'b_grain'].includes(h.nodeId)));
  assert.equal(home.resources.spirit, pawn.resources.spirit - 1);
  assert.equal(home.resources.b_time, pawn.resources.b_time - 2);
});

test('palace: surrendering income at the gate does not invent a later ship impoundment', () => {
  const gate = playTo('palace-ledger', 'b_gate_reply');
  const signed = choose(gate, gate.choices.find(c => c.id === 'sign_away')!);
  assert.equal(signed.node.id, 'b_merchant_signed');
  assert.match(signed.paragraphs.join(''), /分红都要送入内库/);
  assert.ok(!signed.history.some(h => h.nodeId === 'b_dock'));
  assert.doesNotMatch(signed.paragraphs.join(''), /船被扣|扣船/);
});

for (const world of catalogWorldsB) test(`${world.id}: revised decisions preserve aliases without repeating the old evidence tutorial`, () => {
  for (const node of Object.values(world.nodes).filter(n => !n.id.startsWith('b_'))) {
    assert.equal(node.challenge, undefined);
    assert.ok(node.choices.every(c => c.feedback === undefined));
  }
  if (world.nodes.puzzle_0) for (let i = 0; i < 4; i++) {
    assert.ok(world.nodes[`puzzle_${i}`].choices.every(c => c.legacyTexts?.length));
    assert.ok(!world.nodes[`puzzle_${i}`].choices.some(c => c.text === '证据不足，暂不下结论'));
  }
});

for (const world of catalogWorldsB) test(`${world.id}: time and clue gates block events, not just change scores`, () => {
  const audit = auditBGraph(world);
  for (const route of catalogBExpansions[world.id].routes) {
    const gates = route.nodes.flatMap(n => n.choices.map(c => ({ n, c }))).filter(({ c }) =>
      c.requires?.allClues?.length || c.requires?.anyClues?.length || c.requires?.resources?.b_time || (c.effects?.resources?.b_time ?? 0) < 0);
    let testedTime = false, testedClue = false;
    for (const { n, c } of gates) {
      const witness = audit.atEdge.get(`${n.id}/${c.id}`);
      assert.ok(witness, `${n.id}/${c.id}: no playable positive case`);
      assert.equal(choiceBlockers(c, witness, world.resources).length, 0);
      if ((c.effects?.resources?.b_time ?? 0) < 0 || c.requires?.resources?.b_time) {
        assert.ok(choiceBlockers(c, { ...witness, resources: { ...witness.resources, b_time: 0 } }, world.resources).length);
        testedTime = true;
      }
      if (c.requires?.allClues?.length || c.requires?.anyClues?.length) {
        assert.ok(choiceBlockers(c, { ...witness, clues: [] }, world.resources).length);
        testedClue = true;
      }
    }
    assert.ok(testedTime && testedClue, `${route.id}: deadline and clues must gate actual events`);
  }
});
