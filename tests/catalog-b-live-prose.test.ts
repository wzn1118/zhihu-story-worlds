import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import { catalogWorldsB } from '../content/catalog-b.ts';
import { compileWorld } from '../server/worlds.ts';
import type { GameWorld } from '../shared/types.ts';
import { choose, restoreSession, saveSession, startSession, type Session } from '../src/game.ts';
import { auditBGraph } from './catalog-b-graph.ts';
import { pressureWitness } from './catalog-b-live-pressure.ts';
import { resourceContract } from './catalog-b-editorial-support.ts';

// Captured from real 4173 HTTP before these prose fixes, including the real Ink.
const before: GameWorld[] = JSON.parse(gunzipSync(readFileSync('tests/fixtures/catalog-b-live-before.json.gz')).toString());
const worlds = catalogWorldsB.map(compileWorld);
const inventories = JSON.parse(readFileSync('tests/catalog-b-inventory.json', 'utf8'));
function play(world: GameWorld, path: string[]) {
  let s = startSession(world);
  for (const id of path) { const choice = s.choices.find(c => c.id === id); assert.ok(choice, `${world.id}/${s.node.id}/${id}`); s = choose(s, choice); }
  return s;
}
function step(s: Session, id: string) { const choice = s.choices.find(c => c.id === id); assert.ok(choice); return choose(s, choice); }
function facts(s: Session) { return { node: s.node.id, resources: s.resources, clues: s.clues, resolve: s.resolve, trust: s.trust, choiceCount: s.choiceCount }; }
function nearEnd(id: string, end: string) {
  const w = worlds.find(w => w.id === id)!;
  const path = inventories.find((x: any) => x.worldId === id).routes.flatMap((r: any) => r.endingWitnesses).find((e: any) => e.id === end).choices;
  return play(w, path.slice(0, -1));
}

for (const world of worlds) {
  const old = before.find(w => w.id === world.id)!;
  test(`${world.id}: live correction preserves all old graph, price, gate, resource and source contracts`, () => {
    const additive = ['island-broadcast', 'wrong-realm'].includes(world.id);
    assert.equal(world.version, additive ? '2.0.1' : old.version);
    if (additive) assert.ok(world.compatibleSaveVersions?.includes(old.version));
    assert.deepEqual(Object.keys(world.nodes), Object.keys(old.nodes));
    // Descriptions are prose; IDs, labels, bounds and all prices stay frozen.
    assert.deepEqual(world.resources?.map(resourceContract), old.resources?.map(resourceContract));
    assert.deepEqual(world.source, old.source);
    assert.deepEqual(world.sourcePassages, old.sourcePassages);
    for (const node of Object.values(old.nodes)) {
      const current = world.nodes[node.id];
      assert.equal(current.ending?.tone, node.ending?.tone);
      const added = world.id === 'island-broadcast' && node.id === 'b_shore_notice' ? ['escort_route'] : world.id === 'wrong-realm' && node.id === 'b_sword_offer' ? ['read_terms'] : [];
      assert.deepEqual(current.choices.filter(c => !node.choices.some(old => old.id === c.id)).map(c => c.id), added);
      assert.equal(current.choices.length, node.choices.length + added.length);
      for (const c of node.choices) {
        const revised = current.choices.find(x => x.id === c.id)!;
        const { text: _text, legacyTexts: _aliases, ...contract } = c;
        const { text: _newText, legacyTexts: _newAliases, ...newContract } = revised;
        // HTTP omits undefined optional keys; compare the exact serialized
        // contract, retaining every defined gate/effect/route value.
        assert.deepEqual(JSON.parse(JSON.stringify(newContract)), contract, `${node.id}/${c.id}`);
        assert.ok(revised.text === c.text || revised.legacyTexts?.includes(c.text));
      }
    }
  });
  test(`${world.id}: real pre-fix v2 saves before and after every edge restore with IDs and text-only history`, context => {
    const audit = auditBGraph(old);
    let positions = 0;
    for (const [edge, state] of audit.atEdge) {
      const choiceId = edge.slice(edge.indexOf('/') + 1);
      for (const path of [state.path, [...state.path, choiceId]]) {
        const previous = play(old, path);
        previous.paragraphIndex = previous.paragraphs.length - 1;
        const saved = saveSession(previous);
        for (const textOnly of [false, true]) {
          const input = structuredClone(saved);
          if (textOnly) for (const h of input.history) delete h.choiceId;
          const untouched = structuredClone(input);
          const restored = restoreSession(world, input);
          assert.deepEqual(facts(restored), facts(previous));
          assert.equal(restored.paragraphIndex, previous.paragraphIndex);
          assert.deepEqual(input, untouched);
          assert.deepEqual(facts(restoreSession(world, saveSession(restored))), facts(previous));
        }
        positions++;
      }
    }
    context.diagnostic(`${positions} before/after save positions, ID and text-only histories`);
  });
}

