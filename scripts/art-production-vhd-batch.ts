import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { authoredWorlds } from '../content/worlds.ts';
import { ART_WORLD_OWNERS } from '../server/art-production-delegates.ts';
import { inspectCalibrationGate } from '../server/art-production-calibration.ts';
import { buildSceneBrief, sha256 } from '../server/art-production-prompts.ts';
import { VHD_REFERENCE_FILES, VHD_REFERENCE_REVISION } from '../server/art-production-references.ts';
import { createArtProductionService, getArtBatch, listArtBatches, prepareArtBatch, runArtBatch } from '../server/art-production.ts';

const root = process.cwd();
const directory = path.join(root, 'output/imagegen/scene-production/batch-vhd-20260906');
const [command = 'status', ...args] = process.argv.slice(2);
const knownUnknown = 'scene_b6d835c0e9972b9f4ed8c9fd9dba';
await mkdir(directory, { recursive: true });

async function trackedReleaseJobs() {
  const ids = new Set<string>();
  for (const file of await readdir(path.join(directory, 'runs')).catch(() => [])) {
    if (!file.endsWith('.intent.json')) continue;
    const record = JSON.parse(await readFile(path.join(directory, 'runs', file), 'utf8'));
    if (record.referenceRevision === VHD_REFERENCE_REVISION) for (const job of record.selected) ids.add(job.id);
  }
  return ids;
}

async function latestBrief(world: typeof authoredWorlds[number], nodeId: string) {
  const brief = await buildSceneBrief(root, world, world.nodes[nodeId]);
  if (VHD_REFERENCE_FILES.some((ref, index) => path.resolve(root, ref) !== brief.references[index])
    || brief.quality !== 'high' || brief.pixelSize) throw new Error(`LATEST_FRAME_DIRECTION_REQUIRED:${world.id}/${nodeId}`);
  return brief;
}

