import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createArtProductionService } from '../server/art-production.ts';

const root = process.cwd();
const out = path.join(root, 'output/coordination/art-remake-12h-20260912/full64-direct');
const report = path.join(out, 'remaining-loop-status.json');
const maxPerRound = 64;
const rounds = Number(process.argv.find(a => a.startsWith('--rounds='))?.split('=')[1] ?? 1000);
const sleepMs = Number(process.argv.find(a => a.startsWith('--sleep-ms='))?.split('=')[1] ?? 30000);
const service = createArtProductionService({ root });

await mkdir(out, { recursive: true });
const startedAt = new Date().toISOString();
const totals = { rounds: 0, submitted: 0, delivered: 0, errors: 0 };
for (let i = 0; i < rounds; i++) {
  const batches = await service.listArtBatches();
  const candidates = batches.flatMap(batch => batch.jobs
    .filter(job => job.state === 'queued' && job.paidAttempts === 0 && !job.asset && !job.stale)
    .map(job => ({ batch, job })));
  if (!candidates.length) break;
  const selected = candidates.slice(0, maxPerRound);
  const byBatch = new Map<string, typeof selected>();
  for (const row of selected) byBatch.set(row.batch.id, [...(byBatch.get(row.batch.id) ?? []), row]);
  let submitted = 0;
  for (const [batchId, rows] of byBatch) {
    try {
      await service.runArtBatch(batchId, { maxJobs: rows.length, concurrency: 64, jobIds: rows.map(row => row.job.id), acknowledgeBlock: true });
      submitted += rows.length;
    } catch {
      totals.errors += rows.length;
    }
  }
  await service.drain();
  const after = await service.listArtBatches();
  const ids = new Set(selected.map(row => row.job.id));
  const finished = after.flatMap(batch => batch.jobs).filter(job => ids.has(job.id));
  const delivered = finished.filter(job => job.asset).length;
  totals.rounds++; totals.submitted += submitted; totals.delivered += delivered;
  await writeFile(report, JSON.stringify({ startedAt, updatedAt: new Date().toISOString(), ...totals,
    queuedRemaining: after.flatMap(batch => batch.jobs).filter(job => job.state === 'queued' && job.paidAttempts === 0 && !job.asset && !job.stale).length,
    lastRound: { selected: selected.length, submitted, delivered } }, null, 2) + '\n');
  if (sleepMs > 0) await new Promise(resolve => setTimeout(resolve, sleepMs));
}
console.log(JSON.stringify({ ...totals, report }));
