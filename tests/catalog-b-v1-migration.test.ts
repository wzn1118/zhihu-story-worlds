import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { catalogWorldsB } from '../content/catalog-b.ts';
import type { AuthoredWorld } from '../content/worlds.ts';
import { compileWorld } from '../server/worlds.ts';
import { choose, encodeSaveFile, parseSaveFile, restoreSession, rewindSession, saveSession, startSession } from '../src/game.ts';
import { auditBGraph } from './catalog-b-graph.ts';

const originals: AuthoredWorld[] = JSON.parse(readFileSync(new URL('./catalog-b-v1.fixture.json', import.meta.url), 'utf8'));

for (const original of originals) {
  test(`${original.id}: actual v1 graph retains every node, edge, effect and requirement`, () => {
    const current = catalogWorldsB.find(w => w.id === original.id)!;
    assert.equal(original.version, '1.0.0');
    assert.ok(current.compatibleSaveVersions?.includes(original.version));
    assert.equal(current.startNodeId, original.startNodeId);
    assert.deepEqual(current.source, original.source);
    for (const resource of original.resources!) {
      const now = current.resources!.find(r => r.id === resource.id)!;
      assert.deepEqual([now.initial, now.min, now.max], [resource.initial, resource.min, resource.max]);
    }
    for (const oldNode of Object.values(original.nodes)) {
      const node = current.nodes[oldNode.id];
      assert.ok(node, oldNode.id);
      assert.equal(Boolean(node.ending), Boolean(oldNode.ending));
      assert.ok(node.text.length >= oldNode.text.length, `${oldNode.id}: old paragraph positions must remain valid`);
      for (const choice of oldNode.choices) {
        const now = node.choices.find(c => c.id === choice.id)!;
        assert.ok(now, `${oldNode.id}/${choice.id}`);
        assert.equal(now.nextNodeId, choice.nextNodeId);
        assert.deepEqual(now.effects, choice.effects);
        assert.deepEqual(now.requires, choice.requires);
        assert.equal(now.requiresClue, choice.requiresClue);
        for (const text of [choice.text, ...(choice.legacyTexts ?? [])]) {
          assert.ok(now.text === text || now.legacyTexts?.includes(text), `${oldNode.id}/${choice.id}: missing original wording ${text}`);
        }
      }
    }
  });

  test(`${original.id}: genuine v1 Ink saves migrate before and after every legacy edge, including text-only histories`, context => {
    const oldWorld = compileWorld(original);
    const current = compileWorld(catalogWorldsB.find(w => w.id === original.id)!);
    const audit = auditBGraph(original);
    const paths = new Map<string, string[]>();
    for (const state of audit.atNode.values()) paths.set(JSON.stringify(state.path), state.path);
    for (const [edge, state] of audit.atEdge) {
      paths.set(JSON.stringify(state.path), state.path);
      const id = edge.slice(edge.indexOf('/') + 1);
      const after = [...state.path, id];
      paths.set(JSON.stringify(after), after);
    }
    for (const path of paths.values()) {
      let old = startSession(oldWorld);
      for (const id of path) {
        const choice = old.choices.find(c => c.id === id);
        assert.ok(choice, `${old.node.id}/${id}`);
        old = choose(old, choice);
      }
      old.paragraphIndex = old.paragraphs.length - 1;
      const before = saveSession(old);
      const untouched = JSON.stringify(before);
      for (const textOnly of [false, true]) {
        const file = parseSaveFile(encodeSaveFile(before));
        if (textOnly) file.history = file.history.map(({ choiceId: _choiceId, ...entry }) => entry);
        const migrated = restoreSession(current, file);
        assert.equal(migrated.node.id, old.node.id);
        assert.equal(migrated.choiceCount, old.choiceCount);
        assert.equal(migrated.paragraphIndex, old.paragraphIndex);
        assert.equal(migrated.startedAt, old.startedAt);
        assert.equal(migrated.resolve, old.resolve);
        assert.equal(migrated.trust, old.trust);
        assert.deepEqual([...migrated.clues].sort(), [...old.clues].sort());
        for (const r of original.resources!) assert.equal(migrated.resources[r.id], old.resources[r.id]);
        assert.equal(migrated.resources.b_time, 6, 'Replaying legacy decisions must not consume a new-route clock');
        assert.deepEqual(migrated.history.map(h => h.nodeId), old.history.map(h => h.nodeId));
        assert.deepEqual(migrated.history.map(h => h.choiceId), old.history.map(h => h.choiceId));
        const resaved = saveSession(migrated);
        assert.equal(resaved.worldVersion, current.version);
        const reloaded = restoreSession(current, parseSaveFile(encodeSaveFile(resaved)));
        assert.deepEqual(reloaded.resources, migrated.resources);
        assert.deepEqual(reloaded.choices, migrated.choices);
        if (path.length) {
          const rewind = rewindSession(migrated, path.length - 1);
          const id = path.at(-1)!;
          const replay = choose(rewind, rewind.choices.find(c => c.id === id)!);
          assert.equal(replay.node.id, migrated.node.id);
          assert.deepEqual(replay.resources, migrated.resources);
        }
      }
      assert.equal(JSON.stringify(before), untouched, 'Migration must not mutate the source save');
    }
    context.diagnostic(`${paths.size} real v1 save positions; ${audit.atEdge.size} legacy edges; id and text-only replay`);
  });
}
