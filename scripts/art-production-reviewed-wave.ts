import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { createArtProductionService } from '../server/art-production.ts';
import { selectFormalJobs, type FormalSnapshot } from './art-production-formal-supervisor.ts';

const root = process.cwd(), folder = path.resolve('output/imagegen/scene-production/formal-production-20260907');
const run = path.join(folder, 'reviewed-wave-20260910');
await mkdir(run, { recursive: true });
const child = (script: string, args: string[], log: string) => new Promise<void>((resolve, reject) => {
  const stream = createWriteStream(path.join(run, log));
  const process = spawn(globalThis.process.execPath, ['--import', 'tsx', script, ...args], { cwd: root, windowsHide: true });
  process.stdout.pipe(stream, { end: false }); process.stderr.pipe(stream, { end: false });
  stream.once('error', reject);
  process.once('error', reject);
  process.once('close', code => { stream.end(); code === 0 ? resolve() : reject(new Error(`ART_CHILD_EXIT_${code}:${log}`)); });
});
const selection = JSON.parse(await readFile(path.join(folder, 'inspection-20260910/selection.json'), 'utf8'));
const reviews = [];
for (const row of selection) {
  const review = JSON.parse(await readFile(path.join(folder, 'reviews', row.jobId + '.json'), 'utf8'));
  if (review.sha256 !== row.sha256 || !review.fullImageViewed || !review.nativeDetailViewed || !review.styleReviewed
    || !['approved', 'rejected'].includes(review.decision)) throw new Error('PREVIOUS_WAVE_REVIEW_INCOMPLETE');
  const bytes = await readFile(row.original);
  if (createHash('sha256').update(bytes).digest('hex') !== row.sha256) throw new Error('REVIEWED_ORIGINAL_CHANGED');
  reviews.push(review);
}
await child('scripts/art-production-formal.ts', ['status'], 'prepare.log');
const service = createArtProductionService({ startWorker: () => {} });
const batches = await service.listArtBatches();
const allJobs = batches.flatMap(batch => batch.jobs);
if (allJobs.some(job => job.state === 'generating')) throw new Error('OTHER_ART_PRODUCTION_ACTIVE');
const state = JSON.parse(await readFile(path.join(folder, 'state.json'), 'utf8'));
const snapshot: FormalSnapshot = { ...state, allJobs, worldOrder: [...new Set<string>(state.jobs.map((row: { worldId: string }) => row.worldId))] };
const repairs = JSON.parse(await readFile(path.join(folder, 'review-repairs.json'), 'utf8'));
const fresh = selectFormalJobs(snapshot, 1689);
const corrections = fresh.filter(row => repairs[`${row.worldId}/${row.nodeId}`]);
// The parallel production controller delivered the newly unblocked scene wave.
// This owner handles only the thirteen concrete reviewed character corrections.
const selected = corrections.slice(0, 32);
if (!selected.length) throw new Error('NO_FRESH_ELIGIBLE_JOBS');
const pause = await readFile(path.join(folder, 'pause'), 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; });
if (pause && !pause.startsWith('AWAITING_VISUAL_REVIEW: 21 newly delivered correction originals.')) throw new Error('PAUSE_CHANGED_INSPECT_CURRENT_OWNER');
const at = new Date().toISOString();
const report = { at, previousWave: { reviewed: reviews.length, approved: reviews.filter(r => r.decision === 'approved').length,
  rejected: reviews.filter(r => r.decision === 'rejected').length }, concurrency: 32, automaticResubmission: false,
  selected: selected.map(row => ({ jobId: row.jobId, worldId: row.worldId, nodeId: row.nodeId, kind: row.kind,
    prompt: state.jobs.find((item: { jobId: string }) => item.jobId === row.jobId).prompt })),
  status: 'dispatching', finishedAt: undefined as string | undefined };
await writeFile(path.join(run, 'record.json'), JSON.stringify(report, null, 2));
if (pause) await rename(path.join(folder, 'pause'), path.join(run, 'previous-review-pause.txt'));
try {
  await child('scripts/art-production-formal.ts', ['supervise', '--once', '--max-wave=32', '--max-recovery-attempts=0',
    '--job-ids=' + selected.map(row => row.jobId).join(',')], 'dispatch.log');
  report.status = 'delivered-awaiting-visual-review';
} catch (error) {
  report.status = String(error); throw error;
} finally {
  report.finishedAt = new Date().toISOString();
  const after = await service.listArtBatches();
  const results = after.flatMap(batch => batch.jobs).filter(job => selected.some(row => row.jobId === job.id));
  await writeFile(path.join(run, 'record.json'), JSON.stringify({ ...report, results: results.map(job => ({ jobId: job.id,
    state: job.state, errorCode: job.errorCode, paidAttempts: job.paidAttempts, review: job.review?.decision,
    asset: job.asset ? { url: job.asset.url, sha256: job.asset.sha256, width: job.asset.width, height: job.asset.height } : undefined })) }, null, 2));
  await writeFile(path.join(folder, 'pause'), `AWAITING_VISUAL_REVIEW: reviewed-wave-20260910 completed; inspect delivered originals before the next fresh wave. ${report.status}\n`, { flag: 'wx' }).catch(error => { if (error.code !== 'EEXIST') throw error; });
  await child('scripts/art-production-formal.ts', ['status'], 'settled.log');
  await child('scripts/art-production-publish-manifest.ts', [], 'publish.log');
}
