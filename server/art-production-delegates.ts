import { stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ArtWorldInput } from '../shared/production.ts';
import type { SceneNode } from '../shared/types.ts';

export interface DelegatedArtDirection {
  prompt: string;
  references: string[];
  pixelSize?: '4096x2304';
  quality?: 'high';
}
export interface ArtDirectionContext { root: string; world: ArtWorldInput; node: SceneNode }

export const ART_WORLD_OWNERS: Record<string, string> = {
  'blue-blood': 'cel-drawing',
  'double-pursuit': 'cel-drawing',
  'happy-home': 'cel-drawing',
  'score-room': 'cel-drawing',
  'online-heir': 'cel-drawing',
  'red-plum': 'cel-drawing',
  'island-broadcast': 'cel-drawing',
  'future-island': 'painted-background',
  'ming-whisper': 'painted-background',
  'black-flood': 'painted-background',
  'rotten-pilgrimage': 'painted-background',
  'six-roots': 'painted-background',
  'hollow-immortals': 'painted-background',
  'wrong-realm': 'painted-background',
  'velvet-alibi': 'scene-composition',
  'radish-court': 'scene-composition',
  'harvest-box': 'scene-composition',
  'temple-heart': 'scene-composition',
  'tiger-shelter': 'scene-composition',
  'palace-ledger': 'scene-composition',
};

export async function delegatedArtDirection(context: ArtDirectionContext): Promise<DelegatedArtDirection | undefined> {
  const owner = ART_WORLD_OWNERS[context.world.id];
  if (!owner) return undefined;
  const filename = path.join(context.root, 'server/art-production-studies', `${owner}.ts`);
  let modified: number;
  try { modified = (await stat(filename)).mtimeMs; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
  const module = await import(`${pathToFileURL(filename).href}?revision=${modified}`);
  const direction = await module.buildArtDirection(context) as DelegatedArtDirection | undefined;
  if (!direction) return undefined;
  if (!direction.prompt?.trim() || !Array.isArray(direction.references)
    || direction.references.length > 6 || direction.references.some(ref => typeof ref !== 'string')
    || (direction.pixelSize && direction.pixelSize !== '4096x2304')
    || (direction.quality && (direction.quality !== 'high' || direction.pixelSize))) throw new Error('INVALID_DELEGATED_ART_DIRECTION');
  return direction;
}
