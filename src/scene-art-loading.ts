import type { GameWorld, SceneNode } from '../shared/types';
import { sceneCharacterPresentation } from './scene-character-art';
import { hasSceneArtHold } from './scene-art-holds';
import { versionedArtUrl } from './live-published-art';

/** Read only the selected scene; never advance Ink or warm every branch. */
export function sceneArtSources(world: GameWorld, node: SceneNode | undefined, text?: string): string[] {
  if (!node) return [];
  const background = node.background || world.background;
  if (hasSceneArtHold(world.id, node.id, background)) return [];
  const presentation = sceneCharacterPresentation(world, node, text);
  const portrait = presentation?.sources[0];
  const revision = Object.values(presentation?.character.stagePortraits ?? {}).find(item => item.url === portrait)?.sha256;
  return [...new Set([background, portrait && versionedArtUrl(portrait, revision)].filter((url): url is string => Boolean(url)))];
}

export function upcomingSceneArt(world: GameWorld, node: SceneNode, paragraphs: string[], paragraphIndex: number,
  nextNodeId?: string): string[] {
  const current = new Set(sceneArtSources(world, node, paragraphs[paragraphIndex]));
  // Only the next change of actor in this scene, followed by an intended destination.
  const nextPortrait = paragraphs.slice(paragraphIndex + 1).map(text => sceneArtSources(world, node, text)
    .filter(source => !current.has(source))).find(sources => sources.length) ?? [];
  return [...new Set([...nextPortrait, ...sceneArtSources(world, nextNodeId ? world.nodes[nextNodeId] : undefined)])]
    .filter(source => !current.has(source)).slice(0, 3);
}
