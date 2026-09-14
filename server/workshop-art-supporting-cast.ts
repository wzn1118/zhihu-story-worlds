import type { Character, GameWorld } from '../shared/types.ts';
import type { ShortAssetPlan } from './art-production-short.ts';

// Explicit identities verified in the owner books. The worker is confined to
// the station; this does not assert that a shop worker is the same person.
const names: Record<string, Record<string, string>> = {
  'blue-blood': { trainer: '培训师', staff: '地铁工作人员' },
  'double-pursuit': { attacker: '另一位追逐者' },
  'velvet-alibi': { host: '宴会主持人', clerk: '短租楼前台' },
  'online-heir': { vendor: '夜市摊主' },
  'black-flood': { steward: '宗门执事' },
  'radish-court': { convoy_leader: '误入车队领队' },
  'tiger-shelter': { cat: '小橘', pond_worker: '御苑养鱼人', junchaoH: '君潮（人形）', junchaoT: '君潮（虎形）',
    junzhouH: '君洲（人形）', junzhouT: '君洲（虎形）', wolf: '头狼', oldwolf: '老狼', leader: '封山领队' },
  'palace-ledger': { delivery: '送货人', empress: '朱玉润' },
  'red-plum': { zhang: '张婶' },
  'island-broadcast': { zhou: '周延' },
};

export function supportingArtPresent(worldId: string, nodeId: string, characterId: string) {
  return !(worldId === 'blue-blood' && characterId === 'staff') || nodeId === 'station';
}

export function supportingArtCast(world: GameWorld, plans: ShortAssetPlan[]): Character[] {
  return Object.entries(names[world.id] ?? {}).flatMap(([id, name]) => {
    if (world.characters.some(character => character.id === id)) return [];
    const plan = plans.find(row => row.kind === 'character-anchor' && row.nodeId === `__art_character_${id}`);
    const present = plans.some(row => row.kind === 'scene' && !row.blocked && row.dependencies.includes(`__art_character_${id}`));
    if (!plan || plan.blocked || !present) return [];
    return [{ id, name, role: '故事配角', description: plan.sourceFacts[0] ?? '' }];
  });
}
