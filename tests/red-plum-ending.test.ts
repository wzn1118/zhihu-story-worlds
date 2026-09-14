import assert from 'node:assert/strict';
import test from 'node:test';
import { getWorld } from '../server/worlds.ts';
import { restoreSession, saveSession } from '../src/game.ts';
import { auditBGraph } from './catalog-b-graph.ts';
import { editorialBefore, facts, play } from './catalog-b-editorial-support.ts';

const world = getWorld('1930445234262750503');
const endingId = 'b_village_small';

test('red-plum retreat ending names the threat, shelter, food limit and mother\'s decision', () => {
  const node = world.nodes[endingId], prose = node.text.join('\n');
  assert.equal(node.title, '闹闹留在家里');
  assert.equal(node.ending!.title, node.title);
  assert.equal(node.ending!.text, node.text.at(-1));
  assert.equal(node.ending!.tone, 'uneasy');
  assert.equal(node.text.length, 2);
  assert.match(prose, /门被丧尸撞坏/);
  assert.match(prose, /胡医生.*把住户接出来.*安置.*棚屋/);
  assert.match(prose, /菜棚收的菜只够母女和附近这几户人吃/);
  assert.match(prose, /轮流守院门/);
  assert.match(prose, /不借了。她今晚在家/);
  assert.doesNotMatch(prose, /能做的事缩回|一小片地方|许下.*安稳|轮流亮着|你救出了老王|南门失守/);
});

test('every incoming retreat choice preserves state and restores existing ending saves', context => {
  const old = editorialBefore.find(candidate => candidate.id === world.id)!;
  const audit = auditBGraph(world);
  const incoming = Object.values(world.nodes).flatMap(node => node.choices
    .filter(choice => choice.nextNodeId === endingId).map(choice => ({ node, choice })));
  assert.ok(incoming.some(({ node }) => node.id === 'b_night_knock'));
  assert.ok(incoming.some(({ node }) => node.id === 'b_village_table'));
  for (const { node, choice } of incoming) {
    const witness = audit.atEdge.get(`${node.id}/${choice.id}`);
    assert.ok(witness, `${node.id}/${choice.id}: reachable retreat`);
    const path = [...witness.path, choice.id];
    const previous = play(old, path), current = play(world, path);
    assert.equal(current.node.id, endingId);
    assert.deepEqual(facts(current), facts(previous));
    for (const textOnly of [false, true]) {
      const saved = saveSession(previous);
      if (textOnly) for (const entry of saved.history) delete entry.choiceId;
      const restored = restoreSession(world, saved);
      assert.deepEqual(facts(restored), facts(current));
      assert.deepEqual(restored.paragraphs, current.paragraphs);
      assert.equal(restored.node.ending!.title, '闹闹留在家里');
    }
  }
  context.diagnostic(`${incoming.length} incoming edges; early retreat, late retreat, IDs and text-only saves`);
});
