import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = process.cwd();
const production = path.join(root, 'output/imagegen/scene-production');
const privateJobs = path.join(production, '.private/jobs');
const report = path.join(root, 'output/coordination/art-remake-12h-20260912/unknown-1227-audit.json');
const json = async (file: string) => JSON.parse(await readFile(file, 'utf8'));
const manifest = await json(path.join(production, 'manifest.json'));
const jobs = manifest.batches.flatMap((batch: any) => batch.jobs.map((job: any) => ({ batchId: batch.id, job })));
const unknown = jobs.filter(({ job }: any) => job.state === 'unknown_outcome' || job.errorCode === 'CLIENT_FAILED_OR_UNKNOWN');
const inspectJob = async ({ batchId, job }: any) => {
  const directory = path.join(privateJobs, job.id);
  const files = await readdir(directory, { recursive: true }).catch(() => [] as string[]);
  const recoveryFiles = files.filter((file: string) => file.endsWith('.recovery.json'));
  const recovery = [] as any[];
  for (const relative of recoveryFiles) {
    const data = await json(path.join(directory, relative)).catch(() => undefined);
    if (!data) continue;
    recovery.push({ relative, hasResponse: !!data.response, status: data.status ?? null,
      imageCount: Array.isArray(data.images) ? data.images.length : 0,
      hasArchiveEntries: Array.isArray(data.images) && data.images.some((entry: any) => !!entry.archive),
      cleanupPending: Array.isArray(data.images) && data.images.some((entry: any) => entry.cleanup_status === 'pending') });
  }
  const result = await json(path.join(directory, 'result.json')).catch(() => undefined);
  const deliveryManifest = await json(path.join(directory, 'delivery/manifest.json')).catch(() => undefined);
  return { batchId, jobId: job.id, worldId: job.worldId, nodeId: job.nodeId, state: job.state,
    errorCode: job.errorCode ?? null, errorStage: job.errorStage ?? null, paidAttempts: job.paidAttempts,
    recoveryAvailable: !!job.recoveryAvailable, delivered: !!job.asset, result: result ? {
      state: result.state ?? null, errorCode: result.errorCode ?? null, recoveryAvailable: !!result.recoveryAvailable,
      delivered: !!result.file, native4k: !!result.native4k } : null,
    recovery, delivery: deliveryManifest ? { imageCount: Array.isArray(deliveryManifest.images) ? deliveryManifest.images.length : 0,
      failureCount: Array.isArray(deliveryManifest.failures) ? deliveryManifest.failures.length : 0 } : null,
    recoverAction: recovery.some(item => item.hasResponse) ? 'SAFE_SAVED_RESPONSE_RECOVERY_ONLY' : 'NO_SAVED_RESPONSE_INSPECT_ONLY' };
};
const unknownAudit = await Promise.all(unknown.map(inspectJob));
const repairReport = await json(path.join(production, 'formal-production-20260907/repair-plan-20260912/dispatch-report.json'));
const predicted = new Set(repairReport.predictedFreshJobIds ?? []);
const predictionActual: Array<{ jobId: string; state: string; paidAttempts: number; delivered: boolean;
  recoveryAvailable: boolean; errorCode: string | null }> = jobs.filter(({ job }: any) => predicted.has(job.id)).map(({ job }: any) => ({ jobId: job.id,
  state: job.state, paidAttempts: job.paidAttempts, delivered: !!job.asset, recoveryAvailable: !!job.recoveryAvailable,
  errorCode: job.errorCode ?? null }));
const hash = (value: Buffer) => createHash('sha256').update(value).digest('hex');
const audit = { at: new Date().toISOString(), mode: 'READ_ONLY_NO_POST_NO_PREPARE_NO_PAUSE_WRITE',
  pauseObserved: await json(path.join(production, 'formal-production-20260907/pause')).catch(() => null),
  unknownCount: unknownAudit.length, unknown: unknownAudit,
  savedResponseRecoveryEligible: unknownAudit.filter(row => row.recoverAction === 'SAFE_SAVED_RESPONSE_RECOVERY_ONLY').length,
  unknownNoSavedResponse: unknownAudit.filter(row => row.recoverAction === 'NO_SAVED_RESPONSE_INSPECT_ONLY').length,
  predicted64: { count: predicted.size, actualRows: predictionActual.length, paid: predictionActual.filter(row => row.paidAttempts > 0).length,
    delivered: predictionActual.filter(row => row.delivered).length, unresolved: predictionActual.filter(row => !row.delivered).length,
    rows: predictionActual },
  recoveryRule: 'Only invoke existing image-recover on a recovery JSON with hasResponse=true; no POST/resubmit. Unknown without saved response remains isolated.',
  sourceHashes: { manifest: hash(await readFile(path.join(production, 'manifest.json'))), dispatchReport: hash(await readFile(path.join(production, 'formal-production-20260907/repair-plan-20260912/dispatch-report.json'))) } };
await writeFile(report, JSON.stringify(audit, null, 2) + '\n');
console.log(JSON.stringify({ report, unknown: audit.unknownCount, savedResponseRecoveryEligible: audit.savedResponseRecoveryEligible,
  noSavedResponse: audit.unknownNoSavedResponse, predicted64Paid: audit.predicted64.paid, predicted64Delivered: audit.predicted64.delivered }));
