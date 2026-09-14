import assert from 'node:assert/strict';
import test from 'node:test';
import { catalogWorldsA } from '../content/catalog-a.ts';
import { compileWorld } from '../server/worlds.ts';
import { restoreSession, saveSession } from '../src/game.ts';
import { enumerateA, replayA } from './catalog-a-graph.ts';

test('score-room: the live 1.1.0 ending-copy correction preserves same-revision saves', () => {
  const authored = catalogWorldsA.find(world => world.id === 'score-room')!;
  const prior = structuredClone(authored);
  // Exact first paragraph served before the bounded copy edit. No route changed.
  prior.nodes.ending_broken_study.text[0] = '原图经双方核对后，老师撤掉了你组织答疑的资格，考分仍按卷面保留。那场选拔没有替谁背锅，失去的是你亲手争来的合作机会。';
  const oldWorld = compileWorld(prior), current = compileWorld(authored);
  assert.equal(oldWorld.version, current.version);
  const path = enumerateA(oldWorld).nodePaths.get('ending_broken_study')!;
  for (let count = 0; count <= path.length; count++) {
    const old = replayA(oldWorld, path.slice(0, count));
    const restored = restoreSession(current, saveSession(old));
    assert.equal(restored.node.id, old.node.id);
    assert.deepEqual(restored.resources, old.resources);
    assert.deepEqual(restored.clues, old.clues);
    assert.equal(restored.resolve, old.resolve);
    assert.equal(restored.trust, old.trust);
    assert.deepEqual(restored.history.map(entry => entry.choiceId), old.history.map(entry => entry.choiceId));
    if (count === path.length) assert.match(restored.paragraphs.join(''), /答疑值班表上划掉/);
  }
});
