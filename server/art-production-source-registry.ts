import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ArtWorldInput } from '../shared/production.ts';
import type { Character } from '../shared/types.ts';
import { ART_WORLD_OWNERS } from './art-production-delegates.ts';
import { anchorNodeId, sourceSnapshotHash, type ShortAssetPlan } from './art-production-short.ts';
import { supportingArtPresent } from './workshop-art-supporting-cast.ts';

export interface SourceBookWorld {
  characters: Record<string, { prompt: string; sourceFacts: string[] }>;
  nodes: Record<string, { characterIds: string[]; sourceSnapshotHash?: string }>;
}

export interface ArtSourceMetadata {
  supportingCharacters: Character[];
  sceneCharacters: Record<string, string[]>;
}

/** Read identity labels from the original book, never from a corrected render prompt. */
function bookCharacter(id: string, direction: SourceBookWorld['characters'][string]): Character {
  const name = /^吸血鬼猎人D画风，([^，]+)，/.exec(direction.prompt)?.[1].trim();
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(id) || !name || !Array.isArray(direction.sourceFacts)
    || !direction.sourceFacts.length || direction.sourceFacts.some(fact => typeof fact !== 'string'))
    throw new Error(`ART_SOURCE_CHARACTER_INVALID:${id}`);
  return { id, name, role: '故事人物', description: direction.sourceFacts[0] };
}

/** Metadata registers identities independently of whether a main or reaction is ready. */
export function sourceBookArtMetadata(world: ArtWorldInput, book: SourceBookWorld, plans: ShortAssetPlan[]): ArtSourceMetadata {
  const current = plans.filter(plan => plan.worldId === world.id);
  const anchors = new Map(current.filter(plan => plan.kind === 'character-anchor').map(plan => [plan.nodeId, plan]));
  const characters = Object.entries(book.characters).map(([id, direction]) => {
    if (!anchors.has(anchorNodeId(id))) throw new Error(`ART_SOURCE_CHARACTER_PLAN_MISSING:${world.id}/${id}`);
    return bookCharacter(id, direction);
  });
  const known = new Set(characters.map(character => character.id));
  const supportingCharacters = characters.filter(character => !world.characters.some(authored => authored.id === character.id));
  const sceneCharacters: Record<string, string[]> = {};
  for (const plan of current) {
    const node = world.nodes[plan.nodeId], beat = book.nodes[plan.nodeId];
    if (plan.kind !== 'scene' || plan.blocked || !node || !beat
      || sourceSnapshotHash(world, node) !== beat.sourceSnapshotHash) continue;
    const ids = plan.dependencies.map(id => id.startsWith('__art_character_') ? id.slice('__art_character_'.length) : '');
    // The plans and book may have been read around an owner update; mixed revisions
    // must not invent a different cast for the unchanged story text.
    if (!Array.isArray(beat.characterIds) || ids.length !== beat.characterIds.length
      || ids.some((id, index) => !known.has(id) || id !== beat.characterIds[index]) || new Set(ids).size !== ids.length) continue;
    sceneCharacters[plan.nodeId] = ids.filter(id => supportingArtPresent(world.id, plan.nodeId, id));
  }
  return { supportingCharacters, sceneCharacters };
}

export async function buildArtSourceMetadata(root: string, worlds: ArtWorldInput[], plans: ShortAssetPlan[]): Promise<Map<string, ArtSourceMetadata>> {
  const books = new Map<string, { profile: string; worlds: Record<string, SourceBookWorld> }>();
  for (const owner of new Set(worlds.map(world => ART_WORLD_OWNERS[world.id]))) {
    if (!owner) throw new Error('ART_SOURCE_OWNER_MISSING');
    const book = JSON.parse(await readFile(path.join(root, 'output/imagegen/scene-production/art-team', owner,
      'short-production-20260907/book.json'), 'utf8'));
    if (book.profile !== 'short-production-20260907') throw new Error('ART_SOURCE_BOOK_PROFILE_MISMATCH');
    books.set(owner, book);
  }
  return new Map(worlds.map(world => {
    const book = books.get(ART_WORLD_OWNERS[world.id])?.worlds[world.id];
    if (!book) throw new Error(`ART_SOURCE_WORLD_MISSING:${world.id}`);
    return [world.id, sourceBookArtMetadata(world, book, plans)];
  }));
}
