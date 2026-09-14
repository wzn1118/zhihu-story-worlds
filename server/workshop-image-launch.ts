import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GameWorld } from '../shared/types.ts';
import type { WorkshopImageLaunch } from '../shared/workshop-image-launch.ts';
import { createWorkshopImageService, findWorkshopImageBatch, WorkshopImageError, workshopImageSourceHash } from './workshop-images.ts';
import { directWorkshopImages } from './workshop-image-direction.ts';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const time = () => new Date().toISOString();
type Stored = Omit<WorkshopImageLaunch, 'state' | 'progress'> & { phase: 'directing' | 'dispatched' | 'failed'; token: string };
type Options = {
  root?: string;
  images?: ReturnType<typeof createWorkshopImageService>;
  direct?: typeof directWorkshopImages;
  start?: (id: string, token: string) => Promise<number | undefined>;
};
const starting = new Map<string, Promise<WorkshopImageLaunch>>();
export function imageLaunchId(world: GameWorld) {
  return createHash('sha256').update(JSON.stringify([world.storyId, world.id, world.version,
    Object.values(world.nodes).map(node => [node.id, workshopImageSourceHash(world, node)])])).digest('hex');
}

export function createImageLauncher(options: Options = {}) {
  const root = resolve(options.root ?? ROOT), directory = join(root, 'output/workshop-images/.private/launches');
  const images = options.images ?? createWorkshopImageService({ root }), direct = options.direct ?? directWorkshopImages;
  const folder = (id: string) => { if (!/^[a-f0-9]{64}$/.test(id)) throw new WorkshopImageError('INVALID_IMAGE_LAUNCH', 400); return join(directory, id); };
  async function json<T>(file: string): Promise<T | null> { try { return JSON.parse(await readFile(file, 'utf8')); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e; } }
  async function save(file: string, value: unknown) {
    const tmp = `${file}.${randomUUID()}.tmp`;
    // Launch receipts are rebuildable; atomic replacement is enough for process
    // restarts. Paid reservations retain fsync in the separate image service.
    await writeFile(tmp, JSON.stringify(value), { flag: 'wx', mode: 0o600 });
    try { await rename(tmp, file); } finally { await rm(tmp, { force: true }).catch(() => {}); }
  }
  const lease = (id: string) => json<{ pid: number; token: string }>(join(folder(id), 'owner.json'));
  async function snapshot(world: GameWorld, row: Stored): Promise<WorkshopImageLaunch> {
    const { token: _token, phase, ...publicRow } = row;
    const batch = findWorkshopImageBatch(world, await images.listImages());
    const owner = await lease(row.id);
    const current = batch?.jobs.filter(job => !job.stale && world.nodes[job.nodeId] && job.sourceHash === workshopImageSourceHash(world, world.nodes[job.nodeId])) ?? [];
    const preparing = phase === 'directing' && owner?.token === row.token && alive(owner.pid);
    let state: WorkshopImageLaunch['state'] = phase === 'failed' ? 'failed' : phase === 'directing' && !preparing ? 'interrupted' : preparing ? 'preparing' : 'review';
    if (batch?.state === 'paused') state = 'paused';
    else if (batch?.circuitBreaker || batch?.progress.unknownOutcome || batch?.progress.failed || batch?.progress.blocked) state = 'failed';
    else if (batch?.state === 'running' && state !== 'failed' && state !== 'interrupted') state = 'generating';
    return { ...publicRow, directed: current.length, state, ...(batch ? { batchId: batch.id, progress: batch.progress } : {}) };
  }
  async function get(world: GameWorld): Promise<WorkshopImageLaunch | null> {
    const row = await json<Stored>(join(folder(imageLaunchId(world)), 'status.json'));
    return row ? snapshot(world, row) : null;
  }
  async function startOwned(world: GameWorld): Promise<WorkshopImageLaunch> {
    const id = imageLaunchId(world), dir = folder(id), token = randomUUID();
    if (!world.storyId.startsWith('import-')) throw new WorkshopImageError('IMPORTED_IMAGE_LAUNCH_ONLY', 400);
    await mkdir(dir, { recursive: true });
    // Delivered batches need one small receipt, not another world snapshot,
    // worker process or production lease. This path never changes image jobs.
    const readyBatch = findWorkshopImageBatch(world, await images.listImages());
    const deliveredNodes = readyBatch?.jobs.filter(job => !job.stale && job.asset && world.nodes[job.nodeId] && job.sourceHash === workshopImageSourceHash(world, world.nodes[job.nodeId])) ?? [];
    if (readyBatch && new Set(deliveredNodes.map(job => job.nodeId)).size === Object.keys(world.nodes).length) {
      const owner = await lease(id);
      const previous = await json<Stored>(join(dir, 'status.json'));
      if (previous && owner?.token === previous.token && alive(owner.pid)) return snapshot(world, previous);
      const completed: Stored = { id, projectId: world.storyId, worldVersion: world.version, phase: 'dispatched', token, total: Object.keys(world.nodes).length, directed: deliveredNodes.length,
        batchId: readyBatch.id, createdAt: previous?.createdAt ?? time(), updatedAt: time() };
      await save(join(dir, 'status.json'), completed);
      const { token: _token, phase: _phase, ...publicRow } = completed;
      return { ...publicRow, state: 'review', progress: readyBatch.progress };
    }
    for (let attempt = 0;; attempt++) {
      try {
        const h = await open(join(dir, 'owner.json'), 'wx', 0o600);
        try { await h.writeFile(JSON.stringify({ pid: process.pid, token })); } finally { await h.close(); }
        break;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
        const owner = await lease(id).catch(() => null);
        if (owner && !alive(owner.pid)) { await rm(join(dir, 'owner.json'), { force: true }); continue; }
        const row = await json<Stored>(join(dir, 'status.json'));
        if (row && owner?.token === row.token) return snapshot(world, row);
        if (attempt >= 80) throw new WorkshopImageError('IMAGE_LAUNCH_BUSY');
        await new Promise(resolve => setTimeout(resolve, 25));
      }
    }
    const row: Stored = { id, projectId: world.storyId, worldVersion: world.version, phase: 'directing', directed: 0, total: Object.keys(world.nodes).length, token, createdAt: time(), updatedAt: time() };
    try {
      await save(join(dir, 'world.json'), world); await save(join(dir, 'status.json'), row);
      if (options.start) {
        const pid = await options.start(id, token);
        if (pid) await save(join(dir, 'owner.json'), { pid, token });
      } else {
        const child = spawn(process.execPath, ['--import', 'tsx', join(root, 'server/workshop-image-launch-worker.ts'), id, token], { cwd: root, detached: true, windowsHide: true, stdio: 'ignore' });
        await new Promise<void>((resolveSpawn, reject) => { child.once('spawn', resolveSpawn); child.once('error', reject); });
        await save(join(dir, 'owner.json'), { pid: child.pid, token });
        child.unref();
      }
      return { id, projectId: row.projectId, worldVersion: row.worldVersion, state: 'preparing', total: row.total, directed: 0, createdAt: row.createdAt, updatedAt: row.updatedAt };
    } catch (e) {
      row.phase = 'failed'; row.error = '生图任务启动失败，已保存的内容仍在。'; await save(join(dir, 'status.json'), row);
      if ((await lease(id))?.token === token) await rm(join(dir, 'owner.json'), { force: true });
      throw e;
    }
  }
  function start(world: GameWorld): Promise<WorkshopImageLaunch> {
    const key = `${root}/${imageLaunchId(world)}`;
    const previous = starting.get(key); if (previous) return previous;
    const pending = startOwned(world).finally(() => { if (starting.get(key) === pending) starting.delete(key); });
    starting.set(key, pending); return pending;
  }
  async function run(id: string, token: string) {
    const dir = folder(id), owner = await lease(id), row = await json<Stored>(join(dir, 'status.json')), world = await json<GameWorld>(join(dir, 'world.json'));
    if (!row || !world || owner?.token !== token || row.token !== token || imageLaunchId(world) !== id) return;
    let writing = Promise.resolve(), first = true;
    const dispatch = async (batchId: string) => {
      const batch = await images.getImages(batchId);
      if (!batch) throw new WorkshopImageError('WORKSHOP_IMAGES_NOT_FOUND', 404);
      // A user's later pause always wins over a direction group finishing.
      if (!first && batch.state === 'paused') return;
      first = false;
      if (batch.jobs.some(job => !job.stale && job.state === 'queued' && !job.paidAttempts)) {
        await images.runImages(batch.id, { maxJobs: 40, concurrency: 8 });
        row.firstDispatchAt ??= time();
      }
    };
    try {
      const existing = findWorkshopImageBatch(world, await images.listImages());
      const current = existing?.jobs.filter(job => !job.stale && world.nodes[job.nodeId] && job.sourceHash === workshopImageSourceHash(world, world.nodes[job.nodeId])) ?? [];
      if (existing && new Set(current.map(job => job.nodeId)).size === Object.keys(world.nodes).length) {
        row.batchId = existing.id; row.directed = current.length; await dispatch(existing.id);
      } else {
        await direct(world, group => {
          writing = writing.then(async () => {
            const batch = await images.prepareImages(world, group, true);
            row.batchId = batch.id; row.directed = batch.progress.current; row.updatedAt = time();
            await dispatch(batch.id); await save(join(dir, 'status.json'), row);
          });
          return writing;
        });
      }
      await writing; row.phase = 'dispatched'; delete row.error;
    } catch (e) {
      await writing.catch(() => {}); row.phase = 'failed';
      row.error = e instanceof WorkshopImageError ? `生图服务暂停：${e.code}。已完成图片和分镜已保存。` : '分镜连接或内容检查中断。已完成分镜和图片已保存，可接着制作。';
    } finally {
      row.updatedAt = time(); await save(join(dir, 'status.json'), row);
      if ((await lease(id))?.token === token) await rm(join(dir, 'owner.json'), { force: true });
    }
  }
  return { start, get, run };
}
const launcher = createImageLauncher();
export const { start: startImageLaunch, get: getImageLaunch, run: runImageLaunch } = launcher;
