import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import type { GameWorld } from '../shared/types.ts';
import { getWorld } from '../server/worlds.ts';
import { restoreSession, rewindSession, saveSession } from '../src/game.ts';
import revisions from '../content/catalog-b-editorial-followup.json';
import { withCatalogBEditorial } from '../content/catalog-b-editorial.ts';
import { withWorldProse } from '../content/world-prose.ts';
import { withWorldContinuation } from '../content/world-continuation.ts';
import { affectedPaths, facts, play, step } from './catalog-b-editorial-support.ts';
import { auditBGraph } from './catalog-b-graph.ts';

const before: GameWorld[] = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/catalog-b-editorial-20260907-before.json.gz', import.meta.url))).toString());
const current = before.map(w => getWorld(w.storyId));
const world = (id: string) => current.find(w => w.id === id)!;
const output = 'output/editorial/catalog-b/20260907-followup/paths';
mkdirSync(output, { recursive: true });
for (const old of before) {
  test(`${old.id}: follow-up changes only declared copy and additive choice aliases`, () => {
    const now = world(old.id);
    const { ink: _oldInk, ...baseline } = structuredClone(old);
    const { ink: _newInk, ...actual } = structuredClone(now);
    for (const r of revisions.filter(r => r.worldId === old.id)) {
      const [, id, field, index, leaf] = r.path.split('.');
      const a = actual.nodes[id], b = baseline.nodes[id];
      if (field === 'choices') {
        assert.equal(leaf, 'text');
        const newChoice = a.choices.find(c => c.id === index)!, oldChoice = b.choices.find(c => c.id === index)!;
        assert.ok(newChoice.legacyTexts?.includes(oldChoice.text));
        for (const text of oldChoice.legacyTexts ?? []) assert.ok(newChoice.legacyTexts?.includes(text));
        newChoice.text = oldChoice.text;
        if (oldChoice.legacyTexts) newChoice.legacyTexts = oldChoice.legacyTexts;
        else delete newChoice.legacyTexts;
      } else {
        assert.equal(field, 'text');
        a.text[Number(index)] = b.text[Number(index)];
        if (a.ending && Number(index) === a.text.length - 1) {
          assert.equal(now.nodes[id].ending!.text, now.nodes[id].text.at(-1));
          a.ending.text = b.ending!.text;
        }
      }
    }
    assert.deepEqual(JSON.parse(JSON.stringify(actual)), baseline, 'IDs, routes, effects, gates, resources, source, metadata and unrelated prose remain exact');
  });
  if (!revisions.some(r => r.worldId === old.id)) continue;
  test(`${old.id}: follow-up restores actual previous saves on all affected edge witnesses`, context => {
    const now = world(old.id), paths = affectedPaths(old, revisions), evidence = [];
    for (const path of paths) {
      const a = play(old, path), b = play(now, path);
      assert.deepEqual(facts(b), facts(a));
      a.paragraphIndex = a.paragraphs.length - 1;
      const saved = saveSession(a), untouched = structuredClone(saved);
      for (const textOnly of [false, true]) {
        const input = structuredClone(saved);
        if (textOnly) for (const h of input.history) delete h.choiceId;
        const restored = restoreSession(now, input);
        assert.deepEqual(facts(restored), facts(a));
        assert.deepEqual(restored.paragraphs, b.paragraphs);
        assert.equal(restored.paragraphIndex, a.paragraphIndex);
        assert.deepEqual(facts(restoreSession(now, saveSession(restored))), facts(a));
        if (path.length) assert.deepEqual(facts(step(rewindSession(restored, restored.history.length - 2), path.at(-1)!)), facts(b));
      }
      assert.deepEqual(saved, untouched);
      evidence.push({ path, facts: facts(b), before: a.paragraphs, after: b.paragraphs, idRestore: true, textOnlyRestore: true, rewind: path.length ? true : 'start' });
    }
    writeFileSync(`${output}/${old.id}.json`, JSON.stringify(evidence, null, 2));
    context.diagnostic(`${paths.length} positions; ${paths.length * 2} ID/text-only old-save restores with re-save and rewind`);
  });
}
test('tiger: both threats and charges retain the fire consequence without borrowing a skipped wolf negotiation', () => {
  const w = world('tiger-shelter');
  for (const path of [
    ['b_enter_mountain', 'wind', 'wolves', 'threaten'],
    ['b_enter_mountain', 'wind', 'smoke', 'wet', 'charge'],
    ['b_enter_mountain', 'wind', 'wolves', 'share', 'wet', 'charge'],
  ]) {
    const s = play(w, path);
    assert.equal(s.node.id, 'b_mountain_bad');
    assert.equal(s.node.ending!.tone, 'dark');
    assert.match(s.paragraphs.join(''), /火把.*枯草/);
    assert.doesNotMatch(s.paragraphs.join(''), /头狼.*(?:不肯|堵住|开路)/);
    if (path.includes('share')) assert.ok(s.clues.includes('狼群背风路'));
    else assert.ok(!s.clues.includes('狼群背风路'));
  }
  assert.doesNotMatch(w.nodes.b_signal.text.join(''), /咽下催她扑人的话/);
  assert.ok(w.nodes.b_signal.choices.some(c => c.id === 'charge'));
});
test('six: early exits need no school sign; late rest explicitly returns the discharged patient', () => {
  const w = world('six-roots'), audit = auditBGraph(w);
  for (const id of ['b_stretcher', 'b_cart_school', 'b_medicine', 'b_watch']) {
    const s = play(w, audit.atEdge.get(`${id}/b_withdraw`)!.path);
    assert.ok(!s.clues.includes('夜学开门'));
    assert.doesNotMatch(s.choices.find(c => c.id === 'b_withdraw')!.text, /招牌|授课/);
    assert.equal(step(s, 'b_withdraw').node.id, 'b_school_small');
  }
  for (const id of ['slow', 'b_withdraw']) {
    const late = play(w, audit.atNode.get('b_school_return')!.path);
    assert.ok(late.clues.includes('宋沐安置'));
    assert.match(late.choices.find(c => c.id === id)!.text, /陪宋沐.*复诊/);
    assert.equal(step(late, id).node.id, 'b_school_small');
  }
  assert.equal(w.nodes.b_school_return.choices.find(c => c.id === 'welcome')!.text,
    before.find(w => w.id === 'six-roots')!.nodes.b_school_return.choices.find(c => c.id === 'welcome')!.text);
});
test('hollow: not evacuating still blocks the escorted crossing; identity is introduced after a real rescue', () => {
  const w = world('hollow-immortals');
  const alone = play(w, ['b_enter_copper','bow','watch','channel','cut_supply','leave','drop']);
  assert.equal(alone.node.id, 'b_copper_bridge');
  assert.ok(!alone.clues.includes('杂役带人撤离'));
  assert.ok(!alone.choices.some(c => c.id === 'divert'));
  assert.doesNotMatch(alone.paragraphs.join(''), /陆木匠|同伴扶着/);
  assert.equal(step(alone, 'hide').node.id, 'b_copper_small');
  const rescued = play(w, ['b_enter_copper','trace','carry','follow','locate','cut_supply','evacuate','drop','divert']);
  assert.equal(rescued.node.id, 'b_copper_foot');
  assert.ok(rescued.clues.includes('众人过桥'));
  assert.ok(!rescued.history.some(h => h.nodeId === 'b_copper_awake'));
  assert.match(rescued.paragraphs.join(''), /陆木匠.*同伴/);
  assert.equal(step(rescued, 'stay').node.id, 'b_copper_good');
});
test('hollow: messenger and self-carried letters both lead to the arranged meeting without changing their price', () => {
  const w = world('hollow-immortals'), audit = auditBGraph(w);
  for (const id of ['send', 'move']) {
    const s = play(w, audit.atEdge.get(`b_names_home/${id}`)!.path);
    assert.match(s.paragraphs.join(''), /荒地.*碰面/);
    const next = step(s, id);
    assert.equal(next.node.id, 'b_return_water');
    assert.match(next.paragraphs.join(''), /约好的荒地等.*新徒赶来/);
    const resource = id === 'send' ? 'cover' : 'b_time';
    assert.equal(next.resources[resource], s.resources[resource] - 1);
    assert.ok(next.clues.includes(id === 'send' ? '家眷分路接走' : '各家自行避走'));
    assert.ok(next.choices.some(c => c.id === 'alone'));
  }
});
test('island: the cooking ending reflects cooperation; the performed accusation still fails', () => {
  const w = world('island-broadcast'), audit = auditBGraph(w);
  const good = play(w, audit.atNode.get('b_camp_good')!.path);
  assert.ok(good.clues.includes('一起下厨'));
  assert.doesNotMatch(good.paragraphs.join(''), /那场争吵/);
  const bad = step(play(w, audit.atEdge.get('b_camera_argument/perform')!.path), 'perform');
  assert.equal(bad.node.id, 'b_camp_bad');
  assert.equal(bad.node.ending!.tone, 'dark');
  assert.match(bad.paragraphs.join(''), /指控秦白/);
});
test('follow-up exact-match adapter is idempotent and preserves later edits plus previous visible aliases', () => {
  for (const id of ['tiger-shelter', 'six-roots', 'hollow-immortals', 'island-broadcast']) {
    const input = structuredClone(world(id));
    const snapshot = structuredClone(input);
    assert.deepEqual(withWorldContinuation(withWorldProse(withCatalogBEditorial(input))), snapshot);
    assert.deepEqual(input, snapshot);
  }
  const input = structuredClone(world('six-roots'));
  input.nodes.b_stretcher.choices.find(c => c.id === 'b_withdraw')!.text = 'Later independent correction';
  const snapshot = structuredClone(input);
  assert.deepEqual(withCatalogBEditorial(input), snapshot);
  assert.equal(withCatalogBEditorial(input).nodes.b_stretcher.choices.find(c => c.id === 'b_withdraw')!.text, 'Later independent correction');
});
