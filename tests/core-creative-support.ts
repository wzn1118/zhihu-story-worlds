import assert from 'node:assert/strict';
import type { GameWorld } from '../shared/types.ts';
import { choiceBlockers, type ChoiceState } from '../shared/choice-rules.ts';
import { choose, startSession } from '../src/game.ts';

export const coreIds = ['blue-blood', 'double-pursuit', 'velvet-alibi', 'future-island'];
export const routeClues: Record<string, string[]> = {
  'blue-blood': ['选择归途', '选择断路', '选择换位'],
  'double-pursuit': ['追踪·屋顶路线', '追踪·守层路线', '追踪·诱声路线'],
  'velvet-alibi': ['曼笙·公开退场', '曼笙·独自离开', '曼笙·工厂守夜'],
  'future-island': ['岛屿·保住高地', '岛屿·弃岛出航', '岛屿·独占终局'],
};
export function replay(world: GameWorld, path: string[]) {
  let session = startSession(world);
  for (const id of path) {
    const choice = session.choices.find(c => c.id === id);
    assert.ok(choice, `${world.id}/${session.node.id}: Ink did not offer ${id}`);
    session = choose(session, choice);
  }
  return session;
}
interface State extends ChoiceState { nodeId: string; path: string[] }

// Retain future-read facts, exact resources and exclusive-route markers. Display
// counters are merged only when no authored gate inspects them.
export function explore(world: GameWorld, check?: (state: State) => void, endingFacts: Record<string, string[]> = {}) {
  const resources = world.resources ?? [];
  const allChoices = Object.values(world.nodes).flatMap(n => n.choices);
  const readsResolve = allChoices.some(c => c.requires?.resolve);
  const readsTrust = allChoices.some(c => c.requires?.trust);
  const live = Object.fromEntries(Object.values(world.nodes).map(n => [n.id, new Set([
    ...(routeClues[world.id] ?? []),
    ...(endingFacts[n.id] ?? []),
    ...n.choices.flatMap(c => [...(c.requires?.allClues ?? []), ...(c.requires?.anyClues ?? []), ...(c.requires?.noneClues ?? []), ...(c.requiresClue ? [c.requiresClue] : [])]),
  ])]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of Object.values(world.nodes)) for (const c of n.choices) for (const clue of live[c.nextNodeId]) {
      if (!live[n.id].has(clue)) { live[n.id].add(clue); changed = true; }
    }
  }
  const initial = startSession(world);
  const queue: State[] = [{ nodeId: initial.node.id, path: [], clues: initial.clues, resources: initial.resources, resolve: initial.resolve, trust: initial.trust }];
  const seen = new Set<string>();
  const nodes = new Map<string, string[]>(), edges = new Map<string, string[]>();
  const blocked = new Set<string>();
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const state = queue[cursor];
    const key = JSON.stringify([state.nodeId, resources.map(r => state.resources[r.id]), state.clues.filter(c => live[state.nodeId].has(c)).sort(), readsResolve ? state.resolve : null, readsTrust ? state.trust : null]);
    if (seen.has(key)) continue;
    seen.add(key);
    assert.ok(seen.size < 300_000, `${world.id}: exploration budget`);
    check?.(state);
    const node = world.nodes[state.nodeId];
    if (!nodes.has(node.id)) nodes.set(node.id, state.path);
    const available = node.choices.filter(c => {
      if (!choiceBlockers(c, state, resources).length) return true;
      blocked.add(`${node.id}/${c.id}`);
      return false;
    });
    assert.ok(node.ending || available.length, `${world.id}: depleted softlock ${node.id}`);
    for (const c of available) {
      const path = [...state.path, c.id];
      if (!edges.has(`${node.id}/${c.id}`)) edges.set(`${node.id}/${c.id}`, path);
      queue.push({ nodeId: c.nextNodeId, path, clues: [...new Set([...state.clues, ...(c.effects?.clues ?? [])])],
        resources: Object.fromEntries(resources.map(r => [r.id, Math.min(r.max, Math.max(r.min, state.resources[r.id] + (c.effects?.resources?.[r.id] ?? 0)))])),
        resolve: Math.max(0, Math.min(100, state.resolve + (c.effects?.resolve ?? 0))), trust: Math.max(0, Math.min(100, state.trust + (c.effects?.trust ?? 0))),
      });
    }
  }
  return { nodes, edges, blocked, states: seen.size };
}
