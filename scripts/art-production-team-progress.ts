import { writeFile } from 'node:fs/promises';
import { authoredWorlds } from '../content/worlds.ts';
import { ART_WORLD_OWNERS } from '../server/art-production-delegates.ts';
import { listArtBatches } from '../server/art-production.ts';

const batches = await listArtBatches();
const worlds = authoredWorlds.map(world => {
  const owner = ART_WORLD_OWNERS[world.id];
  if (!owner) throw new Error(`ART_WORLD_NOT_ASSIGNED:${world.id}`);
  const batch = batches.find(batch => batch.worldId === world.id);
  const jobs = batch?.jobs ?? [];
  return { worldId: world.id, title: world.title, owner, minimumImages: 30,
    currentSourceNodes: Object.keys(world.nodes).length,
    requiredImages: Math.max(30, Object.keys(world.nodes).length),
    initialNodeId: world.id === 'blue-blood' ? 'training' : world.id === 'velvet-alibi' ? 'dinner'
      : world.id === 'future-island' ? 'depot' : Object.keys(world.nodes)[0],
    currentNodeIds: Object.keys(world.nodes), batchId: batch?.id,
    deliveredFilesIncludingRejected: jobs.filter(job => job.asset).length,
    deliveredSceneIdentities: new Set(jobs.filter(job => job.asset).map(job => job.nodeId)).size,
    native4kCurrent: batch?.progress.native4k ?? 0,
    reviewedCurrent: batch?.progress.reviewed ?? 0,
    approvedCurrent: batch?.progress.covered ?? 0,
    pendingCurrent: batch?.progress.queued ?? 0 };
});
if (Object.keys(ART_WORLD_OWNERS).some(id => !worlds.some(world => world.worldId === id))) throw new Error('STALE_ART_ASSIGNMENT');
const report = { updatedAt: new Date().toISOString(), scope: 'All 20 authored stories; not Blue Blood only',
  storyCount: worlds.length, minimumRequestedImages: worlds.length * 30,
  requiredUniqueSceneImages: worlds.reduce((sum, world) => sum + world.requiredImages, 0),
  approvedCurrentImages: worlds.reduce((sum, world) => sum + world.approvedCurrent, 0),
  groups: Object.fromEntries(['cel-drawing', 'painted-background', 'scene-composition'].map(owner => [owner,
    worlds.filter(world => world.owner === owner).map(world => world.worldId)])), worlds };
await writeFile('output/imagegen/scene-production/art-team/assignments.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ stories: report.storyCount, minimumImages: report.minimumRequestedImages,
  requiredImages: report.requiredUniqueSceneImages, approved: report.approvedCurrentImages, groups: report.groups }, null, 2));
