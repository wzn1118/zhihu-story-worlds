import type { AuthoredWorld } from './worlds.ts';
import { renameChoice } from './core-story-kit.ts';
import { worldProseA } from './world-prose-a.ts';
import { worldProseB } from './world-prose-b.ts';

export const worldProseRevisions: Record<string, readonly (readonly [string, string])[]> = {
  ...worldProseA, ...worldProseB,
};

export function withWorldProse(input: AuthoredWorld): AuthoredWorld {
  const entries = worldProseRevisions[input.id];
  return reviseWorldProse(input, entries);
}

export function reviseWorldProse(input: AuthoredWorld, entries?: readonly (readonly [string, string])[]): AuthoredWorld {
  if (!entries) return input;
  const replacements = new Map(entries);
  // Exact sentence matches preserve later corrections made by the route owners.
  const revise = (text: string) => replacements.get(text) ?? text;
  const world = structuredClone(input);
  world.summary = revise(world.summary);
  world.objective = revise(world.objective);
  world.introduction = world.introduction.map(revise);
  for (const character of world.characters) character.description = revise(character.description);
  if (world.mechanics) {
    world.mechanics.title = revise(world.mechanics.title);
    world.mechanics.description = revise(world.mechanics.description);
    world.mechanics.beginnerTip = revise(world.mechanics.beginnerTip);
  }
  for (const node of Object.values(world.nodes)) {
    node.title = revise(node.title);
    node.text = node.text.map(revise);
    if (node.challenge) {
      node.challenge.prompt = revise(node.challenge.prompt);
      node.challenge.hint = revise(node.challenge.hint);
    }
    for (const choice of node.choices) {
      renameChoice(node, choice.id, revise(choice.text));
      if (choice.hint) choice.hint = revise(choice.hint);
      if (choice.feedback) choice.feedback.text = revise(choice.feedback.text);
    }
    if (node.ending) {
      node.ending.title = revise(node.ending.title);
      node.ending.text = revise(node.ending.text);
    }
  }
  return world;
}
