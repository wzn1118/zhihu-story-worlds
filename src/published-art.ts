import type { GameWorld } from '../shared/types';
import { artBindingSource } from '../shared/art-binding-source';
import { hasSceneArtHold } from './scene-art-holds';
import { verifiedEnvironmentNodeIds } from './verified-environment-placements';
import { approvedStagePortrait, clearStagePortraits, loadCharacterCutouts, type CutoutSource } from './character-cutouts';

type PublishedAsset = CutoutSource;
type PublishedWorld = { worldId: string; storyId: string; version: string; bindingSourceHash: string; assets: PublishedAsset[];
  supportingCharacters?: GameWorld['characters']; sceneCharacters?: Record<string, string[]>;
  environmentPlacements?: Record<string, { sourceHash: string; nodeIds: string[] }> };

export type PublishedSceneVariant = { url: string; sha256: string; width?: number; height?: number; native4k?: boolean; kind: 'scene' | 'environment' };

function environmentNodes(world: GameWorld, entry: PublishedWorld, row: PublishedAsset): string[] {
  // Semantic place names are resolved only by the publisher's current source-book proof.
  if (entry.environmentPlacements && Object.hasOwn(entry.environmentPlacements, row.nodeId)) {
    const placement = entry.environmentPlacements[row.nodeId];
    if (!placement || !/^[a-f0-9]{64}$/.test(placement.sourceHash) || placement.sourceHash !== row.sourceHash
      || !Array.isArray(placement.nodeIds)) return [];
    const ids = [...new Set(placement.nodeIds.filter(id => typeof id === 'string' && Object.hasOwn(world.nodes, id)))];
    if (!placement.nodeIds.every(id => typeof id === 'string' && Object.hasOwn(world.nodes, id))) return [];
    // Extra candidates must not erase an individually verified original target.
    // Other multi-node lists still require their own exact image/location proof.
    // An explicit rejection remains closed even if publication shrinks to one node.
    // Direct deliveries carry placements from the current source book, with the
    // same world and asset source hashes checked above.
    if (row.directDelivery === true) return ids;
    return verifiedEnvironmentNodeIds(world.id, entry.bindingSourceHash, row, ids) ?? (ids.length === 1 ? ids : []);
  }
  const prefix = `__art_environment_${world.id}-`, suffix = '-environment';
  const id = row.nodeId.startsWith(prefix) && row.nodeId.endsWith(suffix) ? row.nodeId.slice(prefix.length, -suffix.length) : '';
  return Object.hasOwn(world.nodes, id) ? [id] : [];
}

