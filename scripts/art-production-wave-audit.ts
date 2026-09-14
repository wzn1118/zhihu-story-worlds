import { readFile, readdir, mkdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { createArtProductionService } from '../server/art-production.ts';
import { sha256 } from '../server/art-production-prompts.ts';
import { SHORT_FOLDER } from '../server/art-production-short.ts';

const root = process.cwd();
const waveName = process.argv[2];
if (!/^\d+-\d+\.json$/.test(waveName ?? '')) throw new Error('EXACT_WAVE_REQUIRED');
const folder = path.join(root, SHORT_FOLDER);
const wave = JSON.parse(await readFile(path.join(folder, 'runs', waveName), 'utf8'));
const service = createArtProductionService({ startWorker: () => {} });
const exists = (file: string) => stat(file).then(() => true).catch(error => {
  if (error.code === 'ENOENT') return false; throw error;
});
async function inspect() {
  const batches = await service.listArtBatches();
  const rows = [];
  for (const selected of wave.selected as { worldId: string; nodeId: string; jobId: string }[]) {
    const batch = batches.find(b => b.jobs.some(j => j.id === selected.jobId));
    const job = batch?.jobs.find(j => j.id === selected.jobId);
    if (!batch || !job) throw new Error('WAVE_JOB_MISSING');
    const directory = path.join(root, 'output/imagegen/scene-production/.private/jobs', job.id);
    const result = await readFile(path.join(directory, 'result.json'), 'utf8').then(JSON.parse).catch(error => {
      if (error.code === 'ENOENT') return null; throw error;
    });
    const marker = await exists(path.join(directory, 'paid-attempt.lock'));
    const recoveryFiles = (await readdir(directory, { recursive: true })).filter(name => name.endsWith('.recovery.json'));
    let savedResponse = false, savedImages = 0;
    for (const name of recoveryFiles) {
      const recovery = JSON.parse(await readFile(path.join(directory, name), 'utf8'));
      savedResponse ||= !!recovery.response;
      savedImages += recovery.images?.length ?? 0;
    }
    let native: { width: number; height: number; bytes: number; sha256: string; resultMatches: boolean } | null = null;
    if (await exists(path.join(directory, 'native.png'))) {
      const bytes = await readFile(path.join(directory, 'native.png'));
      if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('NATIVE_PNG_SIGNATURE_INVALID');
      native = { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), bytes: bytes.length,
        sha256: sha256(bytes), resultMatches: sha256(bytes) === result?.sha256 && bytes.length === result?.bytes };
    }
    const delivery = await readFile(path.join(directory, 'delivery/manifest.json'), 'utf8').then(JSON.parse).catch(error => {
      if (error.code === 'ENOENT') return null; throw error;
    });
    const errors = JSON.stringify(delivery?.failures ?? []);
    const httpError = /HTTP(?:Error)?[ :]+([45]\d\d)/i.exec(errors)?.[1];
    const networkEvidence = /timed out|timeout/i.test(errors) ? 'TIMEOUT' : /10060/.test(errors) ? 'CONNECT_TIMEOUT'
      : /10054/.test(errors) ? 'CONNECTION_RESET' : undefined;
    rows.push({ ...selected, batchId: batch.id, state: job.state, errorCode: job.errorCode,
      reservationCount: job.paidAttempts, invocationMarker: marker,
      confirmedNoPost: !marker && result?.errorCode === 'DISPATCH_NOT_CONFIRMED_NO_POST',
      localResultState: result?.state, localResultCode: result?.errorCode,
      recoveryRecordCount: recoveryFiles.length, savedResponse, savedImages, native, networkEvidence,
      ...(httpError ? { httpError: `HTTP_${httpError}` } : {}),
      asset: job.asset, review: job.review?.decision });
  }
  return rows;
}
let rows = await inspect();
if (process.argv.includes('--recover-delivered')) {
  if ((await service.listArtBatches()).some(b => b.progress.inFlight)) throw new Error('ACTIVE_REQUESTS_MUST_SETTLE_FIRST');
  for (const row of rows.filter(r => !r.asset && r.savedResponse && r.native?.resultMatches)) {
    await service.runArtBatch(row.batchId, { recoverOnly: true, concurrency: 1, maxJobs: 1, jobIds: [row.jobId] });
    await service.drain();
  }
  rows = await inspect();
}
const report = { at: new Date().toISOString(), wave: waveName, selected: rows.length,
  reservations: rows.reduce((n, r) => n + r.reservationCount, 0),
  invocationMarkers: rows.filter(r => r.invocationMarker).length,
  confirmedNoPost: rows.filter(r => r.confirmedNoPost).length,
  unmarkedLocalFailures: rows.filter(r => !r.invocationMarker && !r.confirmedNoPost).length,
  savedResponses: rows.filter(r => r.savedResponse).length, nativeFiles: rows.filter(r => r.native).length,
  publishedFiles: rows.filter(r => r.asset).length, native4k: rows.filter(r => r.asset?.native4k).length,
  reviewed: rows.filter(r => r.review).length, approved: rows.filter(r => r.review === 'approved').length,
  rows };
const destination = path.join(folder, 'wave-audits');
await mkdir(destination, { recursive: true });
await writeFile(path.join(destination, waveName), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, rows: undefined }));
