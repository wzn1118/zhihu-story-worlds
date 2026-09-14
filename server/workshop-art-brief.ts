import type { ArtDirectionContext, DelegatedArtDirection } from './art-production-delegates.ts';
import { workshopImageStyle } from './workshop-art-direction.ts';
import { isImportedId } from '../shared/workshop.ts';

/** Art-owner integration point. Missing legacy briefs stop here, never fall back to a wrapper. */
export function buildWorkshopArtDirection({ world, node }: ArtDirectionContext): DelegatedArtDirection | undefined {
  if (!isImportedId(world.storyId)) return undefined;
  const prompt = node.artBrief;
  if (typeof prompt !== 'string' || prompt !== prompt.trim() || prompt.length < 40 || prompt.length > 240
    || /[\r\n]/.test(prompt) || !prompt.replace(/。$/, '').endsWith(workshopImageStyle)
    || /2001\s*(?:年|版)?\s*(?:电影|动画|吸血鬼猎人D)|16\s*:\s*9|4[Kk]|\d{3,}\s*[x×]\s*\d{3,}|参考图|平涂|去纹理|负面|线宽|阴影比例|negative|references?:/i.test(prompt)) {
    throw new Error(`WORKSHOP_V1_BRIEF_REQUIRED: ${world.id}/${node.id}`);
  }
  return { prompt, references: [] };
}
