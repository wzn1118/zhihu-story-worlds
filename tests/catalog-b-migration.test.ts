import assert from 'node:assert/strict';
import test from 'node:test';
import baseline from './catalog-b-v1.fixture.json';
import type { AuthoredWorld } from '../content/worlds.ts';
import type { GameWorld } from '../shared/types.ts';
import { catalogWorldsB } from '../content/catalog-b.ts';
import { compileWorld } from '../server/worlds.ts';
import { choose, encodeSaveFile, parseSaveFile, restoreSession, saveSession, startSession } from '../src/game.ts';
import { auditBGraph } from './catalog-b-graph.ts';
import { resourceContract } from './catalog-b-editorial-support.ts';

function walk(world: GameWorld, path: string[]) {
  let session = startSession(world);
  for (const id of path) {
    const c = session.choices.find(c => c.id === id);
    assert.ok(c, `${world.id}/${session.node.id}: ${id}`);
    session = choose(session, c);
  }
  return session;
}

for (const original of baseline as unknown as AuthoredWorld[]) test(`${original.id}: genuine v1 Ink saves migrate at every old node and decision`, () => {
  const updated = catalogWorldsB.find(w => w.id === original.id)!;
  assert.equal(updated.version, ['island-broadcast', 'wrong-realm'].includes(updated.id) ? '2.0.1' : '2.0.0');
  assert.ok(updated.compatibleSaveVersions?.includes('1.0.0'));
  assert.equal(updated.startNodeId, original.startNodeId);
  assert.deepEqual(updated.source, original.source);
  for (const r of original.resources!) assert.deepEqual(resourceContract(updated.resources!.find(x => x.id === r.id)!), resourceContract(r));
  for (const [id, old] of Object.entries(original.nodes)) {
    const current = updated.nodes[id];
    assert.ok(current, `Deleted old node ${id}`);
    assert.ok(current.text.length >= old.text.length, `${id}: old paragraph cursor would be invalid`);
    for (const choice of old.choices) {
      const c = current.choices.find(x => x.id === choice.id)!;
      assert.ok(c, `Deleted old choice ${id}/${choice.id}`);
      for (const key of ['nextNodeId', 'effects', 'requires', 'requiresClue', 'repeatable'] as const) assert.deepEqual(c[key], choice[key], `${id}/${choice.id}/${key}`);
      if (c.text !== choice.text) assert.ok(c.legacyTexts?.includes(choice.text), `${id}/${choice.id}: missing wording alias`);
      for (const alias of choice.legacyTexts ?? []) assert.ok(c.legacyTexts?.includes(alias));
    }
  }
  const before = compileWorld(original), after = compileWorld(updated);
  const audit = auditBGraph(original);
  const paths = new Map<string, string[]>();
  for (const s of audit.atNode.values()) paths.set(s.path.join('/'), s.path);
  for (const [edge, s] of audit.atEdge) {
    const choiceId = edge.slice(edge.indexOf('/') + 1);
    const path = [...s.path, choiceId];
    paths.set(path.join('/'), path);
  }
  for (const path of paths.values()) {
    const old = walk(before, path);
    old.paragraphIndex = old.paragraphs.length - 1;
    const saved = saveSession(old), snapshot = JSON.stringify(saved);
    const expected = walk(after, path);
    for (const omitIds of [false, true]) {
      const portable = parseSaveFile(encodeSaveFile({ ...saved, history: saved.history.map(({ choiceId, ...h }) => omitIds ? h : { ...h, choiceId }) }));
      const restored = restoreSession(after, portable);
      assert.equal(restored.node.id, old.node.id);
      assert.equal(restored.paragraphIndex, old.paragraphIndex);
      assert.equal(restored.startedAt, old.startedAt);
      assert.deepEqual(restored.history, expected.history);
      assert.deepEqual([...restored.clues].sort(), [...old.clues].sort());
      assert.equal(restored.resolve, old.resolve);
      assert.equal(restored.trust, old.trust);
      for (const r of original.resources!) assert.equal(restored.resources[r.id], old.resources[r.id]);
      assert.equal(restored.resources.b_time, 6, 'Legacy actions never spend the new deadline');
      assert.deepEqual(restored.choices, expected.choices);
    }
    assert.equal(JSON.stringify(saved), snapshot, 'Migration changed source save');
  }
  // Old text aliases predate v1 too; no-choiceId histories still locate them.
  const aliasVersion = structuredClone(original);
  for (const n of Object.values(aliasVersion.nodes)) for (const c of n.choices) if (c.legacyTexts?.length) c.text = c.legacyTexts[0];
  const aliases = compileWorld(aliasVersion);
  for (const [edge, state] of audit.atEdge) {
    const id = edge.slice(edge.indexOf('/') + 1);
    const c = original.nodes[state.nodeId].choices.find(c => c.id === id)!;
    if (!c.legacyTexts?.length) continue;
    const saved = saveSession(walk(aliases, [...state.path, id]));
    saved.history = saved.history.map(({ choiceId: _id, ...h }) => h);
    assert.equal(restoreSession(after, saved).node.id, c.nextNodeId);
  }
});
