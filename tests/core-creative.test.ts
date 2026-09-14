import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import { recordedStoryExcerpt } from './recorded-story-excerpt.ts';
import { authoredWorlds, type AuthoredWorld } from '../content/worlds.ts';
import { compileWorld } from '../server/worlds.ts';
import { restoreSession, rewindSession, saveSession } from '../src/game.ts';
import { choiceBlockers } from '../shared/choice-rules.ts';
import { coreIds, explore, replay, routeClues } from './core-creative-support.ts';

const before: AuthoredWorld[] = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/core-pre-creative.json.gz', import.meta.url))).toString());
const prefixes = ['b_', 'p_', 'v_', 'f_'];

for (const id of coreIds) {
  const authored = authoredWorlds.find(w => w.id === id)!;
  const original = before.find(w => w.id === id)!;
  const world = compileWorld(authored);
  const prefix = prefixes[coreIds.indexOf(id)];

  test(`${id}: complete core treatment, exact provenance and unique final art targets`, () => {
    assert.ok(Object.values(world.nodes).filter(n => !n.ending).length >= 30);
    assert.ok(Object.values(world.nodes).filter(n => n.ending).length >= 6);
    const bad = Object.values(world.nodes).filter(n => n.ending?.tone === 'dark' && n.title.startsWith('Bad End'));
    assert.equal(bad.length, 3);
    const fresh = Object.values(world.nodes).filter(n => !original.nodes[n.id]);
    assert.equal(new Set(fresh.map(n => n.background)).size, fresh.length);
    for (const n of fresh) {
      assert.equal(n.background, `/assets/scenes/${id}/${n.id}.webp`);
      assert.ok(n.text.join('').length > 100, `${n.id}: substantive scene`);
      assert.ok(n.ending ? n.choices.length === 0 : n.choices.length >= 2);
      assert.ok(world.sourcePassages?.some(p => p.nodeIds.includes(n.id) && /原创/.test(p.note)));
    }
    const cache = recordedStoryExcerpt(world.storyId);
    assert.equal(cache.data.content.length, 3000);
    assert.equal(world.source.url, original.source.url);
    for (const passage of world.sourcePassages ?? []) {
      assert.equal(cache.data.content.split(passage.quote).length - 1, 1, passage.id);
      assert.equal(passage.quote, original.sourcePassages!.find(p => p.id === passage.id)!.quote);
      for (const nodeId of passage.nodeIds) assert.ok(world.nodes[nodeId]);
    }
  });

  test(`${id}: all new Ink choices and endings, exclusive routes, save and rewind`, context => {
    const earnedEndings: Record<string, string[]> = {
      ending_red_home: ['选择归途', '过线锚已固定'],
      ending_blind_city: ['选择断路', '中继隔离'],
      ending_roof_alive: ['追踪·屋顶路线', '屋顶位置确认'],
      ending_floor_alive: ['追踪·守层路线', '老人双锁确认', '卷帘撑住'],
      ending_trap_exposed: ['追踪·诱声路线', '假报平安已识破'],
      ending_factory_dawn: ['曼笙·工厂守夜', '夜班底数已清', '独立买家应答'],
      ending_own_name: ['曼笙·公开退场', '当众撤席'],
      ending_highwater: ['岛屿·保住高地', '下仓已舍弃'],
      ending_last_ship: ['岛屿·弃岛出航', '撤离包已固牢', '末航已离岸'],
      ending_white_room: ['岛屿·独占终局'],
    };
    const graph = explore(world, state => {
      assert.ok(state.clues.filter(c => routeClues[id].includes(c)).length <= 1, `${state.nodeId}: routes merged`);
      for (const clue of earnedEndings[state.nodeId] ?? []) assert.ok(state.clues.includes(clue), `${state.nodeId}: unearned ${clue}`);
      if (state.nodeId === 'ending_silence') assert.ok(!state.clues.includes('邻居安全确认') && !state.clues.includes('老人双锁确认'));
    }, earnedEndings);
    const fresh = Object.values(world.nodes).filter(n => !original.nodes[n.id]);
    for (const node of fresh) {
      const path = graph.nodes.get(node.id);
      assert.ok(path, `unreachable ${node.id}`);
      let session = replay(world, path);
      assert.equal(session.node.id, node.id);
      const loaded = restoreSession(world, saveSession(session));
      assert.deepEqual(loaded.resources, session.resources);
      assert.deepEqual(loaded.clues, session.clues);
      for (const choice of node.choices) {
        const witness = graph.edges.get(`${node.id}/${choice.id}`);
        assert.ok(witness, `unreachable choice ${node.id}/${choice.id}`);
        const before = replay(world, witness.slice(0, -1));
        session = replay(world, witness);
        assert.equal(session.node.id, choice.nextNodeId);
        for (const resource of world.resources ?? []) assert.equal(session.resources[resource.id], Math.min(resource.max, Math.max(resource.min, before.resources[resource.id] + (choice.effects?.resources?.[resource.id] ?? 0))), `${node.id}/${choice.id}/${resource.id}`);
        for (const clue of choice.effects?.clues ?? []) assert.ok(session.clues.includes(clue));
      }
      if (node.ending) {
        const ended = replay(world, path);
        assert.equal(ended.choices.length, 0);
        const rewound = rewindSession(ended, ended.history.length - 2);
        assert.equal(rewound.node.ending, undefined);
        assert.equal(rewound.choiceCount, ended.choiceCount - 1);
      }
    }
    assert.ok(graph.blocked.size > 5, 'Resources and prerequisites actually close choices');
    context.diagnostic(JSON.stringify({ states: graph.states, newNodes: fresh.length, newEndings: fresh.filter(n => n.ending).length, realInkEdges: graph.edges.size }));
  });

  test(`${id}: rewind before the exclusive commitment removes its route and permits the other two`, () => {
    const fork = `${prefix}${id === 'double-pursuit' ? 'split' : 'fork'}`;
    const graph = explore(world);
    const finish = Object.values(world.nodes).find(n => n.ending && graph.nodes.get(n.id)?.some(choiceId => world.nodes[fork].choices.some(c => c.id === choiceId)))!;
    const ended = replay(world, graph.nodes.get(finish.id)!);
    const index = ended.history.findIndex(entry => entry.nodeId === fork);
    assert.ok(index >= 0);
    const rewound = rewindSession(ended, index);
    assert.equal(rewound.node.id, fork);
    assert.equal(rewound.choices.length, 3);
    assert.equal(rewound.clues.filter(c => routeClues[id].includes(c)).length, 0);
    for (const choice of rewound.choices) {
      const branch = replay(world, [...graph.nodes.get(fork)!, choice.id]);
      assert.equal(branch.clues.filter(c => routeClues[id].includes(c)).length, 1);
      assert.equal(branch.node.id, choice.nextNodeId);
    }
  });

  test(`${id}: pre-edit Ink saves migrate at every old edge without a contract change`, context => {
    assert.ok(world.compatibleSaveVersions?.includes(original.version));
    for (const node of Object.values(original.nodes)) {
      assert.ok(world.nodes[node.id]);
      for (const choice of node.choices) {
        const now = world.nodes[node.id].choices.find(c => c.id === choice.id)!;
        assert.ok(now);
        assert.equal(now.nextNodeId, choice.nextNodeId);
        assert.deepEqual(JSON.parse(JSON.stringify(now.effects ?? null)), choice.effects ?? null);
        assert.deepEqual(now.requires, choice.requires);
        assert.equal(now.requiresClue, choice.requiresClue);
        assert.equal(now.repeatable, choice.repeatable);
        assert.ok(now.text === choice.text || now.legacyTexts?.includes(choice.text), `${id}/${node.id}/${choice.id}: missing exact legacy text`);
      }
    }
    const old = compileWorld(original);
    const graph = explore(old);
    for (const path of [[], ...graph.edges.values()]) {
      const session = replay(old, path);
      session.paragraphIndex = Math.min(1, session.paragraphs.length - 1);
      const saved = saveSession(session);
      const oldText = JSON.stringify(saved);
      // Include genuine historical text-only saves, not just modern ID histories.
      for (const history of [saved.history, saved.history.map(({ choiceId: _id, ...entry }) => entry)]) {
        const migrated = restoreSession(world, { ...saved, history });
        assert.equal(migrated.node.id, session.node.id);
        assert.equal(migrated.paragraphIndex, session.paragraphIndex);
        assert.equal(migrated.startedAt, session.startedAt);
        assert.deepEqual(migrated.clues, session.clues);
        assert.deepEqual(migrated.resources, session.resources);
        assert.deepEqual(migrated.history, replay(world, path).history);
        assert.equal(saveSession(migrated).worldVersion, world.version);
      }
      assert.equal(JSON.stringify(saved), oldText);
    }
    context.diagnostic(`${graph.edges.size + 1} real pre-edit save points, each with ID and text-only history`);
  });

  test(`${id}: every new decision retains a zero-resource exit with earned facts intact`, () => {
    const graph = explore(world);
    for (const node of Object.values(world.nodes).filter(n => n.id.startsWith(prefix) && !n.ending)) {
      const reached = replay(world, graph.nodes.get(node.id)!);
      const depleted = { clues: reached.clues, resources: Object.fromEntries(world.resources!.map(r => [r.id, r.min])), resolve: reached.resolve, trust: reached.trust };
      const available = node.choices.filter(c => choiceBlockers(c, depleted, world.resources).length === 0);
      assert.ok(available.length, node.id);
      // Start real Ink at this scene with the earned facts and zero counters.
      // This is a fixture compilation, never a forged production save.
      const probe = compileWorld({ ...authored, startNodeId: 'depletion_probe', resources: authored.resources!.map(r => ({ ...r, initial: r.min })), nodes: {
        ...authored.nodes, depletion_probe: { id: 'depletion_probe', chapter: 'test', title: 'test', location: 'test', time: 'test', background: '', text: ['depletion'], choices: [{ id: 'enter_probe', text: 'enter', nextNodeId: node.id, effects: { clues: reached.clues } }] },
      } });
      const actual = replay(probe, ['enter_probe']);
      assert.deepEqual(actual.choices.map(c => c.id), available.map(c => c.id), node.id);
      const exits = explore({ ...probe, startNodeId: 'depletion_probe' });
      assert.ok([...exits.nodes.keys()].some(id => probe.nodes[id].ending), `${node.id}: no resolved depletion path`);
    }
  });
}
