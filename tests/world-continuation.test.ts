import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import { authoredWorlds, type AuthoredWorld } from '../content/worlds.ts';
import { withWorldContinuation, worldContinuationRevisions } from '../content/world-continuation.ts';
import { compileWorld } from '../server/worlds.ts';
import { restoreSession, saveSession } from '../src/game.ts';
import { explore, replay } from './core-creative-support.ts';
import { gameplayContract, markerCount, visibleProse } from './world-prose-support.ts';

const before: AuthoredWorld[] = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/worlds-pre-continuation.json.gz', import.meta.url))).toString());

test('continuation covers a decision and two opposing resolved endings in every world', () => {
  assert.deepEqual(Object.keys(worldContinuationRevisions), before.map(w => w.id));
  for (const original of before) {
    const input = structuredClone(original);
    const world = withWorldContinuation(input);
    assert.deepEqual(input, original, `${world.id}: input mutation`);
    assert.deepEqual(withWorldContinuation(world), world, `${world.id}: idempotence`);
    assert.deepEqual(gameplayContract(world), gameplayContract(original));
    const fields = visibleProse(original);
    for (const [from, to] of worldContinuationRevisions[world.id]) {
      assert.ok(fields.some(f => f.text === from), `${world.id}: stale original ${from}`);
      assert.notEqual(from, to);
    }
    const changed = Object.values(world.nodes).filter(n => JSON.stringify(n.text) !== JSON.stringify(original.nodes[n.id].text));
    assert.equal(changed.length, 3, world.id);
    assert.equal(changed.filter(n => !n.ending && n.choices.length > 0).length, 1);
    assert.equal(changed.filter(n => n.ending?.tone === 'dark').length, 1);
    assert.equal(changed.filter(n => n.ending?.tone === 'hopeful').length, 1);
    assert.ok(markerCount(world) <= markerCount(original));
    assert.deepEqual(world.sourcePassages, original.sourcePassages);
    assert.deepEqual(world.adaptation, original.adaptation);
    for (const node of changed.filter(n => n.ending)) assert.equal(node.ending!.text, node.text.at(-1));
  }
});

test('continuation leaves a newer route-owner paragraph untouched', () => {
  const world = structuredClone(before.find(w => w.id === 'hollow-immortals')!);
  world.nodes.b_return_bad.text[0] = 'Later correction by the route owner.';
  assert.equal(withWorldContinuation(world).nodes.b_return_bad.text[0], world.nodes.b_return_bad.text[0]);
});

test('gameplay comparison permits resource-description edits but retains numeric rules', () => {
  const original = before[0];
  const updated = structuredClone(original);
  updated.resources![0].description = 'A later onboarding copy correction.';
  assert.deepEqual(gameplayContract(updated), gameplayContract(original));
  updated.resources![0].initial += 1;
  assert.notDeepEqual(gameplayContract(updated), gameplayContract(original));
});

for (const original of before) {
  test(`${original.id}: continued prose preserves all old Ink choices, depletion exits and saves`, context => {
    const authored = authoredWorlds.find(w => w.id === original.id)!;
    assert.deepEqual(gameplayContract(authored), gameplayContract(original));
    const old = compileWorld(original), world = compileWorld(authored);
    const graph = explore(old);
    assert.equal(graph.nodes.size, Object.keys(old.nodes).length);
    const ends = new Set<string>();
    for (const path of [[], ...graph.edges.values()]) {
      const session = replay(old, path);
      session.paragraphIndex = session.paragraphs.length - 1;
      const saved = saveSession(session);
      const expected = replay(world, path);
      if (expected.node.ending) ends.add(expected.node.id);
      for (const history of [saved.history, saved.history.map(({ choiceId: _id, ...entry }) => entry)]) {
        const restored = restoreSession(world, { ...saved, history });
        assert.equal(restored.node.id, session.node.id);
        assert.equal(restored.paragraphIndex, session.paragraphIndex);
        assert.equal(restored.choiceCount, session.choiceCount);
        assert.deepEqual(restored.resources, session.resources);
        assert.deepEqual(restored.clues, session.clues);
        assert.deepEqual(restored.history, expected.history);
        assert.deepEqual(restored.paragraphs, expected.paragraphs);
      }
    }
    assert.equal(ends.size, Object.values(world.nodes).filter(n => n.ending).length);
    context.diagnostic(`${graph.edges.size + 1} save points; ${(graph.edges.size + 1) * 2} legacy restores; ${ends.size} endings`);
  });
}
