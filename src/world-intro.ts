import type { GameWorld } from '../shared/types';

export function introMechanicsDescription(world: Pick<GameWorld, 'generated' | 'mechanics' | 'resources'>) {
  const description = world.mechanics?.description;
  if (world.generated && world.resources?.length
    && description === world.resources.map(resource => `${resource.label}\uff1a${resource.description}`).join('\n')) return undefined;
  return description;
}
