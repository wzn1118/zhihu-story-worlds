import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { catalogWorldsB } from '../content/catalog-b.ts';
import { getWorld } from '../server/worlds.ts';

const stage = process.argv[2] ?? 'before';
if (!['before', 'after'].includes(stage)) throw new Error('Use before or after');
const dir = `output/editorial/catalog-b/${stage}`;
if (stage === 'before' && existsSync(`${dir}/worlds.json.gz`)) throw new Error('The pre-edit snapshot is immutable. Use after.');
mkdirSync(dir, { recursive: true });
const sha = (x: string | Buffer) => createHash('sha256').update(x).digest('hex');
const worlds = catalogWorldsB.map(w => getWorld(w.storyId));
const inventory = [];
for (const w of worlds) {
  const cache = readFileSync(`.local/zhihu-cache/story-${w.storyId}.json`);
  const source = JSON.parse(cache.toString()).data;
  const lines = [`# ${w.id} / ${w.storyId} / ${w.version}`, `## 原作：${source.chapter_name} / ${source.author_name}`, source.content, '## 最终编译元数据', JSON.stringify({ ...w, ink: undefined, nodes: undefined }, null, 2)];
  for (const n of Object.values(w.nodes)) {
    const incoming = Object.values(w.nodes).flatMap(from => from.choices.filter(c => c.nextNodeId === n.id).map(c => `${from.id}/${c.id}`));
    lines.push(`\n## ${n.id} | ${n.title} | ${n.location} | ${n.time}`, `IN: ${incoming.join(', ')}`, ...n.text);
    if (n.challenge) lines.push(`挑战 ${JSON.stringify(n.challenge)}`);
    for (const c of n.choices) lines.push(`- ${c.id} → ${c.nextNodeId} | ${c.text}`, `  ${JSON.stringify({ ...c, id: undefined, nextNodeId: undefined, text: undefined, legacyTexts: undefined })}`);
    if (n.ending) lines.push(`结局 ${JSON.stringify(n.ending)}`);
  }
  writeFileSync(`${dir}/${w.id}.md`, lines.join('\n') + '\n');
  inventory.push({ worldId: w.id, storyId: w.storyId, version: w.version, nodes: Object.keys(w.nodes).length, choices: Object.values(w.nodes).reduce((n, node) => n + node.choices.length, 0), endings: Object.values(w.nodes).filter(n => n.ending).length, sourceEnvelopeSha256: sha(cache), sourceTextSha256: sha(source.content), finalWorldSha256: sha(JSON.stringify(w)), draftSha256: sha(JSON.stringify({ ...w, ink: undefined })), nodesSha256: Object.fromEntries(Object.values(w.nodes).map(n => [n.id, sha(JSON.stringify(n))])) });
}
writeFileSync(`${dir}/worlds.json.gz`, gzipSync(JSON.stringify(worlds)));
writeFileSync(`${dir}/inventory.json`, JSON.stringify(inventory, null, 2));
console.log(JSON.stringify(inventory.map(({ nodesSha256, ...w }) => w), null, 2));
