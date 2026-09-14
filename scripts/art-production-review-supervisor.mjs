import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, open, readFile, unlink, writeFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import path from 'node:path';
import { needsVisualReview } from './art-production-review-candidates.mjs';

const execute = promisify(execFile);
const root = process.cwd();
const folder = path.join(root, 'output/imagegen/scene-production/formal-production-20260907');
const owners = ['cel-drawing', 'painted-background', 'scene-composition'];
const existing = new Map((process.argv.find(arg => arg.startsWith('--existing='))?.slice(11) ?? '')
  .split(',').filter(Boolean).map(pair => pair.split(':')));
const freshOwners = new Set((process.argv.find(arg => arg.startsWith('--fresh='))?.slice(8) ?? '').split(',').filter(Boolean));
for (const owner of freshOwners) if (!owners.includes(owner)) throw new Error('INVALID_REVIEW_OWNER');
for (const [owner, pid] of existing) if (!owners.includes(owner) || !/^\d+$/.test(pid)) throw new Error('INVALID_REVIEW_PROCESS');
const directory = path.join(folder, 'review-supervisor');
await mkdir(directory, { recursive: true });
async function json(file, fallback) {
  return readFile(file, 'utf8').then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return fallback; throw error; });
}
async function identity(pid) {
  const { stdout } = await execute('powershell.exe', ['-NoProfile', '-Command',
    `Get-CimInstance Win32_Process -Filter "ProcessId = ${Number(pid)} AND Name = 'codex.exe'" | Select-Object ProcessId,CreationDate | ConvertTo-Json -Compress`],
  { windowsHide: true });
  return stdout.trim();
}
async function hasPending(owner) {
  const state = await json(path.join(folder, 'state.json'), { jobs: [] });
  const manifest = await json(path.join(folder, '../manifest.json'), { batches: [] });
  const jobs = new Map(manifest.batches.flatMap(batch => batch.jobs).map(job => [job.id, job]));
  for (const row of state.jobs.filter(row => row.owner === owner)) {
    const job = jobs.get(row.jobId);
    if (!job?.asset || job.stale) continue;
    const review = await json(path.join(folder, 'reviews', `${job.id}.json`), undefined).catch(error => {
      if (error instanceof SyntaxError) return undefined; throw error;
    });
    if (needsVisualReview(job, review)) return true;
  }
  return false;
}
async function producerAlive() {
  const lock = await json(path.join(folder, 'supervisor.lock'), undefined);
  try { if (!lock?.pid) return false; process.kill(lock.pid, 0); return true; } catch { return false; }
}
async function lane(owner) {
  const lockFile = path.join(directory, `${owner}.lock`);
  const previous = await json(lockFile, undefined);
  if (previous?.pid) {
    let alive = true;
    try { process.kill(previous.pid, 0); } catch { alive = false; }
    if (alive) throw new Error('REVIEW_SUPERVISOR_ALREADY_ACTIVE');
    await unlink(lockFile);
  }
  const handle = await open(lockFile, 'wx');
  await handle.writeFile(JSON.stringify({ pid: process.pid, at: new Date().toISOString() })); await handle.close();
  const save = async value => {
    const record = { owner, monitorPid: process.pid, at: new Date().toISOString(), ...value };
    await writeFile(path.join(directory, `${owner}.json`), JSON.stringify(record, null, 2) + '\n');
    console.log(JSON.stringify(record));
  };
  let failures = 0, session = 0, freshNext = freshOwners.has(owner);
  try {
    const pid = existing.get(owner), initial = pid ? await identity(pid) : '';
    if (initial) {
      await save({ status: 'existing-session', reviewPid: Number(pid) });
      while (await identity(pid) === initial) await setTimeout(60000);
    }
    while (true) {
      if (!await hasPending(owner)) {
        if (!await producerAlive()) { await save({ status: 'finished-received-reviews' }); return; }
        await save({ status: 'waiting-images' }); await setTimeout(60000); continue;
      }
      const seconds = failures ? Math.min(900, 60 * 2 ** (failures - 1)) : 60;
      await save({ status: 'cooldown', seconds, failures, wakeAt: new Date(Date.now() + seconds * 1000).toISOString() });
      await setTimeout(seconds * 1000);
      if (!await hasPending(owner)) continue;
      const tag = `style-auto-${Date.now()}-${++session}`;
      const mode = freshNext ? 'fresh' : 'resume';
      const child = spawn(process.execPath, ['scripts/art-production-review-threads.mjs', `--owner=${owner}`, `--${mode}-next=${tag}`],
        { cwd: root, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'] });
      await save({ status: 'review-session', launcherPid: child.pid, tag });
      await new Promise((resolve, reject) => { child.once('exit', resolve); child.once('error', reject); });
      const prefix = path.join(folder, 'review-threads', `${owner}.${mode}-${tag}`);
      const result = await json(`${prefix}.exit.json`, { code: 1 });
      const log = await readFile(`${prefix}.stderr.log`, 'utf8').catch(() => '');
      const error = /413/.test(log) ? 'MODEL_CONTEXT_413' : /429/.test(log) ? 'MODEL_HTTP_429' : /active writer/.test(log) ? 'THREAD_ACTIVE_WRITER'
        : result.code ? 'MODEL_SESSION_INTERRUPTED' : undefined;
      if (!result.code) freshNext = false;
      else if (error === 'MODEL_CONTEXT_413') freshNext = true;
      failures = result.code ? failures + 1 : 0;
      await save({ status: result.code ? 'session-failed-preserved-reviews' : 'session-finished', code: error, failures, tag });
    }
  } finally { await unlink(lockFile); }
}
await Promise.all(owners.map(lane));
