import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { GameWorld } from '../shared/types.ts';

const id = 'import-6febc2f6-3a12-41ac-bae5-6d05ebc68c10';
const world = JSON.parse(await readFile(resolve('.local/story-workshop/projects', id, 'r1/world.json'), 'utf8')) as GameWorld;
const route = process.argv[2];
if (!route) {
  console.log(JSON.stringify({ title: world.title, subtitle: world.subtitle, summary: world.summary, introduction: world.introduction, player: world.player,
    objective: world.objective, characters: world.characters, resources: world.resources, mechanics: world.mechanics, adaptation: world.adaptation }, null, 2));
}
for (const node of Object.values(world.nodes)) {
  if (route ? !node.id.startsWith(route) : node.id !== world.startNodeId) continue;
  console.log(`\n## ${node.id}\n${node.chapter} / ${node.title}\n${node.location} / ${node.time}`);
  node.text.forEach((text, i) => console.log(`P${i}: ${text}`));
  for (const choice of node.choices) console.log(`\n${choice.id} -> ${choice.nextNodeId}\nTEXT: ${choice.text}\nHINT: ${choice.hint}\nFEEDBACK: ${choice.feedback?.text}\nRULES: ${JSON.stringify({ requires: choice.requires, effects: choice.effects })}`);
  if (node.ending) console.log(`ENDING: ${JSON.stringify(node.ending)}`);
}
