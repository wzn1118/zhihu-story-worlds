import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ArtDirectionContext, DelegatedArtDirection } from './art-production-delegates.ts';
import { ART_WORLD_OWNERS } from './art-production-delegates.ts';
import type { ArtJob } from '../shared/production.ts';

export const FILM_PROFILE = 'film-frame-20260907';
export const FILM_PREFIX = 'Vampire Hunter D: Bloodlust，动画电影正片画面。';
export const FILM_SUFFIX = '原生4K完整重绘，4096x2304横幅。';
export const FILM_REFERENCE_ROLE = '参考图只取线条和光影，人物按上述特征。';
export const FILM_REFERENCES = [
  { file: 'output/imagegen/scene-production/palace-film-refine-20260907-0032/delivery/palace-film-refine-01.png',
    sha256: '3b327ab8c06b97e46a7c8480d78a397baa2af38a558c242da756dd87eb058197' },
  { file: 'output/imagegen/scene-production/references/vhd-20260906/character-closeup.jpg',
    sha256: '5f4d2b8661beb40c7c9862b4f461ef51fec0faa28feaa46f99b7090f3900e280' },
] as const;
export const FILM_QUARANTINED = new Set([
  'scene_b6d835c0e9972b9f4ed8c9fd9dba', 'scene_e13b301274cfd1919093ac00697a',
  'scene_22c64f4c9636554b3ccb8c91905e',
]);
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export const filmSourceHash = ({ world, node }: ArtDirectionContext) =>
  digest(JSON.stringify({ worldId: world.id, node, characters: world.characters }));
export interface FilmNodeDirection { prompt: string; sourceSnapshotHash: string; sourceFacts: string[] }
export interface FilmDirectionBook { profile: string; worlds: Record<string, { nodes: Record<string, FilmNodeDirection> }> }
export interface FilmSelection {
  batchId: string; jobId: string; worldId: string; nodeId: string;
  sourceHash: string; promptHash: string; referenceHash: string;
  baseJobId?: string; correctionOf?: string;
}
export interface FilmCorrection {
  profile: string; worldId: string; nodeId: string; correctionOf: string;
  reference: { file: string; sha256: string }; direction: FilmNodeDirection;
  selection?: FilmSelection;
}
export function filmCorrectionFile(root: string, worldId: string, nodeId: string): string {
  if (![worldId, nodeId].every(id => /^[a-z0-9_-]+$/.test(id))) throw new Error('INVALID_FILM_CORRECTION_ID');
  return path.join(root, 'output/imagegen/scene-production', FILM_PROFILE, 'corrections', `${worldId}--${nodeId}.json`);
}
export async function readFilmCorrection(root: string, worldId: string, nodeId: string): Promise<FilmCorrection | undefined> {
  const correction: FilmCorrection | undefined = await readFile(filmCorrectionFile(root, worldId, nodeId), 'utf8')
    .then(JSON.parse).catch(error => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    });
  if (correction && (correction.profile !== FILM_PROFILE || correction.worldId !== worldId || correction.nodeId !== nodeId
    || !/^scene_[a-f0-9]+$/.test(correction.correctionOf)
    || correction.reference.file !== `public/generated-art/${correction.correctionOf}.png`))
    throw new Error('INVALID_FILM_CORRECTION');
  return correction;
}
export async function effectiveFilmWave(root: string) {
  const saved: { profile: string; worldCount: number; preparedAt: string; jobs: FilmSelection[] } =
    JSON.parse(await readFile(path.join(root, 'output/imagegen/scene-production', FILM_PROFILE, 'wave.json'), 'utf8'));
  const jobs = [];
  for (const row of saved.jobs) {
    const correction = await readFilmCorrection(root, row.worldId, row.nodeId);
    if (correction?.selection) {
      if (correction.correctionOf !== row.jobId || correction.selection.baseJobId !== row.jobId
        || correction.selection.correctionOf !== row.jobId) throw new Error('FILM_CORRECTION_LINEAGE_CHANGED');
      jobs.push(correction.selection);
    } else jobs.push(row);
  }
  return { ...saved, jobs };
}

