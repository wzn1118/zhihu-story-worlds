import assert from 'node:assert/strict';
import test from 'node:test';
import { authoredWorlds } from '../content/worlds.ts';
import { compileWorld } from '../server/worlds.ts';
import {
  choose, encodeSaveFile, MAX_SAVE_FILE_BYTES, parseSaveFile, restoreSession,
  saveSession, startSession,
} from '../src/game.ts';

for (const authored of authoredWorlds) {
  test(`${authored.id}: portable saves retain choices, clues, paragraph and character state`, () => {
    const world = compileWorld(authored);
    let session = startSession(world);
    for (let step = 0; step < 5 && session.choices.length; step++) {
      const choice = session.choices.find((entry) => entry.effects?.clues?.length) ?? session.choices[0];
      session = choose(session, choice);
    }
    session.paragraphIndex = Math.min(1, session.paragraphs.length - 1);
    const original = saveSession(session);
    const restored = restoreSession(world, parseSaveFile(encodeSaveFile(original)));
    assert.equal(restored.node.id, session.node.id);
    assert.deepEqual(restored.node.character, session.node.character);
    assert.deepEqual(restored.choices, session.choices);
    assert.deepEqual(restored.clues, session.clues);
    assert.ok(restored.clues.length > 0, 'The round trip must exercise acquired evidence.');
    assert.deepEqual(restored.history, session.history);
    assert.equal(restored.paragraphIndex, session.paragraphIndex);
    assert.equal(restored.resolve, session.resolve);
    assert.equal(restored.trust, session.trust);
    assert.deepEqual(restored.resources, session.resources);
    assert.equal(restored.startedAt, session.startedAt);
    // Existing browser saves use the same validated restoration path.
    assert.equal(restoreSession(world, original).node.id, session.node.id);
    if (session.choices.length) {
      const afterOriginal = choose(session, session.choices[0]);
      const afterRestore = choose(restored, restored.choices[0]);
      assert.equal(afterRestore.node.id, afterOriginal.node.id);
      assert.deepEqual(afterRestore.clues, afterOriginal.clues);
      assert.deepEqual(afterRestore.resources, afterOriginal.resources);
      assert.equal(afterRestore.resolve, afterOriginal.resolve);
    }
  });
}

test('save import rejects invalid, oversized and unsupported files before restoration', () => {
  const world = compileWorld(authoredWorlds[0]);
  const saved = saveSession(startSession(world));
  const envelope = JSON.parse(encodeSaveFile(saved));
  assert.throws(() => parseSaveFile('{'), /JSON/);
  assert.throws(() => parseSaveFile(JSON.stringify(saved)), /不是赤页/);
  assert.throws(() => parseSaveFile(JSON.stringify({ ...envelope, version: 2 })), /版本/);
  assert.throws(() => parseSaveFile(JSON.stringify({ ...envelope, game: { ...saved, history: [] } })), /不完整/);
  assert.throws(() => parseSaveFile(JSON.stringify({ ...envelope, game: { ...saved, resolve: 101 } })), /不完整/);
  assert.throws(() => parseSaveFile(JSON.stringify({ ...envelope, game: { ...saved, savedAt: 1e17 } })), /不完整/);
  assert.throws(() => parseSaveFile('汉'.repeat(Math.ceil(MAX_SAVE_FILE_BYTES / 3))), /1 MB/);
  assert.throws(() => encodeSaveFile({ ...saved, title: 'a'.repeat(MAX_SAVE_FILE_BYTES) }), /1 MB/);
});

test('restoration rejects mismatched world, version, history and Ink state without changing the source save', () => {
  const world = compileWorld(authoredWorlds[0]);
  const first = startSession(world);
  const initial = saveSession(first);
  const progressed = choose(first, first.choices[0]);
  const saved = saveSession(progressed);
  const snapshot = JSON.stringify(saved);
  assert.throws(() => restoreSession(world, { ...saved, storyId: '123456789' }), /不属于/);
  assert.throws(() => restoreSession(world, { ...saved, worldVersion: 'future' }), /版本/);
  assert.throws(() => restoreSession(world, { ...saved, nodeId: 'missing' }), /不存在/);
  assert.throws(() => restoreSession(world, { ...saved, inkState: '{' }));
  assert.throws(() => restoreSession(world, { ...saved, inkState: initial.inkState }));
  const badHistory = saved.history.map((entry, index) => index === 0 ? { ...entry, choice: 'invented choice' } : entry);
  assert.throws(() => restoreSession(world, { ...saved, history: badHistory }), /无法还原/);
  const reordered = [...saved.history].reverse();
  assert.throws(() => restoreSession(world, { ...saved, history: reordered }), /路径/);
  assert.equal(JSON.stringify(saved), snapshot);
});

test('imported display text and metadata are reconstructed from the current authored world', () => {
  const world = compileWorld(authoredWorlds[0]);
  const session = startSession(world);
  const saved = saveSession(session);
  const modified = {
    ...saved, title: 'untrusted title', cover: 'https://example.invalid/track',
    paragraphs: ['untrusted text'],
    history: saved.history.map((entry) => ({ ...entry, title: 'untrusted title', text: 'untrusted history' })),
  };
  const restored = restoreSession(world, parseSaveFile(encodeSaveFile(modified)));
  const canonical = saveSession(restored);
  assert.equal(canonical.title, world.title);
  assert.equal(canonical.cover, world.cover);
  assert.deepEqual(canonical.paragraphs, session.paragraphs);
  assert.deepEqual(canonical.history, session.history);
});
