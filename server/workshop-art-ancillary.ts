import type { ArtBatch, ArtJob } from '../shared/production.ts';
import type { GameWorld } from '../shared/types.ts';
import { currentFormalPlans, verifiedNativeArt } from './workshop-art-assets.ts';

const generated = (url: string) => url.startsWith('/generated-art/');

/** Receives the freshly verified scene snapshot; source checks use its original world. */
export async function bindApprovedAncillaryArt(
  world: GameWorld, batch: ArtBatch, originalWorld: GameWorld = world,
): Promise<GameWorld> {
  const result = structuredClone(world);
  const matches = batch.worldId === originalWorld.id && batch.storyId === originalWorld.storyId
    && batch.worldVersion === originalWorld.version && world.id === originalWorld.id
    && world.storyId === originalWorld.storyId && world.version === originalWorld.version;

  // withApprovedArt has already checked these exact scene bindings. Ancillary
  // refreshes must neither replace them nor retain an old ancillary URL as a CG.
  const scenes = new Map<string, ArtJob>();
  if (matches) for (const job of batch.jobs) {
    const asset = job.asset;
    if ((job.assetKind ?? 'scene') === 'scene' && job.worldId === world.id && !job.stale
      && job.state === 'generated' && job.review?.decision === 'approved'
      && asset?.native4k === true && asset.originalPixels === true && asset.duplicate === false
      && world.nodes[job.nodeId]?.background === asset.url) scenes.set(job.nodeId, job);
  }
  for (const [id, node] of Object.entries(result.nodes)) {
    if (generated(node.background) && !scenes.has(id)) node.background = '';
  }
  const startSceneUrl = scenes.get(result.startNodeId)?.asset?.url;
  if (generated(result.background) && result.background !== startSceneUrl) result.background = '';
  if (generated(result.cover) && result.cover !== startSceneUrl) result.cover = '';
  if (!matches) return result;

  try {
    const plans = new Map((await currentFormalPlans(originalWorld)).map(plan => [plan.nodeId, plan]));
    const hashes = new Set([...scenes.values()].map(job => job.asset!.sha256));
    const urls = new Set([...scenes.values()].map(job => job.asset!.url));
    async function assetFor(nodeId: string, kind: 'cover' | 'environment') {
      const plan = plans.get(nodeId);
      if (!plan || plan.kind !== kind || plan.blocked) return;
      for (const job of batch.jobs) {
        if (job.worldId !== originalWorld.id || job.nodeId !== nodeId || job.assetKind !== kind
          || job.sourceHash !== plan.sourceHash || !job.asset || hashes.has(job.asset.sha256)
          || urls.has(job.asset.url) || !await verifiedNativeArt(job, 'landscape')) continue;
        hashes.add(job.asset.sha256); urls.add(job.asset.url);
        return job.asset;
      }
    }

    const cover = await assetFor('__art_cover', 'cover');
    if (cover) result.cover = cover.url;
    for (const [id, node] of Object.entries(result.nodes)) {
      if (scenes.has(id) || !originalWorld.nodes[id]) continue;
      const environment = await assetFor(`__art_environment_${originalWorld.id}-${id}-environment`, 'environment');
      if (environment) {
        node.background = environment.url;
        if (id === result.startNodeId) result.background = environment.url;
      }
    }
    // Cover and environment delivery never changes scene-only artReady coverage.
  } catch {
    // A missing source book hides ancillary art while the playable story remains.
  }
  return result;
}
