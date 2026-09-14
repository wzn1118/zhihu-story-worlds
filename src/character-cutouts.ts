import type { Character, GameWorld, SceneNode, StagePortrait } from '../shared/types';
import { ART_MANIFESTS, readArtManifest } from './art-manifest-cache';

export type CutoutSource = {
  nodeId: string; jobId?: string; sourceHash?: string; assetKind: string;
  review: string; bindingReady?: boolean; gameReady: boolean; directDelivery?: boolean;
  asset: { url: string; sha256: string; width?: number; height?: number; native4k?: boolean };
};
export type CharacterCutout = {
  worldId: string; nodeId: string; jobId: string; sourceHash: string;
  sourceUrl: string; sourceSha256: string; url: string; sha256: string;
  width: number; height: number; review: 'approved' | 'rejected' | 'pending';
};
export type CutoutManifest = { schemaVersion: 1; entries: CharacterCutout[] };

// Presence is live publication evidence, not authored story data or a saved approval.
const sceneCast = new WeakMap<GameWorld, Map<string, string[]>>();
export function sceneCutoutCandidates(world: GameWorld, node: SceneNode): Character[] {
  const ids = sceneCast.get(world)?.get(node.id) ?? (node.stageCharacter ? [node.stageCharacter.id] : []);
  const cast = [...world.characters, ...(world.artCharacters ?? [])];
  // Publication membership order is stable when another actor gains approved art.
  return [...new Set(ids)].map(id => cast.find(character => character.id === id))
    .filter((character): character is Character => Boolean(character && Object.values(character.stagePortraits ?? {}).some(approvedStagePortrait)));
}

export function mentionedSceneCharacter(candidates: Character[], text: string): Character | undefined {
  return candidates.find(character => character.name.trim() && text.includes(character.name.trim()));
}

export function sceneCounterpart(candidates: Character[], node: SceneNode, currentText = node.text[0] ?? ''): Character | undefined {
  // A later paragraph can establish the actor during an unnamed opening beat.
  // Ties retain scene membership order; new approvals must not empty the stage.
  return mentionedSceneCharacter(candidates, currentText)
    ?? mentionedSceneCharacter(candidates, node.text.join('\n'))
    ?? candidates[0];
}

const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export function approvedStagePortrait(value: StagePortrait | undefined): value is StagePortrait {
  return Boolean(value && value.review === 'approved' && /^scene_[a-f0-9]+$/.test(value.jobId)
    && hash(value.sha256) && hash(value.sourceHash) && hash(value.sourceSha256)
    && value.url === `/generated-art/cutouts/${value.jobId}-${value.sourceSha256.slice(0, 12)}.png`
    && Number.isSafeInteger(value.width) && value.width > 0 && Number.isSafeInteger(value.height) && value.height > 0);
}

/** Never retain an earlier cutout approval after a failed or revoked fresh read. */
export function clearStagePortraits(world: GameWorld): GameWorld {
  sceneCast.delete(world);
  const characters = [...world.characters, ...(world.artCharacters ?? [])];
  if (!characters.some(character => character.stagePortraits) && !Object.values(world.nodes).some(node => node.stageCharacter)) return world;
  const clean = structuredClone(world);
  for (const character of [...clean.characters, ...(clean.artCharacters ?? [])]) delete character.stagePortraits;
  for (const node of Object.values(clean.nodes)) delete node.stageCharacter;
  return clean;
}

/** Mutates only the newly cloned runtime snapshot, after source publication validation. */
export function bindCharacterCutouts(world: GameWorld, sources: CutoutSource[], manifest: CutoutManifest,
  sceneCharacters: Record<string, string[]> = {}, illustratedScenes: Set<string> = new Set()): void {
  sceneCast.delete(world);
  for (const character of [...world.characters, ...(world.artCharacters ?? [])]) delete character.stagePortraits;
  for (const node of Object.values(world.nodes)) delete node.stageCharacter;
  if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.entries)) return;
  const cast = [...world.characters, ...(world.artCharacters ?? [])];
  const used = new Set<string>();
  const entries = manifest.entries.filter(entry => entry && typeof entry === 'object');
  const sourceJobs = sources.filter(source => source.review === 'approved' && source.bindingReady
    && ['character-anchor', 'character-reaction'].includes(source.assetKind));
  for (const source of [...sourceJobs].sort((a, b) => Number(a.assetKind === 'character-reaction') - Number(b.assetKind === 'character-reaction'))) {
    const main = source.assetKind === 'character-anchor', expression = main ? 'main' : 'reaction';
    const prefix = main ? '__art_character_' : '__art_reaction_';
    if (!source.nodeId.startsWith(prefix) || !source.jobId || !hash(source.sourceHash) || !hash(source.asset.sha256)
      || source.asset.url !== `/generated-art/${source.jobId}.png`) continue;
    const character = cast.find(candidate => candidate.id === source.nodeId.slice(prefix.length));
    if (!character || character.stagePortraits?.[expression]) continue;
    const matching = entries.filter(entry => entry.worldId === world.id && entry.nodeId === source.nodeId && entry.jobId === source.jobId
      && entry.sourceHash === source.sourceHash && entry.sourceSha256 === source.asset.sha256 && entry.sourceUrl === source.asset.url);
    // Conflicting duplicate proof records cannot grant a stage approval.
    if (matching.length !== 1) continue;
    const cutout = matching[0];
    if (cutout.review !== 'approved' || cutout.width !== source.asset.width || cutout.height !== source.asset.height
      || !approvedStagePortrait(cutout as StagePortrait) || used.has(cutout.sha256)) continue;
    const portrait: StagePortrait = { url: cutout.url, sha256: cutout.sha256, jobId: cutout.jobId,
      sourceHash: cutout.sourceHash, sourceSha256: cutout.sourceSha256, width: cutout.width, height: cutout.height, review: 'approved' };
    character.stagePortraits = { ...character.stagePortraits, [expression]: portrait };
    used.add(portrait.sha256);
  }
  const memberships = new Map<string, string[]>();
  sceneCast.set(world, memberships);
  for (const [id, ids] of Object.entries(sceneCharacters)) {
    const node = world.nodes[id];
    if (!node || node.ending || illustratedScenes.has(id) || !Array.isArray(ids)) continue;
    memberships.set(id, ids.filter(value => typeof value === 'string'));
    const candidates = sceneCutoutCandidates(world, node);
    const speaker = candidates.find(character => character.name === node.speaker);
    const authored = candidates.find(character => character.id === node.character?.id);
    const counterpart = candidates.filter(character => character.id !== 'player' && character.name !== world.player.name);
    const selected = speaker ?? authored ?? sceneCounterpart(counterpart, node);
    if (selected && selected.id !== node.character?.id) node.stageCharacter = { id: selected.id, expression: 'main', position: 'left' };
  }
}

export async function loadCharacterCutouts(world: GameWorld, sources: CutoutSource[], sceneCharacters?: Record<string, string[]>,
  illustratedScenes?: Set<string>): Promise<void> {
  // Direct refreshes must also drop stale approval when the request fails.
  sceneCast.delete(world);
  for (const character of [...world.characters, ...(world.artCharacters ?? [])]) delete character.stagePortraits;
  for (const node of Object.values(world.nodes)) delete node.stageCharacter;
  try {
    const manifest = await readArtManifest<CutoutManifest>(ART_MANIFESTS[1]);
    bindCharacterCutouts(world, sources, manifest, sceneCharacters, illustratedScenes);
  } catch { /* Missing derivative approval never suppresses a complete scene or source reference. */ }
}
