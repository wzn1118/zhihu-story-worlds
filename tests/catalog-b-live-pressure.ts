import assert from 'node:assert/strict';
import type { GameWorld } from '../shared/types.ts';
import { choiceBlockers, type ChoiceState } from '../shared/choice-rules.ts';

// Find a naturally spent-out state, never set a browser balance or edit a save.
export function pressureWitness(world: GameWorld, entryId: string) {
  type State = ChoiceState & { nodeId: string; path: string[] };
  const resources = world.resources ?? [];
  const first = world.nodes[world.startNodeId].choices.find(c => c.nextNodeId === entryId)!;
  assert.ok(first);
  const stack: State[] = [{ nodeId: entryId, path: [first.id], clues: first.effects?.clues ?? [], resources: Object.fromEntries(resources.map(r => [r.id, r.initial])), resolve: 50, trust: 30 }];
  const seen = new Set<string>();
  let best: { score: number; path: string[]; nodeId: string; endingId: string; resources: Record<string, number>; blocked: string[] } | undefined;
  while (stack.length) {
    const s = stack.pop()!;
    const key = JSON.stringify([s.nodeId, s.resources, [...s.clues].sort(), s.resolve, s.trust]);
    if (seen.has(key)) continue;
    seen.add(key);
    assert.ok(seen.size < 200_000, 'Unexpected pressure search size');
    const node = world.nodes[s.nodeId];
    const out = node.choices.find(c => c.id === 'b_withdraw');
    const blocked = node.choices.filter(c => {
      const unaffordable = Object.entries(c.effects?.resources ?? {}).some(([id, delta]) => delta < 0 && s.resources[id] + delta < resources.find(r => r.id === id)!.min);
      const gated = Object.entries(c.requires?.resources ?? {}).some(([id, gate]) => (gate.min !== undefined && s.resources[id] < gate.min) || (gate.max !== undefined && s.resources[id] > gate.max));
      return unaffordable || gated;
    });
    const depleted = resources.filter(r => s.resources[r.id] === r.min).length;
    if (out && depleted && blocked.length) {
      const score = (s.resources.b_time === 0 ? 100 : 0) + depleted * 10 + blocked.length;
      if (!best || score > best.score || (score === best.score && s.path.length < best.path.length)) best = { score, path: [...s.path, out.id], nodeId: node.id, endingId: out.nextNodeId, resources: s.resources, blocked: blocked.map(c => c.id) };
    }
    for (const c of node.choices.filter(c => !choiceBlockers(c, s, resources).length)) {
      stack.push({ nodeId: c.nextNodeId, path: [...s.path, c.id], clues: [...new Set([...s.clues, ...(c.effects?.clues ?? [])])], resolve: Math.max(0, Math.min(100, s.resolve + (c.effects?.resolve ?? 0))), trust: Math.max(0, Math.min(100, s.trust + (c.effects?.trust ?? 0))), resources: Object.fromEntries(resources.map(r => [r.id, Math.max(r.min, Math.min(r.max, s.resources[r.id] + (c.effects?.resources?.[r.id] ?? 0)))])) });
    }
  }
  assert.ok(best, `${world.id}/${entryId}: no natural depletion witness with a blocked action`);
  return { ...best, searchedStates: seen.size };
}
