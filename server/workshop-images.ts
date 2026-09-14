import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { ArtAsset, ArtBatch, ArtConcurrency, ArtJob, ArtProgress, ArtWorldInput, ReviewArtJobInput } from '../shared/production.ts';
import type { SceneNode } from '../shared/types.ts';
import { workshopImageStyle } from './workshop-art-direction.ts';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const now = () => new Date().toISOString();
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
export function workshopImageSourceHash(world: ArtWorldInput, node: SceneNode) {
  const { background: _background, ...scene } = node;
  const cast = world.characters.map(({ portrait: _portrait, portraits: _portraits, ...character }) => character);
  return sha(canonical({ worldId: world.id, storyId: world.storyId, title: world.title, source: world.source, summary: world.summary, adaptation: world.adaptation, cast, scene }));
}
export class WorkshopImageError extends Error {
  constructor(public code: string, public status = 409) { super(code); }
}
interface PrivateJob extends ArtJob { prompt: string; ownerPid?: number; childPid?: number; runId?: string }
interface PrivateBatch extends Omit<ArtBatch, 'jobs' | 'progress' | 'circuitBreaker'> { jobs: PrivateJob[]; runId?: string }
interface Store { version: 1; batches: PrivateBatch[]; circuitBreaker?: { code: string; at: string } }
export interface ImageResult { state: ArtJob['state']; file?: string; width?: number; height?: number; bytes?: number; sha256?: string; recoveryAvailable: boolean; errorCode?: string }
export interface ImageExecution { directory: string; action: 'generate' | 'inspect' | 'recover'; onPid: (pid: number) => Promise<void> }
export interface WorkshopImageOptions { root?: string; pixelSize?: '4096x2304'; execute?: (input: ImageExecution) => Promise<ImageResult>; startWorker?: () => void; isAlive?: (pid: number) => boolean }
export interface RunImagesOptions { maxJobs?: number; concurrency?: number; recoverOnly?: boolean }
export function findWorkshopImageBatch(world: Pick<ArtWorldInput, 'id' | 'storyId' | 'version'>, batches: ArtBatch[]): ArtBatch | null {
  return batches.find(batch => batch.id.startsWith('wart_') && batch.worldId === world.id && batch.storyId === world.storyId && batch.worldVersion === world.version) ?? null;
}
const processAlive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const queues = new Map<string, Promise<unknown>>();
const native4k = (width: number, height: number) => width >= 3840 && height >= 2160 && Math.abs(width / height / (16 / 9) - 1) <= .005;
const cleanText = (value: string) => value.replace(/https?:\/\/\S+|Bearer\s+\S+|(?:[A-Z]:[\\/]|\\\\)[^\s]+/gi, '[redacted]').slice(0, 2000);
const safeCode = (value?: string) => value && /^[A-Z0-9_]{1,80}$/.test(value) ? value : 'IMAGE_OUTCOME_UNKNOWN';

