import assert from 'node:assert/strict';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { authoredWorlds } from '../content/worlds.ts';
import { compileWorld } from '../server/worlds.ts';
import { explore } from '../tests/core-creative-support.ts';
import { challengeInitials } from '../src/difficulty.ts';
import { choose, saveSession, restoreSession, startSession } from '../src/game.ts';
import type { GameWorld } from '../shared/types.ts';

const output = resolve('output/challenge-20260910');
await mkdir(output, { recursive: true });
const worlds = authoredWorlds.map(compileWorld);
const projectRoot = resolve('.local/story-workshop/projects');
for (const entry of await readdir(projectRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  try {
    const project = JSON.parse(await readFile(resolve(projectRoot, entry.name, 'project.json'), 'utf8'));
    if (!project.playable || !project.publishedVersion) continue;
    worlds.push(JSON.parse(await readFile(resolve(projectRoot, entry.name, project.publishedVersion, 'world.json'), 'utf8')));
  } catch { /* Incomplete imports are outside published-game validation. */ }
}
const results = [];
for (const world of worlds) {
  const initials = challengeInitials(world);
  const adjusted = compileWorld({ ...world, resources: world.resources?.map(resource => ({ ...resource, initial: initials[resource.id] })) });
  const graph = explore(adjusted);
  const endings = [];
  for (const [nodeId, path] of graph.nodes) {
    if (!world.nodes[nodeId].ending) continue;
    let actual = startSession(world, { difficulty: 'challenge' });
    for (const id of path) {
      const choice = actual.choices.find(choice => choice.id === id);
      assert.ok(choice, `${world.id}/${actual.node.id}: ${id} missing in actual challenge Ink`);
      actual = choose(actual, choice);
    }
    assert.equal(actual.node.id, nodeId);
    assert.equal(restoreSession(world, saveSession(actual)).node.id, nodeId);
    endings.push({ id: nodeId, tone: actual.node.ending!.tone, path });
  }
  assert.ok(endings.some(ending => ending.tone === 'hopeful'), `${world.id} has no reachable hopeful ending`);
  const result = { id: world.id, storyId: world.storyId, states: graph.states, nodes: graph.nodes.size, choices: graph.edges.size, initials, endings };
  results.push(result);
  console.log(JSON.stringify({ world: world.id, states: graph.states, endings: endings.length, hopeful: endings.filter(ending => ending.tone === 'hopeful').length }));
}
await writeFile(resolve(output, 'reachability.json'), JSON.stringify({ checkedAt: new Date().toISOString(), status: 'passed', worlds: results }, null, 2));
