import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { authoredWorlds } from '../content/worlds.ts';

mkdirSync('output/world-continuation', { recursive: true });
writeFileSync('tests/fixtures/worlds-pre-continuation.json.gz', gzipSync(JSON.stringify(authoredWorlds)), { flag: 'wx' });
const review = authoredWorlds.map(world => {
  const endings = Object.values(world.nodes).filter(n => n.ending);
  const bad = endings.filter(n => n.ending!.tone === 'dark').at(-1)!;
  const good = endings.filter(n => n.ending!.tone === 'hopeful').at(-1)!;
  const selected = [bad, good].filter(Boolean);
  const entries = selected.flatMap(end => Object.values(world.nodes).filter(n => n.choices.some(c => c.nextNodeId === end.id)));
  const parents = entries.flatMap(entry => Object.values(world.nodes).filter(n => n.choices.some(c => c.nextNodeId === entry.id)));
  const ids = [...new Set([...selected, ...entries, ...parents].map(n => n.id))];
  const source = JSON.parse(readFileSync(`.local/zhihu-cache/story-${world.storyId}.json`, 'utf8')).data;
  writeFileSync(`output/world-continuation/${world.id}.review.json`, JSON.stringify({ id: world.id, sourceTitle: world.source.title, introduction: world.introduction, sourceExcerpt: source.content, resources: world.resources, sourcePassages: world.sourcePassages, selected: selected.map(n => n.id), nodes: ids.map(id => world.nodes[id]) }, null, 2));
  return `${world.id}: ${selected.map(n => n.id).join(', ')}; predecessors: ${entries.map(n => n.id).join(', ')}`;
});
writeFileSync('output/world-continuation/selection.txt', review.join('\n'));
console.log(review.join('\n'));
