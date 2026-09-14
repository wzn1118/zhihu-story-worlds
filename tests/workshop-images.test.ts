import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { createWorkshopImageService, workshopImageSourceHash, type ImageExecution, type ImageResult } from '../server/workshop-images.ts';
import { currentSceneSourceHash } from '../server/workshop-art.ts';
import type { ArtWorldInput } from '../shared/production.ts';
import type { GameWorld } from '../shared/types.ts';

const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function source(count = 3): ArtWorldInput {
  return { id: 'generated-import-workshop-images-test', storyId: 'import-workshop-images-test', title: 'Fixture transport world', version: 'r1', characters: [], source: { title: 'Exact source', author: 'Test only', url: '' },
    nodes: Object.fromEntries(Array.from({ length: count }, (_, n) => [`scene-${n}`, { id: `scene-${n}`, title: `Scene ${n}`, chapter: '', location: 'Room', time: 'Night', background: '', text: [`Fixture scene ${n}.`], choices: [], artBrief: 'Transport test only.' }])) };
}
function png(seed: number, width = 32, height = 18) {
  const chunk = (kind: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(kind), data]); let crc = 0xffffffff;
    for (const value of body) { crc ^= value; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    const output = Buffer.alloc(body.length + 8); output.writeUInt32BE(data.length); body.copy(output, 4); output.writeUInt32BE((crc ^ 0xffffffff) >>> 0, output.length - 4); return output;
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  const pixels = Buffer.alloc((width * 3 + 1) * height, seed); for (let y = 0; y < height; y++) pixels[y * (width * 3 + 1)] = 0;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}
async function delivered(input: ImageExecution, seed = 1, width = 32, height = 18): Promise<ImageResult> {
  await input.onPid(process.pid); const bytes = png(seed, width, height), file = join(input.directory, 'native.png');
  await writeFile(file, bytes);
  return { state: 'generated', file, width, height, bytes: bytes.length, sha256: hash(bytes), recoveryAvailable: false };
}
async function temp(t: { after: (fn: () => Promise<void>) => void }) {
  const root = await mkdtemp(join(tmpdir(), 'workshop-images-')); t.after(() => rm(root, { recursive: true, force: true })); return root;
}

test('preparation is isolated, free, idempotent and exposes only public art fields', async t => {
  const root = await temp(t); let starts = 0, calls = 0;
  const service = createWorkshopImageService({ root, startWorker: () => { starts++; }, execute: async () => { calls++; throw new Error(); } });
  const world = source(), first = await service.prepareImages(world), second = await service.prepareImages(world);
  assert.match(first.id, /^wart_[a-f0-9]{20}$/); assert.deepEqual(second.jobs, first.jobs); assert.equal(starts, 0); assert.equal(calls, 0);
  assert.equal(first.progress.current, 3); assert.equal(first.progress.covered, 0); assert.equal(first.progress.sceneShortfall, 27);
  assert.ok(first.jobs.every(j => /^wscene_[a-f0-9]{28}$/.test(j.id)));
  assert.equal('prompt' in first.jobs[0], false); assert.equal('childPid' in first.jobs[0], false);
  assert.equal(workshopImageSourceHash(world, world.nodes['scene-0']), currentSceneSourceHash(world as GameWorld, world.nodes['scene-0']));
  const privateState = JSON.parse(await readFile(join(root, 'output/workshop-images/.private/state.json'), 'utf8'));
  assert.match(privateState.batches[0].jobs[0].prompt, /Transport test only/);
  await assert.rejects(readFile(join(root, 'output/imagegen/scene-production/.private/state.json')), { code: 'ENOENT' });
  const changed = structuredClone(world); changed.nodes['scene-0'].text = ['Changed scene.']; const revised = await service.prepareImages(changed);
  assert.equal(revised.jobs.filter(j => j.stale).length, 1); assert.equal(revised.progress.current, 3);
});

