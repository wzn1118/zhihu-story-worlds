import assert from 'node:assert/strict';
import test from 'node:test';
import { authoredWorlds } from '../content/worlds.ts';
import { compileWorld, getWorld } from '../server/worlds.ts';
import type { GameWorld } from '../shared/types.ts';
import { choiceBlockers, type ChoiceState } from '../shared/choice-rules.ts';
import { choose, restoreSession, saveSession, startSession } from '../src/game.ts';

interface ReachableState extends ChoiceState { nodeId: string; path: string[] }
const islandEndingEvidence: Record<string, string[]> = { ending_commons: ['净水维护配额', '稳定净水配额', '公开配给公约'], ending_ark: ['船坞转运配额', '联合航线'], ending_witness: ['双端通信时间线', '未计入的人员档案', '完整证词'] };

function relevantClues(world: GameWorld): Record<string, Set<string>> {
  const live = Object.fromEntries(Object.values(world.nodes).map(node => [node.id, new Set([
    ...node.choices.flatMap(choice => [...(choice.requires?.allClues ?? []), ...(choice.requires?.anyClues ?? []), ...(choice.requires?.noneClues ?? []), ...(choice.requiresClue ? [choice.requiresClue] : [])]),
    ...(world.id === 'future-island' ? islandEndingEvidence[node.id] ?? [] : []),
  ])]));
  // Backward liveness keeps every fact inspected by any reachable gate or ending assertion.
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of Object.values(world.nodes)) for (const choice of node.choices) for (const clue of live[choice.nextNodeId]) {
      if (!live[node.id].has(clue)) { live[node.id].add(clue); changed = true; }
    }
  }
  return live;
}

