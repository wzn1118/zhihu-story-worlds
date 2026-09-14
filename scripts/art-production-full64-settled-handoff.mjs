import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { open, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const directory = path.join(root, 'output/coordination/art-remake-12h-20260912/full64-direct');
const privateRoot = path.join(root, 'output/imagegen/scene-production/.private');
const expectedPid = Number(process.argv.find(arg => arg.startsWith('--pid='))?.slice(6));
assert(Number.isInteger(expectedPid) && expectedPid > 0, 'EXPLICIT_OWNER_PID_REQUIRED');
let expectedCreatedAt;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const readJson = async file => JSON.parse(await readFile(file, 'utf8'));
const atomic = async (name, value) => {
  const file = path.join(directory, name), temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2) + '\n');
  await rename(temp, file);
};
const processes = () => JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-Command',
  "@(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object {$_.Name -match '^(node|python)(.exe)?$'} | Select-Object ProcessId,ParentProcessId,Name,CommandLine,@{Name='createdAt';Expression={$_.CreationDate.ToUniversalTime().ToString('o')}}) | ConvertTo-Json -Compress"],
  { encoding: 'utf8', windowsHide: true, maxBuffer: 4 * 1024 * 1024 }));
const generationChildren = list => list.filter(p => /scripts[\\/]art-production-client\.py|generate_image2\.py|openqi_imagegen\.py/.test(p.CommandLine ?? ''));
const ownerMatches = p => p && /art-production-full64\.ts/.test(p.CommandLine ?? '')
  && Math.abs(Date.parse(p.createdAt) - expectedCreatedAt) < 1000;
const leasePath = path.join(directory, 'settled-handoff.lock');
const leaseToken = randomUUID();
const lease = await open(leasePath, 'wx');
await lease.writeFile(JSON.stringify({ pid: process.pid, token: leaseToken })); await lease.close();
try {
  assert((await readJson(path.join(directory, 'batch1000-authorization.json'))).concurrency === 64);
  assert.equal((await readJson(path.join(directory, 'active-owner.json'))).pid, expectedPid, 'ACTIVE_OWNER_CHANGED');
  const expectedOwner = processes().find(p => p.ProcessId === expectedPid);
  assert(expectedOwner && /art-production-full64\.ts/.test(expectedOwner.CommandLine ?? ''), 'OWNER_IDENTITY_CHANGED');
  expectedCreatedAt = Date.parse(expectedOwner.createdAt);
  assert(Number.isFinite(expectedCreatedAt), 'OWNER_CREATION_TIME_REQUIRED');
  const deadline = Date.now() + 45 * 60 * 1000;
  let switched = false;
  while (Date.now() < deadline && !switched) {
    const observed = processes();
    assert(ownerMatches(observed.find(p => p.ProcessId === expectedPid)), 'OWNER_IDENTITY_CHANGED');
    if (generationChildren(observed).length) { await delay(2000); continue; }
    const stateLock = path.join(privateRoot, 'state.lock');
    let handle;
    for (let attempt = 0; attempt < 2000 && !handle; attempt++) {
      try { handle = await open(stateLock, 'wx'); }
      catch (error) { if (error.code !== 'EEXIST') throw error; await delay(5); }
    }
    if (!handle) continue;
    const token = randomUUID();
    await handle.writeFile(JSON.stringify({ pid: process.pid, token, at: new Date().toISOString() })); await handle.close();
    try {
      const bytes = await readFile(path.join(privateRoot, 'state.json'));
      const state = JSON.parse(bytes.toString('utf8'));
      const campaign = await readJson(path.join(directory, 'campaign.json'));
      const ids = new Set(campaign.submittedJobIds);
      const jobs = state.batches.flatMap(b => b.jobs);
      const active = jobs.filter(j => j.state === 'generating');
      assert(active.every(j => j.workerPid === expectedPid), 'FOREIGN_GENERATION_ACTIVE');
      assert(active.every(j => ids.has(j.id) || j.activeAction === 'recover'), 'UNRECOGNIZED_GENERATION_ACTIVE');
      let complete = true;
      for (const job of active) {
        const jobDirectory = path.join(privateRoot, 'jobs', job.id);
        const result = await readJson(path.join(jobDirectory, 'result.json')).catch(error => {
          if (error.code === 'ENOENT') return null; throw error;
        });
        if (job.activeAction === 'recover' && !ids.has(job.id)) {
          if (result?.state === 'recoverable' && result.errorCode === 'HTTP_404' && result.recoveryAvailable === true) continue;
          complete = false; break;
        }
        if (!result?.file || !result.sha256) { complete = false; break; }
        const nativePath = path.join(jobDirectory, 'native.png');
        assert.equal(path.resolve(result.file), nativePath);
        const png = await readFile(nativePath);
        assert.equal(digest(png), result.sha256); assert.equal(png.length, result.bytes);
        assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
        assert.equal(png.readUInt32BE(16), result.width); assert.equal(png.readUInt32BE(20), result.height);
      }
      const finalObservation = processes();
      if (!complete || generationChildren(finalObservation).length) continue;
      assert(ownerMatches(finalObservation.find(p => p.ProcessId === expectedPid)), 'OWNER_IDENTITY_CHANGED');
      // The state lock prevents the old scheduler from claiming any new request.
      // Every paid child has exited, and every un-ingested result is already durable.
      execFileSync('powershell.exe', ['-NoProfile', '-Command', `Stop-Process -Id ${expectedPid} -ErrorAction Stop`], { windowsHide: true });
      for (let retry = 0; retry < 20; retry++) {
        if (!ownerMatches(processes().find(p => p.ProcessId === expectedPid))) break;
        await delay(250);
      }
      assert(!ownerMatches(processes().find(p => p.ProcessId === expectedPid)), 'PREVIOUS_OWNER_STILL_ACTIVE');
      await atomic('settled-handoff.json', { at: new Date().toISOString(), status: 'previous-owner-exited-with-saved-results',
        previousPid: expectedPid, liveGenerationChildren: 0, savedUnIngestedResults: active.length,
        stateSha256: digest(bytes), reserved: ids.size,
        serviceSha256: digest(await readFile(path.join(root, 'server/art-production.ts'))) });
      switched = true;
    } finally {
      const lock = await readJson(stateLock).catch(() => null);
      if (lock?.token === token) await unlink(stateLock);
    }
  }
  assert(switched, 'NO_SETTLED_HANDOFF_WINDOW');
  // Reuse the same scheduled task, after its old wrapper has actually finished.
  execFileSync('powershell.exe', ['-NoProfile', '-Command',
    "$taskName='RedLeaf-Art-Full64-1000'; for($attempt=0;$attempt -lt 40;$attempt++){if((Get-ScheduledTask -TaskName $taskName).State -ne 'Running'){Start-ScheduledTask -TaskName $taskName; exit 0}; Start-Sleep -Milliseconds 500}; throw 'OLD_TASK_STILL_RUNNING'"],
    { windowsHide: true, timeout: 30000 });
  await atomic('settled-handoff-launch.json', { at: new Date().toISOString(), requested: true,
    taskName: 'RedLeaf-Art-Full64-1000', previousPid: expectedPid });
  console.log(JSON.stringify({ stage: 'resumed-with-current-service', previousPid: expectedPid }));
} finally {
  const lease = await readJson(leasePath).catch(() => null);
  if (lease?.token === leaseToken) await unlink(leasePath);
}
