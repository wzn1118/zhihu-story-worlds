import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { authoredWorlds } from '../content/worlds.ts';
import { buildSceneBrief, sha256 } from '../server/art-production-prompts.ts';
import { createArtProductionService, listArtBatches, prepareArtBatch, runArtBatch } from '../server/art-production.ts';
import { inspectCalibrationGate } from '../server/art-production-calibration.ts';

const root = process.cwd();
const folder = path.join(root, 'output/imagegen/scene-production/v1-production-20260906');
const [command = 'status', ...args] = process.argv.slice(2);
const styleHold = await readFile(path.join(folder, 'style-hold.json'), 'utf8').then(JSON.parse).catch(error => {
  if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
  throw error;
});
if (command === 'dispatch' && styleHold?.bulkDispatchHeld) throw new Error('STYLE_TRANSFER_REQUIRES_REVIEW');
const quarantined = new Set(['scene_b6d835c0e9972b9f4ed8c9fd9dba',
  'scene_e13b301274cfd1919093ac00697a', 'scene_22c64f4c9636554b3ccb8c91905e']);
const baseline = path.join(root, 'output/imagegen/scene-production/direct-style-20260906-2118/delivery/direct-style-01.png');
if (sha256(await readFile(baseline)) !== '245ce1e27351f91d25d7585e78df307b51c1fe40640f9b96045520be9a8d81f4')
  throw new Error('USER_SELECTED_V1_CHANGED');
await mkdir(path.join(folder, 'runs'), { recursive: true });
const matchesDirection = (prompt: string) => /吸血鬼猎人D画风[。.!]?\s*$/.test(prompt) && prompt.length <= 1000;
async function currentBrief(world: typeof authoredWorlds[number], nodeId: string) {
  if (!world.nodes[nodeId]) throw new Error('SOURCE_NODE_MISSING');
  const brief = await buildSceneBrief(root, world, world.nodes[nodeId]);
  if (!matchesDirection(brief.prompt) || brief.references.length || brief.quality || brief.pixelSize)
    throw new Error(`V1_TEXT_ONLY_DIRECTION_REQUIRED:${world.id}/${nodeId}`);
  return brief;
}

