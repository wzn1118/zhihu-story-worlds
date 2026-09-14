import type { GameWorld } from './types';
import baseline from './generated-copy/seventh-second.baseline.json';
import { seventhSecondCopy } from './generated-copy/seventh-second';
import { visitWorkshopProse } from './workshop-prose-fields';

// Exact baseline matching also preserves newer causal revisions from the story editor.
const sampleId = 'import-6febc2f6-3a12-41ac-bae5-6d05ebc68c10';

export function withReviewedWorkshopCopy(world: GameWorld): GameWorld {
  if (world.storyId !== sampleId || world.generated?.projectId !== sampleId) return world;
  const revised = structuredClone(world);
  let changes = 0;
  visitWorkshopProse(revised, (path, text) => {
    const previous = (baseline as Record<string, string>)[path], next = seventhSecondCopy[path];
    if (next === undefined || text !== previous || next === text) return text;
    changes++;
    return next;
  });
  if (!changes) return world;
  revised.ink = world.ink;
  revised.source = world.source;
  revised.sourcePassages = world.sourcePassages;
  return revised;
}
