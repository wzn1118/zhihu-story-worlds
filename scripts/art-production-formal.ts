import { appendFile, mkdir, open, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createFormalReferenceDigestReader } from './art-production-formal-reference-cache.ts';
import path from 'node:path';
import { authoredWorlds } from '../content/worlds.ts';
import { createArtProductionService } from '../server/art-production.ts';
import { augmentedShortWorld, buildShortPlans, SHORT_FOLDER, SHORT_PROFILE, SHORT_STYLE_REVISION, SHORT_REPAIR_FILE, type ShortAssetPlan } from '../server/art-production-short.ts';
import { canonical, sha256, type SceneBrief } from '../server/art-production-prompts.ts';
import { replaceArtFile } from '../server/art-production-files.ts';
import { readArtReviewEvidence } from '../server/art-production-review-files.ts';
import type { ArtBatch, ArtJob, ArtJobKind } from '../shared/production.ts';
import { formalStyleBrief, formalSupervisorOptions, runFormalSupervisor, type FormalRow, type FormalSupervisorState } from './art-production-formal-supervisor.ts';

interface FormalStatus {
  at: string; profile: string; planHash: string; worldCount: number; globalConcurrency: number;
  requiredAssets: number; requiredScenes: number; prepared: number; awaitingAnchors: number;
  paid: number; generated: number; native4k: number; reviewed: number; approved: number;
  paidHistory: number; generatedHistory: number; reviewedHistory: number; inFlight: number;
  circuitBreaker?: ArtBatch['circuitBreaker']; jobs: Array<ShortAssetPlan & FormalRow & { references: string[] }>;
}

