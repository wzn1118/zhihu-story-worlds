import path from 'node:path';
import { readFile } from 'node:fs/promises';
import type { ArtDirectionContext, DelegatedArtDirection } from '../art-production-delegates.ts';
import { vhdReferences } from '../art-production-references.ts';
import { buildFilmDirection } from '../art-production-film.ts';

interface CohortDirection {
  setting: string;
  cast: Record<string, string>;
  shots: Record<string, [string[], string]>;
}

export const CEL_WORLD_IDS = [
  'blue-blood', 'double-pursuit', 'happy-home', 'score-room',
  'online-heir', 'red-plum', 'island-broadcast',
];

export async function buildArtDirection({ root, world, node }: ArtDirectionContext): Promise<DelegatedArtDirection | undefined> {
  const film = await buildFilmDirection({ root, world, node }, 'cel-drawing');
  if (film) return film;
  if (world.id === 'blue-blood' && node.id === 'zhang') {
    const calibration = JSON.parse(await readFile(path.join(root,
      'output/imagegen/scene-production/art-team/cel-drawing/v1-selected-20260906/ready.json'), 'utf8'));
    return { references: [], prompt: calibration.prompt };
  }
  if (world.id === 'double-pursuit' && node.id === 'ending_pursuit_loss') {
    return {
      quality: 'high',
      references: vhdReferences(root),
      prompt: [
        'Draw one complete original 16:9 animation scene at native 4096 x 2304. Reference images 1 and 2 supply pencil-cleanup line hierarchy and opaque cel color; image 3 supplies painted-background technique. Borrow no reference character, costume or setting.',
        'In double-pursuit / ending_pursuit_loss, Zhang Dongdong has bought a bed with his first new paycheck and placed it beside the window. Late-afternoon light falls onto the pillow. He sits on the bed, leaning his shoulders into that pillow, quietly resting for a long time. Only Dongdong appears. This sparse ordinary room is the present scene, not the earlier rooftop rescue or an exterior dawn.',
        'He is a 26-year-old man with a medium-broad forehead, short layered black hair, a shallow center break and compact sides above his ears. Preserve his narrow tired eyes with readable sclera, straight firm nose, compact adult jaw and rounded-square chin. He wears a matte black winter jacket, hood down, maroon lining and charcoal trousers. His mouth is relaxed and closed.',
        'Compose an eye-level medium view diagonally across the bed. Keep his entire head, normal shoulder proportions and both hands inside the frame. His hands rest loosely on his thighs without a phone or gesture. The pillow supports his back; mattress compression establishes his weight. Window, bed frame and restrained wall planes make a believable small room.',
        'Draw tapered strong outer contours, quieter anatomical lines and fine eyelid, nostril and mouth marks. Paint the face in exactly two opaque colors: a clean light flesh plane and one connected cool-gray hard shadow following the cheek and jaw into the neck. No facial gradients or beauty gloss. Group short hair into near-black masses. Black clothing uses only a few distinct cool hard fold planes. Keep skin and clothing untextured. Confine visible paint strokes to the room and bedding; a small warm sunlight patch on the pillow contrasts with the cooler walls.',
      ].join('\n\n'),
    };
  }
  if (!CEL_WORLD_IDS.includes(world.id)) return undefined;
  const catalog = JSON.parse(await readFile(path.join(root,
    'output/imagegen/scene-production/art-team/cel-drawing/cohort-direction.json'), 'utf8')) as Record<string, CohortDirection>;
  const direction = catalog[world.id];
  const shot = direction?.shots[node.id];
  if (!direction || !shot) return undefined;
  const [cast, staging] = shot;
  const identities = cast.map(id => {
    const identity = direction.cast[id];
    if (!identity) throw new Error('MISSING_CEL_CAST:' + world.id + '/' + node.id + '/' + id);
    return identity;
  });
  return {
    quality: 'high',
    references: vhdReferences(root, world.id === 'blue-blood'
      ? ['output/imagegen/fang-nuo-main-integrated-v3/fang-nuo-main.png'] : []),
    prompt: [
      'Draw one complete original 16:9 animation scene at native 4096 x 2304. References 1 and 2 supply pencil-cleanup line hierarchy and opaque cel color; reference 3 supplies painted-background technique. Borrow no reference character, costume, room or camera layout.',
      'SCENE: ' + world.title + ' / ' + node.id + ' / ' + node.title + '. Setting: ' + direction.setting,
      'MOMENT AND COMPOSITION: ' + staging,
      'ORIGINAL CAST: ' + identities.join('\n') + (world.id === 'blue-blood'
        ? '\nReference 4 fixes Fang Nuo identity only. Retain her actual hair part, face proportions and clothing anchors; adapt pose to this moment.' : ''),
      'Use strong tapered outer contours, quieter anatomical lines and fine eyelid, nostril and mouth marks. Preserve the distinct written ages, skulls, skin tones and builds. Paint each face as a clean opaque flesh plane and a connected hard shadow shaped by this shot\'s light; retain readable eyes. Group hair into deliberate masses. Clothing keeps its specified local colors in large closed fills with few hard fold planes. Keep characters untextured, without gradients or beauty gloss. Clear light-shadow separation does not require a dark background.',
      'Keep the indicated action, sightlines and supported props readable. Normal adult shoulders, arms and palms; complete heads and action hands inside the frame. Respect natural occlusion and scene-specific clothing changes. Remote speakers remain off-screen; show only this selected moment, not a montage. Paint the actual architecture, terrain and material texture on the background layer, with grounded body and object contact. Keep lighting appropriate to the story, not copied from the references. No painted UI, captions or watermark.',
    ].join('\n\n'),
  };
}
