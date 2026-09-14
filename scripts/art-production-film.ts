import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { authoredWorlds } from '../content/worlds.ts';
import { ART_WORLD_OWNERS } from '../server/art-production-delegates.ts';
import { buildSceneBrief, sha256 } from '../server/art-production-prompts.ts';
import { createArtProductionService, listArtBatches, prepareArtBatch, reviewArtJob, wakeArtWorker } from '../server/art-production.ts';
import { inspectCalibrationGate } from '../server/art-production-calibration.ts';
import { FILM_PROFILE, buildFilmDirection, readFilmBook, validateFilmDispatch, verifyFilmGate,
  effectiveFilmWave, filmCorrectionFile, filmSourceHash, readFilmCorrection, validateFilmDirection,
  heldFilmJobs, type FilmCorrection, type FilmSelection } from '../server/art-production-film.ts';
import type { ArtJob } from '../shared/production.ts';
import { replaceArtFile } from '../server/art-production-files.ts';

type Selection = FilmSelection;
interface Wave { profile: string; preparedAt: string; worldCount: number; jobs: Selection[] }
const root = process.cwd();
const folder = path.join(root, 'output/imagegen/scene-production', FILM_PROFILE);
const waveFile = path.join(folder, 'wave.json');
const [command = 'status', ...args] = process.argv.slice(2);
await mkdir(path.join(folder, 'runs'), { recursive: true });

async function currentDirection(worldId: string, nodeId: string) {
  const world = authoredWorlds.find(world => world.id === worldId);
  const node = world?.nodes[nodeId];
  if (!world || !node) throw new Error('FILM_SOURCE_NODE_MISSING');
  const direction = await buildFilmDirection({ root, world, node }, ART_WORLD_OWNERS[worldId]);
  if (!direction) throw new Error('FILM_DIRECTION_MISSING');
  const brief = await buildSceneBrief(root, world, node);
  if (brief.prompt !== direction.prompt || brief.quality || brief.pixelSize
    || JSON.stringify(brief.references.map(ref => path.resolve(ref))) !== JSON.stringify(direction.references.map(ref => path.resolve(ref))))
    throw new Error('FILM_DELEGATE_NOT_CURRENT');
  return { world, brief };
}

if (command === 'prepare') {
  const all = (await listArtBatches()).flatMap(batch => batch.jobs);
  const saved: Wave | undefined = await readFile(waveFile, 'utf8').then(JSON.parse).catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  });
  const plans = [];
  for (const world of authoredWorlds) {
    const book = await readFilmBook(root, ART_WORLD_OWNERS[world.id]);
    const nodes = saved ? saved.jobs.filter(row => row.worldId === world.id).map(row => row.nodeId)
      : Object.keys(book?.worlds[world.id]?.nodes ?? {});
    if (nodes.length !== 2) throw new Error(`TWO_FILM_NODES_PER_WORLD_REQUIRED:${world.id}`);
    for (const nodeId of nodes) {
      if (!saved && all.some(job => job.worldId === world.id && job.nodeId === nodeId && job.paidAttempts > 0))
        throw new Error(`PREVIOUSLY_PAID_SCENE_EXCLUDED:${world.id}/${nodeId}`);
      await currentDirection(world.id, nodeId);
    }
    plans.push({ world, nodes });
  }
  if (plans.length !== 20) throw new Error('TWENTY_AUTHORED_WORLDS_REQUIRED');
  if (saved) {
    if (saved.profile !== FILM_PROFILE || saved.worldCount !== 20 || saved.jobs.length !== 40
      || new Set(saved.jobs.map(row => `${row.worldId}/${row.nodeId}`)).size !== 40) throw new Error('INVALID_FILM_WAVE');
    for (const row of (await effectiveFilmWave(root)).jobs) {
      if (!plans.some(plan => plan.world.id === row.worldId && plan.nodes.includes(row.nodeId)))
        throw new Error('FROZEN_FILM_WAVE_CHANGED');
      const { brief } = await currentDirection(row.worldId, row.nodeId);
      const job = all.find(job => job.id === row.jobId);
      if (!job || job.stale || sha256(brief.prompt) !== row.promptHash || brief.sourceHash !== row.sourceHash
        || brief.referenceHash !== row.referenceHash) throw new Error('FROZEN_FILM_WAVE_CHANGED');
    }
  } else {
  // Preparation is free and idempotent. Persist one immutable cross-story selection.
  const selections = [];
  for (const { world, nodes } of plans) {
    const batch = await prepareArtBatch({ world, nodeIds: nodes });
    for (const [round, nodeId] of nodes.entries()) {
      const job = batch.jobs.find(job => !job.stale && job.nodeId === nodeId)!;
      selections.push({ round, batchId: batch.id, jobId: job.id, worldId: world.id, nodeId,
        promptHash: job.promptHash, sourceHash: job.sourceHash, referenceHash: job.referenceHash });
    }
  }
  const priority = (worldId: string) => ['palace-ledger', 'hollow-immortals'].indexOf(worldId);
  const rank = (worldId: string) => priority(worldId) < 0 ? 2 : priority(worldId);
  const wave: Wave = { profile: FILM_PROFILE, preparedAt: new Date().toISOString(), worldCount: plans.length,
    jobs: selections.sort((a, b) => a.round - b.round || rank(a.worldId) - rank(b.worldId))
      .map(({ round: _round, ...selection }) => selection) };
  await writeFile(waveFile, JSON.stringify(wave, null, 2) + '\n', { flag: 'wx' });
  }
}

