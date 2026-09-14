import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { claimImportRecovery, publishImportRecord } from '../server/import-recovery.ts';
import { alive, hashSource, StoryWorkshop, writeJson } from '../server/story-workshop.ts';
import { isImportedId, type ImportedSource, type WorkshopProject } from '../shared/workshop.ts';

// Synthetic transport data only; these tests never request a creative worker.
const source: ImportedSource = {
  title: '  Recovery source fixture  ', author: ' Fixture author ',
  text: `\uFEFF\r\n${'The witness found a second entry beneath the original signature. '.repeat(5)}\r\n<script>inert source</script>  `,
  scope: 'zhihu-excerpt',
  origin: {
    kind: 'zhihu-answer', workId: '87654321', contentScope: 'search-excerpt',
    sourceUrl: 'https://www.zhihu.com/question/12345678/answer/87654321', fetchedAt: '2026-09-06T00:00:00.000Z',
  },
};
const existingId = 'import-00000000-0000-4000-8000-000000000031';
const helper = fileURLToPath(new URL('./helpers/import-recovery-child.ts', import.meta.url));
const repository = fileURLToPath(new URL('../', import.meta.url));
type ChildMessage = { type: string; pid?: number; claimed?: boolean; id?: string; sourceHash?: string; revision?: number; message?: string };

function startChild(mode: string, target: string, input = '') {
  const process = spawn(globalThis.process.execPath, ['--import', 'tsx', helper, mode, target, input], {
    cwd: repository, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  const messages: ChildMessage[] = [];
  let diagnostic = '', settled = false;
  const listeners = new Set<() => void>();
  process.stdout!.on('data', chunk => { diagnostic += String(chunk); });
  process.stderr!.on('data', chunk => { diagnostic += String(chunk); });
  process.on('message', value => { messages.push(value as ChildMessage); for (const notify of listeners) notify(); });
  const done = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    process.once('error', error => { settled = true; reject(error); for (const notify of listeners) notify(); });
    process.once('close', (code, signal) => { settled = true; resolve({ code, signal }); for (const notify of listeners) notify(); });
  });
  void done.catch(() => {});
  function wait(type: string) {
    return new Promise<ChildMessage>((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error(`Child ${mode} did not send ${type}: ${diagnostic}`)), 20_000);
      const inspect = () => {
        const failure = messages.find(value => value.type === 'failure');
        if (failure) return finish(new Error(failure.message));
        const value = messages.find(value => value.type === type);
        if (value) return finish(undefined, value);
        if (settled) finish(new Error(`Child ${mode} exited before ${type}: ${diagnostic}`));
      };
      function finish(error?: Error, value?: ChildMessage) {
        clearTimeout(timer); listeners.delete(inspect);
        if (error) reject(error); else resolve(value!);
      }
      listeners.add(inspect); inspect();
    });
  }
  return {
    process, wait, done,
    start: () => process.send({ type: 'start' }),
    async success() {
      const result = await done;
      assert.equal(result.code, 0, diagnostic || JSON.stringify(messages));
      assert.equal(result.signal, null);
    },
    async stop() {
      if (!settled) process.kill('SIGKILL');
      await done.catch(() => {});
    },
  };
}

async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'redleaf-import-recovery-'));
  const children: ReturnType<typeof startChild>[] = [];
  t.after(async () => {
    await Promise.all(children.map(child => child.stop()));
    await rm(root, { recursive: true, force: true });
  });
  return {
    root,
    child(mode: string, target: string, input?: string) {
      const child = startChild(mode, target, input); children.push(child); return child;
    },
  };
}

