import { authoredWorlds } from '../content/worlds.ts';
import { readFile } from 'node:fs/promises';
import { getWorld } from '../server/worlds.ts';
const report = JSON.parse(await readFile('output/imagegen/scene-production/formal-production-20260907/inspection-wave42-20260910/review-report.json','utf8'));
const state = JSON.parse(await readFile('output/imagegen/scene-production/formal-production-20260907/state.json','utf8'));
const missing=[];
for (const row of state.jobs.filter((row:any)=>row.kind==='character-anchor' && row.job?.review?.decision==='approved')) {
  const world=authoredWorlds.find(world=>world.id===row.worldId)!;
  const id=row.nodeId.slice('__art_character_'.length);
  if (!getWorld(world.storyId).characters.some(character=>character.id===id)) missing.push({worldId:world.id,id,prompt:row.prompt,fact:row.sourceFacts[0]});
}
console.log(JSON.stringify({missing}));
for (const world of authoredWorlds.filter(world => report.results.some((row: any) => row.decision === 'approved' && row.worldId === world.id))) {
  console.log(JSON.stringify({worldId:world.id,cast:getWorld(world.storyId).characters.map(({id,name})=>({id,name}))}));
}
