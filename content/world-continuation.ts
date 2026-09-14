import type { AuthoredWorld } from './worlds.ts';
import { reviseWorldProse } from './world-prose.ts';
import { continuationCore } from './world-continuation-core.ts';
import { continuationA } from './world-continuation-a.ts';
import { continuationB } from './world-continuation-b.ts';

export const worldContinuationRevisions = { ...continuationCore, ...continuationA, ...continuationB };

export function withWorldContinuation(world: AuthoredWorld): AuthoredWorld {
  return reviseWorldProse(world, worldContinuationRevisions[world.id]);
}