async function waitForFile(file: string) {
  const deadline = Date.now() + 20_000;
  for (;;) {
    try { return await readFile(file, 'utf8'); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || Date.now() >= deadline) throw error;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
}

test('atomic hardlink publication exposes one complete record and cleans contender temporary files', async t => {
  const { root } = await fixture(t), file = join(root, 'record.json');
  const records = Array.from({ length: 12 }, (_, index) => ({ index, payload: `${index}:` + 'x'.repeat(128 * 1024) }));
  let finished = false, reads = 0;
  const observer = (async () => {
    while (!finished) {
      try {
        const value = JSON.parse(await readFile(file, 'utf8'));
        assert.deepEqual(value, records[value.index]); reads++;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      await new Promise(resolve => setImmediate(resolve));
    }
  })();
  let results: boolean[];
  try { results = await Promise.all(records.map(value => publishImportRecord(file, value))); }
  finally { finished = true; await observer; }
  assert.equal(results.filter(Boolean).length, 1);
  const bytes = await readFile(file, 'utf8');
  assert.deepEqual(JSON.parse(bytes), records[results.indexOf(true)]);
  assert.equal(await publishImportRecord(file, { replacement: true }), false);
  assert.equal(await readFile(file, 'utf8'), bytes);
  assert.deepEqual(await readdir(root), ['record.json']);
  assert.ok(reads > 0, 'the observer must read a fully published record during contention');
});

test('competing recovery claims have exactly one owner and never replace its record', async t => {
  const { root } = await fixture(t), index = join(root, 'index.json');
  const claims = await Promise.all(Array.from({ length: 8 }, () => claimImportRecovery(index, alive)));
  const winners = claims.filter((release): release is () => Promise<void> => release !== null);
  assert.equal(winners.length, 1);
  const record = join(`${index}.recover-v2`, '0.json'), bytes = await readFile(record, 'utf8');
  assert.equal(JSON.parse(bytes).pid, process.pid);
  assert.equal(await claimImportRecovery(index, alive), null);
  assert.equal(await readFile(record, 'utf8'), bytes);
  await winners[0]();
});

test('independent processes competing for recovery publish exactly one owner', { timeout: 30_000 }, async t => {
  const f = await fixture(t), index = join(f.root, 'index.json');
  const children = Array.from({ length: 4 }, () => f.child('claim-hold', index));
  await Promise.all(children.map(child => child.wait('ready')));
  for (const child of children) child.start();
  const claims = await Promise.all(children.map(child => child.wait('claimed')));
  assert.equal(new Set(claims.map(value => value.pid)).size, children.length);
  const winners = claims.filter(value => value.claimed); assert.equal(winners.length, 1);
  const directory = `${index}.recover-v2`, owner = JSON.parse(await readFile(join(directory, '0.json'), 'utf8'));
  assert.equal(owner.pid, winners[0].pid); assert.equal(await claimImportRecovery(index, alive), null);
  assert.deepEqual(await readdir(directory), ['0.json']);
  for (const child of children) child.process.send({ type: 'release' });
  await Promise.all(children.map(child => child.success()));
  assert.equal((await readdir(directory)).filter(name => name.endsWith('.released')).length, 1);
});

test('release advances the same live PID and an old release cannot affect the newer claim', async t => {
  const { root } = await fixture(t), index = join(root, 'index.json');
  const first = await claimImportRecovery(index, alive); assert.ok(first);
  assert.equal(await claimImportRecovery(index, alive), null);
  await first(); await first();
  const second = await claimImportRecovery(index, alive); assert.ok(second);
  const directory = `${index}.recover-v2`, newer = await readFile(join(directory, '1.json'), 'utf8');
  assert.equal(JSON.parse(newer).pid, process.pid);
  await first();
  assert.equal(await claimImportRecovery(index, alive), null);
  assert.equal(await readFile(join(directory, '1.json'), 'utf8'), newer);
  assert.equal((await readdir(directory)).filter(name => name.endsWith('.released')).length, 1);
  await second();
  assert.deepEqual((await readdir(directory)).filter(name => /^\d+\.json$/.test(name)).sort(), ['0.json', '1.json']);
});

test('a claimant killed without release is recoverable by a different real process', { timeout: 30_000 }, async t => {
  const f = await fixture(t), index = join(f.root, 'index.json'), child = f.child('claim-hold', index);
  await child.wait('ready'); child.start();
  const held = await child.wait('claimed'); assert.equal(held.claimed, true); assert.notEqual(held.pid, process.pid);
  assert.equal(await claimImportRecovery(index, alive), null);
  await child.stop(); assert.equal(alive(held.pid!), false);
  const release = await claimImportRecovery(index, alive); assert.ok(release);
  const directory = `${index}.recover-v2`;
  assert.equal(JSON.parse(await readFile(join(directory, '0.json'), 'utf8')).pid, held.pid);
  assert.equal(JSON.parse(await readFile(join(directory, '1.json'), 'utf8')).pid, process.pid);
  assert.equal((await readdir(directory)).some(name => name.endsWith('.released')), false);
  await release();
});

test('a delayed old contender cannot delete or replace a newer live recovery claim', { timeout: 30_000 }, async t => {
  const f = await fixture(t), index = join(f.root, 'index.json'), gate = join(f.root, 'continue');
  const owner = f.child('claim-hold', index);
  await owner.wait('ready'); owner.start(); await owner.wait('claimed'); await owner.stop();
  const delayed = f.child('claim-delayed', index, gate);
  await delayed.wait('ready'); delayed.start();
  const observed = JSON.parse(await waitForFile(`${gate}.observed`)); assert.equal(alive(observed.pid), false);
  const release = await claimImportRecovery(index, alive); assert.ok(release);
  const directory = `${index}.recover-v2`, newerFile = join(directory, '1.json'), newer = await readFile(newerFile, 'utf8');
  await writeFile(gate, 'continue', 'utf8');
  assert.equal((await delayed.wait('claimed')).claimed, false); await delayed.success();
  assert.equal(await readFile(newerFile, 'utf8'), newer);
  assert.equal(await claimImportRecovery(index, alive), null);
  assert.deepEqual((await readdir(directory)).sort(), ['0.json', '1.json']);
  await release();
});

test('legacy recovery debris and an abandoned index resume the exact source under its existing ID', async t => {
  const { root } = await fixture(t), workshop = new StoryWorkshop(root), hash = hashSource(source);
  await mkdir(join(root, 'imports'), { recursive: true }); await mkdir(workshop.dir(existingId), { recursive: true });
  const index = join(root, 'imports', `${hash}.json`), legacy = `${index}.recover`;
  await writeJson(index, { id: existingId, pid: -1 }); await writeFile(legacy, 'stale legacy claim');
  await writeJson(join(workshop.dir(existingId), 'source.json'), source);
  const project = await workshop.importZhihuSearch(source);
  assert.equal(project.id, existingId); assert.equal(project.sourceHash, hash);
  assert.equal(project.revision, 0); assert.equal(project.jobId, undefined); assert.equal(project.status, 'idle');
  assert.deepEqual(await workshop.source(existingId), source);
  assert.equal(await readFile(legacy, 'utf8'), 'stale legacy claim');
  assert.deepEqual((await workshop.list()).map(project => project.id), [existingId]);
  await assert.rejects(readFile(join(workshop.dir(existingId), 'job.lock', 'owner.json')), { code: 'ENOENT' });
});

test('a failed recovery releases its generation and can retry in the same live process', async t => {
  const { root } = await fixture(t), index = join(root, 'imports', `${hashSource(source)}.json`);
  await mkdir(join(root, 'imports'), { recursive: true }); await writeJson(index, { id: existingId, pid: -1 });
  class FailedSave extends StoryWorkshop {
    override async save(_project: WorkshopProject): Promise<void> { throw new Error('synthetic import save failure'); }
  }
  await assert.rejects(new FailedSave(root).importZhihuSearch(source), /synthetic import save failure/);
  assert.deepEqual(JSON.parse(await readFile(index, 'utf8')), { id: existingId, pid: -1 });
  const result = await new StoryWorkshop(root).importZhihuSearch(source);
  assert.equal(result.id, existingId); assert.deepEqual(await new StoryWorkshop(root).source(result.id), source);
  const records = await readdir(`${index}.recover-v2`);
  assert.deepEqual(records.filter(name => /^\d+\.json$/.test(name)).sort(), ['0.json', '1.json']);
  assert.equal(records.filter(name => name.endsWith('.released')).length, 2);
});

test('independent Node processes concurrently importing the same source publish one project ID', { timeout: 30_000 }, async t => {
  const f = await fixture(t), root = join(f.root, 'workshop'), input = join(f.root, 'source.json');
  await writeJson(input, source);
  const children = Array.from({ length: 4 }, () => f.child('import', root, input));
  const ready = await Promise.all(children.map(child => child.wait('ready')));
  assert.equal(new Set(ready.map(value => value.pid)).size, children.length);
  for (const child of children) child.start();
  const results = await Promise.all(children.map(child => child.wait('result')));
  await Promise.all(children.map(child => child.success()));
  assert.equal(new Set(results.map(value => value.id)).size, 1);
  const id = results[0].id!; assert.ok(isImportedId(id)); assert.notEqual(id, source.origin!.workId);
  for (const result of results) { assert.equal(result.sourceHash, hashSource(source)); assert.equal(result.revision, 0); }
  const workshop = new StoryWorkshop(root);
  assert.deepEqual(await workshop.source(id), source);
  assert.deepEqual((await workshop.list()).map(project => project.id), [id]);
  assert.deepEqual(await readdir(join(root, 'imports')), [`${hashSource(source)}.json`]);
});

test('reimport preserves an existing live job, revision, source snapshot and lock bytes', async t => {
  const { root } = await fixture(t), workshop = new StoryWorkshop(root), project = await workshop.importZhihuSearch(source);
  project.revision = 2; project.status = 'running'; project.stage = 'outline'; project.jobId = randomUUID(); project.attempts = 7;
  await workshop.save(project);
  const lock = join(workshop.dir(project.id), 'job.lock'); await mkdir(lock);
  await writeJson(join(lock, 'owner.json'), { token: project.jobId, pid: process.pid, heartbeat: new Date().toISOString() });
  const files = [join(workshop.dir(project.id), 'source.json'), join(workshop.dir(project.id), 'project.json'), join(lock, 'owner.json')];
  const before = await Promise.all(files.map(file => readFile(file, 'utf8')));
  const results = await Promise.all(Array.from({ length: 4 }, () => new StoryWorkshop(root).importZhihuSearch({
    ...source, origin: { ...source.origin!, fetchedAt: '2026-09-06T01:00:00.000Z' },
  })));
  for (const result of results) {
    assert.equal(result.id, project.id); assert.equal(result.jobId, project.jobId);
    assert.equal(result.revision, 2); assert.equal(result.attempts, 7); assert.equal(result.status, 'running');
  }
  assert.deepEqual(await Promise.all(files.map(file => readFile(file, 'utf8'))), before);
});
