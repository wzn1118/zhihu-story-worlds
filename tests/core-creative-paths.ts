import assert from 'node:assert/strict';
import type { GameWorld } from '../shared/types.ts';
import { choiceBlockers, type ChoiceState } from '../shared/choice-rules.ts';
import { choose, startSession } from '../src/game.ts';

export const coreIds = ['blue-blood', 'double-pursuit', 'velvet-alibi', 'future-island'];
export const routeFlags: Record<string, string[]> = {
  'blue-blood': ['选择归途', '选择断路', '选择换位'],
  'double-pursuit': ['追踪·屋顶路线', '追踪·守层路线', '追踪·诱声路线'],
  'velvet-alibi': ['曼笙·公开退场', '曼笙·独自离开', '曼笙·工厂守夜'],
  'future-island': ['岛屿·保住高地', '岛屿·弃岛出航', '岛屿·独占终局'],
};
export function play(world: GameWorld, path: string[]) {
  let session = startSession(world);
  for (const id of path) {
    const choice = session.choices.find(c => c.id === id);
    assert.ok(choice, `${world.id}/${session.node.id}: Ink blocked ${id}`);
    session = choose(session, choice);
  }
  return session;
}

/** Exhaust routing-equivalent rule states; callers replay every recorded edge in Ink. */
export function scan(world: GameWorld, check?: (nodeId: string, state: ChoiceState) => void) {
  const live = Object.fromEntries(Object.values(world.nodes).map(n => [n.id, new Set([
    ...(routeFlags[world.id] ?? []),
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
  const stack = [{ nodeId: initial.node.id, resources: initial.resources, clues: initial.clues, resolve: initial.resolve, trust: initial.trust, path: [] as string[] }];
  const seen = new Set<string>(), edgePaths = new Map<string, string[]>(), nodePaths = new Map<string, string[]>();
  const statGates = Object.values(world.nodes).flatMap(n => n.choices).some(c => c.requires?.resolve || c.requires?.trust);
  while (stack.length) {
    const s = stack.pop()!;
    const key = JSON.stringify([s.nodeId, s.resources, s.clues.filter(c => live[s.nodeId].has(c)).sort(), ...(statGates ? [s.resolve, s.trust] : [])]);
    if (seen.has(key)) continue;
    seen.add(key);
    assert.ok(seen.size < 1000000, 'State budget exceeded');
    nodePaths.set(s.nodeId, nodePaths.get(s.nodeId) ?? s.path);
    assert.ok((routeFlags[world.id] ?? []).filter(c => s.clues.includes(c)).length <= 1, `${world.id}: crossed exclusive routes`);
    check?.(s.nodeId, s);
    const n = world.nodes[s.nodeId];
    const available = n.choices.filter(c => !choiceBlockers(c, s, world.resources).length);
    assert.ok(n.ending || available.length, `${world.id}/${n.id}: softlock`);
    for (const c of available) {
      const path = [...s.path, c.id];
      const edge = `${n.id}:${c.id}`;
      if (!edgePaths.has(edge)) edgePaths.set(edge, path);
      stack.push({ nodeId: c.nextNodeId, path,
        clues: [...new Set([...s.clues, ...(c.effects?.clues ?? [])])],
        resources: Object.fromEntries((world.resources ?? []).map(r => [r.id, Math.min(r.max, Math.max(r.min, s.resources[r.id] + (c.effects?.resources?.[r.id] ?? 0)))])),
        resolve: Math.min(100, Math.max(0, s.resolve + (c.effects?.resolve ?? 0))),
        trust: Math.min(100, Math.max(0, s.trust + (c.effects?.trust ?? 0))),
      });
    }
  }
  assert.equal(nodePaths.size, Object.keys(world.nodes).length);
  assert.equal(edgePaths.size, Object.values(world.nodes).reduce((n, s) => n + s.choices.length, 0));
  return { edgePaths, nodePaths, states: seen.size };
}
