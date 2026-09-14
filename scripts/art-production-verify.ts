import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listArtBatches } from '../server/art-production.ts';
import { sha256 } from '../server/art-production-prompts.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = path.join(root, 'output/imagegen/scene-production');
const checks: { name: string; executable: string; args: string[] }[] = [
  { name: 'art-service-tests', executable: process.execPath, args: ['--import', 'tsx', '--test', 'tests/art-production.test.ts', 'tests/art-production-prompts.test.ts'] },
  { name: 'safe-python-client-tests', executable: 'python', args: ['tests/art-production-client-tests.py'] },
  { name: 'project-typecheck', executable: process.execPath, args: ['node_modules/typescript/bin/tsc', '--noEmit'] },
];
const verification = [];
for (const check of checks) {
  const started = Date.now();
  const child = spawn(check.executable, check.args, { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
  const code = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  const result = { name: check.name, exitCode: code, seconds: (Date.now() - started) / 1000,
    tests: Number(output.match(/# tests (\d+)/)?.[1] ?? output.match(/Ran (\d+) tests/)?.[1] ?? 0),
    passed: Number(output.match(/# pass (\d+)/)?.[1] ?? (code === 0 ? output.match(/Ran (\d+) tests/)?.[1] : 0) ?? 0),
    failed: Number(output.match(/# fail (\d+)/)?.[1] ?? 0),
    diagnostics: code === 0 ? [] : output.split(/\r?\n/).filter(line => /^not ok |^.*error TS\d+:/.test(line)).slice(0, 30),
  };
  verification.push(result); console.log(JSON.stringify(result));
}
const batches = await listArtBatches();
const jobs = batches.flatMap(b => b.jobs);
const assets = [];
for (const job of jobs.filter(job => job.asset)) {
  const file = path.join(root, 'public/generated-art', `${job.id}.png`);
  const bytes = await readFile(file);
  assets.push({ jobId: job.id, worldId: job.worldId, nodeId: job.nodeId, stale: job.stale,
    ...job.asset, review: job.review, hashVerified: sha256(bytes) === job.asset!.sha256,
    dimensionsVerified: bytes.readUInt32BE(16) === job.asset!.width && bytes.readUInt32BE(20) === job.asset!.height });
}
const report = { schemaVersion: 1, verifiedAt: new Date().toISOString(),
  productionComplete: false, initial30Native4kComplete: jobs.filter(j => !j.stale && j.asset?.native4k && j.review?.decision === 'approved').length >= 30,
  batchCount: batches.length, currentQueuedScenes: jobs.filter(j => !j.stale && j.state === 'queued').length,
  currentScenes: jobs.filter(j => !j.stale).length, requiredImages: batches.reduce((sum, b) => sum + b.progress.required, 0),
  historicalPaidAttempts: jobs.reduce((sum, j) => sum + j.paidAttempts, 0),
  deliveredImages: assets.length, visuallyReviewedImages: jobs.filter(j => j.review).length,
  native4kImages: jobs.filter(j => j.asset?.native4k).length,
  approvedCurrentImages: jobs.filter(j => !j.stale && j.review?.decision === 'approved' && j.asset?.native4k && !j.asset.duplicate).length,
  unresolvedJobs: jobs.filter(j => j.state === 'unknown_outcome').map(j => ({ id: j.id, worldId: j.worldId, nodeId: j.nodeId,
    stale: j.stale, errorCode: j.errorCode, failureHistory: j.failureHistory, paidAttempts: j.paidAttempts,
    recoveryAttempts: j.recoveryAttempts, recoveryAvailable: j.recoveryAvailable })),
  circuitBreaker: batches.find(b => b.circuitBreaker)?.circuitBreaker,
  batches: batches.map(b => ({ id: b.id, worldId: b.worldId, worldVersion: b.worldVersion, state: b.state, progress: b.progress })),
  assets, verification,
};
await mkdir(directory, { recursive: true });
await writeFile(path.join(directory, 'production-verification.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ report: 'output/imagegen/scene-production/production-verification.json',
  currentScenes: report.currentScenes, requiredImages: report.requiredImages, delivered: report.deliveredImages,
  reviewed: report.visuallyReviewedImages, native4k: report.native4kImages, unknown: report.unresolvedJobs.length }));
