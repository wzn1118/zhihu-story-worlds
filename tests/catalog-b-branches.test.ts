import assert from 'node:assert/strict';
import test from 'node:test';
import { catalogWorldsB } from '../content/catalog-b.ts';
import { catalogBExpansions } from '../content/catalog-b-expansions.ts';
import { compileWorld } from '../server/worlds.ts';
import { choiceBlockers } from '../shared/choice-rules.ts';
import { choose, restoreSession, saveSession, startSession } from '../src/game.ts';
import { auditBGraph } from './catalog-b-graph.ts';
import { recordedStoryExcerpt } from './recorded-story-excerpt.ts';

for (const authored of catalogWorldsB) {
  test(`${authored.id}: B routes have 30+ dialogue scenes, exclusive sequences and reachable endings`, () => {
    const world = compileWorld(authored), nodes = Object.values(world.nodes);
    assert.ok(nodes.filter(n => !n.ending).length >= 30);
    assert.ok(nodes.filter(n => n.ending).length >= 5);
    const routes = catalogBExpansions[world.id].routes;
    const audit = auditBGraph(authored);
    assert.equal(audit.atNode.size, nodes.length, `Unreachable: ${nodes.filter(n => !audit.atNode.has(n.id)).map(n => n.id)}`);
    const missedEdges = nodes.flatMap(n => n.choices.filter(c => !audit.atEdge.has(`${n.id}/${c.id}`)).map(c => `${n.id}/${c.id}`));
    assert.deepEqual(missedEdges, [], 'Every offered transition must have a realizable witness');
    const sets = routes.map(r => new Set(r.nodes.map(n => n.id)));
    assert.ok([...sets[0]].every(id => !sets[1].has(id)));
    const replay = (path: string[]) => {
      let s = startSession(world);
      for (const id of path) {
        const c = s.choices.find(c => c.id === id);
        assert.ok(c, `${world.id}/${s.node.id} missing ${id}`);
        s = choose(s, c);
      }
      return s;
    };
    for (let index = 0; index < routes.length; index++) {
      const route = routes[index], own = sets[index];
      assert.ok(route.nodes.filter(n => !n.ending).length >= 10);
      assert.ok(route.nodes.filter(n => n.ending).length >= 3);
      assert.ok(route.nodes.some(n => n.ending?.tone === 'dark'));
      for (const n of route.nodes) {
        assert.ok(n.choices.every(c => own.has(c.nextNodeId)), `${n.id} escapes its exclusive route`);
        if (n.ending) {
          const s = replay(audit.atNode.get(n.id)!.path);
          assert.equal(s.node.id, n.id);
          assert.equal(s.choices.length, 0);
          assert.ok(s.history.slice(1).every(h => own.has(h.nodeId)));
          const restored = restoreSession(world, saveSession(s));
          assert.deepEqual(restored.resources, s.resources);
          assert.deepEqual(restored.history, s.history);
        } else {
          const s = replay(audit.atNode.get(n.id)!.path);
          const restored = restoreSession(world, saveSession(s));
          assert.deepEqual(restored.choices, s.choices);
          const depleted = { clues: [], resolve: 0, trust: 0, resources: Object.fromEntries(world.resources!.map(r => [r.id, r.min])) };
          const available = n.choices.filter(c => !choiceBlockers(c, depleted, world.resources).length);
          assert.ok(available.some(c => c.id === 'b_withdraw'), `${n.id}: no legal depletion exit`);
          assert.equal(world.nodes[available.find(c => c.id === 'b_withdraw')!.nextNodeId].ending?.tone, 'uneasy');
        }
      }
      const gated = route.nodes.flatMap(n => n.choices.map(c => ({ n, c }))).filter(({ c }) => c.requires?.allClues?.length || c.requires?.anyClues?.length);
      assert.ok(gated.length >= 2, `${route.id}: insufficient clue-dependent events`);
      assert.ok(route.nodes.some(n => n.choices.some(c => (c.effects?.resources?.b_time ?? 0) < 0)));
      assert.ok(route.nodes.every(n => n.choices.every(c => (c.effects?.resources?.b_time ?? 0) <= 0)), 'No reusable deadline refills');
      for (const r of world.resources!.filter(r => r.id !== 'b_time')) {
        assert.ok(route.nodes.some(n => n.choices.some(c => (c.effects?.resources?.[r.id] ?? 0) < 0)), `${route.id}: unused ${r.id}`);
      }
      // Each route must have both a genuinely short concession and a sustained
      // route, not just renamed copies of one node sequence.
      const longest = Math.max(...route.nodes.filter(n => n.ending).map(n => audit.atNode.get(n.id)!.path.length));
      assert.ok(longest >= 8, `${route.id}: no sustained route`);
    }
    // Every new edge is exercised against the actual Ink engine, not just TS.
    for (const [edge, state] of audit.atEdge) {
      if (!edge.startsWith('b_') && !edge.includes('/b_enter_')) continue;
      const c = world.nodes[state.nodeId].choices.find(c => `${state.nodeId}/${c.id}` === edge)!;
      const before = replay(state.path), after = choose(before, before.choices.find(x => x.id === c.id)!);
      assert.equal(after.node.id, c.nextNodeId);
      for (const r of world.resources!) assert.equal(after.resources[r.id], Math.min(r.max, Math.max(r.min, state.resources[r.id] + (c.effects?.resources?.[r.id] ?? 0))));
    }
  });

  test(`${authored.id}: real source attribution and uniquely findable excerpt anchors survive`, () => {
    const file = recordedStoryExcerpt(authored.storyId);
    assert.equal(authored.source.author, file.data.author_name);
    assert.equal(authored.source.title, file.data.chapter_name);
    assert.ok(authored.source.url.endsWith(authored.storyId));
    for (const p of authored.sourcePassages!) {
      assert.equal(file.data.content.split(p.quote).length, 2, `${p.id}: not one exact source occurrence`);
      assert.match(p.note, /原文|原创|游戏|改编/);
    }
    assert.ok(Object.values(authored.nodes).filter(n => n.ending).every(n => n.chapter.includes('原创')));
  });
}