function validateAllPaths(world: GameWorld) {
  const initial = startSession(world);
  const stack: ReachableState[] = [{ nodeId: initial.node.id, clues: initial.clues, resources: initial.resources, resolve: initial.resolve, trust: initial.trust, path: [] }];
  const visited = new Set<string>(), reached = new Set<string>(), edges = new Set<string>(), endings = new Set<string>();
  const resources = world.resources ?? [], clues = Object.keys(world.clueVariables);
  const choices = Object.values(world.nodes).flatMap(node => node.choices);
  const gatesResolve = choices.some(choice => choice.requires?.resolve !== undefined);
  const gatesTrust = choices.some(choice => choice.requires?.trust !== undefined);
  const liveClues = relevantClues(world);
  const keyClues = Object.fromEntries(Object.keys(world.nodes).map(id => [id, clues.filter(clue => liveClues[id].has(clue))]));
  const oldDefinition = structuredClone(authoredWorlds.find(candidate => candidate.id === world.id)!);
  let hasAliases = false;
  for (const node of Object.values(oldDefinition.nodes)) for (const choice of node.choices) {
    if (choice.legacyTexts?.length) { choice.text = choice.legacyTexts[0]; delete choice.legacyTexts; hasAliases = true; }
  }
  const legacyWorld = hasAliases ? compileWorld(oldDefinition) : null;
  const replay = (path: string[], source = world) => {
    let session = startSession(source);
    for (const id of path) {
      const choice = session.choices.find(choice => choice.id === id);
      assert.ok(choice, `${world.id}: Ink rejected ${id}`);
      session = choose(session, choice);
    }
    return session;
  };
  while (stack.length) {
    const state = stack.pop()!;
    // Display-only stats cannot change future transitions in this declarative graph.
    const key = `${state.nodeId}:${gatesResolve ? state.resolve : ''}:${gatesTrust ? state.trust : ''}:${resources.map(r => state.resources[r.id]).join(',')}:${keyClues[state.nodeId].map(c => +state.clues.includes(c)).join('')}`;
    if (visited.has(key)) continue;
    visited.add(key);
    assert.ok(visited.size < 1000000, `${world.id}: state coverage exceeded its budget`);
    const node = world.nodes[state.nodeId];
    assert.ok(node);
    reached.add(node.id);
    for (const r of resources) assert.ok(state.resources[r.id] >= r.min && state.resources[r.id] <= r.max);
    const available = node.choices.filter(choice => !choiceBlockers(choice, state, resources).length);
    if (!node.ending) assert.ok(available.length, `${world.id}: softlock at ${node.id}`);
    // Enumerate routing-equivalent states, replaying actual Ink for every edge and ending.
    if (available.some(c => !edges.has(`${node.id}:${c.id}`)) || (node.ending && !endings.has(node.id))) {
      const actual = replay(state.path);
      assert.equal(actual.node.id, node.id);
      assert.deepEqual(actual.choices.map(c => c.id), available.map(c => c.id));
      assert.deepEqual(actual.resources, state.resources);
      assert.deepEqual([...actual.clues].sort(), [...state.clues].sort());
      assert.equal(actual.resolve, state.resolve);
      assert.equal(actual.trust, state.trust);
      for (const c of available) {
        const branch = replay([...state.path, c.id]);
        assert.equal(branch.node.id, c.nextNodeId);
        assert.ok(branch.paragraphs.join('').length);
        for (const r of resources) assert.equal(branch.resources[r.id], Math.min(r.max, Math.max(r.min, state.resources[r.id] + (c.effects?.resources?.[r.id] ?? 0))));
        for (const clue of c.effects?.clues ?? []) assert.ok(branch.clues.includes(clue));
        if (legacyWorld && c.legacyTexts?.length && !edges.has(`${node.id}:${c.id}`)) {
          for (const path of [state.path, [...state.path, c.id]]) {
            const old = saveSession(replay(path, legacyWorld));
            old.history = old.history.map(({ choiceId: _id, ...entry }) => entry);
            const restored = restoreSession(world, old);
            const expected = replay(path);
            assert.deepEqual(restored.history, expected.history, `${world.id}:${c.id} legacy history`);
            assert.deepEqual(restored.resources, expected.resources);
            assert.deepEqual(restored.clues, expected.clues);
          }
        }
        edges.add(`${node.id}:${c.id}`);
      }
    }
    if (node.ending) {
      endings.add(node.id);
      assert.equal(available.length, 0);
      if (world.id === 'future-island') {
        for (const clue of islandEndingEvidence[node.id] ?? []) assert.ok(state.clues.includes(clue), `${node.id} lacks ${clue}`);
      }
      continue;
    }
    for (const c of available) stack.push({ nodeId: c.nextNodeId, path: [...state.path, c.id], clues: [...new Set([...state.clues, ...(c.effects?.clues ?? [])])], resources: Object.fromEntries(resources.map(r => [r.id, Math.min(r.max, Math.max(r.min, state.resources[r.id] + (c.effects?.resources?.[r.id] ?? 0)))])), resolve: Math.min(100, Math.max(0, state.resolve + (c.effects?.resolve ?? 0))), trust: Math.min(100, Math.max(0, state.trust + (c.effects?.trust ?? 0))) });
  }
  assert.deepEqual([...reached].sort(), Object.keys(world.nodes).sort());
  assert.deepEqual(Object.values(world.nodes).flatMap(n => n.choices.map(c => `${n.id}:${c.id}`)).filter(key => !edges.has(key)), [], `${world.id}: unreachable choices`);
  assert.equal(endings.size, Object.values(world.nodes).filter(n => n.ending).length);
  return { routingEquivalentStates: visited.size, mergedDisplayStats: [!gatesResolve && 'resolve', !gatesTrust && 'trust'].filter(Boolean), nodes: reached.size, inkChoicesReplayed: edges.size, endings: endings.size };
}

for (const world of authoredWorlds) test(`${world.id}: all routing-equivalent states have exits; all scenes, choices and endings replay through Ink`, context => {
  assert.ok(Object.keys(world.nodes).length >= 30);
  assert.equal(world.adaptation.adultCast, true);
  assert.equal(world.adaptation.scope, 'based-on-api-excerpt');
  assert.equal(new URL(world.source.url).host, 'api.zhihu.com');
  assert.ok((world.resources?.length ?? 0) >= 2, `${world.id}: at least two story resources are required`);
  context.diagnostic(JSON.stringify(validateAllPaths(compileWorld(world))));
});
test('unprepared worlds and unsafe identifiers fail honestly', () => {
  assert.throws(() => getWorld('999888777666'), { code: 'WORLD_NOT_PREPARED', status: 409 });
  assert.throws(() => getWorld('../list'), { code: 'INVALID_STORY_ID', status: 400 });
});
