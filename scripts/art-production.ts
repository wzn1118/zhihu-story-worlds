import { pathToFileURL } from 'node:url';
import { prepareArtBatch, listArtBatches, getArtBatch, runArtBatch, pauseArtBatch, reviewArtJob } from '../server/art-production.ts';

const [command, id, ...rest] = process.argv.slice(2);
let result: unknown;
if (command === 'prepare') {
  const { authoredWorlds } = await import(pathToFileURL(`${process.cwd()}/content/worlds.ts`).href);
  const selected = (authoredWorlds as import('../shared/production.ts').ArtWorldInput[]).filter(w => id === 'all' || w.id === id);
  if (!selected.length) throw new Error('WORLD_NOT_FOUND');
  result = [];
  for (const world of selected) (result as unknown[]).push(await prepareArtBatch({ world }));
} else if (command === 'list') result = await listArtBatches();
else if (command === 'get') result = await getArtBatch(id);
else if (command === 'run' || command === 'recover') {
  result = await runArtBatch(id, { maxJobs: Number(rest[0] ?? 2), concurrency: 2, recoverOnly: command === 'recover',
    jobIds: rest[1] && rest[1] !== '--acknowledge' ? rest[1].split(',') : undefined,
    acknowledgeBlock: rest.includes('--acknowledge') });
} else if (command === 'pause') result = await pauseArtBatch(id);
else if (command === 'review') result = await reviewArtJob(id, rest[0], {
  decision: rest[1] as 'approved' | 'rejected', reviewer: 'art-production visual inspection', notes: rest.slice(2).join(' '),
});
else throw new Error('Usage: prepare WORLD|all; list; get BATCH; run|recover BATCH [BUDGET] [JOB_IDS] [--acknowledge]; pause BATCH; review BATCH JOB approved|rejected NOTES');
// Print small safe progress summaries by default. Full public snapshots live in manifest.json.
const summary = (b: any) => b ? ({ id: b.id, worldId: b.worldId, state: b.state, progress: b.progress,
  circuitBreaker: b.circuitBreaker, jobs: b.jobs.filter((j: any) => j.state !== 'queued').map((j: any) => ({ id: j.id, nodeId: j.nodeId, state: j.state, asset: j.asset, review: j.review, errorCode: j.errorCode })) }) : null;
console.log(JSON.stringify(Array.isArray(result) ? result.map(summary) : summary(result), null, 2));
