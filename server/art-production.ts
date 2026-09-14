import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Writable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ArtAsset, ArtBatch, ArtConcurrency, ArtJob, ArtJobKind, ArtJobState, ArtProgress, ArtQualityPolicy, ArtWorldInput, PrepareArtBatchInput, ReviewArtJobInput, RunArtBatchOptions } from '../shared/production.ts';
import { buildSceneBrief, canonical, sha256, type SceneBrief } from './art-production-prompts.ts';
import type { SceneNode } from '../shared/types.ts';
import { replaceArtFile, retryArtFileOperation } from './art-production-files.ts';
import { guardFilmRun } from './art-production-film.ts';
import { NoPostEvidenceError, validateNoPostEvidence } from './art-production-no-post.ts';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const MAX_GLOBAL_CONCURRENCY = 64;
const JOB_KINDS: ArtJobKind[] = ['scene', 'character-anchor', 'character-reaction', 'cover', 'environment'];
const isScene = (job: ArtJob) => (job.assetKind ?? 'scene') === 'scene';
const isConcurrency = (value: unknown): value is ArtConcurrency =>
  Number.isInteger(value) && Number(value) >= 1 && Number(value) <= MAX_GLOBAL_CONCURRENCY;
const now = () => new Date().toISOString();
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const alive = (pid?: number): boolean => { if (!pid) return false; try { process.kill(pid, 0); return true; } catch { return false; } };
const text = (value: string): string => value.replace(/https?:\/\/\S+|(?:[A-Z]:[\\/]|\\\\)[^\s]+|Bearer\s+\S+/gi, '[redacted]').slice(0, 2000);
export const normalizeArtReviewText = text;
export function isNative4k(width: number, height: number, aspectRatio: '16:9' | '2:3' = '16:9'): boolean {
  if (aspectRatio === '2:3') return width >= 2160 && height >= 3840 && Math.abs(width / height / (2 / 3) - 1) <= 0.005;
  return width >= 3840 && height >= 2160 && Math.abs(width / height / (16 / 9) - 1) <= 0.005;
}
export class ArtProductionError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}
interface PrivateJob extends ArtJob {
  prompt: string; references: string[]; childPid?: number; workerPid?: number;
  activeAction?: 'generate' | 'recover'; lastRun?: string; errorStage?: ArtErrorStage;
}
interface PrivateBatch extends Omit<ArtBatch, 'jobs' | 'progress' | 'circuitBreaker'> {
  jobs: PrivateJob[]; runId?: string; selectedJobs?: string[];
}
interface Store { schemaVersion: 1; batches: PrivateBatch[]; circuitBreaker?: { code: string; at: string } }
const hardGateCode = (code?: string) => ['HTTP_401', 'HTTP_402', 'HTTP_403', 'HTTP_404', 'HTTP_429', 'HTTP_503', 'ART_CLIENT_INTEGRITY_FAILED'].includes(code ?? '');
export interface ArtClientResult {
  state: ArtJobState; file?: string; width?: number; height?: number; bytes?: number;
  sha256?: string; native4k?: boolean; recoveryAvailable: boolean; errorCode?: string; errorStage?: ArtErrorStage;
}
type ArtErrorStage = 'request_prepare' | 'client_spawn' | 'pid_persist' | 'client_wait' | 'client_result' | 'ingest';
interface Execution {
  directory: string; action: 'generate' | 'recover' | 'inspect';
  onPid: (pid: number) => Promise<void>;
}
interface ServiceOptions {
  root?: string;
  /** Recovery callers verify retired process identities before inspecting orphaned jobs. */
  isProcessAlive?: (pid?: number) => boolean;
  orphanInspectionConcurrency?: number;
  /** Explicit campaign authorization permits untouched nodes to continue; uncertain jobs stay quarantined. */
  continueIndependentAfterUncertainResult?: boolean;
  startWorker?: () => void;
  buildBrief?: (root: string, world: ArtWorldInput, node: SceneNode) => Promise<SceneBrief>;
  execute?: (execution: Execution) => Promise<ArtClientResult>;
  /** Offline tests retain the real PID/START protocol while replacing only the child program. */
  spawnClient?: (args: { directory: string; action: 'generate' | 'recover' | 'inspect'; root: string }) => ChildProcessByStdio<Writable, null, null>;
}

const transactionTails = new Map<string, Promise<void>>();
const safeCode = (error: unknown, fallback: string) => {
  const code = error && typeof error === 'object' && 'code' in error ? (error as { code?: unknown }).code : undefined;
  return typeof code === 'string' && /^[A-Z0-9_]{1,80}$/.test(code) ? code : fallback;
};

