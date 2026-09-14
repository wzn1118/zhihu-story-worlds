import type { GameWorld } from './types.ts';

/** Stable across runtime artwork decoration, but sensitive to story/cast edits. */
export function artBindingSource(world: GameWorld): string {
  const { nodes, characters } = world;
  const cleanCharacter = ({ portrait: _portrait, portraits: _portraits, stagePortraits: _stage, ...rest }: GameWorld['characters'][number]) => rest;
  const source = { id: world.id, storyId: world.storyId, version: world.version,
    source: world.source, summary: world.summary, adaptation: world.adaptation,
    characters: characters.map(cleanCharacter),
    nodes: Object.fromEntries(Object.entries(nodes).map(([id, { background: _background, backgroundArtKind: _kind, artSceneVariants: _variants, stageCharacter: _stage, ...node }]) => [id, node])) };
  const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
    : value && typeof value === 'object' ? `{${Object.entries(value).filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
      : JSON.stringify(value) ?? 'null';
  return canonical(source);
}
