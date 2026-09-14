import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createArtProductionService } from '../server/art-production.ts';

const root = process.cwd();
const privateRoot = path.join(root, 'output/imagegen/scene-production/.private');
const out = path.join(root, 'output/coordination/art-remake-12h-20260912/full64-direct');
const protectedPairs = new Set(['blue-blood/b_blackout', 'future-island/ending_commons']);
await mkdir(out, { recursive: true });
const service = createArtProductionService({ root });

async function cycle() {
  const state = JSON.parse(await readFile(path.join(privateRoot, 'state.json'), 'utf8'));
  const jobs = state.batches.flatMap((b: any) => b.jobs);
  const ready = jobs.filter((j: any) => !j.stale && j.state === 'queued' && j.paidAttempts === 0 && !j.asset
    && !protectedPairs.has(`${j.worldId}/${j.nodeId}`));
  const selected = ready.slice(0, 64);
  const batches = new Map<string, any[]>();
  for (const job of selected) {
    const batch = state.batches.find((b: any) => b.jobs.some((j: any) => j.id === job.id));
    if (batch) batches.set(batch.id, [...(batches.get(batch.id) ?? []), job]);
  }
  const results: any[] = [];
  try {
    for (const [batchId, rows] of batches) {
      let last: any;
      for (let attempt = 1; attempt <= 4; attempt++) {
        try {
          const result = await service.runArtBatch(batchId, { maxJobs: rows.length, concurrency: 64, jobIds: rows.map(j => j.id), acknowledgeBlock: true });
          last = { batchId, count: rows.length, state: result.state, jobIds: rows.map(j => j.id), attempt }; break;
        } catch (error) {
          last = { batchId, count: rows.length, error: error instanceof Error ? error.message : String(error), code: (error as any)?.code ?? null, attempt };
          if ((error as any)?.code !== 'ART_STORE_BUSY') break;
          await new Promise(resolve => setTimeout(resolve, attempt * 1500));
        }
      }
      results.push(last);
    }
    await service.wakeArtWorker();
    // Keep the durable worker alive long enough to claim this cycle's jobs.
    await new Promise(resolve => setTimeout(resolve, 2500));
  } catch (error) {
    results.push({ error: error instanceof Error ? error.message : String(error), code: (error as any)?.code ?? null });
  }
  const after = JSON.parse(await readFile(path.join(privateRoot, 'state.json'), 'utf8'));
  const submitted = after.batches.flatMap((b: any) => b.jobs).filter((j: any) => j.paidAttempts > 0).length;
  const report = { at: new Date().toISOString(), requested: 64, selected: selected.length, results,
    inFlight: after.batches.flatMap((b: any) => b.jobs).filter((j: any) => j.state === 'generating').length,
    submitted, queuedReady: ready.length, gate: after.circuitBreaker ?? null };
  await writeFile(path.join(out, 'direct-batch-dispatch-0825.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
}
await cycle();
setInterval(() => { cycle().catch(error => console.error(error)); }, 15 * 60 * 1000);
