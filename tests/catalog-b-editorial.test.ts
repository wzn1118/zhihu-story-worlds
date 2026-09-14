import assert from 'node:assert/strict';
import test from 'node:test';
import { getWorld } from '../server/worlds.ts';
import { withCatalogBEditorial } from '../content/catalog-b-editorial.ts';
import { withWorldProse } from '../content/world-prose.ts';
import { withWorldContinuation } from '../content/world-continuation.ts';
import { restoreSession, rewindSession, saveSession } from '../src/game.ts';
import { gameplayContract } from './world-prose-support.ts';
import { editorialBefore, affectedPaths, play, step, facts, resourceContract } from './catalog-b-editorial-support.ts';
import { auditBGraph } from './catalog-b-graph.ts';

const worlds = editorialBefore.map(w => getWorld(w.storyId));
const w = (id: string) => worlds.find(w => w.id === id)!;
const to = (id: string, node: string) => play(w(id), auditBGraph(w(id)).atNode.get(node)!.path);
for (const old of editorialBefore) {
  test(`${old.id}: editorial preserves the full non-prose contract and existing aliases`, () => {
    const world = w(old.id);
    const { ink: _a, ...a } = old, { ink: _b, ...b } = world;
    assert.deepEqual(gameplayContract(b), gameplayContract(a));
    for (const n of Object.values(old.nodes)) for (const c of n.choices) {
      const now = world.nodes[n.id].choices.find(x => x.id === c.id)!;
      for (const text of [c.text, ...(c.legacyTexts ?? [])]) assert.ok(now.text === text || now.legacyTexts?.includes(text), `${n.id}/${c.id}: missing ${text}`);
    }
    for (const n of Object.values(world.nodes).filter(n => n.ending)) {
      assert.equal(n.ending!.text, n.text.at(-1));
      assert.equal(n.ending!.title, n.title);
    }
  });
  test(`${old.id}: actual pre-editorial saves survive edited incoming paths, text-only history and rewind`, context => {
    const world = w(old.id), paths = affectedPaths(old);
    for (const path of paths) {
      const previous = play(old, path), expected = play(world, path);
      previous.paragraphIndex = previous.paragraphs.length - 1;
      const saved = saveSession(previous), untouched = structuredClone(saved);
      for (const textOnly of [false, true]) {
        const input = structuredClone(saved);
        if (textOnly) for (const h of input.history) delete h.choiceId;
        const restored = restoreSession(world, input);
        assert.deepEqual(facts(restored), facts(previous));
        assert.deepEqual(restored.paragraphs, expected.paragraphs);
        assert.equal(restored.paragraphIndex, previous.paragraphIndex);
        assert.deepEqual(facts(restoreSession(world, saveSession(restored))), facts(previous));
        if (path.length) {
          const rewound = rewindSession(restored, restored.history.length - 2);
          assert.deepEqual(facts(step(rewound, path.at(-1)!)), facts(expected));
        }
      }
      assert.deepEqual(saved, untouched);
    }
    context.diagnostic(`${paths.length} pre/post positions, IDs + text-only saves, re-save and rewind`);
  });
}
test('editorial and both shared exact-match passes preserve a later owner correction', () => {
  const world = structuredClone(w('temple-heart'));
  world.nodes.b_shrine_good.text[1] = 'Later owner correction; do not overwrite.';
  world.nodes.b_shrine_good.ending!.text = world.nodes.b_shrine_good.text[1];
  const snapshot = structuredClone(world);
  assert.deepEqual(withWorldContinuation(withWorldProse(withCatalogBEditorial(world))), snapshot);
  assert.deepEqual(world, snapshot);
});
test('only resource copy is omitted: identity, bounds and labels still compare', () => {
  const r = w('six-roots').resources![0];
  assert.deepEqual(resourceContract({ ...r, description: 'Changed explanation' }), resourceContract(r));
  for (const patch of [{ id: 'other' }, { label: 'other' }, { initial: 0 }, { min: -1 }, { max: 90 }]) assert.notDeepEqual(resourceContract({ ...r, ...patch }), resourceContract(r));
});
test('temple: leave-home message and burned contract do not summon mother back or restore the cult', () => {
  const path = ['b_enter_shrine','summon','message','help','stop','tear','renounce','return'];
  const lantern = play(w('temple-heart'), path);
  assert.ok(lantern.clues.includes('毓娘收到留家信'));
  assert.match(lantern.paragraphs.join(''), /家门|敲.*门/);
  const end = step(lantern, 'guard');
  assert.ok(end.clues.includes('亲口撤契') && end.clues.includes('庙门钥匙'));
  assert.doesNotMatch(end.paragraphs.join(''), /庙里仍有人敲钟|放弃争庙里那把钥匙/);
  assert.doesNotMatch(step(play(w('temple-heart'), path), 'soup').paragraphs.join(''), /长高以后/);
});
test('tiger: borrowing announces the work obligation of the common next scene', () => {
  const world = w('tiger-shelter');
  const before = play(world, auditBGraph(world).atEdge.get('b_repay/borrow')!.path);
  const borrowed = step(before, 'borrow');
  assert.ok(borrowed.clues.includes('赔鱼劳约'));
  assert.ok(borrowed.history.at(-2)!.choice?.includes('做工'));
  assert.equal(borrowed.resources.shelter, before.resources.shelter - 1);
  assert.doesNotMatch(w('tiger-shelter').nodes.b_keeper.text.join(''), /他们把鱼养死，再拿一只活猫/);
});
test('six: answer-only teaching does not silently grant villagers repair arithmetic', () => {
  const before = to('six-roots', 'b_grain_class');
  assert.ok(!before.clues.includes('村民会复算'));
  assert.doesNotMatch(before.paragraphs.join(''), /跟着算出了结果/);
  const rain = step(step(before, 'sell_answer'), 'argue');
  assert.ok(!rain.clues.includes('村民会复算'));
  assert.ok(!rain.choices.some(c => c.id === 'roof'));
  assert.doesNotMatch(rain.paragraphs.join(''), /用刚学会的算法分出/);
  assert.ok(rain.choices.some(c => c.id === 'move'));
});
test('palace: light luggage and charter do not invent a jewellery crate or hide the second fee', () => {
  const s = play(w('palace-ledger'), ['b_enter_merchant','alone','light','wait_rule','pass','charter']);
  assert.ok(s.clues.includes('轻装出宫') && s.clues.includes('另雇客船'));
  assert.doesNotMatch(s.paragraphs.join(''), /累赘首饰箱|挤掉多少货/);
  assert.match(s.history.at(-2)!.choice!, /费用另结/);
  assert.ok(s.choices.some(c => c.id === 'sell'));
});
test('red-plum: heavy-cart choice is not already undone; key transfer is announced', () => {
  const s = play(w('red-plum'), ['b_enter_ferry','cart']);
  assert.doesNotMatch(s.paragraphs.join(''), /你把旧柜子抬下/);
  const key = step(s, 'keep_load'), ditch = step(key, 'give');
  assert.ok(ditch.clues.includes('重板车'));
  assert.match(ditch.history.at(-2)!.choice!, /交钥匙/);
  assert.equal(ditch.resources.food, key.resources.food - 1);
});
test('hollow: scattering pills does not reveal their contents or unlock the good-ending gate', () => {
  const s = to('hollow-immortals', 'b_recruit_dan'), scatter = step(s, 'snatch');
  assert.ok(!scatter.clues.includes('众人看见虫卵'));
  assert.doesNotMatch(scatter.paragraphs.join(''), /问那东西进了肚子怎样取出来/);
  const endApproach = step(step(step(scatter, 'scatter'), 'lead'), 'move');
  assert.ok(!endApproach.choices.some(c => c.id === 'dig'));
  assert.ok(endApproach.choices.some(c => c.id === 'alone'));
});
test('island: non-split radio choice announces food transport; late handover retains dinner', () => {
  const s = play(w('island-broadcast'), ['b_enter_camp','marked','carry']), found = step(s, 'high');
  assert.ok(!found.clues.includes('谢骁送回食物'));
  assert.match(found.history.at(-2)!.choice!, /谢骁带食物去找/);
  const end = step(to('island-broadcast', 'b_first_supper'), 'end_task');
  assert.ok(end.clues.includes('取到晚饭') && end.clues.includes('今晚屋顶补住'));
  assert.doesNotMatch(end.paragraphs.join(''), /接回散在岛上的人/);
});
test('realm: late withdrawal preserves medicine; quiet settlement does not transfer sword twice', () => {
  const s = to('wrong-realm', 'b_walk_realm');
  assert.ok(s.clues.includes('灵芝及时入药'));
  assert.doesNotMatch(s.choices.find(c => c.id === 'b_withdraw')!.text, /放弃最快的修复窗口/);
  const gate = step(to('wrong-realm', 'b_verdict'), 'quiet');
  assert.ok(gate.clues.includes('只结清药'));
  assert.doesNotMatch(gate.choices.find(c => c.id === 'return_sword')!.text, /^归还剑/);
  assert.equal(step(gate, 'return_sword').node.id, 'b_judgment_small');
});
