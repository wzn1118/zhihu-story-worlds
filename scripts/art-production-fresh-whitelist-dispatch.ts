import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createArtProductionService } from '../server/art-production.ts';
import { formalStyleBrief } from './art-production-formal-supervisor.ts';
import { buildShortPlans, SHORT_FOLDER } from '../server/art-production-short.ts';
import { authoredWorlds } from '../content/worlds.ts';
import { sha256 } from '../server/art-production-prompts.ts';
import type { ArtConcurrency } from '../shared/production.ts';

const requested = process.argv.slice(2);
if (!requested.length || new Set(requested).size !== requested.length || requested.some(id => !/^scene_[a-f0-9]+$/.test(id)))
  throw new Error('EXACT_FRESH_JOB_IDS_REQUIRED');

const root = process.cwd();
const folder = path.join(root, SHORT_FOLDER, 'fresh-runs');
const concurrency = Math.min(8, requested.length);
const service = createArtProductionService({ startWorker: () => {} });
const batches = await service.listArtBatches();
if (batches.some(batch => batch.progress.inFlight > 0)) throw new Error('ACTIVE_REQUESTS_MUST_SETTLE_FIRST');
const allJobs = batches.flatMap(batch => batch.jobs);
const plans = await buildShortPlans(root, authoredWorlds);
const selected = requested.map(jobId => {
  const batch = batches.find(candidate => candidate.jobs.some(job => job.id === jobId));
  const job = batch?.jobs.find(candidate => candidate.id === jobId);
  if (!batch || !job || job.state !== 'queued' || job.paidAttempts !== 0 || job.asset || job.stale)
    throw new Error(`FRESH_JOB_NOT_READY:${jobId}`);
  if (allJobs.some(other => other.id !== job.id && other.worldId === job.worldId && other.nodeId === job.nodeId
    && ['generating', 'unknown_outcome', 'recoverable'].includes(other.state)))
    throw new Error(`FRESH_JOB_HAS_UNCERTAIN_IDENTITY:${jobId}`);
  const plan = plans.find(candidate => candidate.worldId === job.worldId && candidate.nodeId === job.nodeId);
  if (!plan || plan.blocked || job.sourceHash !== plan.sourceHash || job.promptHash !== sha256(plan.prompt))
    throw new Error(`FRESH_JOB_SOURCE_CHANGED:${jobId}`);
  return { batch, job, plan };
});

for (const row of selected) {
  const brief = await formalStyleBrief(root, row.plan, allJobs);
  if (!brief || brief.referenceHash !== row.job.referenceHash) throw new Error(`FRESH_JOB_REFERENCE_CHANGED:${row.job.id}`);
}

const startedAt = new Date().toISOString();
await mkdir(folder, { recursive: true });
const reportFile = path.join(folder, `${startedAt.replaceAll(':', '-')}.json`);
await writeFile(reportFile, JSON.stringify({
  startedAt,
  dispatch: 'fresh-whitelist',
  automaticResubmission: false,
  concurrency,
  selected: selected.map(({ batch, job, plan }) => ({ batchId: batch.id, jobId: job.id, worldId: job.worldId,
    nodeId: job.nodeId, kind: job.assetKind, sourceHash: job.sourceHash, promptHash: job.promptHash,
    referenceHash: job.referenceHash, prompt: plan.prompt })),
}, null, 2) + '\n');

let acknowledgesCircuit = true;
for (const batchId of new Set(selected.map(row => row.batch.id))) {
  const ids = selected.filter(row => row.batch.id === batchId).map(row => row.job.id);
  await service.runArtBatch(batchId, { maxJobs: ids.length, concurrency: concurrency as ArtConcurrency, jobIds: ids,
    ...(acknowledgesCircuit ? { acknowledgeBlock: true } : {}) });
  acknowledgesCircuit = false;
}
await service.drain();

const after = await service.listArtBatches();
const results = selected.map(({ job }) => {
  const current = after.flatMap(batch => batch.jobs).find(candidate => candidate.id === job.id);
  if (!current) throw new Error('FRESH_JOB_DISAPPEARED');
  return { jobId: current.id, worldId: current.worldId, nodeId: current.nodeId, state: current.state,
    paidAttempts: current.paidAttempts, recoveryAvailable: current.recoveryAvailable,
    ...(current.asset ? { width: current.asset.width, height: current.asset.height, bytes: current.asset.bytes,
      sha256: current.asset.sha256, native4k: current.asset.native4k } : {}),
    ...(current.errorCode ? { errorCode: current.errorCode } : {}) };
});
const finished = { startedAt, finishedAt: new Date().toISOString(), dispatch: 'fresh-whitelist',
  automaticResubmission: false, concurrency, selected: results.length,
  delivered: results.filter(result => result.width !== undefined).length,
  native4k: results.filter(result => result.native4k).length,
  unresolved: results.filter(result => result.width === undefined).length, results };
await writeFile(reportFile, JSON.stringify(finished, null, 2) + '\n');
console.log(JSON.stringify({ ...finished, results: undefined }));