test('two run clicks reserve once; concurrency and budget remain bounded with child ownership persisted', async t => {
  const root = await temp(t); let active = 0, high = 0, calls = 0, starts = 0;
  const service = createWorkshopImageService({ root, startWorker: () => { starts++; }, execute: async input => {
    calls++; active++; high = Math.max(high, active); const seed = calls;
    try { await input.onPid(process.pid); const saved = JSON.parse(await readFile(join(root, 'output/workshop-images/.private/state.json'), 'utf8')); assert.ok(saved.batches[0].jobs.some((j: any) => j.childPid === process.pid)); await delay(15); return await delivered(input, seed); } finally { active--; }
  } });
  const prepared = await service.prepareImages(source(10));
  const [a, b] = await Promise.all([service.runImages(prepared.id, { maxJobs: 9, concurrency: 3 }), service.runImages(prepared.id, { maxJobs: 1, concurrency: 1 })]);
  assert.equal(a.remainingRunBudget, 9); assert.equal(b.remainingRunBudget, 9); assert.equal(starts, 2);
  await service.drainImages(); const result = await service.getImages(prepared.id);
  assert.equal(calls, 9); assert.ok(high <= 3 && high > 1); assert.equal(result!.progress.paidAttemptsTotal, 9); assert.equal(result!.progress.generated, 9); assert.equal(result!.progress.queued, 1);
  assert.equal(result!.progress.native4k, 0); assert.equal(result!.progress.resolutionMismatch, 9); assert.equal(result!.progress.covered, 0); assert.equal(result!.state, 'idle');
  await service.runImages(prepared.id, { maxJobs: 40, concurrency: 8 }); await service.drainImages();
  assert.equal(calls, 10); await service.runImages(prepared.id); await service.drainImages(); assert.equal(calls, 10);
  await assert.rejects(service.runImages(prepared.id, { concurrency: 17 }), /INVALID_IMAGE_RUN_LIMIT/);
});

test('exact-size repairs preserve other scenes and reserve only one request for the new geometry', async t => {
  const root = await temp(t), world = source(3); let originalCalls = 0;
  const normal = createWorkshopImageService({ root, startWorker: () => {}, execute: input => delivered(input, ++originalCalls) });
  const prepared = await normal.prepareImages(world);
  await normal.runImages(prepared.id); await normal.drainImages();
  const original = (await normal.getImages(prepared.id))!;
  let calls = 0;
  const exact = createWorkshopImageService({ root, pixelSize: '4096x2304', startWorker: () => {}, execute: async input => {
    calls++;
    const request = JSON.parse(await readFile(join(input.directory, 'request.json'), 'utf8'));
    assert.deepEqual(request.requested, { aspectRatio: '16:9', resolution: '4K', pixelSize: '4096x2304' });
    return delivered(input, 19);
  } });
  const directions = { 'scene-0': 'Repair current scene only.' };
  const repaired = await exact.prepareImages(world, directions, true);
  assert.equal(repaired.progress.current, 3);
  assert.equal(repaired.jobs.filter(job => job.stale).length, 1);
  for (const scene of ['scene-1', 'scene-2']) {
    assert.deepEqual(repaired.jobs.find(job => job.nodeId === scene), original.jobs.find(job => job.nodeId === scene));
  }
  const current = repaired.jobs.find(job => !job.stale && job.nodeId === 'scene-0')!;
  assert.notEqual(current.id, original.jobs[0].id);
  assert.deepEqual((await exact.prepareImages(world, directions, true)).jobs, repaired.jobs);
  await exact.runImages(repaired.id); await exact.drainImages();
  await exact.runImages(repaired.id); await exact.drainImages();
  assert.equal(calls, 1); assert.equal(originalCalls, 3);
  assert.equal((await exact.getImages(repaired.id))!.progress.native4k, 0);
});

test('authorization/rate failures stop new jobs and preserve untouched budget without repeat POSTs', async t => {
  const root = await temp(t); let calls = 0;
  const service = createWorkshopImageService({ root, startWorker: () => {}, execute: async input => { calls++; await input.onPid(process.pid); return { state: 'blocked', errorCode: 'HTTP_403', recoveryAvailable: false }; } });
  const batch = await service.prepareImages(source(4)); await service.runImages(batch.id, { concurrency: 1 }); await service.drainImages();
  const result = await service.getImages(batch.id); assert.equal(calls, 1); assert.equal(result!.circuitBreaker?.code, 'HTTP_403'); assert.equal(result!.progress.queued, 3); assert.equal(result!.remainingRunBudget, 39);
  await assert.rejects(service.runImages(batch.id), /WORKSHOP_IMAGE_CIRCUIT_OPEN/); assert.equal(calls, 1);
});