if (command === 'correct') {
  const [originalId, relativePrompt] = args;
  const previous = await effectiveFilmWave(root);
  const row = previous.jobs.find(row => row.jobId === originalId || row.correctionOf === originalId);
  const all = (await listArtBatches()).flatMap(batch => batch.jobs);
  const original = all.find(job => job.id === originalId);
  if (!row || !original?.asset?.originalPixels || original.review?.decision !== 'rejected'
    || !['generated', 'resolution_mismatch'].includes(original.state)
    || all.some(job => job.worldId === row.worldId && job.nodeId === row.nodeId && ['generating', 'unknown_outcome', 'recoverable'].includes(job.state)))
    throw new Error('CORRECTION_REQUIRES_KNOWN_REVIEWED_DELIVERY');
  const promptFile = path.resolve(root, relativePrompt ?? '');
  if (!promptFile.startsWith(folder + path.sep)) throw new Error('FILM_CORRECTION_PROMPT_REQUIRED');
  const prompt = (await readFile(promptFile, 'utf8')).trim();
  const world = authoredWorlds.find(world => world.id === row.worldId)!;
  const node = world.nodes[row.nodeId];
  const book = await readFilmBook(root, ART_WORLD_OWNERS[world.id]);
  const sourceFacts = book!.worlds[world.id].nodes[node.id].sourceFacts;
  const direction = { prompt, sourceSnapshotHash: filmSourceHash({ root, world, node }), sourceFacts };
  validateFilmDirection(direction, direction.sourceSnapshotHash);
  const spec: FilmCorrection = { profile: FILM_PROFILE, worldId: row.worldId, nodeId: row.nodeId,
    correctionOf: original.id, reference: { file: `public/generated-art/${original.id}.png`, sha256: original.asset.sha256 }, direction };
  const file = filmCorrectionFile(root, row.worldId, row.nodeId);
  await mkdir(path.dirname(file), { recursive: true });
  const existing = await readFilmCorrection(root, row.worldId, row.nodeId);
  if (existing?.selection) {
    const reserved = all.find(job => job.id === existing.selection!.jobId);
    if (!reserved || reserved.paidAttempts || reserved.asset || reserved.state !== 'queued')
      throw new Error('FILM_CORRECTION_ALREADY_SUBMITTED');
  }
  if (existing) {
    if (existing.correctionOf !== original.id) throw new Error('FILM_CORRECTION_LINEAGE_CHANGED');
    const temporary = `${file}.${process.pid}.direction.tmp`;
    await writeFile(temporary, JSON.stringify(spec, null, 2) + '\n');
    await replaceArtFile(temporary, file);
  } else await writeFile(file, JSON.stringify(spec, null, 2) + '\n', { flag: 'wx' });
  const batch = await prepareArtBatch({ world, nodeIds: [node.id] });
  const job = batch.jobs.find(job => !job.stale && job.nodeId === node.id)!;
  spec.selection = { batchId: batch.id, jobId: job.id, worldId: world.id, nodeId: node.id,
    sourceHash: job.sourceHash, promptHash: job.promptHash, referenceHash: job.referenceHash,
    baseJobId: original.id, correctionOf: original.id };
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(spec, null, 2) + '\n');
  await replaceArtFile(temporary, file);
  console.log(JSON.stringify({ preparedCorrection: spec.selection, paidByPreparation: 0 }));
}