function counts(jobs: ArtJob[], minimum: number, qualityPolicy: ArtQualityPolicy): ArtProgress {
  const current = jobs.filter(j => !j.stale);
  const n = (predicate: (j: ArtJob) => boolean) => current.filter(predicate).length;
  const sceneCurrent = n(isScene);
  const ancillary = (predicate: (j: ArtJob) => boolean) => n(j => !isScene(j) && predicate(j));
  const accepted = (j: ArtJob) => !!j.asset && (qualityPolicy === 'style-first' || j.asset.native4k)
    && !j.asset.duplicate && j.review?.decision === 'approved';
  const covered = n(j => isScene(j) && accepted(j));
  const required = Math.max(minimum, sceneCurrent);
  return {
    deliveredTotal: jobs.filter(j => !!j.asset).length, reviewedTotal: jobs.filter(j => !!j.review).length,
    paidAttemptsTotal: jobs.reduce((n, j) => n + j.paidAttempts, 0),
    unknownOutcomeTotal: jobs.filter(j => j.state === 'unknown_outcome').length,
    total: jobs.length, current: current.length, queued: n(j => j.state === 'queued'),
    inFlight: n(j => j.state === 'generating'), generated: n(j => !!j.asset),
    native4k: n(j => !!j.asset?.native4k && !j.asset.duplicate), reviewed: n(j => !!j.review),
    approved: n(j => j.review?.decision === 'approved'), rejected: n(j => j.review?.decision === 'rejected'),
    blocked: n(j => j.state === 'blocked'), unknownOutcome: n(j => j.state === 'unknown_outcome'),
    recoverable: n(j => j.state === 'recoverable'), failed: n(j => j.state === 'failed'),
    stale: jobs.length - current.length, duplicates: n(j => !!j.asset?.duplicate),
    resolutionMismatch: n(j => !!j.asset && !j.asset.native4k),
    sceneCurrent, ancillaryCurrent: current.length - sceneCurrent, ancillaryGenerated: ancillary(j => !!j.asset),
    ancillaryNative4k: ancillary(j => !!j.asset?.native4k && !j.asset.duplicate),
    ancillaryReviewed: ancillary(j => !!j.review), ancillaryApproved: ancillary(j => j.review?.decision === 'approved'),
    ancillaryCovered: ancillary(accepted),
    required, covered, missing: required - covered, sceneShortfall: Math.max(0, minimum - sceneCurrent),
  };
}

function publicJob(j: PrivateJob): ArtJob {
  return {
    id: j.id, worldId: text(j.worldId), nodeId: text(j.nodeId), sceneTitle: text(j.sceneTitle),
    assetKind: j.assetKind ?? 'scene',
    sourceHash: j.sourceHash, promptHash: j.promptHash, referenceHash: j.referenceHash,
    stale: j.stale, state: j.state, requested: { aspectRatio: j.requested.aspectRatio ?? '16:9', resolution: '4K',
      ...(j.requested.pixelSize === '4096x2304' ? { pixelSize: '4096x2304' } : {}),
      ...(j.requested.quality === 'high' ? { quality: 'high' } : {}) },
    paidAttempts: j.paidAttempts, recoveryAttempts: j.recoveryAttempts, recoveryAvailable: j.recoveryAvailable,
    ...(j.asset ? { asset: { ...j.asset } } : {}),
    ...(j.review ? { review: { ...j.review, reviewer: text(j.review.reviewer), notes: text(j.review.notes) } } : {}),
    ...(j.errorCode ? { errorCode: /^[A-Z0-9_]+$/.test(j.errorCode) ? j.errorCode : 'CLIENT_ERROR' } : {}),
    ...(j.failureHistory ? { failureHistory: j.failureHistory.map(e => ({ code: /^[A-Z0-9_]+$/.test(e.code) ? e.code : 'CLIENT_ERROR', at: e.at })) } : {}),
    createdAt: j.createdAt, updatedAt: j.updatedAt,
  };
}
function snapshot(b: PrivateBatch, store: Store): ArtBatch {
  const jobs = b.jobs.map(publicJob);
  const qualityPolicy = b.qualityPolicy === 'style-first' ? 'style-first' : 'native-4k';
  return {
    id: b.id, worldId: text(b.worldId), storyId: text(b.storyId), worldTitle: text(b.worldTitle), worldVersion: text(b.worldVersion),
    state: b.state, minimumImages: b.minimumImages, remainingRunBudget: b.remainingRunBudget,
    concurrency: b.concurrency, qualityPolicy, recoverOnly: b.recoverOnly, createdAt: b.createdAt, updatedAt: b.updatedAt,
    ...(store.circuitBreaker ? { circuitBreaker: { ...store.circuitBreaker } } : {}), jobs, progress: counts(jobs, b.minimumImages, qualityPolicy),
  };
}

