import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import type { GameWorld } from '../shared/types.ts';
import { choose, startSession, type Session } from '../src/game.ts';
import { auditBGraph } from './catalog-b-graph.ts';
import revisions from '../content/catalog-b-editorial-data.json';

export const editorialBefore: GameWorld[] = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/catalog-b-editorial-before.json.gz', import.meta.url))).toString());
export function resourceContract<T extends { description?: string }>(resource: T) {
  const { description: _copy, ...contract } = resource;
  return contract;
}
export function readField(world: GameWorld, path: string): string {
  let value: any = world;
  for (const key of path.split('.')) value = Array.isArray(value) && !/^\d+$/.test(key) ? value.find(x => x.id === key) : value[key];
  return value;
}
export function play(world: GameWorld, path: string[]) {
  let s = startSession(world);
  for (const id of path) s = step(s, id);
  return s;
}
export function step(s: Session, id: string) {
  const choice = s.choices.find(c => c.id === id);
  assert.ok(choice, `${s.world.id}/${s.node.id}/${id}`);
  return choose(s, choice);
}
export const facts = (s: Session) => ({ node: s.node.id, resources: s.resources, clues: s.clues, resolve: s.resolve, trust: s.trust, choiceCount: s.choiceCount, available: s.choices.map(c => c.id) });

export function affectedPaths(world: GameWorld, revisionSet: ReadonlyArray<{ worldId: string; path: string }> = revisions) {
  const nodes = new Set(revisionSet.filter(r => r.worldId === world.id && r.path.startsWith('nodes.')).map(r => r.path.split('.')[1]));
  const audit = auditBGraph(world);
  const paths = new Map<string, string[]>();
  const add = (path: string[]) => paths.set(JSON.stringify(path), path);
  add([]);
  // Real incoming alternatives and outgoing decisions, not sentence snapshots.
  for (const [edge, witness] of audit.atEdge) {
    const choiceId = edge.split('/')[1];
    const next = world.nodes[witness.nodeId].choices.find(c => c.id === choiceId)!.nextNodeId;
    if (nodes.has(witness.nodeId) || nodes.has(next)) {
      add(witness.path); add([...witness.path, choiceId]);
    }
  }
  return [...paths.values()];
}
