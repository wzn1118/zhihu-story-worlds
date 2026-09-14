import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, copyFile, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { buildShortPlans } from '../server/art-production-short.ts';
import { currentSceneSourceHash, withApprovedArt } from '../server/workshop-art.ts';
import { canonical } from '../server/art-production-prompts.ts';
import { createWorkshopImageService } from '../server/workshop-images.ts';
import type { ArtBatch, ArtJob } from '../shared/production.ts';
import type { GameWorld } from '../shared/types.ts';

const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const root = resolve();
const ledger = JSON.parse(await readFile(resolve(root, 'output/imagegen/scene-production/manifest.json'), 'utf8'));
const batch: ArtBatch = ledger.batches.find((b: ArtBatch) => b.id === (process.argv[2] ?? 'art_8722cd196d766bd0bfbf'));
if (!batch || !/^import-[a-f0-9-]+$/.test(batch.storyId) || !/^r\d+$/.test(batch.worldVersion)) throw new Error('Invalid imported batch');
const world: GameWorld = JSON.parse(await readFile(resolve(root, '.local/story-workshop/projects', batch.storyId, batch.worldVersion, 'world.json'), 'utf8'));
if (world.id !== batch.worldId || world.version !== batch.worldVersion) throw new Error('World version mismatch');
const needsFormalHashes = batch.jobs.some(job => !job.stale && job.asset && world.nodes[job.nodeId]
  && currentSceneSourceHash(world, world.nodes[job.nodeId]) !== job.sourceHash);
const plans = needsFormalHashes ? await buildShortPlans(root, [world]).catch(() => []) : [];
const hashes = new Map(plans.filter(p => p.kind === 'scene').map(p => [p.nodeId, p.sourceHash]));
const selected = new Map<string, ArtJob>();
const rejected: { jobId: string; reason: string }[] = [];
for (const job of [...batch.jobs].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))) {
  if (job.stale || !job.asset || job.assetKind !== 'scene') continue;
  const node = world.nodes[job.nodeId], asset = job.asset;
  if (!node || job.worldId !== world.id || ![hashes.get(job.nodeId), node && currentSceneSourceHash(world, node)].includes(job.sourceHash)) {
    rejected.push({ jobId: job.id, reason: 'source-mismatch' }); continue;
  }
  if (!['generated', 'resolution_mismatch'].includes(job.state) || !asset.originalPixels || asset.duplicate || !/^\/generated-art\/[a-zA-Z0-9/_-]+\.png$/.test(asset.url)) throw new Error(`Invalid delivery: ${job.id}`);
  const bytes = await readFile(resolve(root, 'public', `.${asset.url}`));
  if (bytes.length < 45 || bytes.length !== asset.bytes || sha(bytes) !== asset.sha256 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
    || bytes.subarray(12, 16).toString() !== 'IHDR' || bytes.readUInt32BE(16) !== asset.width || bytes.readUInt32BE(20) !== asset.height
    || Math.abs(asset.width / asset.height / (16 / 9) - 1) > .005) throw new Error(`Integrity mismatch: ${job.id}`);
  selected.set(job.nodeId, job);
}
const jobs = [...selected.values()];
if (!jobs.length || new Set(jobs.map(j => j.asset!.sha256)).size !== jobs.length) throw new Error('Empty or duplicated delivery');
const destinationId = `wart_${sha(canonical([world.id, world.version])).slice(0, 20)}`;
const receipt = { sourceBatchId: batch.id, destinationBatchId: destinationId, worldId: world.id, title: world.title,
  policy: 'user-authorized-no-review', imported: jobs.length, totalScenes: Object.keys(world.nodes).length,
  missingNodes: Object.keys(world.nodes).filter(id => !selected.has(id)), rejected,
  assets: jobs.map(j => ({ sourceJobId: j.id, nodeId: j.nodeId, sourceHash: j.sourceHash, ...j.asset })) };
console.log(JSON.stringify({ ...receipt, assets: undefined }));
if (!process.argv.includes('--apply')) process.exit(0);

