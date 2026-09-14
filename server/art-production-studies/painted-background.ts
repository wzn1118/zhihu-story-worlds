import path from 'node:path';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { ArtDirectionContext, DelegatedArtDirection } from '../art-production-delegates.ts';
import { vhdReferences } from '../art-production-references.ts';
import { buildFilmDirection } from '../art-production-film.ts';

export const COHORT_DIRECTIONS = {
  'future-island': { nodeId: 'island_plan' },
  'rotten-pilgrimage': { nodeId: 'escape' },
  'ming-whisper': { nodeId: 'summons' },
  'black-flood': { nodeId: 'selection' },
  'six-roots': { nodeId: 'arrival' },
  'hollow-immortals': { nodeId: 'arrival' },
  'wrong-realm': { nodeId: 'arrival' },
} as const;

export interface PaintedNodeDirection {
  cast: string[];
  scene: string;
  selfContained?: true;
  editTarget?: { path: string; sha256: string };
}
export interface PaintedWorldDirections {
  worldId: string;
  palette: string;
  nodes: Record<string, PaintedNodeDirection>;
}
interface Identity { name: string; role: string; anchors: string[] }
interface IdentityBook { worlds: Record<string, { characters: Record<string, Identity> }> }
interface CompactIdentityBook { worlds: Record<string, Record<string, Omit<Identity, 'name'>>> }
interface SourceSnapshot { nodes: Array<{ id: string; exactNodeHash: string }> }
interface NamedStyleBook { worldId: string; nodes: Record<string, { prompt: string }> }
export const PAINTED_NAMED_STYLE_PREFIX = '吸血鬼猎人D（2001年动画电影）画风';
export const PAINTED_QUARANTINED_NODES = ['rotten-pilgrimage/old_master'] as const;

const PAINTED_MATERIALS: Record<keyof typeof COHORT_DIRECTIONS, string> = {
  'future-island': 'Pacific-island working refuge: pale concrete, marine-green steel, charcoal machinery, timber and green ridges. Physical video screens contain remote participants. Lamps stay local; no floating interface or magic coin.',
  'rotten-pilgrimage': 'Mythic stone gates, vermilion timber, pale robes and blue-gray clouds; coastal turquoise water and bright greenery. Undersea stone is broadly painted, without glossy caustics. White coverings remain simple opaque shapes.',
  'ming-whisper': 'Late-Ming courtyards, oxblood lacquer, cool gray brick, pale plaster, rain-dark timber and dull iron. Courtyard daylight and sheltered oil lamps motivate light. Physical documents, no modern clothes or gold spectacle.',
  'black-flood': 'Sect cloisters, pale spring stone, living green banks and turquoise rivers. Keep Black in the explicitly staged serpent or human form, never both. Cel creatures have broad scale or feather groups.',
  'six-roots': 'Mountain sect: worn plank platforms, chalk-white plaster, dark posts and moss-green stone. Distinguish fresh wood breaks, iron and medicinal pottery. Wrap injuries modestly; inscriptions are physical indistinct marks, not interfaces.',
  'hollow-immortals': 'Pale sect plaster, rosewood lattice, aged copper, stream-cut stone and local furnace fires; later ordinary carpentry and green fields. Guan retains his white disciple robe. Strange presences remain opaque and partly occluded.',
  'wrong-realm': 'Mountain stone, timber desks and pale plaster contrast with one compact technical cold case. Later clay medicine pots, green slopes and plain inns. System voices remain unseen; no warehouse overlay or gunfire.',
};