test('unknown outcomes stay quarantined across revisions and read-only recovery never generates', async t => {
  const root = await temp(t), actions: string[] = [];
  const service = createWorkshopImageService({ root, startWorker: () => {}, execute: async input => { actions.push(input.action); await input.onPid(process.pid); return { state: 'unknown_outcome', errorCode: 'TRANSPORT_TIMEOUT_UNKNOWN', recoveryAvailable: false }; } });
  const world = source(1), batch = await service.prepareImages(world); await service.runImages(batch.id); await service.drainImages();
  await service.runImages(batch.id); await service.drainImages(); assert.deepEqual(actions, ['generate']);
  const same = { ...world, version: 'r2' }; const previous = await service.prepareImages(same); assert.equal(previous.jobs[0].paidAttempts, 1); await service.runImages(previous.id); await service.drainImages(); assert.deepEqual(actions, ['generate']);
  const revised = structuredClone(world); revised.version = 'r3'; revised.nodes['scene-0'].text = ['New story beat.'];
  const blocked = await service.prepareImages(revised); assert.equal(blocked.jobs[0].state, 'blocked'); assert.equal(blocked.jobs[0].errorCode, 'PREVIOUS_IMAGE_OUTCOME_UNKNOWN');
  await service.runImages(batch.id, { recoverOnly: true }); await service.drainImages(); assert.deepEqual(actions, ['generate', 'inspect']);
  assert.equal((await service.getImages(batch.id))!.jobs[0].paidAttempts, 1);
});

test('actual delivery metadata stays unapproved until a current intact distinct image is reviewed', async t => {
  const root = await temp(t); const service = createWorkshopImageService({ root, startWorker: () => {}, execute: input => delivered(input, 7, 3840, 2160) });
  const batch = await service.prepareImages(source(2)); await service.runImages(batch.id, { concurrency: 1 }); await service.drainImages();
  const generated = (await service.getImages(batch.id))!; assert.equal(generated.progress.generated, 2); assert.equal(generated.progress.duplicates, 1); assert.equal(generated.progress.native4k, 1); assert.equal(generated.progress.covered, 0);
  const [first, duplicate] = generated.jobs;
  await assert.rejects(service.reviewImage(batch.id, duplicate.id, { decision: 'approved', reviewer: 'fixture', notes: 'Synthetic test image.' }), /DISTINCT/);
  await service.reviewImage(batch.id, first.id, { decision: 'approved', reviewer: 'fixture', notes: 'Synthetic PNG transport test, not a generated illustration.' });
  assert.equal((await service.getImages(batch.id))!.progress.covered, 1);
  const file = join(root, 'public', first.asset!.url); await writeFile(file, Buffer.from('corrupted'));
  await assert.rejects(service.reviewImage(batch.id, first.id, { decision: 'approved', reviewer: 'fixture', notes: 'tamper' }), /INTEGRITY/);
});

test('an abandoned worker inspects its original directory and pause prevents fresh claims', async t => {
  const root = await temp(t), actions: string[] = [];
  const service = createWorkshopImageService({ root, startWorker: () => {}, execute: async input => { actions.push(input.action); return delivered(input, 9); } });
  const batch = await service.prepareImages(source(2)); await service.runImages(batch.id);
  const stateFile = join(root, 'output/workshop-images/.private/state.json'), store = JSON.parse(await readFile(stateFile, 'utf8'));
  const job = store.batches[0].jobs[0]; job.state = 'generating'; job.paidAttempts = 1; job.ownerPid = 2147483646; job.childPid = 2147483645;
  store.batches[0].state = 'paused'; await writeFile(stateFile, JSON.stringify(store)); await mkdir(join(root, 'output/workshop-images/.private/jobs', job.id), { recursive: true });
  await service.drainImages(); assert.deepEqual(actions, ['inspect']);
  const result = (await service.getImages(batch.id))!; assert.equal(result.progress.generated, 1); assert.equal(result.progress.queued, 1); assert.equal(result.progress.paidAttemptsTotal, 1);
  await service.pauseImages(batch.id); await service.drainImages(); assert.deepEqual(actions, ['inspect']);
});
