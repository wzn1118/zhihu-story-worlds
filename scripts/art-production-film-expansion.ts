import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { authoredWorlds } from '../content/worlds.ts';
import { ART_WORLD_OWNERS } from '../server/art-production-delegates.ts';
import { FILM_PROFILE, effectiveFilmWave, filmSourceHash, validateFilmDirection, type FilmDirectionBook } from '../server/art-production-film.ts';
import { listArtBatches, prepareArtBatch } from '../server/art-production.ts';
import { sha256 } from '../server/art-production-prompts.ts';
import { replaceArtFile } from '../server/art-production-files.ts';

const root = process.cwd();
const folder = path.join(root, 'output/imagegen/scene-production', FILM_PROFILE);
const command = process.argv[2] ?? 'audit';
if (!['audit', 'prepare'].includes(command)) throw new Error('Usage: audit | prepare (zero paid requests)');
const wave = await effectiveFilmWave(root);
const history = (await listArtBatches()).flatMap(batch => batch.jobs);
const books = new Map<string, FilmDirectionBook>();
const owners: Record<string, { sha256: string; worlds: number; nodes: number }> = {};
for (const owner of new Set(Object.values(ART_WORLD_OWNERS))) {
  const directory = path.join(root, 'output/imagegen/scene-production/art-team', owner, FILM_PROFILE);
  const original: FilmDirectionBook = JSON.parse(await readFile(path.join(directory, 'directions.json'), 'utf8'));
  const binary = await readFile(path.join(directory, 'expansion-directions.json'));
  const expanded: FilmDirectionBook = JSON.parse(binary.toString('utf8'));
  if (expanded.profile !== FILM_PROFILE) throw new Error('INVALID_FILM_EXPANSION_PROFILE');
  for (const [worldId, world] of Object.entries(expanded.worlds)) {
    if (ART_WORLD_OWNERS[worldId] !== owner || Object.keys(world.nodes).length < 30)
      throw new Error('FILM_EXPANSION_OWNER_OR_MINIMUM');
    for (const [nodeId, node] of Object.entries(original.worlds[worldId]?.nodes ?? {}))
      if (JSON.stringify(world.nodes[nodeId]) !== JSON.stringify(node)) throw new Error('FILM_FIRST_WAVE_CHANGED');
  }
  books.set(owner, expanded);
  owners[owner] = { sha256: sha256(binary), worlds: Object.keys(expanded.worlds).length,
    nodes: Object.values(expanded.worlds).reduce((sum, world) => sum + Object.keys(world.nodes).length, 0) };
}
const plans = authoredWorlds.map(world => {
  const book = books.get(ART_WORLD_OWNERS[world.id]);
  const nodes = book?.worlds[world.id]?.nodes;
  if (!nodes || Object.keys(nodes).length < 30) throw new Error(`FILM_EXPANSION_WORLD_MISSING:${world.id}`);
  for (const [nodeId, direction] of Object.entries(nodes)) {
    const node = world.nodes[nodeId];
    if (!node) throw new Error(`FILM_SOURCE_NODE_MISSING:${world.id}/${nodeId}`);
    validateFilmDirection(direction, filmSourceHash({ root, world, node }));
    const prior = history.filter(job => job.worldId === world.id && job.nodeId === nodeId && job.paidAttempts > 0);
    if (prior.some(job => ['unknown_outcome', 'recoverable'].includes(job.state))
      || (prior.length && !wave.jobs.some(job => job.worldId === world.id && job.nodeId === nodeId)))
      throw new Error(`FILM_EXPANSION_PREVIOUSLY_PAID_SCENE:${world.id}/${nodeId}`);
  }
  return { world, nodeIds: Object.keys(nodes) };
});
if (plans.length !== 20 || Object.values(owners).reduce((sum, owner) => sum + owner.worlds, 0) !== 20)
  throw new Error('FILM_EXPANSION_TWENTY_WORLDS_REQUIRED');
const receipt = { at: new Date().toISOString(), profile: FILM_PROFILE, mode: 'preparation-only',
  worldCount: plans.length, materialCount: plans.reduce((sum, plan) => sum + plan.nodeIds.length, 0), owners,
  paidByPreparation: 0, dispatchStillLimitedToReviewedFirstWave: true };
await mkdir(folder, { recursive: true });
if (command === 'prepare') {
  const enabled = path.join(folder, 'expansion.json');
  const existing = await readFile(enabled, 'utf8').then(JSON.parse).catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  });
  if (existing && JSON.stringify(existing.owners) !== JSON.stringify(owners)) throw new Error('FROZEN_FILM_EXPANSION_CHANGED');
  if (!existing) await writeFile(enabled, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  const prepared = [];
  for (const { world, nodeIds } of plans) {
    const batch = await prepareArtBatch({ world, nodeIds });
    const jobs = batch.jobs.filter(job => !job.stale && nodeIds.includes(job.nodeId));
    if (jobs.length !== nodeIds.length) throw new Error('FILM_EXPANSION_CURRENT_JOBS_MISMATCH');
    prepared.push({ worldId: world.id, batchId: batch.id, requirements: jobs.length,
      jobs: jobs.map(job => ({ id: job.id, nodeId: job.nodeId, sourceHash: job.sourceHash,
        promptHash: job.promptHash, referenceHash: job.referenceHash, state: job.state, paidAttempts: job.paidAttempts,
        asset: job.asset, review: job.review })) });
    console.log(JSON.stringify({ preparedWorld: world.id, currentFilmJobs: jobs.length, newPaidRequests: 0 }));
  }
  const file = path.join(folder, 'expansion-status.json');
  await writeFile(`${file}.${process.pid}.tmp`, JSON.stringify({ ...receipt, prepared }, null, 2) + '\n');
  await replaceArtFile(`${file}.${process.pid}.tmp`, file);
}
console.log(JSON.stringify(receipt));
