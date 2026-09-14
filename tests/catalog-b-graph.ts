import assert from 'node:assert/strict';
import type { AuthoredWorld } from '../content/worlds.ts';
import { choiceBlockers, type ChoiceState } from '../shared/choice-rules.ts';

export interface BState extends ChoiceState { nodeId: string; path: string[] }
export function auditBGraph(world: AuthoredWorld) {
  const nodes = Object.values(world.nodes), resources = world.resources ?? [];
  const live = Object.fromEntries(nodes.map(n => [n.id, new Set(n.choices.flatMap(c => [
    ...(c.requires?.allClues ?? []), ...(c.requires?.anyClues ?? []), ...(c.requires?.noneClues ?? []), ...(c.requiresClue ? [c.requiresClue] : []),
  ]))]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of nodes) for (const c of n.choices) {
      assert.ok(world.nodes[c.nextNodeId], `${world.id}/${n.id}: absent ${c.nextNodeId}`);
      for (const clue of live[c.nextNodeId]) if (!live[n.id].has(clue)) { live[n.id].add(clue); changed = true; }
    }
  }
  const choices = nodes.flatMap(n => n.choices);
  const resolveMatters = choices.some(c => c.requires?.resolve);
  const trustMatters = choices.some(c => c.requires?.trust);
  const stack: BState[] = [{ nodeId: world.startNodeId, path: [], clues: [], resolve: 50, trust: 30, resources: Object.fromEntries(resources.map(r => [r.id, r.initial])) }];
  const visited = new Set<string>();
  const atNode = new Map<string, BState>(), atEdge = new Map<string, BState>();
  const blocked = new Set<string>();
  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
  while (stack.length) {
    const state = stack.pop()!;
    const key = JSON.stringify([state.nodeId, resources.map(r => state.resources[r.id]), state.clues.filter(c => live[state.nodeId].has(c)).sort(), resolveMatters ? state.resolve : 0, trustMatters ? state.trust : 0]);
    if (visited.has(key)) continue;
    visited.add(key);
    assert.ok(visited.size < 300000, `${world.id}: excessive state space`);
    const node = world.nodes[state.nodeId];
    if (!atNode.has(node.id)) atNode.set(node.id, state);
    const available = node.choices.filter(c => !choiceBlockers(c, state, resources).length);
    if (!node.ending) assert.ok(available.length, `${world.id}: softlock ${node.id} at ${JSON.stringify(state.resources)}`);
    for (const c of node.choices) if (!available.includes(c)) blocked.add(`${node.id}/${c.id}`);
    for (const c of available) {
      if (!atEdge.has(`${node.id}/${c.id}`)) atEdge.set(`${node.id}/${c.id}`, state);
      stack.push({
        nodeId: c.nextNodeId, path: [...state.path, c.id],
        clues: [...new Set([...state.clues, ...(c.effects?.clues ?? [])])],
        resolve: clamp(state.resolve + (c.effects?.resolve ?? 0), 0, 100), trust: clamp(state.trust + (c.effects?.trust ?? 0), 0, 100),
        resources: Object.fromEntries(resources.map(r => [r.id, clamp(state.resources[r.id] + (c.effects?.resources?.[r.id] ?? 0), r.min, r.max)])),
      });
    }
  }
  return { atNode, atEdge, blocked, states: visited.size };
}