export function createArtProductionService(options: ServiceOptions = {}) {
  const processAlive = options.isProcessAlive ?? alive;
  const root = path.resolve(options.root ?? ROOT);
  const production = path.join(root, 'output/imagegen/scene-production');
  const privateRoot = path.join(production, '.private');
  const stateFile = path.join(privateRoot, 'state.json');
  const storeKey = process.platform === 'win32' ? stateFile.toLowerCase() : stateFile;
  const wakeFile = path.join(privateRoot, 'worker-wake.json');
  const jobDirectory = (id: string) => path.join(privateRoot, 'jobs', id);
  const publicRoot = path.join(root, 'public/generated-art');
  const briefBuilder = options.buildBrief ?? buildSceneBrief;
  type PendingPid = { batchId: string; jobId: string; pid: number; resolve: () => void; reject: (error: unknown) => void };
  const pendingPids: PendingPid[] = [];
  let pidFlushQueued = false;

  async function atomic(filename: string, data: unknown) {
    await mkdir(path.dirname(filename), { recursive: true });
    const temp = `${filename}.${process.pid}.${randomUUID()}.tmp`;
    const handle = await open(temp, 'wx', 0o600);
    try { await handle.writeFile(JSON.stringify(data, null, 2) + '\n'); await handle.sync(); } finally { await handle.close(); }
    await replaceArtFile(temp, filename);
  }
  const signalWorker = () => atomic(wakeFile, { revision: randomUUID() });
  async function wakeRevision(): Promise<string> {
    try { return JSON.parse(await readFile(wakeFile, 'utf8')).revision; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''; throw error; }
  }
  async function lock(name: string, wait: boolean): Promise<(() => Promise<void>) | null> {
    await mkdir(privateRoot, { recursive: true });
    const filename = path.join(privateRoot, `${name}.lock`);
    const token = randomUUID();
    for (let attempt = 0; attempt < (wait ? 400 : 1); attempt++) {
      try {
        const handle = await open(filename, 'wx', 0o600);
        try { await handle.writeFile(JSON.stringify({ pid: process.pid, token, at: now() })); }
        finally { await handle.close(); }
        return async () => {
          try { const owner = JSON.parse(await readFile(filename, 'utf8')); if (owner.token === token) await unlink(filename); } catch { /* already released */ }
        };
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        // Windows can report a delete-pending lease as EPERM instead of EEXIST.
        if (code !== 'EEXIST' && !(process.platform === 'win32' && ['EPERM', 'EACCES', 'EBUSY'].includes(code ?? ''))) throw error;
        try {
          const owner = JSON.parse(await readFile(filename, 'utf8'));
          if (!processAlive(owner.pid)) { await unlink(filename); if (!wait) return lock(name, false); continue; }
        } catch {
          // A process can die between exclusive create and writing its PID. Allow a
          // generous grace period; never steal an ordinary live writer's brief gap.
          try { if (Date.now() - (await stat(filename)).mtimeMs > 30_000) { await unlink(filename); if (!wait) return lock(name, false); } } catch { /* changed concurrently */ }
        }
        if (wait) await sleep(25);
      }
    }
    if (wait) throw new ArtProductionError('ART_STORE_BUSY', 409);
    return null;
  }
  async function readStore(): Promise<Store> {
    let store: Store;
    try { store = JSON.parse(await retryArtFileOperation(() => readFile(stateFile, 'utf8'))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new ArtProductionError('ART_STORE_CORRUPT', 500); return { schemaVersion: 1, batches: [] }; }
    if (store.schemaVersion !== 1) throw new ArtProductionError('ART_STORE_VERSION', 500);
    return store;
  }
  async function transaction<T>(fn: (store: Store) => T | Promise<T>, persist: boolean | (() => boolean) = true): Promise<T> {
    // Queue all same-process service instances before entering the cross-process lock timeout.
    const previous = transactionTails.get(storeKey) ?? Promise.resolve();
    let finish!: () => void;
    const current = new Promise<void>(resolve => { finish = resolve; });
    transactionTails.set(storeKey, current);
    await previous;
    try {
      const release = await lock('state', true);
      try {
        const store = await readStore();
        const result = await fn(store);
        if (typeof persist === 'function' ? persist() : persist) {
          await atomic(stateFile, store);
          // This manifest is the only production record intended for publication.
          await atomic(path.join(production, 'manifest.json'), {
            schemaVersion: 1, updatedAt: now(), batches: store.batches.map(b => snapshot(b, store)),
          });
        }
        return result;
      } finally { await release?.(); }
    } finally {
      finish();
      if (transactionTails.get(storeKey) === current) transactionTails.delete(storeKey);
    }
  }
  async function flushPendingPids() {
    try {
      while (pendingPids.length) {
        const waitingBeforeTransaction = pendingPids.length;
        let updates: PendingPid[] | undefined;
        try {
          await transaction(store => {
            // Include children that arrived while this flush waited for the store lock.
            updates = pendingPids.splice(0);
            const changedBatches = new Set<PrivateBatch>();
            for (const update of updates) {
              const batch = batchById(store, update.batchId);
              const job = batch.jobs.find(candidate => candidate.id === update.jobId);
              if (!job || job.state !== 'generating') throw new ArtProductionError('ART_PID_PERSIST_REQUIRES_GENERATING', 409);
              job.childPid = update.pid;
              job.updatedAt = now();
              changedBatches.add(batch);
            }
            for (const batch of changedBatches) batch.updatedAt = now();
          });
          // START remains blocked until both durable transaction writes finish.
          for (const update of updates!) update.resolve();
        } catch (error) {
          // A lock/read failure has not claimed a batch. Settle its original waiters;
          // later arrivals can still use the next transaction without being stranded.
          for (const update of updates ?? pendingPids.splice(0, waitingBeforeTransaction)) update.reject(error);
        }
      }
    } finally {
      pidFlushQueued = false;
    }
  }
  function persistChildPid(batchId: string, jobId: string, pid: number): Promise<void> {
    return new Promise((resolve, reject) => {
      pendingPids.push({ batchId, jobId, pid, resolve, reject });
      if (!pidFlushQueued) {
        pidFlushQueued = true;
        queueMicrotask(() => { void flushPendingPids(); });
      }
    });
  }
  function batchById(store: Store, id: string): PrivateBatch {
    const batch = store.batches.find(b => b.id === id);
    if (!batch) throw new ArtProductionError('ART_BATCH_NOT_FOUND', 404);
    return batch;
  }
  const allJobs = (store: Store) => store.batches.flatMap(b => b.jobs);

  async function prepareArtBatch(input: PrepareArtBatchInput): Promise<ArtBatch> {
    const world = input.world;
    if (!world || typeof world.id !== 'string' || !world.id.trim() || world.id.length > 160
      || !world.nodes || !Array.isArray(world.characters) || typeof world.storyId !== 'string'
      || typeof world.title !== 'string' || typeof world.version !== 'string' || !world.source) throw new ArtProductionError('INVALID_ART_WORLD');
    if (input.qualityPolicy !== undefined && !['native-4k', 'style-first'].includes(input.qualityPolicy))
      throw new ArtProductionError('INVALID_ART_QUALITY_POLICY');
    const ids = input.nodeIds ?? Object.keys(world.nodes);
    if (!ids.length || ids.length > 2000 || new Set(ids).size !== ids.length
      || ids.some(id => !world.nodes[id] || world.nodes[id].id !== id || !Array.isArray(world.nodes[id].text) || !Array.isArray(world.nodes[id].choices))) throw new ArtProductionError('INVALID_ART_NODES');
    if (input.jobKinds !== undefined && (!input.jobKinds || typeof input.jobKinds !== 'object' || Array.isArray(input.jobKinds)
      || Object.entries(input.jobKinds).some(([id, kind]) => !world.nodes[id] || !JOB_KINDS.includes(kind)))) throw new ArtProductionError('INVALID_ART_JOB_KINDS');
    const containsScenes = ids.some(id => (input.jobKinds?.[id] ?? 'scene') === 'scene');
    const minimum = input.minimumImages ?? (containsScenes ? 30 : 0);
    if (!Number.isInteger(minimum) || minimum < 0 || minimum > 1000) throw new ArtProductionError('INVALID_ART_MINIMUM');
    if (containsScenes && minimum < 30) throw new ArtProductionError('ART_MINIMUM_MUST_BE_AT_LEAST_30');
    const prepared = await Promise.all(ids.map(async id => {
      const node = world.nodes[id];
      const kind = input.jobKinds?.[id] ?? 'scene';
      const brief = await briefBuilder(root, world, node);
      if (brief.blockedReason && !/^[A-Z0-9_]+$/.test(brief.blockedReason)) throw new ArtProductionError('ART_INVALID_BLOCK_REASON');
      if (brief.aspectRatio && (!['16:9', '2:3'].includes(brief.aspectRatio)
        || (brief.aspectRatio === '2:3' && (brief.pixelSize || (input.jobKinds?.[id] ?? 'scene') === 'scene'))))
        throw new ArtProductionError('ART_INVALID_ASSET_GEOMETRY');
      if (brief.quality && (brief.quality !== 'high' || brief.pixelSize)) throw new ArtProductionError('ART_QUALITY_GEOMETRY_CONFLICT');
      if (!Array.isArray(brief.references) || brief.references.length > 6
        || brief.references.some(ref => typeof ref !== 'string' || !ref.trim())) throw new ArtProductionError('ART_REFERENCE_COUNT');
      const promptHash = sha256(brief.prompt);
      const jobId = `scene_${sha256(canonical([world.id, id, brief.sourceHash, brief.referenceHash, promptHash,
        ...(brief.pixelSize ? [brief.pixelSize] : []), ...(brief.quality ? [{ quality: brief.quality }] : []),
        ...(brief.aspectRatio === '2:3' ? [{ aspectRatio: '2:3' }] : []),
        ...(brief.blockedReason ? [{ blockedReason: brief.blockedReason }] : []),
        ...(kind === 'scene' ? [] : [{ kind }])])).slice(0, 28)}`;
      return { node, kind, brief, jobId, promptHash };
    }));
    return transaction(async store => {
      const batchId = `art_${sha256(world.id).slice(0, 20)}`;
      let batch = store.batches.find(b => b.id === batchId);
      if (!batch) {
        batch = { id: batchId, worldId: world.id, storyId: world.storyId, worldTitle: world.title,
          worldVersion: world.version, state: 'prepared', minimumImages: minimum, remainingRunBudget: 0,
          concurrency: 2, qualityPolicy: input.qualityPolicy ?? 'native-4k', recoverOnly: false, createdAt: now(), updatedAt: now(), jobs: [] };
        store.batches.push(batch);
      }
      batch.worldTitle = world.title; batch.worldVersion = world.version;
      if (input.qualityPolicy !== undefined) batch.qualityPolicy = input.qualityPolicy;
      batch.minimumImages = containsScenes ? minimum : Math.max(batch.minimumImages, minimum);
      batch.storyId = world.storyId; batch.updatedAt = now();
      for (const job of batch.jobs) if (!world.nodes[job.nodeId]) job.stale = true;
      for (const { node, kind, brief, jobId, promptHash } of prepared) {
        // Reverting text may reuse the exact old revision, but never resets its attempts.
        const existing = batch.jobs.find(j => j.id === jobId);
        for (const old of batch.jobs.filter(j => j.nodeId === node.id && j.id !== jobId)) old.stale = true;
        if (existing) { existing.stale = false; continue; }
        batch.jobs.push({ id: jobId, worldId: world.id, nodeId: node.id, sceneTitle: node.title,
          assetKind: kind,
          sourceHash: brief.sourceHash, referenceHash: brief.referenceHash, promptHash,
          prompt: brief.prompt, references: brief.references, stale: false, state: brief.blockedReason ? 'blocked' : 'queued',
          ...(brief.blockedReason ? { errorCode: brief.blockedReason } : {}),
          requested: { aspectRatio: brief.aspectRatio ?? '16:9', resolution: '4K', ...(brief.pixelSize ? { pixelSize: brief.pixelSize } : {}), ...(brief.quality ? { quality: brief.quality } : {}) }, paidAttempts: 0, recoveryAttempts: 0,
          recoveryAvailable: false, createdAt: now(), updatedAt: now() });
      }
      return snapshot(batch, store);
    });
  }
  // Writers replace the complete file atomically. Readers need no write lock or disk writes.
  async function listArtBatches(): Promise<ArtBatch[]> {
    const store = await readStore();
    return store.batches.map(b => snapshot(b, store));
  }
  async function getArtBatch(id: string): Promise<ArtBatch | null> {
    const store = await readStore();
    const batch = store.batches.find(b => b.id === id);
    return batch ? snapshot(batch, store) : null;
  }
  async function confirmUnsubmittedArtJob(batchId: string, jobId: string, evidenceSha256: string): Promise<ArtBatch> {
    let changed = false;
    try {
      return await transaction(async store => {
        const batch = batchById(store, batchId);
        if (store.batches.some(candidate => candidate.state === 'running' || candidate.jobs.some(job => job.state === 'generating')))
          throw new ArtProductionError('ART_NO_POST_REQUIRES_IDLE', 409);
        const job = batch.jobs.find(candidate => candidate.id === jobId);
        if (!job) throw new ArtProductionError('ART_JOB_NOT_FOUND', 404);
        const receipt = await validateNoPostEvidence({
          job, batchId, directory: jobDirectory(job.id), publicAssetPath: path.join(publicRoot, `${job.id}.png`),
          evidenceSha256, isAlive: processAlive,
        });
        if (job.state !== 'failed' || job.errorCode !== 'DISPATCH_NOT_CONFIRMED_NO_POST') {
          changed = true;
          job.state = 'failed'; job.errorCode = 'DISPATCH_NOT_CONFIRMED_NO_POST';
          job.updatedAt = receipt.resolvedAt; batch.updatedAt = receipt.resolvedAt;
        }
        return snapshot(batch, store);
      }, () => changed);
    } catch (error) {
      if (error instanceof NoPostEvidenceError) throw new ArtProductionError(error.code, 409);
      throw error;
    }
  }
  const startWorker = options.startWorker ?? (() => {
    const child = spawn(process.execPath, ['--import', 'tsx', path.join(root, 'scripts/art-production-worker.ts')], {
      cwd: root, detached: true, stdio: 'ignore', windowsHide: true,
    });
    child.on('error', () => { /* run state is durable; explicit run can restart scheduler */ });
    child.unref();
  });
  async function runArtBatch(id: string, opts: RunArtBatchOptions = {}): Promise<ArtBatch> {
    const maxJobs = opts.maxJobs ?? 2;
    if (!Number.isInteger(maxJobs) || maxJobs < 1 || maxJobs > 1000) throw new ArtProductionError('INVALID_ART_RUN_BUDGET');
    if (opts.concurrency !== undefined && !isConcurrency(opts.concurrency)) throw new ArtProductionError('INVALID_ART_CONCURRENCY');
    const result = await transaction(async store => {
      const batch = batchById(store, id);
      if (opts.jobIds && (!opts.jobIds.length || opts.jobIds.some(jobId => !batch.jobs.some(j => j.id === jobId && (!j.stale || opts.recoverOnly))))) throw new ArtProductionError('INVALID_ART_JOB_SELECTION');
      if (!opts.recoverOnly) await guardFilmRun(root, batch.worldId, opts.jobIds, maxJobs, allJobs(store));
      if (store.circuitBreaker && !opts.recoverOnly && !opts.acknowledgeBlock) throw new ArtProductionError('ART_CIRCUIT_OPEN', 409);
      if (opts.acknowledgeBlock) delete store.circuitBreaker;
      if (batch.state !== 'running') {
        batch.state = 'running'; batch.remainingRunBudget = maxJobs;
        batch.concurrency = opts.concurrency ?? batch.concurrency;
        batch.recoverOnly = opts.recoverOnly === true; batch.runId = randomUUID();
        batch.selectedJobs = opts.jobIds ? [...opts.jobIds] : undefined; batch.updatedAt = now();
      }
      return snapshot(batch, store);
    });
    await signalWorker();
    startWorker();
    return result;
  }
  async function wakeArtWorker(): Promise<void> {
    await signalWorker();
    startWorker();
  }
  async function pauseArtBatch(id: string): Promise<ArtBatch> {
    const result = await transaction(store => { const batch = batchById(store, id); batch.state = 'paused'; batch.updatedAt = now(); return snapshot(batch, store); });
    await signalWorker();
    return result;
  }
  function validateReview(review: ReviewArtJobInput) {
    if (!['approved', 'rejected'].includes(review.decision) || !review.reviewer?.trim() || !review.notes?.trim()) throw new ArtProductionError('ART_REVIEW_NOTES_REQUIRED');
  }
  async function applyReview(store: Store, batchId: string, jobId: string, review: ReviewArtJobInput, expectedSha256?: string) {
      const batch = batchById(store, batchId);
      const job = batch.jobs.find(j => j.id === jobId);
      if (!job) throw new ArtProductionError('ART_JOB_NOT_FOUND', 404);
      if (!job.asset || (job.stale && review.decision === 'approved')) throw new ArtProductionError('ART_REVIEW_REQUIRES_CURRENT_IMAGE', 409);
      const asset = job.asset;
      if (expectedSha256 !== undefined && expectedSha256 !== asset.sha256) throw new ArtProductionError('ART_ASSET_INTEGRITY_FAILED', 409);
      const bytes = await readFile(path.join(publicRoot, `${job.id}.png`));
      if (sha256(bytes) !== asset.sha256 || bytes.length !== asset.bytes) throw new ArtProductionError('ART_ASSET_INTEGRITY_FAILED', 409);
      if (review.decision === 'approved' && (asset.duplicate || (!asset.native4k && batch.qualityPolicy !== 'style-first')))
        throw new ArtProductionError(batch.qualityPolicy === 'style-first'
          ? 'ART_APPROVAL_REQUIRES_DISTINCT_IMAGE' : 'ART_APPROVAL_REQUIRES_DISTINCT_NATIVE_4K', 409);
      job.review = { decision: review.decision, reviewer: text(review.reviewer), notes: text(review.notes), reviewedAt: now() };
      job.updatedAt = now(); batch.updatedAt = now();
      return batch;
  }
  async function reviewArtJob(batchId: string, jobId: string, review: ReviewArtJobInput): Promise<ArtBatch> {
    validateReview(review);
    return transaction(async store => snapshot(await applyReview(store, batchId, jobId, review), store));
  }
  async function reviewArtJobs(entries: { batchId: string; jobId: string; sha256: string; review: ReviewArtJobInput }[]): Promise<number> {
    if (!entries.length) return 0;
    if (entries.length > 2000 || new Set(entries.map(entry => entry.jobId)).size !== entries.length)
      throw new ArtProductionError('INVALID_ART_REVIEW_SELECTION');
    for (const entry of entries) {
      validateReview(entry.review);
      if (!/^[a-f0-9]{64}$/.test(entry.sha256)) throw new ArtProductionError('ART_ASSET_INTEGRITY_FAILED', 409);
    }
    // Every image is revalidated under the same lock; either all reviews persist or none do.
    // Avoid rewriting the complete historical ledger for each independent sidecar.
    return transaction(async store => {
      for (const entry of entries) await applyReview(store, entry.batchId, entry.jobId, entry.review, entry.sha256);
      return entries.length;
    });
  }
  const execute = options.execute ?? (async ({ directory, action, onPid }: Execution): Promise<ArtClientResult> => {
    const child = options.spawnClient
      ? options.spawnClient({ directory, action, root })
      : spawn('python', [path.join(root, 'scripts/art-production-client.py'), action, directory, '--await-dispatch'],
        { cwd: root, stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true });
    // Never pipe a provider response/CLI log to the application or shared server log.
    const exited = new Promise<void>((resolve, reject) => { child.once('error', reject); child.once('exit', () => resolve()); });
    if (!child.stdin) { child.kill(); throw new ArtProductionError('ART_CLIENT_NO_STDIN', 500); }
    child.stdin.on('error', () => { /* An early client exit is resolved through its result below. */ });
    let dispatchError: ArtClientResult | undefined;
    try {
      if (!child.pid) throw new Error('ART_CLIENT_NOT_STARTED');
      await onPid(child.pid);
    } catch {
      dispatchError = { state: 'failed', errorCode: 'DISPATCH_NOT_CONFIRMED_NO_POST', errorStage: 'pid_persist', recoveryAvailable: false };
    }
    // The client cannot send a paid request until its PID is durable.
    child.stdin.end(dispatchError ? undefined : 'START\n');
    await exited;
    try {
      const result = JSON.parse(await readFile(path.join(directory, 'result.json'), 'utf8')) as ArtClientResult;
      return dispatchError ? { ...result, ...dispatchError } : result;
    } catch {
      return dispatchError ?? { state: 'unknown_outcome', errorCode: 'CLIENT_RESULT_MISSING', errorStage: 'client_result', recoveryAvailable: false };
    }
  });

  type PendingIngest = { batchId: string; jobId: string; result: ArtClientResult;
    resolve: () => void; reject: (error: unknown) => void };
  const pendingIngests: PendingIngest[] = [];
  let ingestFlushQueued = false;
  async function applyIngest(store: Store, batchId: string, jobId: string, result: ArtClientResult) {
      const batch = batchById(store, batchId);
      const job = batch.jobs.find(j => j.id === jobId)!;
      if (job.errorCode && !job.failureHistory?.some(e => e.code === job.errorCode)) {
        (job.failureHistory ??= []).push({ code: job.errorCode, at: job.updatedAt });
      }
      if (result.errorCode) (job.failureHistory ??= []).push({ code: result.errorCode, at: now() });
      job.recoveryAvailable = result.recoveryAvailable === true;
      job.state = result.state;
      job.errorStage = result.errorStage;
      if (result.errorCode !== 'NO_SAVED_RESPONSE_NO_RESUBMISSION' || !job.errorCode) job.errorCode = result.errorCode;
      delete job.childPid; delete job.workerPid; delete job.activeAction;
      if (result.file) {
        const filepath = path.resolve(result.file);
        const relative = path.relative(jobDirectory(jobId), filepath);
        if (relative.startsWith('..') || path.isAbsolute(relative)) throw new ArtProductionError('ART_DELIVERY_OUTSIDE_JOB', 500);
        const binary = await readFile(filepath);
        const width = binary.readUInt32BE(16), height = binary.readUInt32BE(20);
        if (binary.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || sha256(binary) !== result.sha256
          || binary.length !== result.bytes || width !== result.width || height !== result.height) throw new ArtProductionError('ART_CLIENT_INTEGRITY_FAILED', 500);
        await mkdir(publicRoot, { recursive: true });
        const target = path.join(publicRoot, `${jobId}.png`);
        await writeFile(`${target}.tmp`, binary); await replaceArtFile(`${target}.tmp`, target);
        const duplicate = allJobs(store).some(other => other.id !== jobId && other.asset?.sha256 === result.sha256);
        const asset: ArtAsset = { url: `/generated-art/${jobId}.png`, width, height, bytes: binary.length,
          sha256: result.sha256!, native4k: isNative4k(width, height, job.requested.aspectRatio), originalPixels: true, duplicate };
        if (job.asset && job.asset.sha256 !== asset.sha256) delete job.review;
        job.asset = asset; job.state = asset.native4k ? 'generated' : 'resolution_mismatch'; delete job.errorCode;
        if (duplicate) job.errorCode = 'DUPLICATE_IMAGE_HASH';
        if ((!asset.native4k && batch.qualityPolicy !== 'style-first') || duplicate) {
          store.circuitBreaker ??= { code: duplicate ? 'DUPLICATE_IMAGE_HASH' : 'NATIVE_4K_GATE_FAILED', at: now() };
          for (const b of store.batches) if (b.state === 'running' && !b.recoverOnly) b.state = 'blocked';
        }
      }
      const isolated = options.continueIndependentAfterUncertainResult === true
        && ['unknown_outcome', 'recoverable'].includes(job.state)
        && ['HTTP_502', 'CLIENT_FAILED_OR_UNKNOWN', 'CLIENT_RESULT_MISSING'].includes(job.errorCode ?? '');
      if (!isolated && ['blocked', 'unknown_outcome', 'failed', 'recoverable'].includes(job.state) && job.lastRun === batch.runId) {
        if (!hardGateCode(store.circuitBreaker?.code)) {
          store.circuitBreaker = { code: /^[A-Z0-9_]+$/.test(job.errorCode ?? '') ? job.errorCode! : 'PRODUCTION_STOPPED_FOR_INSPECTION', at: now() };
        }
        for (const b of store.batches) if (b.state === 'running' && !b.recoverOnly) b.state = 'blocked';
      }
      job.updatedAt = now(); batch.updatedAt = now();
  }
  async function flushPendingIngests() {
    try {
      while (pendingIngests.length) {
        const waitingBeforeTransaction = Math.min(64, pendingIngests.length);
        let updates: PendingIngest[] | undefined;
        const failures = new Map<PendingIngest, unknown>();
        try {
          await transaction(async store => {
            // Claim completed deliveries after acquiring the store lock, up to one wave.
            updates = pendingIngests.splice(0, 64);
            for (const update of updates) {
              // Only the target job and batch headers mutate. A failed delivery must
              // roll back its own state without dropping successfully verified peers.
              const candidate: Store = { ...store, batches: store.batches.map(batch => ({
                ...batch, jobs: batch.id === update.batchId
                  ? batch.jobs.map(job => job.id === update.jobId ? structuredClone(job) : job)
                  : batch.jobs,
              })) };
              try {
                await applyIngest(candidate, update.batchId, update.jobId, update.result);
                store.batches = candidate.batches;
                const previousGate = store.circuitBreaker, candidateGate = candidate.circuitBreaker;
                if (previousGate && hardGateCode(previousGate.code) && !hardGateCode(candidateGate?.code)) candidate.circuitBreaker = previousGate;
                else if (previousGate && hardGateCode(previousGate.code) && hardGateCode(candidateGate?.code)) candidate.circuitBreaker = previousGate;
                store.circuitBreaker = candidate.circuitBreaker;
              } catch (error) { failures.set(update, error); }
            }
          });
          // Resolve only after both existing durable writes complete.
          for (const update of updates!) {
            if (failures.has(update)) update.reject(failures.get(update));
            else update.resolve();
          }
        } catch (error) {
          for (const update of updates ?? pendingIngests.splice(0, waitingBeforeTransaction)) update.reject(error);
        }
      }
    } finally { ingestFlushQueued = false; }
  }
  function ingest(batchId: string, jobId: string, result: ArtClientResult): Promise<void> {
    return new Promise((resolve, reject) => {
      pendingIngests.push({ batchId, jobId, result, resolve, reject });
      if (!ingestFlushQueued) {
        ingestFlushQueued = true;
        queueMicrotask(() => { void flushPendingIngests(); });
      }
    });
  }
  async function perform(batchId: string, job: PrivateJob, action: 'generate' | 'recover' | 'inspect') {
    const directory = jobDirectory(job.id);
    let stage: ArtErrorStage = 'request_prepare';
    let savedDelivery = false;
    try {
      await mkdir(directory, { recursive: true });
      if (action === 'generate') {
        await writeFile(path.join(directory, 'prompt.txt'), job.prompt, { encoding: 'utf8', flag: 'wx' });
        await atomic(path.join(directory, 'request.json'), { references: job.references, sourceHash: job.sourceHash,
          promptHash: job.promptHash, requested: job.requested });
      }
      stage = 'client_spawn';
      const result = await execute({ directory, action, onPid: async pid => {
        stage = 'pid_persist';
        await persistChildPid(batchId, job.id, pid);
        stage = 'client_wait';
      } });
      savedDelivery = !!result.file || result.recoveryAvailable;
      stage = 'ingest';
      await ingest(batchId, job.id, result);
    } catch (error) {
      await ingest(batchId, job.id, { state: savedDelivery ? 'recoverable' : 'unknown_outcome',
        errorCode: safeCode(error, 'WORKER_ERROR_INSPECT_BEFORE_RETRY'), errorStage: stage, recoveryAvailable: savedDelivery });
    }
  }
  async function drain(): Promise<void> {
    const release = await lock('worker', false);
    if (!release) return;
    const active = new Set<Promise<void>>();
    try {
      // Reconcile a prior crashed worker. A still-live child occupies a global slot.
      const abandoned = await transaction(store => store.batches.flatMap(b => b.jobs.filter(j => j.state === 'generating' && !processAlive(j.workerPid))
        .map(j => ({ batchId: b.id, job: { ...j } }))), false);
      const inspectLimit = Math.max(1, Math.min(64, options.orphanInspectionConcurrency ?? 1));
      for (let offset = 0; offset < abandoned.length; offset += inspectLimit) {
        await Promise.all(abandoned.slice(offset, offset + inspectLimit).map(async item => {
          if (!processAlive(item.job.childPid)) await perform(item.batchId, item.job, 'inspect');
        }));
      }
      let seenWake = '';
      let recheck = true;
      while (true) {
        const revision = await wakeRevision();
        if (!recheck && revision === seenWake && active.size) {
          await Promise.race([...active, sleep(1000)]);
          continue;
        }
        seenWake = revision;
        recheck = false;
        const claims = await transaction(async store => {
          const globalRunning = allJobs(store).filter(j => j.state === 'generating').length;
          const selected: { batchId: string; job: PrivateJob; action: 'generate' | 'recover' }[] = [];
          const running = store.batches.filter(b => b.state === 'running');
          // The largest active reservation authorizes the global ceiling; every batch also keeps its own cap.
          const limit = Math.min(MAX_GLOBAL_CONCURRENCY, Math.max(0, ...running.map(b => b.concurrency)));
          for (const batch of running) {
            if (store.circuitBreaker && !batch.recoverOnly) { batch.state = 'blocked'; continue; }
            if (!batch.recoverOnly && batch.remainingRunBudget > 0) {
              try { await guardFilmRun(root, batch.worldId, batch.selectedJobs, batch.remainingRunBudget, allJobs(store)); }
              catch (error) {
                batch.state = 'paused'; batch.updatedAt = now();
                const code = (error as Error).message;
                store.circuitBreaker = { code: /^[A-Z0-9_]+$/.test(code) ? code : 'FILM_DISPATCH_REQUIRES_INSPECTION', at: now() };
                continue;
              }
            }
            const eligible = batch.jobs.filter(j => (batch.recoverOnly || !j.stale) && (!batch.selectedJobs || batch.selectedJobs.includes(j.id))
              && j.lastRun !== batch.runId && (batch.recoverOnly
                ? (j.recoveryAvailable && j.state !== 'generating') || ['unknown_outcome', 'recoverable'].includes(j.state)
                : j.state === 'queued' && j.paidAttempts === 0 && !allJobs(store).some(prior => prior.id !== j.id
                  && prior.worldId === j.worldId && prior.nodeId === j.nodeId
                  && ['generating', 'unknown_outcome', 'recoverable'].includes(prior.state))));
            let batchRunning = batch.jobs.filter(j => j.state === 'generating').length;
            while (eligible.length && batch.remainingRunBudget > 0 && globalRunning + selected.length < limit && batchRunning < batch.concurrency) {
              const job = eligible.shift()!;
              job.state = 'generating'; job.lastRun = batch.runId; job.workerPid = process.pid;
              job.activeAction = batch.recoverOnly ? 'recover' : 'generate';
              if (batch.recoverOnly) job.recoveryAttempts++; else job.paidAttempts++;
              job.updatedAt = now(); batch.updatedAt = now(); batch.remainingRunBudget--;
              batchRunning++;
              selected.push({ batchId: batch.id, job: { ...job }, action: job.activeAction });
            }
            if ((!eligible.length || batch.remainingRunBudget <= 0) && !batch.jobs.some(j => j.state === 'generating')) batch.state = 'idle';
          }
          return selected;
        });
        for (const claim of claims) {
          const task = perform(claim.batchId, claim.job, claim.action).finally(() => {
            active.delete(task);
            recheck = true;
          });
          active.add(task);
        }
        if (active.size) {
          // A tiny wake record detects late queue additions without rewriting the
          // large production store every second or waiting for the slowest image.
          await Promise.race([...active, sleep(1000)]);
          continue;
        }
        const orphaned = await transaction(store => store.batches.flatMap(b => b.jobs.filter(j => j.state === 'generating')
          .map(j => ({ batchId: b.id, job: { ...j } }))), false);
        if (orphaned.length) {
          for (const item of orphaned) if (!processAlive(item.job.childPid)) await perform(item.batchId, item.job, 'inspect');
          recheck = true;
          await sleep(1000); continue;
        }
        break;
      }
    } finally {
      await Promise.allSettled(active);
      await release();
    }
    // Close the run/start race: a run saved during worker shutdown is picked up.
    const pending = await transaction(store => store.batches.some(b => b.state === 'running'), false);
    if (pending) startWorker();
  }
  return { prepareArtBatch, listArtBatches, getArtBatch, confirmUnsubmittedArtJob, runArtBatch, pauseArtBatch, reviewArtJob, reviewArtJobs, wakeArtWorker, drain };
}

const service = createArtProductionService();
export const { prepareArtBatch, listArtBatches, getArtBatch, runArtBatch, pauseArtBatch, reviewArtJob } = service;
export const wakeArtWorker = service.wakeArtWorker;
/** Internal worker entry, not an HTTP handler. */
export const drainArtQueue = service.drain;

/** Workshop: mount before Vite/static middleware. DTOs are safe; raw output is private. */
export function artPrivateFileGuard(
  request: { originalUrl?: string; url?: string },
  response: { status(code: number): { end(): unknown } },
  next: () => void,
) {
  let url = (request.originalUrl ?? request.url ?? '').split('?')[0];
  for (let i = 0; i < 3; i++) { try { url = decodeURIComponent(url); } catch { break; } }
  url = url.replaceAll('\\', '/').toLowerCase();
  if (/(^|\/)output(\/|$)|(^|\/)\.private(\/|$)|\.recovery\.json(?:$|\/)/.test(url)) return response.status(404).end();
  next();
}