if (command === 'prepare') {
  const world = authoredWorlds.find(world => world.id === args[0]);
  if (!world) throw new Error('AUTHORED_WORLD_REQUIRED');
  const nodeIds = args.length > 1 ? args.slice(1) : Object.keys(world.nodes);
  const materials = [];
  for (const nodeId of nodeIds) {
    const brief = await currentBrief(world, nodeId);
    materials.push({ worldId: world.id, nodeId, ...brief, promptHash: sha256(brief.prompt) });
  }
  const batch = await prepareArtBatch({ world, nodeIds });
  await mkdir(path.join(folder, world.id), { recursive: true });
  for (const material of materials) {
    const job = batch.jobs.find(job => !job.stale && job.nodeId === material.nodeId)!;
    await writeFile(path.join(folder, world.id, `${job.id}.json`), JSON.stringify({ ...material,
      batchId: batch.id, jobId: job.id, requested: job.requested, preparedAt: new Date().toISOString(),
      paidByPreparation: 0 }, null, 2) + '\n', { flag: 'wx' }).catch(error => {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      });
    console.log(JSON.stringify({ worldId: world.id, nodeId: material.nodeId, batchId: batch.id, jobId: job.id,
      state: job.state, paidAttempts: job.paidAttempts, prompt: material.prompt, references: [] }));
  }
} else if (command === 'dispatch') {
  const ids = args.filter(value => !value.startsWith('--'));
  if (!ids.length || ids.length > 2 || new Set(ids).size !== ids.length) throw new Error('ONE_OR_TWO_EXACT_JOBS_REQUIRED');
  const batches = await listArtBatches();
  const all = batches.flatMap(batch => batch.jobs);
  const uncertain = all.filter(job => ['unknown_outcome', 'recoverable'].includes(job.state));
  if (uncertain.some(job => !quarantined.has(job.id) || job.state !== 'unknown_outcome'
    || job.paidAttempts !== 1 || job.recoveryAvailable)) throw new Error('NEW_UNCERTAINTY_REQUIRES_INSPECTION');
  if (all.filter(job => job.state === 'generating').length + ids.length > 2) throw new Error('GLOBAL_TWO_REQUEST_LIMIT');
  const gate = batches.find(batch => batch.circuitBreaker)?.circuitBreaker;
  const connectionAt = args.find(value => value.startsWith('--inspected-connection-gate='))?.split('=')[1];
  if (gate && connectionAt) {
    if (connectionAt !== '2026-09-06T07:58:42.076Z' || gate.code !== 'CLIENT_FAILED_OR_UNKNOWN' || gate.at !== connectionAt
      || uncertain.length !== 3 || !uncertain.some(job => job.failureHistory?.some(event => event.code === gate.code && event.at === gate.at)))
      throw new Error('EXACT_INSPECTED_CONNECTION_GATE_REQUIRED');
  } else if (gate) inspectCalibrationGate(gate, all, {
    nativeGateAt: args.find(value => value.startsWith('--inspected-native-gate='))?.split('=')[1],
    rejectionJobId: args.find(value => value.startsWith('--inspected-rejection-job='))?.split('=')[1],
  });
  const selected = [];
  for (const id of ids) {
    const batch = batches.find(batch => batch.jobs.some(job => job.id === id));
    const job = batch?.jobs.find(job => job.id === id);
    if (!batch || !job || job.stale || job.state !== 'queued' || job.paidAttempts || job.asset
      || batch.state === 'running') throw new Error('UNTOUCHED_FROZEN_SELECTION_REQUIRED');
    if (all.some(prior => prior.worldId === job.worldId && prior.nodeId === job.nodeId && prior.paidAttempts > 0))
      throw new Error('PREVIOUSLY_PAID_SCENE_EXCLUDED');
    const world = authoredWorlds.find(world => world.id === job.worldId)!;
    const brief = await currentBrief(world, job.nodeId);
    if (sha256(brief.prompt) !== job.promptHash || brief.sourceHash !== job.sourceHash || brief.referenceHash !== job.referenceHash)
      throw new Error('SOURCE_OR_DIRECTION_CHANGED_REPREPARE');
    selected.push({ batchId: batch.id, ...job });
  }
  if (new Set(selected.map(job => job.worldId)).size !== selected.length) throw new Error('DISTINCT_WORLDS_REQUIRED');
  const intent = { at: new Date().toISOString(), direction: 'user-selected-v1-text-only', maxNewPaidRequests: selected.length,
    priorGate: gate, preservedUnknown: uncertain.map(job => ({ id: job.id, state: job.state, paidAttempts: job.paidAttempts })), selected };
  for (const job of selected) await writeFile(path.join(folder, 'runs', `${job.id}.intent.json`), JSON.stringify(intent, null, 2) + '\n', { flag: 'wx' });
  const reserved = createArtProductionService({ startWorker: () => {} });
  for (const [index, job] of selected.entries()) {
    await reserved.runArtBatch(job.batchId, { jobIds: [job.id], maxJobs: 1, concurrency: 2,
      ...(index === 0 && gate ? { acknowledgeBlock: true } : {}) });
  }
  const last = selected.at(-1)!;
  await runArtBatch(last.batchId, { jobIds: [last.id], maxJobs: 1, concurrency: 2 });
  console.log(JSON.stringify({ dispatched: selected.map(job => ({ jobId: job.id, worldId: job.worldId, nodeId: job.nodeId })) }));
} else if (command !== 'status') throw new Error('Usage: prepare WORLD [NODE...]; dispatch JOB [JOB] [--inspected-...=EVIDENCE]; status');

const batches = await listArtBatches();
const tracked = new Set<string>();
for (const file of await readdir(path.join(folder, 'runs'))) {
  if (!file.endsWith('.intent.json')) continue;
  const intent = JSON.parse(await readFile(path.join(folder, 'runs', file), 'utf8'));
  for (const job of intent.selected) tracked.add(job.id);
}
const jobs = batches.flatMap(batch => batch.jobs).filter(job => tracked.has(job.id));
const preparedIds = new Set<string>();
for (const world of authoredWorlds) {
  const directory = path.join(folder, world.id);
  for (const file of await readdir(directory).catch(() => [])) {
    if (!/^scene_[a-z0-9]+\.json$/.test(file)) continue;
    const material = JSON.parse(await readFile(path.join(directory, file), 'utf8'));
    if (matchesDirection(material.prompt) && material.references.length === 0) preparedIds.add(material.jobId);
  }
}
const status = { at: new Date().toISOString(), direction: 'user-selected-v1-text-only',
  styleHold,
  preparedCurrent: batches.flatMap(batch => batch.jobs).filter(job => !job.stale && preparedIds.has(job.id)).length,
  dispatched: tracked.size, paidAttempts: jobs.reduce((sum, job) => sum + job.paidAttempts, 0),
  generated: jobs.filter(job => job.asset).length, native4k: jobs.filter(job => job.asset?.native4k).length,
  reviewed: jobs.filter(job => job.review).length,
  approved: jobs.filter(job => !job.stale && job.review?.decision === 'approved' && job.asset?.native4k && !job.asset.duplicate).length,
  inFlight: jobs.filter(job => job.state === 'generating').length,
  gate: batches.find(batch => batch.circuitBreaker)?.circuitBreaker,
  jobs: jobs.map(job => ({ id: job.id, worldId: job.worldId, nodeId: job.nodeId, state: job.state,
    paidAttempts: job.paidAttempts, asset: job.asset, review: job.review, errorCode: job.errorCode })) };
await writeFile(path.join(folder, 'status.json'), JSON.stringify(status, null, 2) + '\n');
console.log(JSON.stringify(status));
