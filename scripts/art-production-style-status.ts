import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { authoredWorlds } from '../content/worlds.ts';
import { listArtBatches } from '../server/art-production.ts';

const root = process.cwd();
const production = path.join(root, 'output/imagegen/scene-production');
const runs = path.join(production, 'batch-vhd-20260906/runs');
const out = path.join(production, 'style-continuation-20260906');
const startedAt = '2026-09-06T06:30:00.000Z';
const ids = new Set<string>();
for (const name of await readdir(runs)) {
  if (!name.endsWith('.intent.json')) continue;
  const intent = JSON.parse(await readFile(path.join(runs, name), 'utf8'));
  if (Date.parse(intent.createdAt) < Date.parse(startedAt)) continue;
  for (const selected of intent.selected) ids.add(selected.id);
}
const batches = await listArtBatches();
const jobs = batches.flatMap(batch => batch.jobs).filter(job => ids.has(job.id));
const delivered = jobs.filter(job => job.asset);
const wave = JSON.parse(await readFile(path.join(production, 'batch-vhd-20260906/waves/first-forty.json'), 'utf8'));
const report = {
  updatedAt: new Date().toISOString(), startedAt, scope: 'This user-directed drawing continuation only; historical attempts excluded.',
  authoredStories: authoredWorlds.length,
  authoredRequirements: authoredWorlds.reduce((sum, world) => sum + Math.max(30, Object.keys(world.nodes).length), 0),
  wave: { id: wave.name, selected: wave.selected.length, worlds: new Set(wave.selected.map((item: { worldId: string }) => item.worldId)).size },
  newlySelectedRequests: jobs.length,
  newPaidAttempts: jobs.reduce((sum, job) => sum + job.paidAttempts, 0),
  deliveredImages: delivered.length,
  distinctDeliveredScenes: new Set(delivered.map(job => JSON.stringify([job.worldId, job.nodeId]))).size,
  native4k: delivered.filter(job => job.asset!.native4k).length,
  reviewed: delivered.filter(job => job.review).length,
  internallyApproved: delivered.filter(job => !job.stale && job.review?.decision === 'approved' && job.asset!.native4k && !job.asset!.duplicate).length,
  userApprovedClaimed: false,
  generatingOrRecovering: jobs.filter(job => job.state === 'generating').length,
  neverSubmitted: jobs.filter(job => job.paidAttempts === 0).length,
  circuitBreaker: batches.find(batch => batch.circuitBreaker)?.circuitBreaker ?? null,
  jobs,
};
const markdown = [
  '# Live Drawing Continuation', '',
  `Updated ${report.updatedAt}. ${report.scope}`, '',
  `This continuation: ${report.newPaidAttempts} paid attempts, ${report.deliveredImages} delivered images `
    + `(${report.distinctDeliveredScenes} distinct scenes), ${report.native4k} native-4K files, `
    + `${report.reviewed} reviewed, ${report.internallyApproved} internally approved. No user-approval claim.`, '',
  `Twenty-story requirement: ${report.authoredRequirements} actual scene nodes. First wave: ${report.wave.selected} exact selections across ${report.wave.worlds} stories. Queued is not generated.`, '',
  '| World / Node | Job | State | Actual Size | Review |',
  '| --- | --- | --- | --- | --- |',
  ...jobs.map(job => `| ${job.worldId}/${job.nodeId} | ${job.id} | ${job.state} | `
    + `${job.asset ? `${job.asset.width}x${job.asset.height}` : '-'} | ${job.review?.decision ?? 'pending'} |`), '',
  'Exact hashes and safe public asset URLs are in status.json. Original files are unchanged; review crops count as zero scene assets.',
  'Recovery uses saved responses/archives only. Funding, transport and uncertainty gates require inspection; no automatic paid resubmission.', '',
].join('\n');
await mkdir(out, { recursive: true });
for (const [name, text] of [['status.json', JSON.stringify(report, null, 2) + '\n'], ['status.md', markdown]]) {
  const target = path.join(out, name);
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, text);
  await rename(temporary, target);
}
const saved = JSON.parse(await readFile(path.join(out, 'status.json'), 'utf8'));
if (saved.jobs.length !== jobs.length) throw new Error('STYLE_STATUS_WRITE_VERIFICATION_FAILED');
console.log(JSON.stringify({ ...report, jobs: undefined }));