const wave: Wave = await effectiveFilmWave(root);
if (wave.profile !== FILM_PROFILE || wave.worldCount !== 20 || wave.jobs.length !== 40
  || new Set(wave.jobs.map(job => `${job.worldId}/${job.nodeId}`)).size !== 40) throw new Error('INVALID_FILM_WAVE');
const batches = await listArtBatches();
const all = batches.flatMap(batch => batch.jobs);
const held = await heldFilmJobs(root, wave.jobs, all);
const resolve = (row: Selection): ArtJob => {
  const job = all.find(job => job.id === row.jobId);
  if (!job || job.worldId !== row.worldId || job.nodeId !== row.nodeId
    || job.promptHash !== row.promptHash || job.sourceHash !== row.sourceHash || job.referenceHash !== row.referenceHash)
    throw new Error('FROZEN_FILM_JOB_CHANGED');
  return job;
};
const runIds = new Set((await readdir(path.join(folder, 'runs'))).filter(name => name.endsWith('.intent.json'))
  .map(name => name.slice(0, -'.intent.json'.length)));
const previous = wave.jobs.filter(row => runIds.has(row.jobId) && !held.has(row.jobId)).map(resolve);
const pending = wave.jobs.filter(row => runIds.has(row.jobId) && resolve(row).paidAttempts === 0);
const next: Selection[] = [];
for (const row of wave.jobs) {
  if (runIds.has(row.jobId) || held.has(row.jobId) || next.some(job => job.worldId === row.worldId)) continue;
  next.push(row);
  if (next.length === 2) break;
}

if (command === 'dispatch' || command === 'resume') {
  await verifyFilmGate(root);
  if (command === 'dispatch' && pending.length) throw new Error('RECORDED_UNPAID_SELECTION_REQUIRES_RESUME');
  const selections = command === 'resume' ? pending : next;
  const selected = selections.map(resolve);
  validateFilmDispatch(all, selected, previous.filter(job => !selected.some(candidate => candidate.id === job.id)),
    Object.fromEntries(selections.filter(row => row.correctionOf).map(row => [row.jobId, row.correctionOf!])));
  const gate = batches.find(batch => batch.circuitBreaker)?.circuitBreaker;
  if (gate) inspectCalibrationGate(gate, all, {
    nativeGateAt: args.find(arg => arg.startsWith('--inspected-native-gate='))?.split('=')[1],
  });
  for (const row of selections) {
    const { brief } = await currentDirection(row.worldId, row.nodeId);
    if (sha256(brief.prompt) !== row.promptHash || brief.sourceHash !== row.sourceHash || brief.referenceHash !== row.referenceHash)
      throw new Error('FILM_SOURCE_OR_DIRECTION_CHANGED_REPREPARE');
    const batch = batches.find(batch => batch.id === row.batchId)!;
    if (batch.state === 'running' && command !== 'resume') throw new Error('FILM_BATCH_ALREADY_RUNNING');
  }
  const intent = { at: new Date().toISOString(), profile: FILM_PROFILE, selected: selections,
    maxNewPaidRequests: selected.length, priorGate: gate, automaticResubmit: false };
  for (const row of selections) {
    const file = command === 'resume' ? `${row.jobId}.resume-${Date.now()}.json` : `${row.jobId}.intent.json`;
    await writeFile(path.join(folder, 'runs', file), JSON.stringify(intent, null, 2) + '\n', { flag: 'wx' });
  }
  const reserved = createArtProductionService({ startWorker: () => {} });
  for (const [index, row] of selections.entries()) await reserved.runArtBatch(row.batchId, {
    jobIds: [row.jobId], maxJobs: 1, concurrency: 2, ...(index === 0 && gate ? { acknowledgeBlock: true } : {}),
  });
  await wakeArtWorker();
  console.log(JSON.stringify({ dispatched: selections, maxConcurrentPaid: 2 }));
} else if (command === 'review') {
  const [jobId, decision, relativeReport] = args;
  const row = wave.jobs.find(row => row.jobId === jobId);
  if (!row || !['approved', 'rejected'].includes(decision) || !relativeReport) throw new Error('FILM_REVIEW_ARGUMENTS_REQUIRED');
  const reportFile = path.resolve(root, relativeReport);
  if (!reportFile.startsWith(folder + path.sep)) throw new Error('FILM_REVIEW_REPORT_REQUIRED');
  const report = await readFile(reportFile, 'utf8');
  const job = resolve(row);
  if (!job.asset || !report.includes(job.asset.sha256) || report.length < 120) throw new Error('FILM_REVIEW_MUST_IDENTIFY_ACTUAL_FILE');
  await reviewArtJob(row.batchId, jobId, { decision: decision as 'approved' | 'rejected',
    reviewer: 'art-owner-full-image-and-native-detail', notes: report.slice(0, 1800) });
} else if (command === 'hold') {
  const [jobId, ...reasonParts] = args;
  const row = wave.jobs.find(row => row.jobId === jobId);
  const job = row && resolve(row);
  if (!row || !job?.asset?.originalPixels || job.review?.decision !== 'rejected'
    || !['generated', 'resolution_mismatch'].includes(job.state) || !reasonParts.length)
    throw new Error('FILM_HOLD_REQUIRES_KNOWN_REVIEWED_DELIVERY');
  const file = path.join(folder, 'holds.json');
  const rows = await readFile(file, 'utf8').then(JSON.parse).catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  });
  if (rows.some((row: { jobId: string }) => row.jobId === jobId)) throw new Error('FILM_NODE_ALREADY_HELD');
  rows.push({ at: new Date().toISOString(), jobId, worldId: row.worldId, nodeId: row.nodeId,
    sha256: job.asset.sha256, reason: reasonParts.join(' '), countAsCoverage: false, paidResubmissionAllowed: false });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(rows, null, 2) + '\n');
  await replaceArtFile(temporary, file);
} else if (!['prepare', 'correct', 'status', 'next'].includes(command)) throw new Error('Usage: prepare | status | next | dispatch [--inspected-native-gate=ISO] | resume | review JOB approved|rejected REPORT | correct JOB PROMPT');

