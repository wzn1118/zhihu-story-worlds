import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createArtProductionService } from '../server/art-production.ts';

const root = process.cwd();
const privateRoot = path.join(root, 'output/imagegen/scene-production/.private');
const direct = path.join(root, 'output/coordination/art-remake-12h-20260912/full64-direct');
const protectedPairs = new Set(['blue-blood/b_blackout', 'future-island/ending_commons']);
const state = JSON.parse(await readFile(path.join(privateRoot, 'state.json'), 'utf8'));
const jobs = state.batches.flatMap((b: any) => b.jobs);
const window = JSON.parse(await readFile(path.join(root, 'output/coordination/art-remake-12h-20260912/queue-window-64-ready.json'), 'utf8'));
const selected = window.selected.map((row: any) => jobs.find((j: any) => j.id === row.jobId)).filter(Boolean);
assert.equal(selected.length, 64, `READY_WINDOW_NOT_CURRENT:${selected.length}`);
assert(selected.every((j: any) => !j.stale && j.state === 'queued' && j.paidAttempts === 0 && !j.asset
  && !protectedPairs.has(`${j.worldId}/${j.nodeId}`)), 'READY_WINDOW_STATE_CHANGED');
const byBatch = new Map<string, any[]>();
for (const job of selected) {
  const batch = state.batches.find((b: any) => b.jobs.some((j: any) => j.id === job.id));
  assert(batch, 'BATCH_MISSING');
  byBatch.set(batch.id, [...(byBatch.get(batch.id) ?? []), job]);
}
const service = createArtProductionService({ root });
const results = [];
for (const [batchId, rows] of byBatch) {
  const result = await service.runArtBatch(batchId, { maxJobs: rows.length, concurrency: 64, jobIds: rows.map(j => j.id), acknowledgeBlock: true });
  results.push({ batchId, count: rows.length, state: result.state, concurrency: result.concurrency, selectedJobs: rows.map(j => j.id) });
}
const after = JSON.parse(await readFile(path.join(privateRoot, 'state.json'), 'utf8'));
const running = after.batches.flatMap((b: any) => b.jobs.filter((j: any) => j.state === 'generating'));
const report = { at: new Date().toISOString(), requested: 64, selected: selected.length, batches: results,
  globalGenerating: running.length, runningJobIds: running.map((j: any) => j.id), paidAttemptsIncrement: running.length,
  gate: after.circuitBreaker ?? null, protectedExcluded: 2, dispatch: 'service.runArtBatch per batch; no direct state writes' };
await writeFile(path.join(direct, 'actual-window-0752.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
