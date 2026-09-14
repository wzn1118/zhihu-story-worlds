import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { authoredWorlds } from '../content/worlds.ts';
import { compileWorld } from '../server/worlds.ts';
import { withPublishedArt } from '../src/published-art.ts';
import { scenePortraitSources, sceneCharacterPresentation } from '../src/scene-character-art.ts';

const folder = 'output/coordination/cutout-game-integration-20260910';
await mkdir(folder, { recursive: true });
const label = process.argv[2] ?? 'current';
if (!/^[a-z0-9-]+$/.test(label)) throw new Error('Invalid snapshot label');
const productionBytes = await readFile('public/generated-art/production-manifest.json', 'utf8');
const cutoutBytes = await readFile('public/generated-art/character-cutouts.json', 'utf8');
const production = JSON.parse(productionBytes), cutouts = JSON.parse(cutoutBytes);
const networkFetch = globalThis.fetch;
// Exercise the real binding code against one consistent pair of live files.
globalThis.fetch = async url => {
  const path = String(url);
  if (path === '/generated-art/production-manifest.json') return new Response(productionBytes);
  if (path === '/generated-art/character-cutouts.json') return new Response(cutoutBytes);
  throw new Error(`Unexpected audit network access: ${path}`);
};
const rows = [];
try {
  for (const source of authoredWorlds) {
    const world = await withPublishedArt(compileWorld(source));
    const cast = [...world.characters, ...(world.artCharacters ?? [])];
    const nodes = [];
    for (const node of Object.values(world.nodes)) {
      const speaker = cast.find(actor => actor.name === node.speaker);
      const placements = label === 'before' ? [node.character ?? node.stageCharacter ?? (speaker && { id: speaker.id })]
        : [node.stageCharacter, node.character, speaker && { id: speaker.id }];
      const oldDisplay = placements.flatMap(placement => {
        if (!placement) return [];
        const actor = cast.find(actor => actor.id === placement.id);
        const urls = node.ending ? [] : scenePortraitSources(actor, placement.expression ?? 'main', node.background || world.background, node.backgroundArtKind);
        return actor && urls.length ? [{ actor, urls }] : [];
      })[0];
      const presentation = label === 'before' ? null : sceneCharacterPresentation(world, node);
      const actor = label === 'before' ? oldDisplay?.actor : presentation?.character;
      const urls = label === 'before' ? oldDisplay?.urls ?? [] : presentation?.sources ?? [];
      const cutout = urls.find(url => url.startsWith('/generated-art/cutouts/'));
      if (cutout) nodes.push({ nodeId: node.id, characterId: actor.id, characterName: actor.name, url: cutout, background: node.background || world.background });
    }
    const attached = cast.flatMap(actor => Object.entries(actor.stagePortraits ?? {}).map(([expression, image]) => ({ characterId: actor.id, expression, url: image.url })));
    const used = new Set(nodes.map(node => node.url));
    const published = production.worlds.find(entry => entry.worldId === world.id);
    const assets = (published?.assets ?? []).filter(asset => asset.review === 'approved' && asset.bindingReady).map(asset => {
      const locations = [];
      if (asset.assetKind === 'cover' && world.cover === asset.asset.url) locations.push('world.cover');
      if (['scene', 'environment'].includes(asset.assetKind)) for (const node of Object.values(world.nodes)) {
        if ([node.background, ...(node.artSceneVariants ?? []).map(variant => variant.url)].includes(asset.asset.url)) locations.push(`node:${node.id}`);
      }
      if (asset.assetKind.startsWith('character-')) for (const actor of cast) {
        for (const [expression, url] of Object.entries(actor.portraits ?? {})) if (url === asset.asset.url) locations.push(`character:${actor.id}:${expression}`);
      }
      const environmentPrefix = `__art_environment_${world.id}-`;
      const environmentNodeId = asset.assetKind === 'environment' && asset.nodeId.startsWith(environmentPrefix) ? asset.nodeId.slice(environmentPrefix.length, -'-environment'.length) : undefined;
      const mappedEnvironmentNodes = published?.environmentPlacements?.[asset.nodeId]?.nodeIds ?? (environmentNodeId ? [environmentNodeId] : []);
      const blockedByScene = mappedEnvironmentNodes.length > 0 && mappedEnvironmentNodes.every(id => world.nodes[id]?.backgroundArtKind === 'scene');
      return { kind: asset.assetKind, jobId: asset.jobId, nodeId: asset.nodeId, url: asset.asset.url, locations,
        reason: locations.length ? 'bound' : blockedByScene ? 'complete-scene-has-priority' : 'unbound' };
    });
    rows.push({ worldId: world.id, storyId: world.storyId, title: world.title, startNodeId: world.startNodeId,
      approvedAssets: cutouts.entries.filter(entry => entry.worldId === world.id).length,
      attached, usableNodes: nodes, startVisible: nodes.some(node => node.nodeId === world.startNodeId),
      notCurrentlySelected: attached.filter(entry => !used.has(entry.url)), assets });
  }
} finally { globalThis.fetch = networkFetch; }
const report = { at: new Date().toISOString(), label, sourceManifestAt: production.generatedAt, cutoutManifestAt: cutouts.generatedAt,
  sha256: { production: createHash('sha256').update(productionBytes).digest('hex'), cutouts: createHash('sha256').update(cutoutBytes).digest('hex') },
  counts: { approvedAssets: cutouts.entries.length, attachedAssets: rows.reduce((sum, row) => sum + row.attached.length, 0),
    usableScenePlacements: rows.reduce((sum, row) => sum + row.usableNodes.length, 0),
    worldsWithVisibleCutouts: rows.filter(row => row.usableNodes.length).length,
    startScenesWithVisibleCutouts: rows.filter(row => row.startVisible).length }, worlds: rows };
report.artByKind = Object.fromEntries([...new Set(rows.flatMap(row => row.assets.map(asset => asset.kind)))].map(kind => {
  const assets = rows.flatMap(row => row.assets).filter(asset => asset.kind === kind);
  return [kind, { approved: assets.length, bound: assets.filter(asset => asset.locations.length).length,
    sceneTakesPriority: assets.filter(asset => asset.reason === 'complete-scene-has-priority').length,
    unbound: assets.filter(asset => asset.reason === 'unbound').length }];
}));
await writeFile(`${folder}/${label}-coverage.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ counts: report.counts, artByKind: report.artByKind, starts: rows.filter(row => row.startVisible).map(row => row.worldId), report: `${folder}/${label}-coverage.json` }));
