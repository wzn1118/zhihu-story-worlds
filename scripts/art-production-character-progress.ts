import { readFile, readdir, writeFile } from 'node:fs/promises';
import { listArtBatches } from '../server/art-production.ts';

const directory = 'output/imagegen/scene-production/art-team/character-calibration';
const intents = (await readdir(directory)).filter(name => name.endsWith('.intent.json'));
const selected = new Set<string>();
for (const name of intents) {
  const record = JSON.parse(await readFile(`${directory}/${name}`, 'utf8'));
  for (const job of record.selected) selected.add(job.jobId);
}
const batches = await listArtBatches();
const jobs = batches.flatMap(batch => batch.jobs.filter(job => selected.has(job.id)));
const report = {
  updatedAt: new Date().toISOString(), target: 'Vampire Hunter D character-drawing calibration across original story casts',
  attempts: jobs.reduce((sum, job) => sum + job.paidAttempts, 0),
  generated: jobs.filter(job => job.asset).length,
  native4k: jobs.filter(job => job.asset?.native4k).length,
  reviewed: jobs.filter(job => job.review).length,
  approved: jobs.filter(job => !job.stale && job.review?.decision === 'approved' && job.asset?.native4k).length,
  inFlight: jobs.filter(job => job.state === 'generating').length,
  failed: jobs.filter(job => job.state === 'failed').length,
  unknown: jobs.filter(job => job.state === 'unknown_outcome').length,
  circuitBreaker: batches.find(batch => batch.circuitBreaker)?.circuitBreaker,
  jobs,
  countsOnlyThisCalibration: true,
  upscaledOrCroppedDeliveries: 0,
};
await writeFile(`${directory}/current-status.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, jobs: jobs.map(job => ({ id: job.id, worldId: job.worldId, nodeId: job.nodeId, state: job.state, asset: job.asset, reviewed: job.review?.decision })) }));