if (command === 'prepare') {
  const selected = args.length ? authoredWorlds.filter(world => args.includes(world.id)) : authoredWorlds;
  if (!selected.length || (args.length && selected.length !== new Set(args).size)) throw new Error('EXACT_AUTHORED_WORLD_REQUIRED');
  for (const world of selected) {
    if (Object.keys(world.nodes).length < 30) throw new Error(`AUTHORED_SCENE_SHORTFALL:${world.id}`);
    const materials = [];
    for (const node of Object.values(world.nodes)) {
      const brief = await latestBrief(world, node.id);
      materials.push({ worldId: world.id, nodeId: node.id, sceneTitle: node.title, location: node.location,
        time: node.time, sourceHash: brief.sourceHash, promptHash: sha256(brief.prompt), referenceHash: brief.referenceHash,
        referenceRevision: VHD_REFERENCE_REVISION, references: brief.references.map(ref => path.relative(root, ref)),
        requested: { aspectRatio: '16:9', resolution: '4K', quality: 'high' }, prompt: brief.prompt });
    }
    const batch = await prepareArtBatch({ world });
    const folder = path.join(directory, world.id);
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, 'scene-materials.jsonl'), materials.map(material => JSON.stringify(material)).join('\n') + '\n');
    const current = batch.jobs.filter(job => !job.stale);
    const record = { updatedAt: new Date().toISOString(), referenceRevision: VHD_REFERENCE_REVISION,
      worldId: world.id, title: world.title, owner: ART_WORLD_OWNERS[world.id], batchId: batch.id,
      prepared: materials.length, requestedMinimum: 30, currentJobs: current, sourceSpecific: true,
      paidByPreparation: 0, materialFile: 'scene-materials.jsonl' };
    await writeFile(path.join(folder, 'preparation.json'), JSON.stringify(record, null, 2) + '\n');
    console.log(JSON.stringify({ worldId: world.id, prepared: materials.length, paidByPreparation: 0 }));
  }
} else if (command === 'dispatch' || command === 'resume') {
  const ids = args.filter(value => !value.startsWith('--'));
  if (!ids.length || ids.length > 2 || ids.length !== new Set(ids).size) throw new Error('ONE_OR_TWO_EXACT_FRESH_JOBS_REQUIRED');
  const batches = await listArtBatches();
  const jobs = batches.flatMap(batch => batch.jobs);
  const uncertain = jobs.find(job => job.id === knownUnknown);
  if (!uncertain || uncertain.state !== 'unknown_outcome' || uncertain.paidAttempts !== 1 || uncertain.recoveryAvailable)
    throw new Error('KNOWN_UNKNOWN_CHANGED_REINSPECT');
  const tracked = await trackedReleaseJobs();
  if (jobs.some(job => (['recoverable', 'unknown_outcome'].includes(job.state) && job.id !== knownUnknown)
    || (job.state === 'generating' && !tracked.has(job.id))))
    throw new Error('OTHER_ACTIVE_OR_UNCERTAIN_JOB_REQUIRES_INSPECTION');
  if (jobs.filter(job => job.state === 'generating').length + ids.length > 2) throw new Error('TWO_PAID_REQUEST_LIMIT');
  const gate = batches.find(batch => batch.circuitBreaker)?.circuitBreaker;
  const nativeGateAt = args.find(value => value.startsWith('--inspected-native-gate='))?.slice('--inspected-native-gate='.length);
  const rejectionJobId = args.find(value => value.startsWith('--inspected-rejection-job='))?.slice('--inspected-rejection-job='.length)
    ?? (args.includes('--inspected-correction-rejection') ? 'scene_49ad3c28e064bf0ec5fa2f04e75b'
      : args.includes('--inspected-island-rejection') ? 'scene_f3f1b15e3bbd5c181ef1a3f449f6'
        : args.includes('--inspected-prior-rejection') ? 'scene_43765a0133e8c94ea47e9cd85716' : undefined);
  const recoveredJobId = args.find(value => value.startsWith('--inspected-recovered-job='))?.slice('--inspected-recovered-job='.length);
  const inspectedFailure = inspectCalibrationGate(gate, jobs, { nativeGateAt, rejectionJobId, recoveredJobId });
  const selected = [];
  for (const id of ids) {
    const batch = batches.find(batch => batch.jobs.some(job => job.id === id));
    const job = batch?.jobs.find(job => job.id === id);
    if (!batch || !job || job.stale || job.state !== 'queued' || job.paidAttempts !== 0) throw new Error('CURRENT_UNTOUCHED_JOB_REQUIRED');
    if (batch.state === 'running') throw new Error('BATCH_ALREADY_RUNNING_SELECTION_FROZEN');
    if (inspectedFailure?.worldId === job.worldId && inspectedFailure.nodeId === job.nodeId)
      throw new Error('INSPECTED_FAILURE_IS_NOT_PERMISSION_TO_RETRY');
    if (jobs.some(prior => prior.worldId === job.worldId && prior.nodeId === job.nodeId
      && ['generating', 'recoverable', 'unknown_outcome'].includes(prior.state))) throw new Error('SAME_SCENE_OUTCOME_LOCKED');
    const world = authoredWorlds.find(world => world.id === job.worldId);
    if (!world) throw new Error('AUTHORED_WORLD_MISSING');
    const brief = await latestBrief(world, job.nodeId);
    if (sha256(brief.prompt) !== job.promptHash || brief.sourceHash !== job.sourceHash || brief.referenceHash !== job.referenceHash)
      throw new Error('SOURCE_OR_DIRECTION_CHANGED_REPREPARE');
    selected.push({ batchId: batch.id, ...job });
  }
  if (new Set(selected.map(job => job.worldId)).size !== selected.length) throw new Error('DISTINCT_STORY_FIRST_PASS_REQUIRED');
  const intent = { createdAt: new Date().toISOString(), referenceRevision: VHD_REFERENCE_REVISION,
    scope: 'User-directed new actual-frame drawing calibration for eventual all-story production; not a transport retry.',
    maxNewPaidRequests: selected.length, globalConcurrency: 2, priorGate: gate, selected,
    retainedUnknown: { id: uncertain.id, paidAttempts: uncertain.paidAttempts, recoveryAttempts: uncertain.recoveryAttempts } };
  const runFolder = path.join(directory, 'runs');
  await mkdir(runFolder, { recursive: true });
  for (const job of selected) {
    const intentFile = path.join(runFolder, `${job.id}.intent.json`);
    if (command === 'resume') {
      const original = JSON.parse(await readFile(intentFile, 'utf8'));
      const reservation = original.selected.find((item: { id: string }) => item.id === job.id);
      if (original.referenceRevision !== VHD_REFERENCE_REVISION || !reservation
        || reservation.sourceHash !== job.sourceHash || reservation.promptHash !== job.promptHash
        || reservation.referenceHash !== job.referenceHash || reservation.batchId !== job.batchId)
        throw new Error('EXACT_UNSUBMITTED_RESERVATION_REQUIRED');
      await writeFile(path.join(runFolder, `${job.id}.${Date.now()}.resume.json`), JSON.stringify({
        ...intent, scope: 'Resume exact previously authorized but never submitted selection; no repeat POST.',
        originalIntentAt: original.createdAt,
      }, null, 2) + '\n', { flag: 'wx' });
    } else {
      await writeFile(intentFile, JSON.stringify(intent, null, 2) + '\n', { flag: 'wx' });
    }
  }
  const reservedService = createArtProductionService({ startWorker: () => {} });
  for (const [index, job] of selected.entries()) {
    const current = await getArtBatch(job.batchId);
    if (current?.circuitBreaker && (index > 0 || current.circuitBreaker.at !== gate?.at)) throw new Error('NEW_GATE_STOPPED_DISPATCH');
    const result = await reservedService.runArtBatch(job.batchId, { jobIds: [job.id], maxJobs: 1, concurrency: 2,
      ...(index === 0 && gate ? { acknowledgeBlock: true } : {}) });
    const record = { at: new Date().toISOString(), batchId: job.batchId, batchState: result.state,
      job: result.jobs.find(item => item.id === job.id) };
    await writeFile(path.join(runFolder, `${job.id}.run.json`), JSON.stringify(record, null, 2) + '\n');
    console.log(JSON.stringify(record));
  }
  // Save both selections before waking the worker, so the first cannot monopolize
  // a dispatch cycle merely because its companion's state write takes longer.
  const last = selected.at(-1)!;
  await runArtBatch(last.batchId, { jobIds: [last.id], maxJobs: 1, concurrency: 2 });
} else if (command !== 'status') throw new Error('Usage: prepare [WORLD...]; status; dispatch|resume JOB [JOB] [--inspected-...=EVIDENCE]');

