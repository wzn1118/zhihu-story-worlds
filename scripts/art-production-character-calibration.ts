import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { authoredWorlds } from '../content/worlds.ts';
import { buildSceneBrief, sha256 } from '../server/art-production-prompts.ts';
import { getArtBatch, listArtBatches, runArtBatch } from '../server/art-production.ts';

const root = process.cwd();
const directory = 'output/imagegen/scene-production/art-team/character-calibration';
const knownUnknown = 'scene_b6d835c0e9972b9f4ed8c9fd9dba';
const expectedGate = process.argv.includes('--reviewed-c3-rejection')
  ? { code: 'UPSTREAM_PROMPT_REJECTED', at: '2026-09-06T04:13:20.229Z' }
  : process.argv.includes('--reviewed-size-gate')
  ? { code: 'NATIVE_4K_GATE_FAILED', at: '2026-09-06T03:59:44.128Z' }
  : { code: 'WORKER_ERROR_INSPECT_BEFORE_RETRY', at: '2026-09-06T03:39:42.735Z' };
const jobIds = process.argv.slice(2).filter(value => !value.startsWith('--'));
if (!jobIds.length || jobIds.length > 2 || new Set(jobIds).size !== jobIds.length) throw new Error('SELECT_ONE_OR_TWO_EXACT_JOBS');
await mkdir(directory, { recursive: true });
const batches = await listArtBatches();
const allJobs = batches.flatMap(batch => batch.jobs);
const unknown = allJobs.find(job => job.id === knownUnknown);
if (!unknown || unknown.state !== 'unknown_outcome' || unknown.paidAttempts !== 1 || unknown.recoveryAvailable) throw new Error('HISTORICAL_OUTCOME_CHANGED_REINSPECT');
if (allJobs.some(job => ['generating', 'recoverable', 'unknown_outcome'].includes(job.state) && job.id !== knownUnknown)) throw new Error('UNINSPECTED_ACTIVE_OR_UNKNOWN_REQUEST');
const gate = batches.find(batch => batch.circuitBreaker)?.circuitBreaker;
if (gate && (gate.code !== expectedGate.code || gate.at !== expectedGate.at)) throw new Error('NEW_GATE_REQUIRES_INSPECTION');
if (expectedGate.code === 'UPSTREAM_PROMPT_REJECTED') {
  const rejected = allJobs.find(job => job.id === 'scene_43765a0133e8c94ea47e9cd85716');
  if (!rejected || rejected.state !== 'failed' || rejected.errorCode !== expectedGate.code
    || rejected.asset || rejected.recoveryAvailable || jobIds.length !== 1) throw new Error('DEFINITIVE_REJECTION_REQUIRED');
}
if (expectedGate.code === 'NATIVE_4K_GATE_FAILED') {
  for (const id of ['scene_02dea3bdc39a964913d20b59c94e', 'scene_f49e774daecb72f3cec35206f1a3']) {
    const reviewed = allJobs.find(job => job.id === id);
    if (reviewed?.asset?.width !== 1672 || reviewed.asset.height !== 941 || reviewed.asset.native4k
      || reviewed.review?.decision !== 'rejected') throw new Error('SIZE_GATE_REVIEW_NOT_COMPLETE');
  }
}
const selected = [];
for (const id of jobIds) {
  const batch = batches.find(batch => batch.jobs.some(job => job.id === id));
  const job = batch?.jobs.find(job => job.id === id);
  if (!batch || !job || job.stale || job.state !== 'queued' || job.paidAttempts !== 0) throw new Error('UNTOUCHED_CURRENT_JOB_REQUIRED');
  if (allJobs.some(prior => prior.worldId === job.worldId && prior.nodeId === job.nodeId && ['unknown_outcome', 'recoverable', 'generating'].includes(prior.state))) throw new Error('SAME_SCENE_UNCERTAINTY_LOCKED');
  const world = authoredWorlds.find(world => world.id === job.worldId);
  if (!world) throw new Error('SOURCE_WORLD_MISSING');
  const brief = await buildSceneBrief(root, world, world.nodes[job.nodeId]);
  if (sha256(brief.prompt) !== job.promptHash || brief.sourceHash !== job.sourceHash || brief.referenceHash !== job.referenceHash) throw new Error('ART_DIRECTION_CHANGED_REPREPARE');
  if (!/Vampire Hunter D/i.test(brief.prompt)) throw new Error('LATEST_CHARACTER_DIRECTION_MISSING');
  if (expectedGate.code !== 'WORKER_ERROR_INSPECT_BEFORE_RETRY' && (job.requested.quality !== 'high' || brief.quality !== 'high' || brief.pixelSize)) throw new Error('EXPLICIT_HIGH_4K_CALIBRATION_REQUIRED');
  const reservation = `${directory}/${id}.intent.json`;
  try { await readFile(reservation); throw new Error('DISPATCH_ALREADY_RECORDED_INSPECT_EXISTING_RUN'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  selected.push({ batchId: batch.id, jobId: id, worldId: job.worldId, nodeId: job.nodeId, promptHash: job.promptHash, sourceHash: job.sourceHash });
}
const intent = {
  at: new Date().toISOString(), scope: 'New user-requested character-style calibration, not a retry',
  maxPaidRequests: selected.length, globalConcurrency: 2, expectedGate,
  historicalUnknown: { id: knownUnknown, paidAttempts: unknown.paidAttempts, recoveryAttempts: unknown.recoveryAttempts,
    state: unknown.state, savedResponse: false, action: 'retain unchanged; never resubmit this scene' },
  selected,
};
for (const item of selected) await writeFile(`${directory}/${item.jobId}.intent.json`, JSON.stringify(intent, null, 2), { flag: 'wx' });
for (let index = 0; index < selected.length; index++) {
  const item = selected[index];
  const current = await getArtBatch(item.batchId);
  if (!current) throw new Error('BATCH_DISAPPEARED');
  if (current.circuitBreaker && (index > 0 || current.circuitBreaker.code !== expectedGate.code || current.circuitBreaker.at !== expectedGate.at)) throw new Error('NEW_GATE_STOPPED_CALIBRATION');
  const result = await runArtBatch(item.batchId, { jobIds: [item.jobId], maxJobs: 1, concurrency: 2,
    ...(index === 0 && gate ? { acknowledgeBlock: true } : {}) });
  const record = { at: new Date().toISOString(), ...item, batchState: result.state, job: result.jobs.find(job => job.id === item.jobId) };
  await writeFile(`${directory}/${item.jobId}.run.json`, JSON.stringify(record, null, 2));
  console.log(JSON.stringify(record));
}
