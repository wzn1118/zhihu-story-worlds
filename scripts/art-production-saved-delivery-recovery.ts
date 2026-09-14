import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createArtProductionService } from '../server/art-production.ts';
import type { ArtConcurrency } from '../shared/production.ts';

const root = process.cwd();
const privateJobs = path.join(root, 'output/imagegen/scene-production/.private/jobs');
const reportFolder = path.join(root, 'output/imagegen/scene-production/formal-production-20260907/recovery-runs');
const concurrency = 8;

async function hasSavedResponse(jobId: string): Promise<boolean> {
  const directory = path.join(privateJobs, jobId);
  const files = await readdir(directory, { recursive: true }).catch(error => {
    if (error.code === 'ENOENT') return [] as string[];
    throw error;
  });
  for (const name of files.filter(name => name.endsWith('.recovery.json'))) {
    const record = await readFile(path.join(directory, name), 'utf8').then(JSON.parse).catch(() => undefined);
    if (record?.response) return true;
  }
  return false;
}

const service = createArtProductionService({ startWorker: () => {} });
const before = await service.listArtBatches();
if (before.some(batch => batch.progress.inFlight > 0)) throw new Error('ACTIVE_REQUESTS_MUST_SETTLE_FIRST');

const candidates = before.flatMap(batch => batch.jobs.map(job => ({ batch, job })))
  .filter(({ job }) => job.state === 'recoverable' && job.paidAttempts > 0 && job.recoveryAvailable && !job.asset);
const inspected = await Promise.all(candidates.map(async row => ({ ...row, savedResponse: await hasSavedResponse(row.job.id) })));
const selected = inspected.filter(row => row.savedResponse);

const startedAt = new Date().toISOString();
await mkdir(reportFolder, { recursive: true });
const reportFile = path.join(reportFolder, `${startedAt.replaceAll(':', '-')}.json`);
await writeFile(reportFile, JSON.stringify({
  startedAt,
  mode: 'saved-response-only',
  paidSubmissionAllowed: false,
  concurrency,
  candidates: candidates.length,
  selected: selected.map(({ batch, job }) => ({ batchId: batch.id, jobId: job.id, worldId: job.worldId, nodeId: job.nodeId })),
  skippedWithoutSavedResponse: inspected.filter(row => !row.savedResponse).map(({ job }) => job.id),
}, null, 2) + '\n');

for (const batchId of new Set(selected.map(row => row.batch.id))) {
  const ids = selected.filter(row => row.batch.id === batchId).map(row => row.job.id);
  await service.runArtBatch(batchId, { recoverOnly: true, maxJobs: ids.length,
    concurrency: Math.min(concurrency, ids.length) as ArtConcurrency, jobIds: ids });
}
await service.drain();

const after = await service.listArtBatches();
const results = selected.map(({ job }) => {
  const current = after.flatMap(batch => batch.jobs).find(candidate => candidate.id === job.id);
  if (!current) throw new Error('RECOVERY_JOB_DISAPPEARED');
  return {
    jobId: current.id,
    worldId: current.worldId,
    nodeId: current.nodeId,
    state: current.state,
    recoveryAttempts: current.recoveryAttempts,
    delivered: !!current.asset,
    native4k: !!current.asset?.native4k,
    ...(current.asset ? { width: current.asset.width, height: current.asset.height, bytes: current.asset.bytes, sha256: current.asset.sha256 } : {}),
    ...(current.errorCode ? { errorCode: current.errorCode } : {}),
  };
});
const finished = {
  startedAt,
  finishedAt: new Date().toISOString(),
  mode: 'saved-response-only',
  paidSubmissionAllowed: false,
  candidates: candidates.length,
  selected: selected.length,
  delivered: results.filter(result => result.delivered).length,
  native4k: results.filter(result => result.native4k).length,
  unresolved: results.filter(result => !result.delivered).length,
  results,
};
await writeFile(reportFile, JSON.stringify(finished, null, 2) + '\n');
console.log(JSON.stringify({ ...finished, results: undefined }));
