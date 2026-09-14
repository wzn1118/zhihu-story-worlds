import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { authoredWorlds, type AuthoredWorld } from '../content/worlds.ts';
import { compileWorld } from '../server/worlds.ts';
import { saveSession } from '../src/game.ts';
import { coreIds, explore, replay } from './core-creative-support.ts';

const directory = process.argv[2] ?? 'output/creative-core';
mkdirSync(directory, { recursive: true });
const before: AuthoredWorld[] = JSON.parse(gunzipSync(readFileSync('tests/fixtures/core-pre-creative.json.gz')).toString());
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const report = coreIds.map(id => {
  const authored = authoredWorlds.find(w => w.id === id)!;
  const old = before.find(w => w.id === id)!;
  const sourceBytes = readFileSync(`.local/zhihu-cache/story-${authored.storyId}.json`);
  const sourceCache = JSON.parse(sourceBytes.toString('utf8'));
  if (typeof sourceCache.data?.content !== 'string') throw new Error(`${id}: original source text is missing`);
  const world = compileWorld(authored);
  const graph = explore(world);
  const scenes = Object.values(world.nodes).map(node => ({
    id: node.id, new: !old.nodes[node.id], title: node.title, chapter: node.chapter, location: node.location,
    background: node.background, text: node.text, ending: node.ending ?? null,
    sourcePassageIds: world.sourcePassages?.filter(p => p.nodeIds.includes(node.id)).map(p => p.id),
    contentSha256: sha256(JSON.stringify(node)),
    choices: node.choices.map(c => ({ id: c.id, text: c.text, nextNodeId: c.nextNodeId, costs: c.effects?.resources, gates: c.requires, requiresClue: c.requiresClue })),
  }));
  const paths = Object.fromEntries(Object.values(world.nodes).filter(n => n.ending).map(node => {
    const path = graph.nodes.get(node.id)!;
    const session = replay(world, path);
    const save = saveSession(session);
    writeFileSync(`${directory}/${id}-${node.id}.save.json`, JSON.stringify({ format: 'redleaf-save', version: 1, game: save }, null, 2));
    return [node.id, { path, resources: session.resources, clues: session.clues, title: node.title }];
  }));
  writeFileSync(`${directory}/${id}.world.json`, JSON.stringify(world));
  return { id, title: world.title, storyId: world.storyId, version: world.version, compatibleSaveVersions: world.compatibleSaveVersions,
    source: world.source, sourceSha256: sha256(sourceBytes), sourceCacheSha256: sha256(sourceBytes),
    sourceTextSha256: sha256(sourceCache.data.content), sourceFetchedAt: sourceCache.fetchedAt ?? null,
    adaptation: world.adaptation, scenes, paths, counts: { nodes: scenes.length, decisions: scenes.filter(n => !n.ending).length, endings: Object.keys(paths).length, newNodes: scenes.filter(n => n.new).length, badEnds: scenes.filter(n => n.ending?.tone === 'dark' && n.title.startsWith('Bad End')).length, inkEdges: graph.edges.size, routingEquivalentStates: graph.states },
  };
});
writeFileSync(`${directory}/scene-manifest.json`, JSON.stringify({ generatedAt: new Date().toISOString(), artStatus: 'Targets only; no image generation or visual acceptance claimed', worlds: report }, null, 2));
console.log(JSON.stringify(report.map(w => ({ id: w.id, version: w.version, ...w.counts })), null, 2));
