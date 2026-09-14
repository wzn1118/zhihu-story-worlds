import { readFile, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { authoredWorlds } from '../content/worlds.ts';
import { buildShortPlans } from '../server/art-production-short.ts';
import { sourceEnvironmentPlacements } from '../server/art-production-environment-placements.ts';
import { artBindingSource } from '../shared/art-binding-source.ts';
import { getWorld } from '../server/worlds.ts';
import { replaceArtFile } from '../server/art-production-files.ts';
import { directDeliveryFile, mergeDirectDeliveries } from './art-production-direct-deliveries.ts';

const root = process.cwd();
const folder = path.dirname(path.join(root, directDeliveryFile));
const json = async (file: string) => JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
const mapping = await json(path.join(folder, 'saved-art-verified-map.json'));
const publicFile = path.join(root, 'public/generated-art/production-manifest.json');
const manifest = await json(publicFile);
const plans = await buildShortPlans(root, authoredWorlds);
const worlds: any[] = [], outcomes: any[] = [];
for (const item of mapping.rows.filter((r: any) => r.ready)) {
  const original = authoredWorlds.find(w => w.id === item.worldId);
  const current = manifest.worlds.find((w: any) => w.worldId === item.worldId);
  const plan = plans.find(p => p.worldId === item.worldId && p.nodeId === item.nodeId);
  if (!original || !current || !plan) {
    outcomes.push({ jobId: item.jobId, state: 'unresolved-current-target' }); continue;
  }
  const digest = createHash('sha256').update(artBindingSource(getWorld(original.storyId))).digest('hex');
  if (digest !== current.bindingSourceHash) throw new Error(`World source changed: ${item.worldId}`);
  let release = worlds.find(w => w.worldId === item.worldId);
  if (!release) {
    release = { worldId: current.worldId, storyId: current.storyId, version: current.version,
      bindingSourceHash: digest, assets: [], environmentPlacements: {} };
    worlds.push(release);
  }
  const bytes = await readFile(item.imagePath);
  if (createHash('sha256').update(bytes).digest('hex') !== item.sha256) throw new Error(`Image changed: ${item.jobId}`);
  const id = `scene_${item.sha256.slice(0, 28)}`;
  const url = `/generated-art/${id}.png`;
  await copyFile(item.imagePath, path.join(root, 'public', url.slice(1)));
  const assetKind = item.assetKind ?? 'scene';
  const row = { worldId: item.worldId, nodeId: item.nodeId, assetKind,
    jobId: id, sourceJobId: item.jobId, sourceHash: plan.sourceHash,
    state: item.generationState, review: 'pending', bindingReady: true,
    gameReady: assetKind === 'scene', directDelivery: true,
    asset: { url, sha256: item.sha256, bytes: item.bytes, width: item.width, height: item.height,
      native4k: Math.max(item.width, item.height) >= 3840 } };
  release.assets.push(row);
  if (assetKind === 'environment') {
    const placements = sourceEnvironmentPlacements(original, plans, [row]).environmentPlacements;
    release.environmentPlacements[item.nodeId] = placements[item.nodeId]
      ?? current.environmentPlacements?.[item.nodeId] ?? { sourceHash: plan.sourceHash, nodeIds: [] };
  }
  outcomes.push({ jobId: item.jobId, worldId: item.worldId, nodeId: item.nodeId,
    assetKind, state: 'published', url, imagePath: item.imagePath,
    environmentNodeIds: release.environmentPlacements[item.nodeId]?.nodeIds });
}
await writeFile(path.join(root, directDeliveryFile), JSON.stringify({ at: new Date().toISOString(), worlds }, null, 2));
await mergeDirectDeliveries(manifest, root);
manifest.generatedAt = new Date().toISOString();
await copyFile(publicFile, path.join(folder, `manifest-before-direct-${Date.now()}.json`));
const temporary = `${publicFile}.${process.pid}.tmp`;
await writeFile(temporary, JSON.stringify(manifest, null, 2));
await replaceArtFile(temporary, publicFile);
const report = { at: manifest.generatedAt, required: mapping.sourceCount, saved: mapping.readyCount,
  missing: mapping.missingCount, published: outcomes.filter(r => r.state === 'published').length, outcomes };
await writeFile(path.join(folder, 'game-art-integration-receipt.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