const privateRoot = resolve(root, 'output/workshop-images/.private');
const statePath = resolve(privateRoot, 'state.json'), lockPath = resolve(privateRoot, 'state.lock');
await mkdir(privateRoot, { recursive: true });
// Use the image service's cross-process lease, preserving other batches and workers.
const token = randomUUID();
const lock = await open(lockPath, 'wx', 0o600);
await lock.writeFile(JSON.stringify({ pid: process.pid, token, at: new Date().toISOString() }));
await lock.close();
async function atomic(file: string, value: unknown) {
  await mkdir(dirname(file), { recursive: true });
  const temp = `${file}.${token}.tmp`;
  const handle = await open(temp, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(value, null, 2)); await handle.sync(); } finally { await handle.close(); }
  await rename(temp, file);
}
try {
  const store = JSON.parse(await readFile(statePath, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return '{"version":1,"batches":[]}'; throw error;
  }));
  if (store.version !== 1 || !Array.isArray(store.batches)) throw new Error('Invalid image store');
  let target = store.batches.find((b: ArtBatch) => b.id === destinationId);
  if (target?.state === 'running' || target?.jobs.some((j: ArtJob) => j.state === 'generating')) throw new Error('Target batch is currently generating');
  const at = new Date().toISOString();
  if (!target) {
    target = { id: destinationId, worldId: world.id, storyId: world.storyId, worldTitle: world.title, worldVersion: world.version,
      state: 'paused', minimumImages: Math.max(30, Object.keys(world.nodes).length), remainingRunBudget: 0,
      concurrency: 8, qualityPolicy: 'style-first', recoverOnly: false, createdAt: at, updatedAt: at, jobs: [] };
    store.batches.push(target);
  }
  if (target.worldId !== world.id || target.storyId !== world.storyId || target.worldVersion !== world.version) throw new Error('Destination mismatch');
  for (const job of jobs) {
    const id = `wscene_${sha(canonical(['import', batch.id, job.id, job.asset!.sha256])).slice(0, 28)}`;
    for (const old of target.jobs) if (old.nodeId === job.nodeId && old.id !== id) old.stale = true;
    const url = `/generated-art/workshop/${id}.png`;
    await mkdir(resolve(root, 'public/generated-art/workshop'), { recursive: true });
    await copyFile(resolve(root, 'public', `.${job.asset!.url}`), resolve(root, 'public', `.${url}`));
    const imported = { ...job, id, prompt: '', recoveryAvailable: false, asset: { ...job.asset, url },
      review: { decision: 'approved', reviewer: 'user-authorized-direct-import',
        notes: `User explicitly requested import without review. No visual review performed. Source batch ${batch.id}; source job ${job.id}. Original pixels and source hash verified.`, reviewedAt: at }, updatedAt: at };
    const index = target.jobs.findIndex((j: ArtJob) => j.id === id);
    if (index < 0) target.jobs.push(imported); else target.jobs[index] = imported;
  }
  target.qualityPolicy = 'style-first'; target.updatedAt = at;
  const receiptPath = resolve(root, 'output/art-imports', `${batch.id}.json`);
  await copyFile(statePath, `${receiptPath}.state-backup.json`).catch(async (error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
    await mkdir(dirname(receiptPath), { recursive: true });
    await copyFile(statePath, `${receiptPath}.state-backup.json`).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'ENOENT') throw e; });
  });
  await atomic(statePath, store);
  const service = createWorkshopImageService({ root });
  const bound = await withApprovedArt(world, destinationId, { getArtBatch: service.getImages, listArtBatches: service.listImages });
  const matched = jobs.filter(job => bound.nodes[job.nodeId].background.includes(sha(canonical(['import', batch.id, job.id, job.asset!.sha256])).slice(0, 28)));
  await atomic(receiptPath, { ...receipt, appliedAt: at, runtimeBound: matched.length });
  if (matched.length !== jobs.length) throw new Error(`Runtime bound ${matched.length}/${jobs.length}; see ${receiptPath}`);
  console.log(JSON.stringify({ applied: true, runtimeBound: matched.length, receiptPath }));
} finally {
  const saved = JSON.parse(await readFile(lockPath, 'utf8'));
  if (saved.token === token) await rm(lockPath);
}
