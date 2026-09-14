import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rename, rm, stat, symlink, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import { createArtProductionService } from '../server/art-production.ts';
import { canonical, sha256 } from '../server/art-production-prompts.ts';
import type { ArtBatch, ArtJob, ArtWorldInput } from '../shared/production.ts';

type StoredJob = ArtJob & { prompt: string; references: string[]; childPid?: number; workerPid?: number };
type Stored = { batches: (Omit<ArtBatch, 'jobs'> & { jobs: StoredJob[] })[]; circuitBreaker?: { code: string; at: string } };
const world: ArtWorldInput = {
  id: 'no-post-test', storyId: 'no-post-test', title: 'Local proof test', version: '1', characters: [],
  source: { title: 'Fixture', author: 'Test', url: '' },
  nodes: Object.fromEntries(['anchor', 'other'].map(id => [id, { id, title: id, chapter: 'one',
    location: 'room', time: 'morning', text: ['Test-only drawing'], background: '', choices: [] }])),
};
const confirmedResult = { state: 'failed', errorCode: 'DISPATCH_NOT_CONFIRMED_NO_POST', recoveryAvailable: false };

async function setup(t: TestContext) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'art-no-post-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  let calls = 0; let wakes = 0;
  const service = createArtProductionService({ root, startWorker: () => { wakes++; },
    buildBrief: async (_root, _world, node) => ({ prompt: node.text.join('\n'), references: [],
      sourceHash: sha256(canonical(node)), referenceHash: sha256('no references') }),
    execute: async () => { calls++; throw new Error('Execution is forbidden in maintenance tests'); },
  });
  const batch = await service.prepareArtBatch({ world });
  const jobId = batch.jobs[0].id;
  const production = path.join(root, 'output/imagegen/scene-production');
  const stateFile = path.join(production, '.private/state.json');
  const manifestFile = path.join(production, 'manifest.json');
  const directory = path.join(production, '.private/jobs', jobId);
  const resultFile = path.join(directory, 'result.json');
  const requestFile = path.join(directory, 'request.json');
  const promptFile = path.join(directory, 'prompt.txt');
  const receiptFile = path.join(directory, 'no-post-resolution.json');
  const readStore = async () => JSON.parse(await readFile(stateFile, 'utf8')) as Stored;
  const editStore = async (edit: (store: Stored) => void) => {
    const store = await readStore(); edit(store); await writeFile(stateFile, JSON.stringify(store, null, 2) + '\n');
  };
  await editStore(store => {
    store.batches[0].state = 'idle';
    Object.assign(store.batches[0].jobs[0], { state: 'unknown_outcome', paidAttempts: 1, stale: true,
      errorCode: 'WORKER_ERROR_INSPECT_BEFORE_RETRY', failureHistory: [{ code: 'WORKER_ERROR_INSPECT_BEFORE_RETRY', at: '2026-01-01T00:00:00.000Z' }] });
    store.circuitBreaker = { code: 'NATIVE_4K_GATE_FAILED', at: '2026-01-01T00:00:00.000Z' };
  });
  const job = (await readStore()).batches[0].jobs[0];
  await mkdir(directory, { recursive: true });
  await writeFile(resultFile, JSON.stringify(confirmedResult) + '\n');
  await writeFile(requestFile, JSON.stringify({ sourceHash: job.sourceHash, promptHash: job.promptHash,
    references: job.references, requested: job.requested }) + '\n');
  await writeFile(promptFile, job.prompt);
  const evidenceSha256 = sha256(await readFile(resultFile));
  const confirm = (pin = evidenceSha256) => service.confirmUnsubmittedArtJob(batch.id, jobId, pin);
  const assertRejected = async (code: string, pin = evidenceSha256) => {
    const before = await readFile(stateFile);
    const publicBefore = await readFile(manifestFile);
    await assert.rejects(confirm(pin), { code });
    assert.deepEqual(await readFile(stateFile), before);
    assert.deepEqual(await readFile(manifestFile), publicBefore);
    assert.equal(calls, 0); assert.equal(wakes, 0);
  };
  return { root, service, batch, jobId, directory, resultFile, requestFile, promptFile, receiptFile,
    stateFile, evidenceSha256, readStore, editStore, confirm, assertRejected, counts: () => ({ calls, wakes }) };
}