export async function heldFilmJobs(root: string, rows: FilmSelection[], all: ArtJob[]): Promise<Set<string>> {
  const holds: Array<{ jobId: string; worldId: string; nodeId: string; sha256: string; reason: string }> =
    await readFile(path.join(root, 'output/imagegen/scene-production', FILM_PROFILE, 'holds.json'), 'utf8')
      .then(JSON.parse).catch(error => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw error;
      });
  const held = new Set<string>();
  for (const hold of holds) {
    const row = rows.find(row => row.jobId === hold.jobId);
    const job = all.find(job => job.id === hold.jobId);
    if (!row || !job || row.worldId !== hold.worldId || row.nodeId !== hold.nodeId || !hold.reason?.trim()
      || !job.asset?.originalPixels || job.asset.sha256 !== hold.sha256 || job.review?.decision !== 'rejected'
      || !['generated', 'resolution_mismatch'].includes(job.state)) throw new Error('FILM_HOLD_REQUIRES_KNOWN_REVIEWED_DELIVERY');
    held.add(job.id);
  }
  return held;
}

export function validateFilmDirection(row: FilmNodeDirection, sourceHash: string): void {
  if (row.sourceSnapshotHash !== sourceHash) throw new Error('FILM_SOURCE_CHANGED_REPREPARE');
  if (!row.prompt?.startsWith(FILM_PREFIX) || !row.prompt.endsWith(FILM_SUFFIX)
    || !row.prompt.includes(FILM_REFERENCE_ROLE) || row.prompt.length > 1200
    || !Array.isArray(row.sourceFacts) || !row.sourceFacts.length
    || row.sourceFacts.some(fact => typeof fact !== 'string' || !fact.trim()))
    throw new Error('INVALID_FILM_DIRECTION');
}

