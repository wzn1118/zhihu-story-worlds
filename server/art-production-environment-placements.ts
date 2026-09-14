import type { ArtWorldInput } from '../shared/production.ts';
import type { ShortAssetPlan } from './art-production-short.ts';
import { reviewedEnvironmentNodeIds, type ReviewedEnvironmentAsset } from './art-production-reviewed-placements.ts';

type EnvironmentAsset = ReviewedEnvironmentAsset & { assetKind: string };
export type EnvironmentPlacements = Record<string, { sourceHash: string; nodeIds: string[] }>;
export type EnvironmentPlacementDecision = {
  nodeId: string; assetNodeIds: string[]; selectedAssetNodeId: string | null; reason: string;
};

/** Plans carry the current owner book's verbatim facts and scene snapshot checks. */
export function sourceEnvironmentPlacements(world: ArtWorldInput, plans: ShortAssetPlan[], assets: EnvironmentAsset[]) {
  const current = new Map(plans.filter(plan => plan.worldId === world.id).map(plan => [plan.nodeId, plan]));
  const placements: EnvironmentPlacements = {};
  const decisions: EnvironmentPlacementDecision[] = [];
  for (const asset of assets) {
    if (asset.assetKind !== 'environment' || !asset.bindingReady) continue;
    const plan = current.get(asset.nodeId);
    if (!plan || plan.kind !== 'environment' || plan.blocked || plan.sourceHash !== asset.sourceHash) continue;
    const nodeIds = plan.sourceFacts.flatMap(fact => {
      const header = /^节点 ([^；\s]+)；/.exec(fact)?.[1];
      if (header) return [header];
      // Some source books use a standalone world/node reference instead of a header.
      const reference = /^([a-z0-9-]+)\/([a-zA-Z0-9_-]+)$/.exec(fact.trim());
      return reference?.[1] === world.id ? [reference[2]] : [];
    });
    // Retain the exact legacy ID contract; semantic location names are never guessed.
    const prefix = `__art_environment_${world.id}-`, suffix = '-environment';
    if (asset.nodeId.startsWith(prefix) && asset.nodeId.endsWith(suffix))
      nodeIds.push(asset.nodeId.slice(prefix.length, -suffix.length));
    nodeIds.push(...reviewedEnvironmentNodeIds(world.id, asset, current));
    placements[asset.nodeId] = { sourceHash: plan.sourceHash, nodeIds: [...new Set(nodeIds)].filter(id => {
      const scene = current.get(id);
      return Object.hasOwn(world.nodes, id) && scene?.kind === 'scene' && !scene.blocked;
    }).sort() };
  }
  const candidates = new Map<string, string[]>();
  for (const [assetNodeId, placement] of Object.entries(placements))
    for (const nodeId of placement.nodeIds) candidates.set(nodeId, [...(candidates.get(nodeId) ?? []), assetNodeId]);
  for (const [nodeId, assetNodeIds] of candidates) {
    const cart = world.id === 'ming-whisper' && nodeId === 'cart_check';
    if (assetNodeIds.length < 2 && !cart) continue;
    // Both books cite cart_check. The post-gate direction explicitly depicts its
    // gate scales; grain-store keeps granary. Unknown overlaps remain unassigned.
    const selectedAssetNodeId = cart && assetNodeIds.includes('__art_environment_post-gate')
      ? '__art_environment_post-gate' : null;
    decisions.push({ nodeId, assetNodeIds: [...assetNodeIds].sort(), selectedAssetNodeId,
      reason: cart ? 'explicit-cart-check-post-gate-selection' : 'ambiguous-explicit-source-overlap' });
    for (const id of assetNodeIds) if (id !== selectedAssetNodeId)
      placements[id].nodeIds = placements[id].nodeIds.filter(candidate => candidate !== nodeId);
  }
  return { environmentPlacements: placements, environmentPlacementDecisions: decisions };
}