export async function buildArtDirection(context: ArtDirectionContext): Promise<DelegatedArtDirection | undefined> {
  const film = await buildFilmDirection(context, 'painted-background');
  if (film) return film;
  const { root, world, node } = context;
  if (!(world.id in COHORT_DIRECTIONS)) return undefined;
  const ownerRoot = path.join(root, 'output/imagegen/scene-production/art-team/painted-background');
  const worldRoot = path.join(ownerRoot, 'batch-vhd', world.id);
  let directions: PaintedWorldDirections;
  try {
    directions = JSON.parse(await readFile(path.join(worldRoot, 'directions.json'), 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
  const direction = directions.nodes[node.id];
  if (!direction) return undefined;
  if (directions.worldId !== world.id || !direction.scene.trim() || direction.cast.length === 0) {
    throw new Error(`PAINTED_INVALID_NODE_DIRECTION_${world.id}_${node.id}`);
  }
  if (direction.editTarget && !direction.selfContained) {
    throw new Error(`PAINTED_EDIT_REQUIRES_EXPLICIT_REFERENCE_ROLES_${world.id}_${node.id}`);
  }
  // Each staged moment was read against a frozen actual source, never a generated node.
  const source: SourceSnapshot = JSON.parse(await readFile(path.join(worldRoot, 'source-nodes.json'), 'utf8'));
  const actualHash = createHash('sha256').update(JSON.stringify(node)).digest('hex');
  if (source.nodes.find(record => record.id === node.id)?.exactNodeHash !== actualHash) {
    throw new Error(`PAINTED_SOURCE_CHANGED_${world.id}_${node.id}`);
  }
  const book: IdentityBook = JSON.parse(await readFile(path.join(ownerRoot, 'cohort/identities.json'), 'utf8'));
  const originalCast = direction.cast.map(id => {
    const identity = book.worlds[world.id]?.characters[id];
    if (!identity || identity.anchors.length < 5) throw new Error(`PAINTED_IDENTITY_MISSING_${world.id}_${id}`);
    return identity;
  });

  // Unknown paid history keeps its old immutable direction; new dispatch lists exclude it.
  if (!PAINTED_QUARANTINED_NODES.some(id => id === `${world.id}/${node.id}`)) {
    let selected: NamedStyleBook | undefined;
    try {
      selected = JSON.parse(await readFile(path.join(ownerRoot, 'v1-selected-20260906/directions', `${world.id}.json`), 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const selectedDirection = selected?.nodes[node.id];
    if (selectedDirection) {
      if (selected!.worldId !== world.id || !selectedDirection.prompt.endsWith('吸血鬼猎人D画风。')) {
        throw new Error(`PAINTED_V1_SELECTED_INVALID_${world.id}_${node.id}`);
      }
      return { references: [], prompt: selectedDirection.prompt };
    }
    let named: NamedStyleBook | undefined;
    try {
      named = JSON.parse(await readFile(path.join(ownerRoot, 'named-style-20260906/directions', `${world.id}.json`), 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const namedDirection = named?.nodes[node.id];
    if (namedDirection) {
      if (named!.worldId !== world.id || !namedDirection.prompt.startsWith(PAINTED_NAMED_STYLE_PREFIX)) {
        throw new Error(`PAINTED_NAMED_STYLE_INVALID_${world.id}_${node.id}`);
      }
      return { references: vhdReferences(root), quality: 'high', prompt: namedDirection.prompt };
    }
  }

  // An explicitly directed compact single-character study already carries its source and anchors.
  if (direction.selfContained) {
    const words = direction.scene.trim().split(/\s+/).length;
    if (direction.cast.length !== 1 || words < 220 || words > 350) {
      throw new Error(`PAINTED_COMPACT_DIRECTION_INVALID_${world.id}_${node.id}`);
    }
    let references = vhdReferences(root);
    if (direction.editTarget) {
      const filename = path.resolve(root, direction.editTarget.path);
      const local = path.relative(worldRoot, filename);
      if (!local || local.startsWith(`..${path.sep}`) || path.isAbsolute(local) || path.extname(local) !== '.png') {
        throw new Error(`PAINTED_EDIT_TARGET_OUTSIDE_WORLD_${world.id}_${node.id}`);
      }
      const hash = createHash('sha256').update(await readFile(filename)).digest('hex');
      if (hash !== direction.editTarget.sha256) {
        throw new Error(`PAINTED_EDIT_TARGET_CHANGED_${world.id}_${node.id}`);
      }
      references = vhdReferences(root, [filename]);
    }
    return { references, quality: 'high', prompt: direction.scene };
  }

  const compact: CompactIdentityBook = JSON.parse(await readFile(path.join(ownerRoot, 'batch-vhd/compact-identities.json'), 'utf8'));
  const cast = direction.cast.map((id, index) => {
    const identity = compact.worlds[world.id]?.[id];
    if (!identity?.role || identity.anchors.length !== 6) {
      throw new Error(`PAINTED_COMPACT_IDENTITY_MISSING_${world.id}_${id}`);
    }
    return `${id} / ${originalCast[index].name}, adult ${identity.role}: ${identity.anchors.join('; ')}.`;
  }).join('\n');

  return {
    references: vhdReferences(root),
    quality: 'high',
    prompt: [
      'Draw one complete original scene at native 4096 x 2304, 16:9. Images 1/2 supply cel drawing; image 3 supplies background painting. Borrow no reference person, costume or composition.',
      `Scene ${world.id}/${node.id}: ${direction.scene}`,
      `Original cast; designs are not lettering:\n${cast}\nExplicit scene chronology overrides starting ages or equipment; remote speakers remain inside their stated device.`,
      PAINTED_MATERIALS[world.id as keyof typeof COHORT_DIRECTIONS],
      'Keep principal heads whole, hands attached and contacts supported. Preserve the directed near/middle/far perspective and motivated light. Draw tapered strong outer contours and fine eyelid, nostril and mouth lines. Use a clean opaque flesh plane and one cool hard shadow following each distinct skull; retain sclera and nasal underside. Hair is grouped, clothing solid with sparse hard folds. No character grain, brush scuffs, continuous tones or beauty gloss. Paint local background materials broadly; no CG finish, blur, bloom, global fog, montage or readable lettering.',
    ].join('\n\n'),
  };
}