/** Data-only art releases reach the running game without a shared server restart. */
export async function withPublishedArt(world: GameWorld): Promise<GameWorld> {
  // Imported worlds carry current, hash-checked images from their own API.
  // The authored publication manifest must not erase this separate namespace.
  if (world.storyId.startsWith('import-')) return world;
  const clean = clearStagePortraits(world);
  try {
    const response = await fetch('/generated-art/production-manifest.json', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!response.ok) return clean;
    const manifest = await response.json() as { bindingPolicy?: string; worlds: PublishedWorld[] };
    if (!['style-first-approved-current-v1', 'native-4k-current-evidence-v1', 'direct-delivery-current-v1'].includes(manifest.bindingPolicy ?? '')) return clean;
    const entry = manifest.worlds.find(row => row.worldId === world.id && row.storyId === world.storyId && row.version === world.version);
    if (!entry) return clean;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(artBindingSource(world)));
    if (Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('') !== entry.bindingSourceHash) return clean;

    // Only a successfully validated manifest may revoke the last accepted art snapshot.
    const result = structuredClone(clean);
    delete result.artCharacters;
    result.background = '';
    result.cover = '';
    for (const node of Object.values(result.nodes)) {
      node.background = '';
      delete node.backgroundArtKind;
      delete node.artSceneVariants;
    }
    for (const character of result.characters) {
      delete character.portrait;
      delete character.portraits;
    }
    if (result.generated) result.generated.artReady = false;
    if (entry.supportingCharacters?.length) result.artCharacters = entry.supportingCharacters
      .filter(character => !result.characters.some(existing => existing.id === character.id))
      .map(({ id, name, role, description }) => ({ id, name, role, description }));
    const generated = (url?: string) => url?.startsWith('/generated-art/scene_');
    const hashes = new Set<string>(), scenes = new Set<string>();
    const sceneVariants = new Map<string, PublishedSceneVariant[]>();
    const priority = (row: PublishedAsset) => row.assetKind === 'character-anchor' ? 0 : row.assetKind === 'scene' ? 1 : 2;
    for (const row of [...entry.assets].sort((a, b) => priority(a) - priority(b))) {
      if (row.review !== 'approved' || !row.bindingReady || !/^\/generated-art\/scene_[a-f0-9]+\.png$/.test(row.asset.url)
        || !/^[a-f0-9]{64}$/.test(row.asset.sha256) || hashes.has(row.asset.sha256)) continue;
      if (row.assetKind === 'scene' && row.gameReady && Object.hasOwn(result.nodes, row.nodeId)
        && !hasSceneArtHold(result.id, row.nodeId, row.asset.url)) {
        result.nodes[row.nodeId].background = row.asset.url;
        result.nodes[row.nodeId].backgroundArtKind = 'scene'; scenes.add(row.nodeId);
        sceneVariants.set(row.nodeId, [...(sceneVariants.get(row.nodeId) ?? []), { ...row.asset, kind: 'scene' }]);
      } else if (row.assetKind === 'cover' && row.nodeId === '__art_cover') result.cover = row.asset.url;
      else if (row.assetKind === 'character-anchor' || row.assetKind === 'character-reaction') {
        const main = row.assetKind === 'character-anchor';
        const prefix = main ? '__art_character_' : '__art_reaction_';
        if (!row.nodeId.startsWith(prefix)) continue;
        const id = row.nodeId.slice(prefix.length);
        const character = [...result.characters, ...(result.artCharacters ?? [])].find(item => item.id === id);
        if (!character) continue;
        character.portraits = { ...character.portraits, [main ? 'main' : 'reaction']: row.asset.url };
        if (main) character.portrait = row.asset.url;
      } else if (row.assetKind === 'environment') {
        for (const id of environmentNodes(result, entry, row)) {
          // A scene keeps its own composition at its actual resolution.
          if (scenes.has(id)) {
            sceneVariants.set(id, [...(sceneVariants.get(id) ?? []), { ...row.asset, kind: 'environment' }]);
            continue;
          }
          if (result.nodes[id].backgroundArtKind !== 'environment') {
            result.nodes[id].background = row.asset.url; result.nodes[id].backgroundArtKind = 'environment';
            scenes.delete(id);
          }
          sceneVariants.set(id, [...(sceneVariants.get(id) ?? []), { ...row.asset, kind: 'environment' }]);
        }
      }
      hashes.add(row.asset.sha256);
    }
    if (result.generated) result.generated.artReady = scenes.size >= Object.keys(result.nodes).length && scenes.size >= 30;
    for (const [id, variants] of sceneVariants) {
      result.nodes[id].artSceneVariants = variants.filter((variant, index, all) =>
        !hasSceneArtHold(result.id, id, variant.url) && all.findIndex(item => item.sha256 === variant.sha256) === index);
    }
    await loadCharacterCutouts(result, entry.assets, entry.sceneCharacters, scenes);
    // A supporting actor can have an independently approved reaction cutout before its main pose.
    if (result.artCharacters) result.artCharacters = result.artCharacters.filter(character => generated(character.portraits?.main)
      || generated(character.portraits?.reaction)
      || approvedStagePortrait(character.stagePortraits?.main) || approvedStagePortrait(character.stagePortraits?.reaction));
    return result;
  } catch {
    // Keep the accepted scene illustration, but stage approvals need fresh evidence.
    return clean;
  }
}