function progress(jobs: ArtJob[], minimum: number): ArtProgress {
  const current = jobs.filter(j => !j.stale), count = (fn: (j: ArtJob) => boolean) => current.filter(fn).length;
  const distinct = new Set<string>();
  const approved = current.filter(j => { if (!j.asset || j.asset.duplicate || !j.asset.originalPixels || j.review?.decision !== 'approved' || distinct.has(j.asset.sha256)) return false; distinct.add(j.asset.sha256); return true; });
  const required = Math.max(minimum, current.length), covered = approved.length;
  return { total: jobs.length, current: current.length, deliveredTotal: jobs.filter(j => j.asset).length, reviewedTotal: jobs.filter(j => j.review).length,
    paidAttemptsTotal: jobs.reduce((n, j) => n + j.paidAttempts, 0), unknownOutcomeTotal: jobs.filter(j => j.state === 'unknown_outcome').length,
    queued: count(j => j.state === 'queued'), inFlight: count(j => j.state === 'generating'), generated: count(j => !!j.asset),
    native4k: count(j => !!j.asset?.native4k && !j.asset.duplicate), reviewed: count(j => !!j.review), approved: covered, covered,
    rejected: count(j => j.review?.decision === 'rejected'), blocked: count(j => j.state === 'blocked'), unknownOutcome: count(j => j.state === 'unknown_outcome'),
    recoverable: count(j => j.recoveryAvailable && !j.asset), failed: count(j => j.state === 'failed'), stale: jobs.length - current.length,
    duplicates: count(j => !!j.asset?.duplicate), resolutionMismatch: count(j => !!j.asset && !j.asset.native4k), sceneCurrent: current.length,
    ancillaryCurrent: 0, ancillaryGenerated: 0, ancillaryNative4k: 0, ancillaryReviewed: 0, ancillaryApproved: 0, ancillaryCovered: 0,
    required, missing: required - covered, sceneShortfall: Math.max(0, minimum - current.length) };
}
function snapshot(batch: PrivateBatch, store: Store): ArtBatch {
  const { runId: _runId, jobs: privateJobs, ...publicBatch } = batch;
  const jobs = privateJobs.map(({ prompt: _prompt, ownerPid: _owner, childPid: _child, runId: _run, ...job }) => structuredClone(job));
  return { ...publicBatch, jobs, progress: progress(jobs, batch.minimumImages), ...(store.circuitBreaker ? { circuitBreaker: { ...store.circuitBreaker } } : {}) };
}
function promptFor(world: ArtWorldInput, node: SceneNode) {
  // Older published games predate artBrief. Their real scene prose is still
  // usable image-model input; do not invent an illustration or alter old saves.
  const prose = node.text.slice(0, 2).join('\n');
  const cast = world.characters.filter(c => prose.includes(c.name) || node.speaker === c.name).map(c => `${c.name}：${c.description}`).join('\n');
  const brief = node.artBrief?.trim() || `${node.location}。${cast}\n${prose}`;
  if (!brief || brief.length > 4000) throw new WorkshopImageError('SCENE_ART_BRIEF_REQUIRED', 400);
  return brief.includes(workshopImageStyle) ? brief : `${brief}，${workshopImageStyle}`;
}

