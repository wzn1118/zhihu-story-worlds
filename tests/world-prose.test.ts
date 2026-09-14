import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import { authoredWorlds, type AuthoredWorld } from '../content/worlds.ts';
import { withWorldProse, worldProseRevisions } from '../content/world-prose.ts';
import { compileWorld } from '../server/worlds.ts';
import { restoreSession, saveSession } from '../src/game.ts';
import { explore, replay } from './core-creative-support.ts';
import { gameplayContract, markerCount, visibleProse } from './world-prose-support.ts';

const before: AuthoredWorld[] = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/worlds-pre-prose.json.gz', import.meta.url))).toString());

test('all registered worlds receive an explicit prose audit; exact source passages remain unchanged', context => {
  assert.deepEqual(authoredWorlds.map(w => w.id), before.map(w => w.id));
  assert.equal(Object.keys(worldProseRevisions).length, 16);
  for (const original of before) {
    const world = authoredWorlds.find(w => w.id === original.id)!;
    const entries = worldProseRevisions[world.id] ?? [];
    const originals = visibleProse(original);
    assert.equal(new Set(entries.map(([from]) => from)).size, entries.length);
    for (const [from, to] of entries) {
      assert.notEqual(from, to);
      assert.ok(originals.some(f => f.text === from), `${world.id}: unmatched revision ${from}`);
    }
    assert.deepEqual(world.source, original.source);
    assert.deepEqual(world.sourcePassages, original.sourcePassages);
    assert.deepEqual(withWorldProse(world), world, `${world.id}: idempotence`);
    if (entries.length) assert.ok(markerCount(world) <= markerCount(original) / 2, world.id);
    context.diagnostic(`${world.id}: ${markerCount(original)} -> ${markerCount(world)} monitored expressions`);
  }
});

test('the exact-match layer retains newer edits supplied by a route owner', () => {
  const original = before.find(w => w.id === 'happy-home')!;
  const updated = structuredClone(original);
  updated.nodes.ending_erased.text[2] = 'The route owner revised this paragraph after the prose baseline.';
  assert.equal(withWorldProse(updated).nodes.ending_erased.text[2], updated.nodes.ending_erased.text[2]);
  assert.deepEqual(original, before.find(w => w.id === original.id));
});

for (const original of before) {
  test(`${original.id}: all-world prose keeps gameplay and restores every pre-pass Ink edge`, context => {
    const authored = authoredWorlds.find(w => w.id === original.id)!;
    assert.deepEqual(gameplayContract(authored), gameplayContract(original));
    for (const old of Object.values(original.nodes)) {
      const node = authored.nodes[old.id];
      for (const choice of old.choices) {
        const current = node.choices.find(c => c.id === choice.id)!;
        assert.ok(current.text === choice.text || current.legacyTexts?.includes(choice.text), `${old.id}/${choice.id}`);
        for (const alias of choice.legacyTexts ?? []) assert.ok(current.legacyTexts?.includes(alias));
      }
    }
    const old = compileWorld(original), world = compileWorld(authored);
    const graph = explore(old);
    for (const path of [[], ...graph.edges.values()]) {
      const session = replay(old, path);
      session.paragraphIndex = session.paragraphs.length - 1;
      const save = saveSession(session);
      const expected = replay(world, path);
      for (const history of [save.history, save.history.map(({ choiceId: _id, ...entry }) => entry)]) {
        const restored = restoreSession(world, { ...save, history });
        assert.equal(restored.node.id, session.node.id);
        assert.equal(restored.paragraphIndex, session.paragraphIndex);
        assert.equal(restored.choiceCount, session.choiceCount);
        assert.deepEqual(restored.resources, session.resources);
        assert.deepEqual(restored.clues, session.clues);
        assert.deepEqual(restored.history, expected.history);
        assert.deepEqual(restored.paragraphs, expected.paragraphs);
      }
    }
    context.diagnostic(`${graph.edges.size + 1} save points; ${(graph.edges.size + 1) * 2} ID/text-only restores`);
  });
}
