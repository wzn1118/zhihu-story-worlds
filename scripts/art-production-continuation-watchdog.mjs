import { appendFile, mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const root = process.cwd();
const folder = path.join(root, 'output/imagegen/scene-production/formal-production-20260907');
const pauseFile = path.join(folder, 'pause');
const lockFile = path.join(folder, 'supervisor.lock');
const stateFile = path.join(folder, 'supervisor-state.json');
const privateStateFile = path.join(root, 'output/imagegen/scene-production/.private/state.json');
const statusFile = path.join(folder, 'continuation-watchdog.json');
const eventsFile = path.join(folder, 'continuation-watchdog.jsonl');
const maxWave = 32;
const intervalMs = 30_000;

async function json(file, fallback) {
  return readFile(file, 'utf8').then(JSON.parse).catch(error => {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  });
}
function alive(pid) {
  try { process.kill(Number(pid), 0); return true; } catch { return false; }
}
async function currentInFlight() {
  const store = await json(privateStateFile, { batches: [] });
  return store.batches.flatMap(batch => batch.jobs ?? []).filter(job => job.state === 'generating').length;
}
async function save(event, extra = {}) {
  const record = { at: new Date().toISOString(), event, ...extra };
  await writeFile(statusFile, JSON.stringify(record, null, 2) + '\n');
  await appendFile(eventsFile, JSON.stringify(record) + '\n');
  console.log(JSON.stringify(record));
}
async function staleLock() {
  const lock = await json(lockFile, undefined);
  return lock && !alive(lock.pid) ? lock : undefined;
}
async function launch(gate) {
  const stdout = path.join(folder, `watchdog-supervisor-${Date.now()}.stdout.log`);
  const stderr = path.join(folder, `watchdog-supervisor-${Date.now()}.stderr.log`);
  const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/art-production-formal.ts', 'supervise',
    `--max-wave=${maxWave}`, `--acknowledge-gate=${gate}`],
    { cwd: root, windowsHide: true, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe((await import('node:fs')).createWriteStream(stdout));
  child.stderr.pipe((await import('node:fs')).createWriteStream(stderr));
  child.unref();
  await save('SUPERVISOR_RESTARTED', { pid: child.pid, acknowledgeGate: gate, stdout, stderr });
  return child.pid;
}
async function tick() {
  const lock = await json(lockFile, undefined);
  if (lock?.pid && alive(lock.pid)) {
    await save('SUPERVISOR_ALIVE', { pid: lock.pid, inFlight: await currentInFlight() });
    return;
  }
  const pause = await readFile(pauseFile, 'utf8').catch(() => '');
  if (!pause) {
    await save('WAITING_FOR_SUPERVISOR', { inFlight: await currentInFlight() });
    return;
  }
  const inFlight = await currentInFlight();
  if (inFlight) {
    await save('PAUSE_RETAINED_IN_FLIGHT', { inFlight, pause: pause.trim() });
    return;
  }
  // Preserve audited unknown outcomes as a hard gate; a 503 can leave a paid
  // request in an indeterminate state just like the other provider gates.
  if (/HTTP_(402|403|429|503)\b/.test(pause)) {
    await save('PAUSE_RETAINED_HARD_GATE', { pause: pause.trim() });
    return;
  }
  const gate = (await json(stateFile, {}))?.recoveryGate?.at;
  if (!gate) {
    await save('PAUSE_RETAINED_NO_GATE', { pause: pause.trim() });
    return;
  }
  const oldLock = await staleLock();
  if (oldLock) await unlink(lockFile).catch(() => {});
  await appendFile(path.join(folder, 'pause-history.jsonl'), JSON.stringify({
    at: new Date().toISOString(), pause: pause.trim(), acknowledgeGate: gate,
  }) + '\n');
  await unlink(pauseFile).catch(() => {});
  await launch(gate);
}

await mkdir(folder, { recursive: true });
do {
  await tick();
  if (!process.argv.includes('--watch')) break;
  await sleep(intervalMs);
} while (true);