test('pinned no-POST proof changes only the target disposition and writes a private durable receipt', async t => {
  const f = await setup(t);
  const before = await f.readStore();
  const proofFiles = [f.resultFile, f.requestFile, f.promptFile];
  const proofs = await Promise.all(proofFiles.map(file => readFile(file)));
  const batch = await f.confirm();
  const after = await f.readStore();
  const receipt = JSON.parse(await readFile(f.receiptFile, 'utf8'));
  const job = after.batches[0].jobs[0];
  assert.equal(job.state, 'failed'); assert.equal(job.errorCode, 'DISPATCH_NOT_CONFIRMED_NO_POST');
  assert.equal(job.paidAttempts, 1); assert.equal(job.recoveryAttempts, 0); assert.equal(job.stale, true);
  assert.deepEqual(job.failureHistory, before.batches[0].jobs[0].failureHistory);
  assert.deepEqual(after.batches[0].jobs.slice(1), before.batches[0].jobs.slice(1));
  assert.deepEqual(after.circuitBreaker, before.circuitBreaker);
  assert.equal(after.batches[0].state, 'idle'); assert.equal(after.batches[0].remainingRunBudget, 0);
  assert.equal(receipt.kind, 'art-no-post-resolution'); assert.equal(receipt.jobId, f.jobId);
  assert.equal(receipt.batchId, f.batch.id); assert.equal(receipt.beforeState, 'unknown_outcome');
  assert.equal(receipt.beforeErrorCode, 'WORKER_ERROR_INSPECT_BEFORE_RETRY');
  assert.equal(receipt.resultSha256, f.evidenceSha256); assert.equal(receipt.requestSha256, sha256(proofs[1]));
  assert.equal(receipt.promptSha256, sha256(proofs[2])); assert.equal(receipt.resolvedAt, job.updatedAt);
  for (const [index, file] of proofFiles.entries()) assert.deepEqual(await readFile(file), proofs[index]);
  assert.equal(JSON.stringify(batch).includes('art-no-post-resolution'), false);
  assert.equal(JSON.stringify(batch).includes(f.directory), false);
  assert.deepEqual(f.counts(), { calls: 0, wakes: 0 });
});

test('confirmation is idempotent across service instances without rewriting proof or receipt', async t => {
  const f = await setup(t);
  const first = await f.confirm();
  const receipt = await readFile(f.receiptFile);
  const stamp = (await stat(f.receiptFile)).mtimeMs;
  const before = await readFile(f.stateFile);
  const reopened = createArtProductionService({ root: f.root, startWorker: () => { throw new Error('Unexpected wake'); },
    execute: async () => { throw new Error('Unexpected execution'); } });
  const manifestFile = path.join(f.root, 'output/imagegen/scene-production/manifest.json');
  const storageFiles = [f.stateFile, manifestFile];
  const originalTime = new Date('2026-01-01T00:00:00.000Z');
  for (const file of storageFiles) await utimes(file, originalTime, originalTime);
  const storageTimes = await Promise.all(storageFiles.map(async file => (await stat(file)).mtimeMs));
  const repeated = await reopened.confirmUnsubmittedArtJob(f.batch.id, f.jobId, f.evidenceSha256);
  assert.deepEqual(await Promise.all(storageFiles.map(async file => (await stat(file)).mtimeMs)), storageTimes,
    'Revalidating unchanged no-POST evidence must not replace state or the public manifest.');
  assert.deepEqual(repeated, first); assert.deepEqual(await readFile(f.stateFile), before);
  assert.deepEqual(await readFile(f.receiptFile), receipt); assert.equal((await stat(f.receiptFile)).mtimeMs, stamp);
  assert.equal(repeated.jobs[0].paidAttempts, 1); assert.deepEqual(f.counts(), { calls: 0, wakes: 0 });
  await writeFile(path.join(f.directory, 'paid-attempt.lock'), 'A new marker still invalidates previously confirmed evidence.');
  await f.assertRejected('ART_NO_POST_ARTIFACT_PRESENT');
});

test('receipt-before-state interruption can resume with the same pinned evidence', async t => {
  const f = await setup(t);
  const before = await readFile(f.stateFile);
  await f.confirm();
  const receipt = await readFile(f.receiptFile);
  await writeFile(f.stateFile, before);
  assert.equal((await f.confirm()).jobs[0].state, 'failed');
  assert.deepEqual(await readFile(f.receiptFile), receipt);
});

test('wrong and missing evidence never change production state', async t => {
  for (const [name, pin, code] of [
    ['malformed', 'bad', 'ART_NO_POST_EVIDENCE_HASH_INVALID'],
    ['wrong', '0'.repeat(64), 'ART_NO_POST_EVIDENCE_HASH_MISMATCH'],
    ['missing', undefined, 'ART_NO_POST_RESULT_MISSING'],
  ] as const) await t.test(name, async t => {
    const f = await setup(t);
    if (name === 'missing') await rm(f.resultFile);
    await f.assertRejected(code, pin);
    await assert.rejects(stat(f.receiptFile), { code: 'ENOENT' });
  });
});

test('real unknowns, saved delivery claims, and nonexact result objects are not no-POST proof', async t => {
  for (const result of [
    { ...confirmedResult, state: 'unknown_outcome', errorCode: 'NO_SAVED_DELIVERY' },
    { ...confirmedResult, errorCode: 'CLIENT_FAILED_OR_UNKNOWN' },
    { ...confirmedResult, recoveryAvailable: true },
    { ...confirmedResult, file: '' },
    { ...confirmedResult, response: {} },
  ]) await t.test(JSON.stringify(result), async t => {
    const f = await setup(t);
    const bytes = JSON.stringify(result); await writeFile(f.resultFile, bytes);
    await f.assertRejected('ART_NO_POST_RESULT_NOT_CONFIRMED', sha256(bytes));
  });
});