const live = await listArtBatches();
const dispatchedIds = await trackedReleaseJobs();
interface WorldProgress {
  worldId: string; title: string; owner: string; batchId?: string;
  required: number; preparedCurrentRelease: number; pendingMaterialRefresh: number;
  generated: number; native4k: number; reviewed: number; approved: number;
  paidAttempts: number; inFlight: number; failed: number; historicalDeliveredNotThisRelease: number;
}
const worlds: WorldProgress[] = [];
for (const world of authoredWorlds) {
  const batch = live.find(batch => batch.worldId === world.id);
  const all = batch?.jobs ?? [];
  const current = all.filter(job => !job.stale);
  let prepared: { currentJobs?: { id: string }[] } = {};
  try { prepared = JSON.parse(await readFile(path.join(directory, world.id, 'preparation.json'), 'utf8')); } catch { /* not prepared under this release */ }
  const preparedIds = new Set(prepared.currentJobs?.map(job => job.id) ?? []);
  const release = current.filter(job => preparedIds.has(job.id));
  const deliveredRelease = all.filter(job => preparedIds.has(job.id) || dispatchedIds.has(job.id));
  const required = Math.max(30, Object.keys(world.nodes).length);
  worlds.push({ worldId: world.id, title: world.title, owner: ART_WORLD_OWNERS[world.id], batchId: batch?.id,
    required, preparedCurrentRelease: release.length, pendingMaterialRefresh: required - release.length,
    generated: deliveredRelease.filter(job => job.asset).length, native4k: deliveredRelease.filter(job => job.asset?.native4k).length,
    reviewed: deliveredRelease.filter(job => job.review).length,
    approved: release.filter(job => job.review?.decision === 'approved' && job.asset?.native4k && !job.asset.duplicate).length,
    paidAttempts: deliveredRelease.reduce((sum, job) => sum + job.paidAttempts, 0),
    inFlight: deliveredRelease.filter(job => job.state === 'generating').length,
    failed: deliveredRelease.filter(job => job.state === 'failed').length,
    historicalDeliveredNotThisRelease: all.filter(job => job.asset && !deliveredRelease.some(item => item.id === job.id)).length });
}
const sum = (key: 'required' | 'preparedCurrentRelease' | 'generated' | 'native4k' | 'reviewed' | 'approved' | 'inFlight' | 'paidAttempts' | 'failed') =>
  worlds.reduce((total, world) => total + world[key], 0);
const status = { updatedAt: new Date().toISOString(), referenceRevision: VHD_REFERENCE_REVISION,
  storyCount: worlds.length, minimumRequested: worlds.length * 30, required: sum('required'),
  prepared: sum('preparedCurrentRelease'), generated: sum('generated'), native4k: sum('native4k'),
  reviewed: sum('reviewed'), approved: sum('approved'), inFlight: sum('inFlight'), paidAttempts: sum('paidAttempts'), failed: sum('failed'),
  circuitBreaker: live.find(batch => batch.circuitBreaker)?.circuitBreaker, worlds,
  claims: 'Prepared requirements are not generated files; generated is not reviewed or approved. No upscaling.' };
await writeFile(path.join(directory, 'status.json'), JSON.stringify(status, null, 2) + '\n');
console.log(JSON.stringify({ ...status, worlds: undefined }));
