import path from 'node:path';

export const VHD_REFERENCE_REVISION = 'vhd-user-frames-20260906';
export const VHD_REFERENCE_FILES = [
  'output/imagegen/scene-production/references/vhd-20260906/character-silhouette.jpg',
  'output/imagegen/scene-production/references/vhd-20260906/character-closeup.jpg',
  'output/imagegen/scene-production/references/vhd-20260906/painted-valley.jpg',
] as const;

export function vhdReferences(root: string, identityReferences: string[] = []): string[] {
  const references = [...VHD_REFERENCE_FILES, ...identityReferences].map(ref => path.resolve(root, ref));
  const unique = [...new Set(references)];
  if (unique.length > 6) throw new Error('MAX_SIX_ART_REFERENCES');
  return unique;
}

export const VHD_REFERENCE_DIRECTION = `ACTUAL USER FRAME STUDIES, ${VHD_REFERENCE_REVISION}: Images 1 and 2 are Vampire Hunter D animation frames for DRAWING AND CEL PAINT ONLY. Image 1 demonstrates large near-black silhouette masses, sparse cold blue-gray hard cloth planes, and selective contour lines. Image 2 demonstrates an adult constructed nose, asymmetric narrow eyelids with readable sclera, an articulated cheek/jaw, and a large pale face plane against a deliberately placed cold-gray hard shadow. Inner mouth/nostril lines are much finer than the outer silhouette. Use closed clean opaque color regions; one main hard shadow per material, at most a second overlap shadow. Determine shadows from each shot's physical light and anatomy, not an identical triangular cheek mark on every person. Avoid stretching every skull or making every eye a black slit. Preserve different ages, jaw widths, skin tones and body builds.

Image 3 is a BACKGROUND PAINTING study: bright saturated green terrain, broad directional opaque brush marks, selective details and clearly composed foreground/middle/distant planes. This establishes that backgrounds can be luminous and colored, not uniformly dark, brown or fogged. Translate the paper-painted technique to the story's actual architecture, weather and materials; do not insert this valley into an indoor story. Characters remain smooth untextured cels over that painted layer. Clothing has large unbroken black/red fills and only useful hard fold planes; no brushed gradients, shiny skin, cloth grain or decorative all-over rim light. A localized hard metal gleam may have a physical cause; skin does not inherit it.

Any later references supply ORIGINAL CAST IDENTITY ONLY, not their previous rendering style. Never import the film character, hat, mount, weapon, costume or shot layout into this story. Compose a new source-specific moment. Render new native 4096 x 2304 pixels, not a resized reference, tracing, crop, composite, collage or texture-filtered old output.`;
