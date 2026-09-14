import type { ArtBatch, ArtJob } from '../shared/production.ts';
import type { GameWorld } from '../shared/types.ts';
import { currentFormalPlans, verifiedNativeArt } from './workshop-art-assets.ts';
import { supportingArtCast } from './workshop-art-supporting-cast.ts';

export async function bindApprovedCharacters(world: GameWorld, batch: ArtBatch): Promise<GameWorld> {
  const result = structuredClone(world);
  delete result.artCharacters;
  for (const character of result.characters) {
    if (character.portrait?.startsWith('/generated-art/')) delete character.portrait;
    for (const expression of ['main', 'reaction'] as const) {
      if (character.portraits?.[expression]?.startsWith('/generated-art/')) delete character.portraits[expression];
    }
    if (character.portraits && !Object.keys(character.portraits).length) delete character.portraits;
  }
  if (batch.worldId !== world.id || batch.storyId !== world.storyId || batch.worldVersion !== world.version) return result;

  try {
    // Keep the original source snapshot: adding portraits changes formal scene hashes.
    const sourcePlans = await currentFormalPlans(world);
    const plans = new Map(sourcePlans.map(plan => [plan.nodeId, plan]));
    const supporting = supportingArtCast(world, sourcePlans);
    const hashes = new Set<string>(), urls = new Set<string>();
    const select = async (nodeId: string, kind: 'character-anchor' | 'character-reaction'): Promise<ArtJob | undefined> => {
      const plan = plans.get(nodeId);
      if (!plan || plan.kind !== kind || plan.blocked) return undefined;
      for (const job of batch.jobs) {
        if (job.worldId !== world.id || job.nodeId !== nodeId || job.assetKind !== kind
          || job.sourceHash !== plan.sourceHash || !job.asset
          || hashes.has(job.asset.sha256) || urls.has(job.asset.url)
          || !await verifiedNativeArt(job, 'portrait')) continue;
        hashes.add(job.asset.sha256); urls.add(job.asset.url);
        return job;
      }
      return undefined;
    };
    const seen = new Set<string>();
    for (const character of [...result.characters, ...supporting]) {
      if (seen.has(character.id)) continue;
      seen.add(character.id);
      const main = await select(`__art_character_${character.id}`, 'character-anchor');
      if (!main?.asset) continue;
      character.portrait = main.asset.url;
      character.portraits = { ...character.portraits, main: main.asset.url };
      // A reaction can supplement its own verified mother portrait, never replace it.
      const reaction = await select(`__art_reaction_${character.id}`, 'character-reaction');
      if (reaction?.asset) character.portraits.reaction = reaction.asset.url;
    }
    const approvedSupporting = supporting.filter(character => character.portraits?.main);
    if (approvedSupporting.length) result.artCharacters = approvedSupporting;
  } catch {
    // Worlds without a current formal direction retain their authored character art.
  }
  return result;
}
