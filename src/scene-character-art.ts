import type { Character, GameWorld, SceneNode } from '../shared/types';
import { approvedStagePortrait, sceneCounterpart, sceneCutoutCandidates } from './character-cutouts';

// These authored cutouts have been decoded and visually checked with transparency.
// Production mothers and reactions are complete reference images, not stage cutouts.
const stageCutouts = new Set(['/assets/fang-nuo-main.webp', '/assets/fang-nuo-reaction.webp']);

export function scenePortraitSources(character: Character | undefined, expression: 'main' | 'reaction', background?: string,
  backgroundArtKind?: 'scene' | 'environment'): string[] {
  // A generated scene already contains its own composition and cast.
  if (backgroundArtKind === 'scene' || (background?.startsWith('/generated-art/') && backgroundArtKind !== 'environment')) return [];
  const stage = [character?.stagePortraits?.[expression], character?.stagePortraits?.main, character?.stagePortraits?.reaction]
    .filter(approvedStagePortrait).map(portrait => portrait.url);
  return Array.from(new Set([
    ...stage, ...[character?.portraits?.[expression], character?.portraits?.main, character?.portrait]
      .filter((source): source is string => Boolean(source && stageCutouts.has(source))),
  ]));
}

export type SceneCharacterPresentation = {
  character: Character; expression: 'main' | 'reaction'; position: 'left' | 'right' | 'center'; sources: string[];
};

/** Resolve the visible actor without rewriting authored cast or borrowing off-scene art. */
export function sceneCharacterPresentation(world: GameWorld, node: SceneNode, currentText = node.text[0] ?? ''): SceneCharacterPresentation | null {
  if (node.ending) return null;
  const background = node.background || world.background;
  const cast = [...world.characters, ...(world.artCharacters ?? [])];
  const present = (character: Character | undefined): SceneCharacterPresentation | null => {
    if (!character) return null;
    const placement = [node.character, node.stageCharacter].find(value => value?.id === character.id);
    const expression = placement?.expression ?? 'main';
    const sources = scenePortraitSources(character, expression, background, node.backgroundArtKind);
    return sources.length ? { character, expression, position: placement?.position ?? 'left', sources } : null;
  };
  const speaker = cast.filter(character => character.name === node.speaker);
  const primary = present(speaker.length === 1 ? speaker[0] : undefined)
    ?? present(cast.find(character => character.id === node.character?.id));
  if (primary) return primary;
  const candidates = sceneCutoutCandidates(world, node)
    .filter(character => character.id !== 'player' && character.name !== world.player.name);
  return present(sceneCounterpart(candidates, node, currentText));
}