export async function readFilmBook(root: string, owner: string): Promise<FilmDirectionBook | undefined> {
  if (!['cel-drawing', 'painted-background', 'scene-composition'].includes(owner)) throw new Error('INVALID_FILM_OWNER');
  let book: FilmDirectionBook;
  try { book = JSON.parse(await readFile(path.join(root, 'output/imagegen/scene-production/art-team', owner,
    FILM_PROFILE, 'directions.json'), 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
  if (book.profile !== FILM_PROFILE || !book.worlds) throw new Error('INVALID_FILM_BOOK');
  const enabled = await readFile(path.join(root, 'output/imagegen/scene-production', FILM_PROFILE, 'expansion.json'), 'utf8')
    .then(JSON.parse).catch(error => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    });
  if (enabled) {
    const bytes = await readFile(path.join(root, 'output/imagegen/scene-production/art-team', owner,
      FILM_PROFILE, 'expansion-directions.json'));
    if (enabled.profile !== FILM_PROFILE || enabled.owners?.[owner]?.sha256 !== digest(bytes))
      throw new Error('FILM_EXPANSION_CHANGED_REPREPARE');
    const expanded: FilmDirectionBook = JSON.parse(bytes.toString('utf8'));
    if (expanded.profile !== FILM_PROFILE) throw new Error('INVALID_FILM_EXPANSION');
    for (const [worldId, world] of Object.entries(book.worlds))
      for (const [nodeId, node] of Object.entries(world.nodes))
        if (JSON.stringify(expanded.worlds[worldId]?.nodes[nodeId]) !== JSON.stringify(node))
          throw new Error('FILM_FIRST_WAVE_CHANGED');
    return expanded;
  }
  return book;
}

export async function filmReferences(root: string): Promise<string[]> {
  const result = [];
  for (const reference of FILM_REFERENCES) {
    const file = path.join(root, reference.file);
    if (digest(await readFile(file)) !== reference.sha256) throw new Error('FILM_REFERENCE_CHANGED');
    result.push(file);
  }
  return result;
}

export async function buildFilmDirection(context: ArtDirectionContext, owner: string): Promise<DelegatedArtDirection | undefined> {
  const book = await readFilmBook(context.root, owner);
  const correction = await readFilmCorrection(context.root, context.world.id, context.node.id);
  const row = correction?.direction ?? book?.worlds[context.world.id]?.nodes[context.node.id];
  if (!row) return undefined;
  validateFilmDirection(row, filmSourceHash(context));
  const references = await filmReferences(context.root);
  if (correction) {
    const file = path.join(context.root, correction.reference.file);
    if (digest(await readFile(file)) !== correction.reference.sha256) throw new Error('FILM_CORRECTION_REFERENCE_CHANGED');
    references.unshift(file);
  }
  return { prompt: row.prompt, references };
}

export async function verifyFilmGate(root: string): Promise<void> {
  const gate = JSON.parse(await readFile(path.join(root, 'output/imagegen/scene-production', FILM_PROFILE, 'gate.json'), 'utf8'));
  if (gate.profile !== FILM_PROFILE || gate.mode !== 'reviewed-pairs'
    || gate.pilot?.decision !== 'approved-internal' || gate.pilot.sha256 !== FILM_REFERENCES[0].sha256
    || gate.userPreference !== '皇后更接近' || gate.maxConcurrentPaid !== 2) throw new Error('FILM_GATE_NOT_REVIEWED');
  await filmReferences(root);
  const png = await readFile(path.join(root, FILM_REFERENCES[0].file));
  if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
    || png.readUInt32BE(16) !== 4096 || png.readUInt32BE(20) !== 2303) throw new Error('FILM_PILOT_DIMENSIONS_CHANGED');
  const review = await readFile(path.join(root,
    'output/imagegen/scene-production/palace-film-refine-20260907-0032/independent-review.md'), 'utf8');
  if (!review.includes('PASS: INTERNAL') || !review.includes(gate.pilot.sha256)) throw new Error('FILM_REVIEW_EVIDENCE_MISSING');
}

export function validateFilmDispatch(all: ArtJob[], selected: ArtJob[], previous: ArtJob[],
  corrections: Record<string, string> = {}): void {
  if (!selected.length || selected.length > 2 || new Set(selected.map(job => job.worldId)).size !== selected.length)
    throw new Error('FILM_DISTINCT_ONE_OR_TWO_REQUIRED');
  if (all.filter(job => job.state === 'generating').length + selected.length > 2) throw new Error('GLOBAL_TWO_REQUEST_LIMIT');
  if (all.some(job => ['unknown_outcome', 'recoverable'].includes(job.state)
    && !(FILM_QUARANTINED.has(job.id) && job.state === 'unknown_outcome' && job.paidAttempts === 1 && !job.recoveryAvailable)))
    throw new Error('NEW_UNCERTAINTY_REQUIRES_INSPECTION');
  if (previous.some(job => !job.asset?.native4k || job.asset.duplicate || job.stale || job.review?.decision !== 'approved'))
    throw new Error('PREVIOUS_FILM_DELIVERIES_REQUIRE_APPROVAL');
  for (const job of selected) {
    if (job.state !== 'queued' || job.stale || job.paidAttempts || job.asset) throw new Error('UNTOUCHED_FILM_JOB_REQUIRED');
    const priorPaid = all.filter(prior => prior.worldId === job.worldId && prior.nodeId === job.nodeId && prior.paidAttempts > 0);
    const knownCorrection = priorPaid.length === 1 && priorPaid[0].id === corrections[job.id]
      && priorPaid[0].asset?.originalPixels && priorPaid[0].review?.decision === 'rejected'
      && ['generated', 'resolution_mismatch'].includes(priorPaid[0].state);
    if (priorPaid.length && !knownCorrection)
      throw new Error('PREVIOUSLY_PAID_SCENE_EXCLUDED');
  }
}

export async function guardFilmRun(root: string, worldId: string, jobIds: string[] | undefined,
  maxJobs: number, all: Array<ArtJob & { prompt: string; references: string[] }>): Promise<void> {
  if (!all.some(job => !job.stale && job.worldId === worldId && (!jobIds || jobIds.includes(job.id))
    && job.prompt.startsWith(FILM_PREFIX))) return;
  if (!jobIds?.length || jobIds.length > 2 || maxJobs > jobIds.length)
    throw new Error('FILM_EXACT_SELECTION_REQUIRED');
  const folder = path.join(root, 'output/imagegen/scene-production', FILM_PROFILE);
  const wave = await effectiveFilmWave(root).catch(() => {
    throw new Error('FILM_WAVE_REQUIRED');
  });
  if (wave.profile !== FILM_PROFILE || !Array.isArray(wave.jobs)) throw new Error('INVALID_FILM_WAVE');
  const held = await heldFilmJobs(root, wave.jobs, all);
  for (const id of jobIds) {
    if (held.has(id)) throw new Error('FILM_NODE_HELD');
    const row = wave.jobs.find((row: { jobId: string }) => row.jobId === id);
    const job = all.find(job => job.id === id && job.worldId === worldId);
    if (!row || !job || job.stale) throw new Error('FILM_FROZEN_SELECTION_REQUIRED');
    const intent = await readFile(path.join(folder, 'runs', `${id}.intent.json`), 'utf8').then(JSON.parse).catch(() => {
      throw new Error('FILM_DISPATCH_INTENT_REQUIRED');
    });
    const pair = intent.selected;
    if (intent.profile !== FILM_PROFILE || !Array.isArray(pair) || !pair.length || pair.length > 2
      || new Set(pair.map((item: { worldId: string }) => item.worldId)).size !== pair.length
      || !pair.some((item: { jobId: string }) => item.jobId === id)) throw new Error('INVALID_FILM_DISPATCH_INTENT');
    const same = pair.find((item: { jobId: string }) => item.jobId === id);
    for (const key of ['worldId', 'nodeId', 'sourceHash', 'promptHash', 'referenceHash'] as const)
      if (same[key] !== job[key] || row[key] !== job[key]) throw new Error('FILM_FROZEN_SELECTION_CHANGED');
    if (row.correctionOf) {
      const parent = all.find(parent => parent.id === row.correctionOf);
      if (same.correctionOf !== row.correctionOf || !parent?.asset?.originalPixels || parent.review?.decision !== 'rejected'
        || !['generated', 'resolution_mismatch'].includes(parent.state)) throw new Error('FILM_CORRECTION_REQUIRES_KNOWN_REVIEWED_IMAGE');
    }
    const prior = all.filter(prior => prior.paidAttempts > 0
      && wave.jobs.some((item: { jobId: string }) => item.jobId === prior.id)
      && !held.has(prior.id)
      && !pair.some((item: { jobId: string }) => item.jobId === prior.id));
    if (prior.some(prior => prior.stale || !prior.asset?.native4k || prior.asset.duplicate || prior.review?.decision !== 'approved'))
      throw new Error('PREVIOUS_FILM_DELIVERIES_REQUIRE_APPROVAL');
    const { authoredWorlds } = await import(pathToFileURL(path.join(root, 'content/worlds.ts')).href);
    const world = authoredWorlds.find((world: ArtDirectionContext['world']) => world.id === worldId);
    const node = world?.nodes[job.nodeId];
    if (!world || !node) throw new Error('FILM_SOURCE_NODE_MISSING');
    const direction = await buildFilmDirection({ root, world, node }, ART_WORLD_OWNERS[worldId]);
    if (!direction || direction.prompt !== job.prompt
      || JSON.stringify(direction.references.map(ref => path.resolve(ref))) !== JSON.stringify(job.references.map(ref => path.resolve(ref))))
      throw new Error('FILM_DIRECTION_CHANGED_REPREPARE');
    const { buildSceneBrief } = await import('./art-production-prompts.ts');
    const current = await buildSceneBrief(root, world, node);
    if (current.sourceHash !== job.sourceHash || current.referenceHash !== job.referenceHash || digest(current.prompt) !== job.promptHash)
      throw new Error('FILM_SOURCE_OR_REFERENCE_CHANGED');
  }
  await verifyFilmGate(root);
}
