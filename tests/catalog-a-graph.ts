import assert from 'node:assert/strict';
import { choiceBlockers, type ChoiceState } from '../shared/choice-rules.ts';
import type { GameWorld } from '../shared/types.ts';
import { choose, startSession } from '../src/game.ts';

export interface CatalogAState extends ChoiceState { nodeId: string; path: string[] }
export function replayA(world: GameWorld, path: string[]) {
  let session = startSession(world);
  for (const id of path) {
    const choice = session.choices.find(choice => choice.id === id);
    assert.ok(choice, `${world.id}/${session.node.id}: Ink rejected ${id}`);
    session = choose(session, choice);
  }
  return session;
}

// Identical graph semantics to the shared validator, independently scoped to A.
// Keep only future-gated facts in the visited key, not irrelevant journal text.
export function enumerateA(world: GameWorld) {
  const nodes = Object.values(world.nodes), resources = world.resources ?? [];
  const live = Object.fromEntries(nodes.map(node => [node.id, new Set(node.choices.flatMap(choice => [
    ...(choice.requires?.allClues ?? []), ...(choice.requires?.anyClues ?? []), ...(choice.requires?.noneClues ?? []), ...(choice.requiresClue ? [choice.requiresClue] : []),
  ]))]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes) for (const choice of node.choices) for (const clue of live[choice.nextNodeId]) {
      if (!live[node.id].has(clue)) { live[node.id].add(clue); changed = true; }
    }
  }
  const all = nodes.flatMap(node => node.choices);
  const gateResolve = all.some(choice => choice.requires?.resolve), gateTrust = all.some(choice => choice.requires?.trust);
  const initial = startSession(world);
  const pending: CatalogAState[] = [{ nodeId: initial.node.id, resources: initial.resources, clues: initial.clues, resolve: initial.resolve, trust: initial.trust, path: [] }];
  const visited = new Set<string>(), states: CatalogAState[] = [];
  const nodePaths = new Map<string, string[]>(), edgePaths = new Map<string, string[]>();
  for (let cursor = 0; cursor < pending.length; cursor++) {
    const state = pending[cursor];
    const key = JSON.stringify([state.nodeId, resources.map(r => state.resources[r.id]), [...live[state.nodeId]].filter(c => state.clues.includes(c)), gateResolve && state.resolve, gateTrust && state.trust]);
    if (visited.has(key)) continue;
    visited.add(key); states.push(state);
    assert.ok(visited.size < 500_000, `${world.id}: enumeration bound exceeded`);
    if (!nodePaths.has(state.nodeId)) nodePaths.set(state.nodeId, state.path);
    const node = world.nodes[state.nodeId];
    for (const r of resources) assert.ok(state.resources[r.id] >= r.min && state.resources[r.id] <= r.max);
    const available = node.choices.filter(choice => !choiceBlockers(choice, state, resources).length);
    if (node.ending) { assert.equal(available.length, 0); continue; }
    assert.ok(available.length >= 2, `${world.id}/${node.id}: forced/no exit after ${state.path.join(' > ')}`);
    for (const choice of available) {
      const path = [...state.path, choice.id], edge = `${node.id}:${choice.id}`;
      if (!edgePaths.has(edge)) edgePaths.set(edge, path);
      pending.push({ nodeId: choice.nextNodeId, path,
        resources: Object.fromEntries(resources.map(r => [r.id, Math.min(r.max, Math.max(r.min, state.resources[r.id] + (choice.effects?.resources?.[r.id] ?? 0)))])),
        clues: [...new Set([...state.clues, ...(choice.effects?.clues ?? [])])],
        resolve: Math.min(100, Math.max(0, state.resolve + (choice.effects?.resolve ?? 0))),
        trust: Math.min(100, Math.max(0, state.trust + (choice.effects?.trust ?? 0))),
      });
    }
  }
  assert.equal(nodePaths.size, nodes.length, `${world.id}: unreachable nodes`);
  assert.equal(edgePaths.size, all.length, `${world.id}: unreachable choices`);
  return { states, nodePaths, edgePaths };
}
