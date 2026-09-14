import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const directDeliveryFile = 'output/coordination/art-remake-12h-20260912/full64-direct/direct-delivery-publication.json';

/** Preserve explicit direct deliveries when the regular publisher refreshes. */
export async function mergeDirectDeliveries(manifest: any, root: string) {
  let supplement: any;
  try { supplement = JSON.parse(await readFile(path.join(root, directDeliveryFile), 'utf8')); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return manifest;
    throw error;
  }
  let applied = 0;
  for (const release of supplement.worlds) {
    const world = manifest.worlds.find((w: any) => w.worldId === release.worldId
      && w.storyId === release.storyId && w.version === release.version
      && w.bindingSourceHash === release.bindingSourceHash);
    if (!world) continue;
    for (const row of release.assets) {
      if (!/^\/generated-art\/scene_[a-f0-9]+\.png$/.test(row.asset.url)) continue;
      const bytes = await readFile(path.join(root, 'public', row.asset.url.slice(1)));
      if (createHash('sha256').update(bytes).digest('hex') !== row.asset.sha256) continue;
      world.assets = world.assets.filter((old: any) => old.nodeId !== row.nodeId || old.assetKind !== row.assetKind);
      world.assets.push(row);
      const placement = release.environmentPlacements?.[row.nodeId];
      if (placement) world.environmentPlacements = { ...world.environmentPlacements, [row.nodeId]: placement };
      applied++;
    }
    world.gameReadyScenes = world.assets.filter((r: any) => r.gameReady && r.assetKind === 'scene').length;
  }
  const assets = manifest.worlds.flatMap((w: any) => w.assets);
  manifest.counts = { ...manifest.counts, delivered: assets.length,
    gameReadyScenes: assets.filter((r: any) => r.gameReady && r.assetKind === 'scene').length,
    bindingReadyAssets: assets.filter((r: any) => r.bindingReady).length,
    reviewed: assets.filter((r: any) => r.review !== 'pending').length,
    approved: assets.filter((r: any) => r.review === 'approved').length,
    pendingReview: assets.filter((r: any) => r.review === 'pending').length,
    rejected: assets.filter((r: any) => r.review === 'rejected').length,
    directDeliveries: applied };
  return manifest;
}