const refreshed = await listArtBatches();
const jobs = wave.jobs.map(row => ({ ...row, job: refreshed.flatMap(batch => batch.jobs).find(job => job.id === row.jobId)! }));
const historyIds = new Set(wave.jobs.flatMap(row => [row.jobId, ...(row.baseJobId ? [row.baseJobId] : [])]));
const history = refreshed.flatMap(batch => batch.jobs).filter(job => historyIds.has(job.id));
const currentHolds = await heldFilmJobs(root, wave.jobs, refreshed.flatMap(batch => batch.jobs));
const status = { at: new Date().toISOString(), profile: FILM_PROFILE, mode: 'reviewed-pairs',
  worldCount: wave.worldCount, prepared: jobs.length,
  held: currentHolds.size,
  paidAttemptsTotal: history.reduce((sum, job) => sum + job.paidAttempts, 0),
  deliveredTotal: history.filter(job => job.asset).length, reviewedTotal: history.filter(job => job.review).length,
  paidAttempts: jobs.reduce((sum, row) => sum + row.job.paidAttempts, 0),
  generated: jobs.filter(row => row.job.asset).length, native4k: jobs.filter(row => row.job.asset?.native4k).length,
  reviewed: jobs.filter(row => row.job.review).length,
  approved: jobs.filter(row => !row.job.stale && row.job.asset?.native4k && !row.job.asset.duplicate && row.job.review?.decision === 'approved').length,
  inFlight: jobs.filter(row => row.job.state === 'generating').length,
  circuitBreaker: refreshed.find(batch => batch.circuitBreaker)?.circuitBreaker,
  queued: jobs.filter(row => row.job.state === 'queued').length,
  jobs: jobs.map(({ job, ...row }) => ({ ...row, state: job.state, stale: job.stale, paidAttempts: job.paidAttempts,
    asset: job.asset, review: job.review, errorCode: job.errorCode, held: currentHolds.has(job.id) })) };
const temporary = path.join(folder, `status-${process.pid}.tmp`);
await writeFile(temporary, JSON.stringify(status, null, 2) + '\n');
await replaceArtFile(temporary, path.join(folder, 'status.json'));
console.log(JSON.stringify({ ...status, jobs: undefined, next: command === 'next' ? next : undefined }));