const root = process.cwd();
const folder = path.join(root, SHORT_FOLDER);
const [command = 'status', ...args] = process.argv.slice(2);
const supervisorOptions = command === 'run' || command === 'supervise' ? formalSupervisorOptions(args) : undefined;
// Keep the historical 32 default; --concurrency can raise local capacity to 64.
const formalConcurrency = supervisorOptions?.concurrency ?? 32;
await mkdir(path.join(folder, 'reviews'), { recursive: true });
const atomic = async (filename: string, value: unknown) => {
  const temp = `${filename}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2) + '\n');
  await replaceArtFile(temp, filename);
};
const key = (worldId: string, nodeId: string) => `${worldId}/${nodeId}`;
async function sourceDigest() {
  const files = (await readdir(path.join(root, 'content'), { recursive: true }))
    .filter(file => file.endsWith('.ts')).map(file => path.join(root, 'content', file));
  for (const owner of ['cel-drawing', 'painted-background', 'scene-composition']) files.push(path.join(root,
    'output/imagegen/scene-production/art-team', owner, 'short-production-20260907/book.json'));
  files.push(path.join(root, 'server/art-production-short.ts'));
  const repairs = path.join(root, SHORT_REPAIR_FILE);
  if (await stat(repairs).then(() => true).catch(() => false)) files.push(repairs);
  const hashes = [];
  for (const file of files.sort()) hashes.push([path.relative(root, file), sha256(await readFile(file))]);
  return sha256(canonical(hashes));
}
const initialSourceDigest = await sourceDigest();
const briefs = new Map<string, SceneBrief>();
const service = createArtProductionService({ startWorker: () => {}, buildBrief: async (_root, world, node) => {
  const brief = briefs.get(key(world.id, node.id));
  if (!brief) throw new Error('SHORT_BRIEF_NOT_READY');
  return brief;
} });
const plans = await buildShortPlans(root, authoredWorlds);
const currentHash = sha256(canonical(plans));
let batches = await service.listArtBatches();
let all = batches.flatMap(b => b.jobs);

if (command === 'review') {
  const [jobId, decision, reviewer, ...notes] = args;
  const batch = batches.find(b => b.jobs.some(j => j.id === jobId));
  const job = batch?.jobs.find(j => j.id === jobId);
  if (!job?.asset || (job.stale && decision === 'approved') || !['approved', 'rejected'].includes(decision) || !reviewer || notes.join(' ').length < 30)
    throw new Error('ACTUAL_VISUAL_REVIEW_REQUIRED');
  await atomic(path.join(folder, 'reviews', `${jobId}.json`), { jobId, sha256: job.asset.sha256, decision,
    reviewer, notes: notes.join(' '), fullImageViewed: true, nativeDetailViewed: true, styleReviewed: true, at: new Date().toISOString() });
}

async function sync(): Promise<FormalStatus> {
  batches = await service.listArtBatches(); all = batches.flatMap(b => b.jobs);
  const historyFile = path.join(folder, 'history-ids.json');
  const historyIds: string[] = await readFile(historyFile, 'utf8').then(JSON.parse).catch(error => {
    if (error.code === 'ENOENT') return []; throw error;
  });
  for (const job of all) if (plans.some(p => p.worldId === job.worldId && p.nodeId === job.nodeId && p.sourceHash === job.sourceHash)
    && !historyIds.includes(job.id)) historyIds.push(job.id);
  await atomic(historyFile, historyIds);
  briefs.clear();
  const readReferenceDigest = createFormalReferenceDigestReader();
  for (const plan of plans) {
    const brief = await formalStyleBrief(root, plan, all, readReferenceDigest);
    briefs.set(key(plan.worldId, plan.nodeId), brief ?? { prompt: plan.prompt, references: [], sourceHash: plan.sourceHash,
      referenceHash: sha256(canonical({ profile: SHORT_PROFILE, pending: plan.dependencies, blocked: plan.blocked })),
      blockedReason: plan.blocked ?? 'AWAITING_APPROVED_ANCHORS',
      ...(plan.kind === 'character-reaction' ? { aspectRatio: '2:3' } : {}) });
  }
  for (const world of authoredWorlds) {
    const ready = plans.filter(p => p.worldId === world.id && briefs.has(key(p.worldId, p.nodeId)));
    const changed = ready.filter(p => !all.some(j => !j.stale && j.worldId === p.worldId && j.nodeId === p.nodeId
      && j.sourceHash === p.sourceHash && j.promptHash === sha256(p.prompt)
      && j.referenceHash === briefs.get(key(p.worldId, p.nodeId))!.referenceHash));
    const prepare = changed.length ? changed : ready;
    if (prepare.length && (changed.length || batches.find(b => b.worldId === world.id)?.qualityPolicy !== 'style-first'))
      await service.prepareArtBatch({ world: augmentedShortWorld(world, plans), qualityPolicy: 'style-first',
        nodeIds: prepare.map(p => p.nodeId),
        jobKinds: Object.fromEntries(prepare.map(p => [p.nodeId, p.kind])) as Record<string, ArtJobKind> });
  }
  batches = await service.listArtBatches(); all = batches.flatMap(b => b.jobs);
  let appliedReviews = 0;
  const reviewImportWarnings: Array<{ file: string; code: string }> = [];
  for (const file of await readdir(path.join(folder, 'reviews'))) {
    if (!/^scene_[a-f0-9]+\.json$/.test(file)) continue;
    const evidence = await readArtReviewEvidence(path.join(folder, 'reviews', file));
    if (!evidence.review) { reviewImportWarnings.push({ file, code: evidence.warning! }); continue; }
    const review = evidence.review;
    const batch = batches.find(b => b.jobs.some(j => j.id === review.jobId));
    const job = batch?.jobs.find(j => j.id === review.jobId);
    if (!job?.asset || job.asset.sha256 !== review.sha256 || (job.stale && review.decision === 'approved')) continue;
    if (job.review && (!review.styleReviewed || (job.review.decision === review.decision
      && job.review.reviewer === review.reviewer && job.review.notes === review.notes))) continue;
    if (job.stale && review.decision === 'approved') continue;
    await service.reviewArtJob(batch!.id, job.id, review); appliedReviews++;
  }
  if (appliedReviews) return sync();
  const jobs = plans.map(plan => {
    const brief = briefs.get(key(plan.worldId, plan.nodeId));
    const job = brief && all.find(j => !j.stale && j.worldId === plan.worldId && j.nodeId === plan.nodeId
      && j.sourceHash === plan.sourceHash && j.promptHash === sha256(plan.prompt) && j.referenceHash === brief.referenceHash);
    const uncertain = all.some(j => j.worldId === plan.worldId && j.nodeId === plan.nodeId
      && ['unknown_outcome', 'recoverable'].includes(j.state));
    return { ...plan, status: plan.blocked ?? (uncertain ? 'UNKNOWN_IDENTITY_QUARANTINED'
      : brief?.blockedReason === 'AWAITING_APPROVED_ANCHORS' ? 'awaiting-approved-anchors' : job?.state ?? 'awaiting-approved-anchors'),
      ...(job ? { jobId: job.id, batchId: batches.find(b => b.worldId === plan.worldId)!.id, job } : {}),
      references: brief?.references.map(filename => path.relative(root, filename).replaceAll('\\', '/')) ?? [] };
  });
  const history = all.filter(j => historyIds.includes(j.id));
  const status = { at: new Date().toISOString(), profile: SHORT_PROFILE, styleRevision: SHORT_STYLE_REVISION,
    qualityPolicy: 'style-first', planHash: currentHash, worldCount: authoredWorlds.length,
    globalConcurrency: formalConcurrency, requiredAssets: plans.length, requiredScenes: plans.filter(p => p.kind === 'scene').length,
    prepared: jobs.filter(r => r.job).length, awaitingAnchors: jobs.filter(r => r.status === 'awaiting-approved-anchors').length,
    paid: jobs.reduce((n, r) => n + (r.job?.paidAttempts ?? 0), 0),
    generated: jobs.filter(r => r.job?.asset).length, native4k: jobs.filter(r => r.job?.asset?.native4k).length,
    reviewed: jobs.filter(r => r.job?.review).length, approved: jobs.filter(r => r.job?.review?.decision === 'approved').length,
    paidHistory: history.reduce((n, j) => n + j.paidAttempts, 0), generatedHistory: history.filter(j => j.asset).length,
    reviewedHistory: history.filter(j => j.review).length,
    inFlight: all.filter(j => j.state === 'generating').length, reviewImportWarnings,
    circuitBreaker: batches.find(b => b.circuitBreaker)?.circuitBreaker, jobs };
  await atomic(path.join(folder, 'state.json'), status);
  return status;
}

if (command === 'prepare' || command === 'review' || command === 'status') {
  const result = await sync();
  console.log(JSON.stringify({ ...result, jobs: undefined }));
} else if (command === 'run' || command === 'supervise') {
  const options = supervisorOptions!;
  // One supervisor owns fresh paid reservations across all art conversations.
  const lockPath = path.join(folder, 'supervisor.lock');
  try {
    const old = JSON.parse(await readFile(lockPath, 'utf8'));
    try { process.kill(old.pid, 0); throw new Error('SHORT_SUPERVISOR_ALREADY_ACTIVE'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
    await unlink(lockPath);
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const token = randomUUID();
  const handle = await open(lockPath, 'wx');
  await handle.writeFile(JSON.stringify({ pid: process.pid, token, at: new Date().toISOString() })); await handle.close();
  const supervisorFile = path.join(folder, 'supervisor-state.json');
  try {
    const previous: FormalSupervisorState | undefined = await readFile(supervisorFile, 'utf8').then(JSON.parse).catch(error => {
      if (error.code === 'ENOENT') return undefined; throw error;
    });
    await runFormalSupervisor({
      now: Date.now, sleep: milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
      persist: async state => {
        await atomic(supervisorFile, state);
        await appendFile(path.join(folder, 'supervisor-events.jsonl'), JSON.stringify(state) + '\n');
        console.log(JSON.stringify({ event: 'ART_SUPERVISOR', ...state }));
      },
      load: async () => {
        const paused = await stat(path.join(folder, 'pause')).then(() => true).catch(() => false);
        const sourceChanged = await sourceDigest() !== initialSourceDigest;
        if (paused || sourceChanged) {
          const current = await service.listArtBatches();
          const jobs = current.flatMap(batch => batch.jobs);
          return { jobs: [], allJobs: jobs, worldOrder: authoredWorlds.map(world => world.id),
            inFlight: jobs.filter(job => job.state === 'generating').length,
            runningBatches: current.filter(batch => batch.state === 'running').length,
            circuitBreaker: current.find(batch => batch.circuitBreaker)?.circuitBreaker, paused, sourceChanged };
        }
        const state = await sync();
        const worldOrder = [...authoredWorlds].sort((a, b) =>
          all.filter(j => j.worldId === a.id && j.assetKind && j.assetKind !== 'scene').reduce((n, j) => n + j.paidAttempts, 0)
          - all.filter(j => j.worldId === b.id && j.assetKind && j.assetKind !== 'scene').reduce((n, j) => n + j.paidAttempts, 0)).map(world => world.id);
        return { ...state, allJobs: all, worldOrder, runningBatches: batches.filter(batch => batch.state === 'running').length };
      },
      drain: () => service.drain(),
      recover: async jobs => {
        for (const batch of batches) {
          const ids = jobs.filter(job => batch.jobs.some(item => item.id === job.id)).map(job => job.id);
          if (ids.length) await service.runArtBatch(batch.id, { maxJobs: ids.length, concurrency: formalConcurrency,
            recoverOnly: true, jobIds: ids });
        }
        await service.drain();
      },
      dispatch: async (selected, acknowledgeGate) => {
        if (await sourceDigest() !== initialSourceDigest) throw new Error('SOURCE_CHANGED_RELOAD_REQUIRED');
        const latest = await service.listArtBatches();
        const gate = latest.find(batch => batch.circuitBreaker)?.circuitBreaker;
        if (gate && gate.at !== acknowledgeGate) throw new Error('FORMAL_GATE_CHANGED_RECHECK');
        for (const row of selected) {
          const job = latest.flatMap(batch => batch.jobs).find(job => job.id === row.jobId);
          if (!job || job.stale || job.state !== 'queued' || job.paidAttempts || job.asset
            || job.sourceHash !== row.job!.sourceHash || job.promptHash !== row.job!.promptHash
            || job.referenceHash !== row.job!.referenceHash) throw new Error('FORMAL_SELECTION_CHANGED_RECHECK');
        }
        await mkdir(path.join(folder, 'runs'), { recursive: true });
        await atomic(path.join(folder, 'runs', `${Date.now()}-${process.pid}.json`), {
          at: new Date().toISOString(), sourceDigest: initialSourceDigest, planHash: currentHash,
          concurrency: formalConcurrency, paidReservationLimit: selected.length, automaticResubmission: false,
          inspectedGate: gate, qualityPolicy: 'style-first', selected: selected.map(row => ({ worldId: row.worldId,
            nodeId: row.nodeId, kind: row.kind, jobId: row.jobId, sourceHash: row.job!.sourceHash,
            prompt: plans.find(plan => plan.worldId === row.worldId && plan.nodeId === row.nodeId)!.prompt,
            promptHash: row.job!.promptHash, referenceHash: row.job!.referenceHash, requested: row.job!.requested })) });
        let acknowledge = !!gate;
        for (const worldId of new Set(selected.map(row => row.worldId))) {
          const rows = selected.filter(row => row.worldId === worldId);
          await service.runArtBatch(rows[0].batchId!, { maxJobs: rows.length, concurrency: formalConcurrency,
            jobIds: rows.map(row => row.jobId!), ...(acknowledge ? { acknowledgeBlock: true } : {}) });
          acknowledge = false;
        }
        await service.drain();
      },
    }, options, previous);
  } catch (error) {
    const errno = (error as NodeJS.ErrnoException)?.code;
    const code = typeof errno === 'string' && /^[A-Z0-9_]{1,100}$/.test(errno) ? errno
      : error instanceof Error && /^[A-Z0-9_]{1,100}$/.test(error.message) ? error.message : 'FORMAL_SUPERVISOR_ERROR';
    const previous = await readFile(supervisorFile, 'utf8').then(JSON.parse).catch(() => ({}));
    const stopped = { ...previous, schemaVersion: 1, status: 'stopped', code, updatedAt: new Date().toISOString() };
    await atomic(supervisorFile, stopped);
    await appendFile(path.join(folder, 'supervisor-events.jsonl'), JSON.stringify(stopped) + '\n');
    console.error(JSON.stringify({ event: 'ART_SUPERVISOR_STOPPED', code }));
    process.exitCode = 1;
  } finally {
    const owner = await readFile(lockPath, 'utf8').then(JSON.parse).catch(() => undefined);
    if (owner?.token === token) await unlink(lockPath);
  }
} else throw new Error('Usage: prepare | status | supervise [--concurrency=32] [--max-wave=32] [--cooldown-seconds=60] [--once] | review JOB approved|rejected REVIEWER NOTES');