test('malformed JSON proof and mismatched request/prompt hashes are rejected', async t => {
  for (const file of ['result', 'request', 'prompt', 'request-hash']) await t.test(file, async t => {
    const f = await setup(t);
    if (file === 'result') {
      await writeFile(f.resultFile, 'null');
      await f.assertRejected('ART_NO_POST_RESULT_INVALID', sha256('null'));
    } else if (file === 'request') {
      await writeFile(f.requestFile, '{broken');
      await f.assertRejected('ART_NO_POST_REQUEST_INVALID');
    } else {
      if (file === 'prompt') await writeFile(f.promptFile, 'changed');
      else await writeFile(f.requestFile, JSON.stringify({ sourceHash: 'changed', promptHash: 'changed' }));
      await f.assertRejected('ART_NO_POST_REQUEST_PROMPT_MISMATCH');
    }
  });
});

test('an invocation marker or any generator, archive, image or extra artifact rejects confirmation', async t => {
  for (const artifact of ['paid-attempt.lock', 'delivery', 'archive', 'native.png', 'extra.log']) await t.test(artifact, async t => {
    const f = await setup(t);
    const file = path.join(f.directory, artifact);
    if (['archive', 'delivery'].includes(artifact)) await mkdir(file);
    else await writeFile(file, 'test-only artifact');
    await f.assertRejected('ART_NO_POST_ARTIFACT_PRESENT');
  });
});

test('directory symlinks and linked job-directory ancestors are rejected without following them', async t => {
  for (const ancestor of [false, true]) await t.test(ancestor ? 'linked job parent' : 'linked child', async t => {
    const f = await setup(t);
    if (ancestor) {
      const jobs = path.dirname(f.directory);
      const moved = path.join(path.dirname(jobs), 'original-jobs');
      await rename(jobs, moved); await symlink(moved, jobs, 'junction');
    } else {
      const destination = path.join(f.root, 'linked-fixture');
      await mkdir(destination); await symlink(destination, path.join(f.directory, 'linked'), 'junction');
    }
    await f.assertRejected('ART_NO_POST_SYMLINK_OR_NONFILE');
  });
});

test('a published image without a store asset still blocks no-POST confirmation', async t => {
  const f = await setup(t);
  const published = path.join(f.root, 'public/generated-art');
  await mkdir(published, { recursive: true });
  await writeFile(path.join(published, `${f.jobId}.png`), 'test-only existing delivery');
  await f.assertRejected('ART_NO_POST_ARTIFACT_PRESENT');
});

test('ineligible attempt counts, assets and recoverability preserve unknown isolation', async t => {
  const edits: Partial<StoredJob>[] = [
    { paidAttempts: 0 }, { paidAttempts: 2 }, { recoveryAttempts: 1 }, { recoveryAvailable: true },
    { asset: { url: '/generated-art/fixture.png', width: 1, height: 1, bytes: 1, sha256: 'fixture', native4k: false, originalPixels: true, duplicate: false } },
  ];
  for (const edit of edits) await t.test(JSON.stringify(edit), async t => {
    const f = await setup(t);
    await f.editStore(store => Object.assign(store.batches[0].jobs[0], edit));
    await f.assertRejected('ART_NO_POST_TARGET_NOT_UNSUBMITTED');
  });
});

test('any running batch or generating job blocks maintenance globally', async t => {
  for (const mode of ['running', 'generating']) await t.test(mode, async t => {
    const f = await setup(t);
    await f.service.prepareArtBatch({ world: { ...world, id: 'other-production' } });
    await f.editStore(store => {
      store.batches[1].state = mode === 'running' ? 'running' : 'idle';
      if (mode === 'generating') store.batches[1].jobs[0].state = 'generating';
    });
    await f.assertRejected('ART_NO_POST_REQUIRES_IDLE');
  });
});

test('a live target child or worker PID blocks confirmation', async t => {
  for (const key of ['childPid', 'workerPid'] as const) await t.test(key, async t => {
    const f = await setup(t);
    await f.editStore(store => { store.batches[0].jobs[0][key] = process.pid; });
    await f.assertRejected('ART_NO_POST_JOB_ACTIVE');
  });
});

test('tampered or incomplete resolution receipts never get overwritten', async t => {
  for (const corrupt of ['{partial', JSON.stringify({ kind: 'art-no-post-resolution', resultSha256: 'bad' })]) await t.test(corrupt, async t => {
    const f = await setup(t);
    await writeFile(f.receiptFile, corrupt);
    await f.assertRejected(corrupt === '{partial' ? 'ART_NO_POST_RECEIPT_INVALID' : 'ART_NO_POST_RECEIPT_MISMATCH');
    assert.equal(await readFile(f.receiptFile, 'utf8'), corrupt);
  });
});

test('failed input can be confirmed but queued and recoverable states retain their classifications', async t => {
  for (const state of ['failed', 'queued', 'recoverable'] as const) await t.test(state, async t => {
    const f = await setup(t);
    await f.editStore(store => { store.batches[0].jobs[0].state = state; });
    if (state === 'failed') assert.equal((await f.confirm()).jobs[0].errorCode, 'DISPATCH_NOT_CONFIRMED_NO_POST');
    else await f.assertRejected('ART_NO_POST_TARGET_STATE_INVALID');
  });
});
