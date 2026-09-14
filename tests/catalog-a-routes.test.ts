import assert from 'node:assert/strict';
import test from 'node:test';
import { catalogWorldsA } from '../content/catalog-a.ts';
import { compileWorld } from '../server/worlds.ts';
import { choiceBlockers, type ChoiceState } from '../shared/choice-rules.ts';
import { choose, restoreSession, saveSession, startSession } from '../src/game.ts';

interface RouteState extends ChoiceState { nodeId: string; path: string[] }

for (const authored of catalogWorldsA) test(`${authored.id}: divergent routes remain playable through depletion and save replay`, context => {
  const world = compileWorld(authored);
  const initial = startSession(world);
  const nodes = Object.values(world.nodes);
  assert.ok(nodes.length >= 30);
  assert.ok(nodes.filter(node => node.ending).length >= 5);
  for (const node of nodes) {
    assert.equal(node.text.length, 3, `${node.id}: missing authored prose`);
    assert.ok(node.text.every(paragraph => paragraph.trim().length > 0));
    for (const choice of node.choices) {
      assert.ok(world.nodes[choice.nextNodeId], `${node.id}:${choice.id}: missing destination`);
      for (const id of Object.keys(choice.effects?.resources ?? {})) assert.ok(world.resources?.some(resource => resource.id === id), `unknown resource ${id}`);
    }
  }

  const entrances = world.nodes[world.startNodeId].choices.filter(choice => choice.id.startsWith('route_'));
  assert.equal(entrances.length, 2);
  const branchScenes = entrances.map(entrance => {
    const found = new Set<string>();
    const pending = [entrance.nextNodeId];
    while (pending.length) {
      const id = pending.pop()!;
      if (found.has(id) || world.nodes[id].ending) continue;
      found.add(id);
      pending.push(...world.nodes[id].choices.map(choice => choice.nextNodeId));
    }
    assert.ok(found.size >= 6, `${entrance.id}: fewer than six distinct choice scenes`);
    return found;
  });
  assert.deepEqual([...branchScenes[0]].filter(id => branchScenes[1].has(id)), [], 'New routes must stay separate for their entire nonending scenes');

  const liveClues = Object.fromEntries(nodes.map(node => [node.id, new Set(node.choices.flatMap(choice => [...(choice.requires?.allClues ?? []), ...(choice.requires?.anyClues ?? []), ...(choice.requires?.noneClues ?? []), ...(choice.requiresClue ? [choice.requiresClue] : [])]))]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes) for (const choice of node.choices) for (const clue of liveClues[choice.nextNodeId]) {
      if (!liveClues[node.id].has(clue)) { liveClues[node.id].add(clue); changed = true; }
    }
  }
  const resources = world.resources ?? [];
  const allChoices = nodes.flatMap(node => node.choices);
  const gateResolve = allChoices.some(choice => choice.requires?.resolve);
  const gateTrust = allChoices.some(choice => choice.requires?.trust);
  const pending: RouteState[] = [{ nodeId: initial.node.id, path: [], resources: initial.resources, clues: initial.clues, resolve: initial.resolve, trust: initial.trust }];
  const visited = new Set<string>();
  const edges = new Set<string>();
  const endings = new Map<string, string[]>();
  const scarce = new Map<string, string[]>();
  while (pending.length) {
    const state = pending.pop()!;
    const key = JSON.stringify([state.nodeId, resources.map(resource => state.resources[resource.id]), [...liveClues[state.nodeId]].filter(clue => state.clues.includes(clue)), gateResolve && state.resolve, gateTrust && state.trust]);
    if (visited.has(key)) continue;
    visited.add(key);
    assert.ok(visited.size < 500_000, 'route-state enumeration unexpectedly exceeded its bound');
    const node = world.nodes[state.nodeId];
    if (node.ending) { if (!endings.has(node.id)) endings.set(node.id, state.path); continue; }
    const available = node.choices.filter(choice => !choiceBlockers(choice, state, resources).length);
    assert.ok(available.length, `${node.id}: no exit after ${state.path.join(' > ')}`);
    if (available.length < 2 && !scarce.has(node.id)) scarce.set(node.id, state.path);
    for (const choice of available) {
      edges.add(`${node.id}:${choice.id}`);
      pending.push({
        nodeId: choice.nextNodeId, path: [...state.path, choice.id],
        resources: Object.fromEntries(resources.map(resource => [resource.id, Math.min(resource.max, Math.max(resource.min, state.resources[resource.id] + (choice.effects?.resources?.[resource.id] ?? 0)))])),
        clues: [...new Set([...state.clues, ...(choice.effects?.clues ?? [])])],
        resolve: Math.min(100, Math.max(0, state.resolve + (choice.effects?.resolve ?? 0))),
        trust: Math.min(100, Math.max(0, state.trust + (choice.effects?.trust ?? 0))),
      });
    }
  }
  assert.deepEqual(nodes.flatMap(node => node.choices.map(choice => `${node.id}:${choice.id}`)).filter(edge => !edges.has(edge)), [], 'All authored choices must be reachable with legal resources');
  assert.equal(endings.size, nodes.filter(node => node.ending).length);
  assert.deepEqual([...scarce], [], 'Every playable scene must retain two legal options, including exhausted states');
  for (const [ending, path] of endings) {
    let session = startSession(world);
    for (const id of path) {
      const choice = session.choices.find(candidate => candidate.id === id);
      assert.ok(choice, `${ending}: Ink did not expose ${id}`);
      session = choose(session, choice);
    }
    assert.equal(session.node.id, ending);
    assert.equal(restoreSession(world, saveSession(session)).node.id, ending);
  }
  context.diagnostic(JSON.stringify({ nodes: nodes.length, edges: edges.size, endings: endings.size, states: visited.size }));
});