test('red-plum: travelling light never invents a cart or a handed-over key before the choice', () => {
  const w = worlds.find(w => w.id === 'red-plum')!;
  const key = play(w, ['b_enter_ferry', 'light']);
  assert.doesNotMatch(key.paragraphs.join(''), /她把钥匙穿在腰上/);
  const ditch = step(key, 'lock');
  assert.ok(!ditch.history.some(h => h.nodeId === 'b_cart_plum'));
  assert.ok(!ditch.clues.includes('张婶送堤路'));
  const c = ditch.choices.find(c => c.id === 'push_cart')!;
  assert.doesNotMatch(c.text, /车/);
  assert.ok(c.legacyTexts?.some(t => t.includes('重车')));
});
test('red-plum: late warehouse concession does not undo the completed crossing', () => {
  const s = step(nearEnd('red-plum', 'b_ferry_good'), 'shelter');
  assert.equal(s.node.id, 'b_ferry_small');
  assert.ok(s.clues.includes('赶上渡船') && s.clues.includes('河心坐稳'));
  assert.doesNotMatch(s.paragraphs.join(''), /开春你们才渡河|你不再追船/);
  assert.match(s.paragraphs.join(''), /就近的堤仓/);
});
test('palace: resting after approved resignation does not reinstate the empress title', () => {
  const s = step(nearEnd('palace-ledger', 'b_merchant_good'), 'rest');
  assert.equal(s.node.id, 'b_merchant_small');
  assert.ok(s.clues.includes('请辞后位'));
  assert.doesNotMatch(s.paragraphs.join(''), /仍留你的位份|依探亲手续往返/);
});
test('wrong-realm: rest after timely treatment does not claim the medicine missed its window', () => {
  const s = step(nearEnd('wrong-realm', 'b_depart_good'), 'slow');
  assert.ok(s.clues.includes('灵芝及时入药'));
  assert.equal(s.node.id, 'b_depart_small');
  assert.doesNotMatch(s.paragraphs.join(''), /没赶上|错过.*恢复/);
});
test('island: reshooting after evacuation describes renewed exposure, not an unperformed first evacuation', () => {
  const w = worlds.find(w => w.id === 'island-broadcast')!;
  const audit = auditBGraph(catalogWorldsB.find(authored => authored.id === w.id)!);
  const s = step(play(w, audit.atNode.get('b_camera_stop')!.path), 'reshoot');
  assert.ok(s.clues.includes('人员全部撤离'));
  assert.match(s.paragraphs.join(''), /人又留在了低处/);
});
test('time headers mark recovery and settlement rather than putting every month inside the same hour', () => {
  const six = worlds.find(w => w.id === 'six-roots')!;
  assert.equal(six.nodes.b_inn_school.time, '次日早晨');
  assert.equal(six.nodes.b_school_return.time, '一月后');
  const s = nearEnd('wrong-realm', 'b_depart_good');
  assert.equal(s.timeLabel, '休养二十日后');
  assert.match(s.paragraphs.join(''), /第二十天/);
  assert.equal(worlds.find(w => w.id === 'temple-heart')!.nodes.temple.location, '毓娘家');
});
test('hollow: an escape never refunds the recruits without a transaction', () => {
  const w = worlds.find(w => w.id === 'hollow-immortals')!;
  assert.match(w.nodes.b_return_water.text.join(''), /没敢回去讨车钱/);
  assert.doesNotMatch(w.nodes.b_return_water.text.join(''), /新徒退了车钱/);
});

test('shore: the added escort has a real time/supply trade-off and a natural depletion exit', () => {
  const w = worlds.find(w => w.id === 'island-broadcast')!;
  const proof = pressureWitness(w, 'b_shore_call');
  assert.ok(proof.path.includes('escort_route'));
  const atGate = play(w, proof.path.slice(0, -1));
  assert.equal(atGate.resources.b_time, 0);
  assert.ok(proof.blocked.some(id => !atGate.choices.some(c => c.id === id)));
  const end = step(atGate, 'b_withdraw');
  assert.equal(end.node.id, 'b_shore_small');
  assert.deepEqual(facts(restoreSession(w, saveSession(end))), facts(end));
  const shore = play(w, ['b_enter_shore', 'crew', 'escort_route', 'refuse_scene']);
  assert.ok(shore.clues.includes('蓝绳回营路'));
  const onFoot = step(shore, 'route');
  assert.equal(onFoot.resources.supplies, shore.resources.supplies);
});

test('judgment: late public terms can run out the cold-box clock while an early hearing unlocks settlement', () => {
  const w = worlds.find(w => w.id === 'wrong-realm')!;
  const proof = pressureWitness(w, 'b_sword_edge');
  assert.ok(proof.path.includes('read_terms'));
  const atGate = play(w, proof.path.slice(0, -1));
  assert.equal(atGate.resources.b_time, 0);
  assert.ok(proof.blocked.length);
  assert.equal(step(atGate, 'b_withdraw').node.id, 'b_judgment_small');
  const early = play(w, ['b_enter_judgment', 'split', 'store', 'truth', 'return_for_drug', 'read_terms', 'cool']);
  assert.ok(early.clues.includes('替战当众宣读'));
  assert.ok(early.choices.some(c => c.id === 'settle'));
  assert.deepEqual(facts(restoreSession(w, saveSession(early))), facts(early));
});