export function createWorkshopImageService(options: WorkshopImageOptions = {}) {
  const root = path.resolve(options.root ?? ROOT), privateRoot = path.join(root, 'output/workshop-images/.private');
  const stateFile = path.join(privateRoot, 'state.json'), publicRoot = path.join(root, 'public/generated-art/workshop');
  const alive = options.isAlive ?? processAlive;
  const jobDirectory = (id: string) => path.join(privateRoot, 'jobs', id);
  async function atomic(file: string, value: unknown) {
    await mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      const handle = await open(temporary, 'wx', 0o600);
      try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); } finally { await handle.close(); }
      for (let attempt = 0;; attempt++) {
        try { await rename(temporary, file); break; }
        catch (error) { if (attempt >= 8 || !['EPERM', 'EACCES', 'EBUSY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error; await sleep(20 * (attempt + 1)); }
      }
    } finally { await rm(temporary, { force: true }).catch(() => {}); }
  }
  async function lease(name: string, wait = true): Promise<(() => Promise<void>) | null> {
    await mkdir(privateRoot, { recursive: true }); const file = path.join(privateRoot, `${name}.lock`), token = randomUUID();
    const deadline = Date.now() + (wait ? 30_000 : 0);
    for (;;) {
      try {
        const handle = await open(file, 'wx', 0o600);
        try { await handle.writeFile(JSON.stringify({ pid: process.pid, token, at: now() })); await handle.sync(); } finally { await handle.close(); }
        return async () => { const saved = await readFile(file, 'utf8').then(JSON.parse).catch(() => null); if (saved?.token === token) await rm(file, { force: true }); };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        const saved = await readFile(file, 'utf8').then(JSON.parse).catch(() => null);
        if (saved?.pid && !alive(saved.pid)) { await rm(file, { force: true }); continue; }
        if (Date.now() >= deadline) { if (!wait) return null; throw new WorkshopImageError('WORKSHOP_IMAGE_STORE_BUSY'); }
        await sleep(50);
      }
    }
  }
  async function readStore(): Promise<Store> {
    try { const store = JSON.parse(await readFile(stateFile, 'utf8')); if (store.version !== 1 || !Array.isArray(store.batches)) throw new Error(); return store; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, batches: [] }; throw new WorkshopImageError('WORKSHOP_IMAGE_STORE_INVALID', 500); }
  }
  async function transaction<T>(fn: (store: Store) => T | Promise<T>): Promise<T> {
    const key = stateFile.toLowerCase(), previous = queues.get(key) ?? Promise.resolve();
    const pending = previous.catch(() => {}).then(async () => { const release = await lease('state'); try { const store = await readStore(); const result = await fn(store); await atomic(stateFile, store); return result; } finally { await release?.(); } });
    queues.set(key, pending); try { return await pending; } finally { if (queues.get(key) === pending) queues.delete(key); }
  }
  const find = (store: Store, id: string) => { const batch = store.batches.find(b => b.id === id); if (!batch) throw new WorkshopImageError('WORKSHOP_IMAGES_NOT_FOUND', 404); return batch; };
  const allJobs = (store: Store) => store.batches.flatMap(b => b.jobs);
  async function prepareImages(world: ArtWorldInput, directions?: Record<string, string>, partial = false): Promise<ArtBatch> {
    if (!world || typeof world.id !== 'string' || !world.id || typeof world.storyId !== 'string' || !world.storyId || !world.version || !world.source || !Array.isArray(world.characters) || !world.nodes) throw new WorkshopImageError('INVALID_IMAGE_WORLD', 400);
    const nodes = Object.entries(world.nodes);
    if (!nodes.length || nodes.length > 1000 || nodes.some(([id, node]) => id !== node.id || !Array.isArray(node.text) || !Array.isArray(node.choices))) throw new WorkshopImageError('INVALID_IMAGE_SCENES', 400);
    if (partial && (!directions || !Object.keys(directions).length || Object.keys(directions).some(id => !world.nodes[id]))) throw new WorkshopImageError('INVALID_IMAGE_DIRECTIONS', 400);
    const prepared = nodes.filter(([id]) => !partial || Object.hasOwn(directions!, id)).map(([, node]) => { const sourceHash = workshopImageSourceHash(world, node), prompt = directions?.[node.id] ?? promptFor(world, node), promptHash = sha(prompt); return { node, sourceHash, prompt, promptHash, id: `wscene_${sha(canonical([world.id, node.id, sourceHash, promptHash, ...(options.pixelSize ? [options.pixelSize] : [])])).slice(0, 28)}` }; });
    return transaction(store => {
      const id = `wart_${sha(canonical([world.id, world.version])).slice(0, 20)}`; let batch = store.batches.find(b => b.id === id);
      if (!batch) { batch = { id, worldId: world.id, storyId: world.storyId, worldTitle: world.title, worldVersion: world.version, state: 'prepared', minimumImages: 30, remainingRunBudget: 0, concurrency: 8, qualityPolicy: 'style-first', recoverOnly: false, createdAt: now(), updatedAt: now(), jobs: [] }; store.batches.push(batch); }
      batch.worldTitle = world.title; batch.updatedAt = now();
      batch.minimumImages = Math.max(30, nodes.length);
      for (const old of batch.jobs) {
        if (!partial || prepared.some(j => j.node.id === old.nodeId)) old.stale = !prepared.some(j => j.id === old.id);
        else if (!world.nodes[old.nodeId] || old.sourceHash !== workshopImageSourceHash(world, world.nodes[old.nodeId])) old.stale = true;
      }
      for (const item of prepared) {
        const existing = batch.jobs.find(j => j.id === item.id); if (existing) { existing.stale = false; continue; }
        const previousIdentity = allJobs(store).find(j => j.id === item.id);
        if (previousIdentity) { batch.jobs.push({ ...structuredClone(previousIdentity), stale: false }); continue; }
        const unresolved = allJobs(store).some(j => j.worldId === world.id && j.nodeId === item.node.id && ['generating', 'unknown_outcome', 'recoverable'].includes(j.state));
        batch.jobs.push({ id: item.id, worldId: world.id, nodeId: item.node.id, sceneTitle: item.node.title, sourceHash: item.sourceHash, promptHash: item.promptHash, prompt: item.prompt, referenceHash: sha('no-reference-v1'), assetKind: 'scene', stale: false,
          state: unresolved ? 'blocked' : 'queued', ...(unresolved ? { errorCode: 'PREVIOUS_IMAGE_OUTCOME_UNKNOWN' } : {}), requested: { aspectRatio: '16:9', resolution: '4K', ...(options.pixelSize ? { pixelSize: options.pixelSize } : {}) }, paidAttempts: 0, recoveryAttempts: 0, recoveryAvailable: false, createdAt: now(), updatedAt: now() });
      }
      return snapshot(batch, store);
    });
  }
  const getImages = async (id: string) => { const store = await readStore(), batch = store.batches.find(b => b.id === id); return batch ? snapshot(batch, store) : null; };
  const listImages = async () => { const store = await readStore(); return store.batches.map(b => snapshot(b, store)); };
  const startWorker = options.startWorker ?? (() => { const child = spawn(process.execPath, ['--import', 'tsx', path.join(root, 'server/workshop-image-worker.ts')], { cwd: root, detached: true, windowsHide: true, stdio: 'ignore' }); child.on('error', () => {}); child.unref(); });
  async function runImages(id: string, opts: RunImagesOptions = {}) {
    const budget = opts.maxJobs ?? 40, concurrency = opts.concurrency ?? 8;
    if (!Number.isInteger(budget) || budget < 1 || budget > 1000 || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) throw new WorkshopImageError('INVALID_IMAGE_RUN_LIMIT', 400);
    const result = await transaction(store => { const batch = find(store, id);
      if (store.circuitBreaker && !opts.recoverOnly) throw new WorkshopImageError('WORKSHOP_IMAGE_CIRCUIT_OPEN');
      if (batch.state !== 'running') { batch.state = 'running'; batch.runId = randomUUID(); batch.remainingRunBudget = budget; batch.concurrency = concurrency as ArtConcurrency; batch.recoverOnly = opts.recoverOnly === true; batch.updatedAt = now(); }
      return snapshot(batch, store);
    });
    startWorker(); return result;
  }
  const pauseImages = async (id: string) => transaction(store => { const batch = find(store, id); batch.state = 'paused'; batch.updatedAt = now(); return snapshot(batch, store); });
  async function reviewImage(id: string, jobId: string, input: ReviewArtJobInput) {
    if (!input || !['approved', 'rejected'].includes(input.decision) || typeof input.reviewer !== 'string' || !input.reviewer.trim() || typeof input.notes !== 'string' || !input.notes.trim() || input.reviewer.length > 120 || input.notes.length > 2000) throw new WorkshopImageError('IMAGE_REVIEW_DETAILS_REQUIRED', 400);
    return transaction(async store => { const batch = find(store, id), job = batch.jobs.find(j => j.id === jobId); if (!job?.asset) throw new WorkshopImageError('IMAGE_REVIEW_REQUIRES_DELIVERY');
      if (input.decision === 'approved' && (job.stale || job.asset.duplicate || !job.asset.originalPixels || !['generated', 'resolution_mismatch'].includes(job.state))) throw new WorkshopImageError('IMAGE_REVIEW_REQUIRES_CURRENT_DISTINCT_DELIVERY');
      const bytes = await readFile(path.join(publicRoot, `${job.id}.png`)).catch(() => { throw new WorkshopImageError('IMAGE_ASSET_MISSING'); });
      if (bytes.length !== job.asset.bytes || sha(bytes) !== job.asset.sha256) throw new WorkshopImageError('IMAGE_ASSET_INTEGRITY_FAILED');
      job.review = { decision: input.decision, reviewer: cleanText(input.reviewer), notes: cleanText(input.notes), reviewedAt: now() }; job.updatedAt = now(); batch.updatedAt = now(); return snapshot(batch, store);
    });
  }
  const execute = options.execute ?? (async ({ directory, action, onPid }: ImageExecution): Promise<ImageResult> => {
    const child = spawn('python', [path.join(root, 'scripts/workshop-image-client.py'), action, directory, '--await-dispatch'], { cwd: root, stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true });
    const done = new Promise<void>((resolve, reject) => { child.once('error', reject); child.once('exit', () => resolve()); });
    child.stdin.on('error', () => {});
    try { if (!child.pid) throw new Error(); await onPid(child.pid); child.stdin.end('START\n'); }
    catch { child.stdin.end(); await done.catch(() => {}); return { state: 'failed', errorCode: 'DISPATCH_NOT_CONFIRMED_NO_POST', recoveryAvailable: false }; }
    await done;
    try { return JSON.parse(await readFile(path.join(directory, 'result.json'), 'utf8')); }
    catch { return { state: 'unknown_outcome', errorCode: 'IMAGE_CLIENT_RESULT_MISSING', recoveryAvailable: false }; }
  });
  async function ingest(batchId: string, jobId: string, result: ImageResult) {
    let asset: ArtAsset | undefined;
    if (result.file) {
      if (path.resolve(result.file) !== path.join(jobDirectory(jobId), 'native.png')) throw new WorkshopImageError('IMAGE_DELIVERY_PATH_INVALID');
      const bytes = await readFile(result.file);
      if (bytes.length < 45 || bytes.length > 64 * 1024 * 1024 || bytes.length !== result.bytes || sha(bytes) !== result.sha256 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || bytes.subarray(12, 16).toString() !== 'IHDR') throw new WorkshopImageError('IMAGE_DELIVERY_INTEGRITY_FAILED');
      const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
      if (!width || !height || width !== result.width || height !== result.height) throw new WorkshopImageError('IMAGE_DELIVERY_DIMENSIONS_INVALID');
      await mkdir(publicRoot, { recursive: true }); const temporary = path.join(publicRoot, `${jobId}.${randomUUID()}.tmp`), file = path.join(publicRoot, `${jobId}.png`);
      await writeFile(temporary, bytes); try { await rename(temporary, file); } finally { await rm(temporary, { force: true }).catch(() => {}); }
      asset = { url: `/generated-art/workshop/${jobId}.png`, width, height, bytes: bytes.length, sha256: sha(bytes), native4k: native4k(width, height), duplicate: false, originalPixels: true };
    }
    await transaction(store => { const batch = find(store, batchId), job = batch.jobs.find(j => j.id === jobId)!;
      delete job.ownerPid; delete job.childPid; job.recoveryAvailable = result.recoveryAvailable === true;
      if (asset) { asset.duplicate = allJobs(store).some(j => j.id !== jobId && j.asset?.sha256 === asset.sha256); job.asset = asset; job.state = asset.native4k ? 'generated' : 'resolution_mismatch'; delete job.errorCode; }
      else { job.state = ['blocked', 'failed', 'recoverable', 'unknown_outcome'].includes(result.state) ? result.state : 'unknown_outcome'; job.errorCode = safeCode(result.errorCode); job.failureHistory = [...(job.failureHistory ?? []), { code: job.errorCode, at: now() }]; }
      if (/^HTTP_(401|402|403|429)$/.test(job.errorCode ?? '')) { store.circuitBreaker = { code: job.errorCode!, at: now() }; for (const candidate of store.batches) if (candidate.state === 'running' && !candidate.recoverOnly) candidate.state = 'blocked'; }
      job.updatedAt = now(); batch.updatedAt = now();
    });
  }
  async function perform(batchId: string, job: PrivateJob, action: ImageExecution['action']) {
    const directory = jobDirectory(job.id);
    try {
      await mkdir(directory, { recursive: true });
      if (action === 'generate') { await writeFile(path.join(directory, 'prompt.txt'), job.prompt, { flag: 'wx', mode: 0o600 }); await atomic(path.join(directory, 'request.json'), { references: [], sourceHash: job.sourceHash, promptHash: job.promptHash, requested: job.requested }); }
      const result = await execute({ directory, action, onPid: pid => transaction(store => { const current = find(store, batchId).jobs.find(j => j.id === job.id)!; current.childPid = pid; }) });
      await ingest(batchId, job.id, result);
    } catch (error) { await ingest(batchId, job.id, { state: 'unknown_outcome', errorCode: error instanceof WorkshopImageError ? error.code : 'IMAGE_WORKER_INTERRUPTED', recoveryAvailable: false }); }
  }
  async function drainImages() {
    const release = await lease('worker'); if (!release) return;
    const active = new Set<Promise<void>>();
    try {
      const abandoned = await transaction(store => store.batches.flatMap(b => b.jobs.filter(j => j.state === 'generating' && (!j.ownerPid || !alive(j.ownerPid)) && (!j.childPid || !alive(j.childPid))).map(job => { job.ownerPid = process.pid; return { batchId: b.id, job: structuredClone(job) }; })));
      for (const item of abandoned) await perform(item.batchId, item.job, 'inspect');
      for (;;) {
        const selected = await transaction(store => {
          const selected: { batchId: string; job: PrivateJob; action: ImageExecution['action'] }[] = [];
          const running = store.batches.filter(b => b.state === 'running'), ceiling = Math.min(16, Math.max(0, ...running.map(b => b.concurrency)));
          let globalRunning = allJobs(store).filter(j => j.state === 'generating').length;
          for (const batch of running) {
            if (store.circuitBreaker && !batch.recoverOnly) { batch.state = 'blocked'; continue; }
            let batchRunning = batch.jobs.filter(j => j.state === 'generating').length;
            for (const job of batch.jobs) {
              if (batch.remainingRunBudget <= 0 || globalRunning >= ceiling || batchRunning >= batch.concurrency) break;
              if (job.state === 'generating' || job.runId === batch.runId || (job.stale && !batch.recoverOnly)) continue;
              if (batch.recoverOnly) { if ((!job.recoveryAvailable && job.state !== 'unknown_outcome') || job.asset || job.recoveryAttempts >= 2) continue; }
              else { if (job.state !== 'queued' || job.paidAttempts > 0) continue; if (allJobs(store).some(j => j.id !== job.id && j.worldId === job.worldId && j.nodeId === job.nodeId && ['generating', 'unknown_outcome', 'recoverable'].includes(j.state))) { job.state = 'blocked'; job.errorCode = 'PREVIOUS_IMAGE_OUTCOME_UNKNOWN'; continue; } }
              const action = batch.recoverOnly ? job.recoveryAvailable ? 'recover' : 'inspect' : 'generate';
              job.state = 'generating'; job.ownerPid = process.pid; job.runId = batch.runId; if (batch.recoverOnly) job.recoveryAttempts++; else job.paidAttempts++;
              batch.remainingRunBudget--; globalRunning++; batchRunning++; job.updatedAt = now(); selected.push({ batchId: batch.id, job: structuredClone(job), action });
            }
            if (!batchRunning && !selected.some(s => s.batchId === batch.id)) { batch.state = 'idle'; batch.updatedAt = now(); }
          }
          return selected;
        });
        for (const item of selected) { const task = perform(item.batchId, item.job, item.action); active.add(task); void task.finally(() => active.delete(task)); }
        if (!active.size) break;
        await Promise.race(active);
      }
    } finally { await Promise.allSettled(active); await release(); }
  }
  return { prepareImages, getImages, listImages, runImages, pauseImages, reviewImage, drainImages };
}
const service = createWorkshopImageService();
export const { prepareImages, getImages, listImages, runImages, pauseImages, reviewImage, drainImages } = service;
