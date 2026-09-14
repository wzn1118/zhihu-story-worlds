import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { artPrivateFileGuard, createArtProductionService, isNative4k, type ArtClientResult } from '../server/art-production.ts';
import { sha256, canonical } from '../server/art-production-prompts.ts';
import type { ArtConcurrency, ArtJobKind, ArtWorldInput } from '../shared/production.ts';
import { FILM_PREFIX } from '../server/art-production-film.ts';

const fixture = (id = 'fixture-world', nodeIds = ['first', 'second', 'third']): ArtWorldInput => ({
  id, storyId: `import-${id}`, title: 'Test-only story', version: '1', characters: [],
  source: { title: 'Local test', author: 'Fixture', url: '' },
  nodes: Object.fromEntries(nodeIds.map(nodeId => [nodeId, { id: nodeId, chapter: 'one', title: nodeId,
    location: 'test set', time: 'morning', text: [`specific ${nodeId} action`], background: '', choices: [] }])),
});
const brief = async (_root: string, world: ArtWorldInput, node: ArtWorldInput['nodes'][string]) => ({
  prompt: `${world.id}/${node.id}/${node.text.join(' ')}`, references: ['test-only-reference.png'],
  sourceHash: sha256(canonical(node)), referenceHash: sha256('test-reference-content'),
});
async function setup(execute?: NonNullable<Parameters<typeof createArtProductionService>[0]>['execute']) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'art-production-test-'));
  const service = createArtProductionService({ root, buildBrief: brief, startWorker: () => {}, execute });
  return { root, service };
}
// Synthetic PNG headers used only by injected test executor; never enter real production.
function testBinary(width = 4096, height = 2304, marker = 0): Buffer {
  const data = Buffer.alloc(64); data.write('89504e470d0a1a0a', 0, 'hex');
  data.writeUInt32BE(width, 16); data.writeUInt32BE(height, 20); data.writeUInt32BE(marker, 32); return data;
}
async function delivered(directory: string, width = 4096, height = 2304, marker = 0): Promise<ArtClientResult> {
  const binary = testBinary(width, height, marker);
  await mkdir(directory, { recursive: true }); const file = path.join(directory, 'test-only.png'); await writeFile(file, binary);
  return { state: 'generated', file, width, height, bytes: binary.length, sha256: sha256(binary), native4k: isNative4k(width, height), recoveryAvailable: true };
}
async function within<T>(promise: Promise<T>, timeoutMs = 5000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('EXPECTED_DISPATCH_DID_NOT_START')), timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}

test('prepare persists real world/node identity and is idempotent, no paid work', async () => {
  let calls = 0; const { root, service } = await setup(async () => { calls++; throw new Error('paid work forbidden'); });
  const first = await service.prepareArtBatch({ world: fixture() });
  const second = await service.prepareArtBatch({ world: fixture() });
  assert.deepEqual(second.jobs.map(j => j.id), first.jobs.map(j => j.id));
  assert.equal(first.progress.sceneShortfall, 27); assert.equal(first.progress.generated, 0); assert.equal(calls, 0);
  const reopened = createArtProductionService({ root, buildBrief: brief, startWorker: () => {} });
  assert.equal((await reopened.getArtBatch(first.id))?.progress.queued, 3);
  assert.equal(await reopened.getArtBatch('missing'), null);
});

test('film jobs require an explicit saved selection at the shared API, before any paid work', async () => {
  const { root } = await setup();
  let started = 0;
  const service = createArtProductionService({ root, startWorker: () => { started++; },
    buildBrief: async (...args) => ({ ...await brief(...args), prompt: FILM_PREFIX + 'Original film test fixture' }) });
  const batch = await service.prepareArtBatch({ world: fixture() });
  await assert.rejects(service.runArtBatch(batch.id), /FILM_EXACT_SELECTION_REQUIRED/);
  await assert.rejects(service.runArtBatch(batch.id, { jobIds: [batch.jobs[0].id], maxJobs: 1 }), /FILM_WAVE_REQUIRED/);
  assert.equal(started, 0);
  assert.equal((await service.getArtBatch(batch.id))?.progress.paidAttemptsTotal, 0);
});

test('selected non-film jobs are independent of current and stale film jobs in the same world', async () => {
  let calls = 0;
  const { root } = await setup();
  const world = fixture('mixed-film', ['film-current', 'film-stale', 'short']);
  const service = createArtProductionService({ root, startWorker: () => {},
    execute: async ({ directory }) => delivered(directory, 4096, 2304, ++calls),
    buildBrief: async (...args) => ({ ...await brief(...args),
      prompt: args[2].id.startsWith('film') ? FILM_PREFIX + args[2].id : 'New short scene' }) });
  await service.prepareArtBatch({ world });
  delete world.nodes['film-stale'];
  const batch = await service.prepareArtBatch({ world });
  const short = batch.jobs.find(job => job.nodeId === 'short')!;
  await service.runArtBatch(batch.id, { maxJobs: 1, jobIds: [short.id], concurrency: 8 });
  await service.drain();
  assert.equal(calls, 1);
  assert.equal((await service.getArtBatch(batch.id))?.jobs.find(job => job.id === short.id)?.state, 'generated');
  assert.ok((await service.getArtBatch(batch.id))?.jobs.filter(job => job.nodeId.startsWith('film')).every(job => job.paidAttempts === 0));
  await assert.rejects(service.runArtBatch(batch.id), /FILM_EXACT_SELECTION_REQUIRED/);
  await assert.rejects(service.runArtBatch(batch.id, { maxJobs: 1,
    jobIds: [batch.jobs.find(job => job.nodeId === 'film-current')!.id] }), /FILM_WAVE_REQUIRED/);
});

test('worker validates film reservations from an older API before claiming a paid request', async () => {
  const { root } = await setup();
  let paid = 0;
  const service = createArtProductionService({ root, startWorker: () => {},
    execute: async () => { paid++; throw new Error('must not submit'); },
    buildBrief: async (...args) => ({ ...await brief(...args), prompt: FILM_PREFIX + 'Original film test fixture' }) });
  const batch = await service.prepareArtBatch({ world: fixture() });
  const stateFile = path.join(root, 'output/imagegen/scene-production/.private/state.json');
  const store = JSON.parse(await readFile(stateFile, 'utf8'));
  store.batches[0].state = 'running'; store.batches[0].remainingRunBudget = 40;
  await writeFile(stateFile, JSON.stringify(store));
  await service.drain();
  const result = await service.getArtBatch(batch.id);
  assert.equal(paid, 0); assert.equal(result?.progress.paidAttemptsTotal, 0);
  assert.equal(result?.state, 'paused');
  assert.equal(result?.circuitBreaker?.code, 'FILM_EXACT_SELECTION_REQUIRED');
});

test('pure worker wake preserves a pause made after reservation', async () => {
  const { service } = await setup();
  const batch = await service.prepareArtBatch({ world: fixture() });
  await service.runArtBatch(batch.id, { jobIds: [batch.jobs[0].id], maxJobs: 1 });
  await service.pauseArtBatch(batch.id);
  await service.wakeArtWorker();
  assert.equal((await service.getArtBatch(batch.id))?.state, 'paused');
});

test('text-only preparation persists zero references while malformed and excessive references are rejected', async () => {
  const { root } = await setup();
  const world = fixture('text-only', ['first']);
  const textOnly = createArtProductionService({ root, startWorker: () => {}, buildBrief: async (...args) => ({
    ...await brief(...args), references: [],
  }) });
  const prepared = await textOnly.prepareArtBatch({ world });
  assert.equal(prepared.jobs.length, 1);
  assert.equal(prepared.jobs[0].paidAttempts, 0);
  for (const references of [[''], Array(7).fill('test.png')]) {
    const invalid = createArtProductionService({ root, startWorker: () => {}, buildBrief: async (...args) => ({
      ...await brief(...args), references,
    }) });
    await assert.rejects(invalid.prepareArtBatch({ world }), /ART_REFERENCE_COUNT/);
  }
});

test('text changes invalidate only matching scene; removed nodes remain stale history', async () => {
  const { service } = await setup(); const world = fixture(); const original = await service.prepareArtBatch({ world });
  world.nodes.first.text = ['revised concrete action']; delete world.nodes.third;
  const revised = await service.prepareArtBatch({ world });
  assert.equal(revised.progress.stale, 2); assert.equal(revised.progress.current, 2);
  assert.equal(revised.jobs.find(j => j.nodeId === 'second')?.id, original.jobs.find(j => j.nodeId === 'second')?.id);
  assert.equal(revised.jobs.filter(j => j.nodeId === 'first' && !j.stale).length, 1);
});

test('reference-content changes mark existing images stale without mutating jobs', async () => {
  const { root, service } = await setup(); const old = await service.prepareArtBatch({ world: fixture() });
  const changed = createArtProductionService({ root, startWorker: () => {}, buildBrief: async (...args) => ({ ...await brief(...args), referenceHash: sha256('changed-reference') }) });
  const next = await changed.prepareArtBatch({ world: fixture() });
  assert.equal(next.progress.stale, 3); assert.equal(next.progress.current, 3);
  assert.ok(old.jobs.every(j => next.jobs.find(n => n.id === j.id)?.stale));
});

test('explicit native pixel request is persisted and gets a separate immutable revision', async () => {
  const { root, service } = await setup();
  const old = await service.prepareArtBatch({ world: fixture() });
  const changed = createArtProductionService({ root, startWorker: () => {}, buildBrief: async (...args) => ({
    ...await brief(...args), pixelSize: '4096x2304',
  }) });
  const next = await changed.prepareArtBatch({ world: fixture() });
  assert.equal(next.progress.stale, 3);
  assert.ok(old.jobs.every(j => next.jobs.find(n => n.id === j.id)?.stale));
  assert.ok(next.jobs.filter(j => !j.stale).every(j => j.requested.pixelSize === '4096x2304'));
});

test('minimum counts never synthesize nodes; partial prepare retains unrelated current jobs', async () => {
  const { service } = await setup(); const world = fixture(); await service.prepareArtBatch({ world });
  const partial = await service.prepareArtBatch({ world, nodeIds: ['second'] });
  assert.equal(partial.progress.current, 3); assert.equal(partial.progress.required, 30);
  await assert.rejects(service.prepareArtBatch({ world, minimumImages: 2 }), /AT_LEAST_30/);
  await assert.rejects(service.prepareArtBatch({ world, nodeIds: ['missing'] }), /INVALID_ART_NODES/);
});

test('ancillary preparation is additive and approved ancillary deliveries never satisfy scene coverage', async () => {
  let calls = 0;
  const { service } = await setup(async ({ directory }) => delivered(directory, 4096, 2304, ++calls));
  const sceneIds = Array.from({ length: 29 }, (_, i) => `scene-${i}`);
  const jobKinds: Record<string, ArtJobKind> = {
    anchor: 'character-anchor', reaction: 'character-reaction', cover: 'cover', environment: 'environment',
  };
  const world = fixture('all-art', [...sceneIds, ...Object.keys(jobKinds)]);
  const scenes = await service.prepareArtBatch({ world, nodeIds: sceneIds });
  const prepared = await service.prepareArtBatch({ world, nodeIds: Object.keys(jobKinds), jobKinds, minimumImages: 0 });
  assert.equal(prepared.minimumImages, 30);
  assert.equal(prepared.progress.current, 33);
  assert.equal(prepared.progress.sceneCurrent, 29);
  assert.equal(prepared.progress.ancillaryCurrent, 4);
  assert.equal(prepared.progress.required, 30);
  assert.equal(prepared.progress.sceneShortfall, 1);
  assert.ok(scenes.jobs.every(job => prepared.jobs.some(current => current.id === job.id && !current.stale)));
  const selected = prepared.jobs.filter(job => job.assetKind !== 'scene');
  await service.runArtBatch(prepared.id, { jobIds: selected.map(job => job.id), maxJobs: 4, concurrency: 8 });
  await service.drain();
  for (const job of selected) await service.reviewArtJob(prepared.id, job.id,
    { decision: 'approved', reviewer: 'test', notes: 'Synthetic ancillary review' });
  const progress = (await service.getArtBatch(prepared.id))!.progress;
  assert.equal(progress.generated, 4); assert.equal(progress.approved, 4);
  assert.equal(progress.ancillaryGenerated, 4); assert.equal(progress.ancillaryNative4k, 4);
  assert.equal(progress.ancillaryReviewed, 4); assert.equal(progress.ancillaryApproved, 4);
  assert.equal(progress.ancillaryCovered, 4); assert.equal(progress.covered, 0);
  assert.equal(progress.missing, 30); assert.equal(progress.sceneShortfall, 1);
});

test('ancillary-only batches accept zero minimum and validate kind mappings without changing scene job identity', async () => {
  const { root, service } = await setup();
  const world = fixture('ancillary-only', ['anchor']);
  const input = { world, jobKinds: { anchor: 'character-anchor' as const }, minimumImages: 0 };
  const first = await service.prepareArtBatch(input);
  const second = await service.prepareArtBatch(input);
  assert.equal(second.jobs[0].id, first.jobs[0].id);
  assert.equal(second.jobs[0].assetKind, 'character-anchor');
  assert.equal(second.progress.required, 0); assert.equal(second.progress.sceneShortfall, 0);
  await assert.rejects(service.prepareArtBatch({ world, minimumImages: 0 }), /AT_LEAST_30/);
  await assert.rejects(service.prepareArtBatch({ ...input, minimumImages: -1 }), /INVALID_ART_MINIMUM/);
  await assert.rejects(service.prepareArtBatch({ ...input, jobKinds: { anchor: 'invalid' as ArtJobKind } }), /INVALID_ART_JOB_KINDS/);
  await assert.rejects(service.prepareArtBatch({ ...input, jobKinds: { missing: 'cover' } }), /INVALID_ART_JOB_KINDS/);
  const scenes = await service.prepareArtBatch({ world });
  assert.notEqual(scenes.jobs.find(job => !job.stale)!.id, first.jobs[0].id);
  assert.equal(scenes.jobs.find(job => job.id === first.jobs[0].id)?.stale, true);
  const stateFile = path.join(root, 'output/imagegen/scene-production/.private/state.json');
  const store = JSON.parse(await readFile(stateFile, 'utf8'));
  const current = store.batches[0].jobs.find((job: { stale: boolean }) => !job.stale);
  delete current.assetKind;
  await writeFile(stateFile, JSON.stringify(store));
  const historical = await service.prepareArtBatch({ world });
  assert.equal(historical.jobs.find(job => !job.stale)!.id, current.id);
  assert.equal(historical.jobs.find(job => !job.stale)!.assetKind, 'scene');
  assert.equal(historical.progress.sceneCurrent, 1);
  assert.equal(historical.progress.ancillaryCurrent, 0);
});

test('native 4K is native 16:9 >=3840x2160, not long-edge alone', () => {
  assert.equal(isNative4k(4096, 2304), true); assert.equal(isNative4k(3840, 2160), true);
  assert.equal(isNative4k(3500, 1968), false); assert.equal(isNative4k(4096, 1024), false);
  assert.equal(isNative4k(2304, 4096), false); assert.equal(isNative4k(4096, 4096), false);
});

test('global worker lease and two-request cap across batches, exact run budget', async () => {
  let inFlight = 0, peak = 0, submitted = 0;
  const { service } = await setup(async ({ directory }) => {
    submitted++; inFlight++; peak = Math.max(peak, inFlight); const marker = submitted;
    await new Promise(resolve => setTimeout(resolve, 25)); inFlight--; return delivered(directory, 4096, 2304, marker);
  });
  const a = await service.prepareArtBatch({ world: fixture('a') }); const b = await service.prepareArtBatch({ world: fixture('b') });
  await service.runArtBatch(a.id, { maxJobs: 2 }); await service.runArtBatch(b.id, { maxJobs: 2 });
  // A duplicate run must not extend the budget.
  await service.runArtBatch(a.id, { maxJobs: 20 });
  await Promise.all([service.drain(), service.drain()]);
  assert.equal(peak, 2); assert.equal(submitted, 4);
  assert.equal((await service.getArtBatch(a.id))?.progress.queued, 1);
  assert.equal((await service.getArtBatch(b.id))?.progress.generated, 2);
  assert.equal((await service.getArtBatch(b.id))?.progress.reviewed, 0);
});

for (const concurrency of [8, 32, 64] as const) test(`explicit concurrency is durable and the global worker lease never exceeds ${concurrency} requests`, { timeout: 30000 }, async () => {
  let inFlight = 0, peak = 0, submitted = 0;
  let reachedLimit!: () => void, releaseFirstWave!: () => void;
  const limitReached = new Promise<void>(resolve => { reachedLimit = resolve; });
  const held = new Promise<void>(resolve => { releaseFirstWave = resolve; });
  const execute = async ({ directory }: { directory: string }) => {
    const marker = ++submitted; inFlight++; peak = Math.max(peak, inFlight);
    if (inFlight === concurrency) reachedLimit();
    try { await held; return await delivered(directory, 4096, 2304, marker); }
    finally { inFlight--; }
  };
  const { root, service } = await setup(execute);
  const jobsPerBatch = concurrency / 2 + 2;
  const ids = Array.from({ length: jobsPerBatch }, (_, i) => `scene-${i}`);
  const a = await service.prepareArtBatch({ world: fixture(`capacity-${concurrency}-a`, ids) });
  const b = await service.prepareArtBatch({ world: fixture(`capacity-${concurrency}-b`, ids) });
  await service.runArtBatch(a.id, { maxJobs: jobsPerBatch, concurrency });
  await service.runArtBatch(b.id, { maxJobs: jobsPerBatch, concurrency });
  const reopened = createArtProductionService({ root, buildBrief: brief, startWorker: () => {}, execute });
  assert.equal((await reopened.getArtBatch(a.id))?.concurrency, concurrency);
  const draining = Promise.all([service.drain(), reopened.drain()]);
  try {
    await within(limitReached, 10000);
    assert.equal((await service.listArtBatches()).reduce((sum, batch) => sum + batch.progress.inFlight, 0), concurrency);
    assert.equal(submitted, concurrency);
  } finally { releaseFirstWave(); await draining; }
  assert.equal(peak, concurrency); assert.equal(submitted, jobsPerBatch * 2);
  assert.ok((await service.listArtBatches()).every(batch => batch.progress.generated === jobsPerBatch && batch.progress.paidAttemptsTotal === jobsPerBatch));
  await service.runArtBatch(a.id, { maxJobs: 1 });
  assert.equal((await service.getArtBatch(a.id))?.concurrency, concurrency);
  await service.drain();
  assert.equal(submitted, jobsPerBatch * 2);
});

test('32-slot wave persists real child PIDs before START without dispatch lock failures', { timeout: 30000 }, async () => {
  let spawned = 0;
  const childScript = [
    "const fs=require('fs');",
    "const path=process.argv[1];",
    "process.stdin.setEncoding('utf8');",
    "process.stdin.on('data',d=>{if(d.includes('START')) fs.writeFileSync(path+'/result.json', JSON.stringify({state:'failed',errorCode:'TEST_CLIENT_DONE',recoveryAvailable:false}));});",
    "process.stdin.on('end',()=>process.exit(0));",
  ].join('');
  const { root } = await setup();
  const service = createArtProductionService({
    root,
    buildBrief: brief,
    startWorker: () => {},
    spawnClient: ({ directory }) => {
      spawned++;
      return spawn(process.execPath, ['-e', childScript, directory], { stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true });
    },
  });
  const world = fixture('real-pid-32', Array.from({ length: 96 }, (_, i) => `node-${i}`));
  const batch = await service.prepareArtBatch({ world });
  await service.runArtBatch(batch.id, { maxJobs: 32, concurrency: 32 });
  await service.drain();
  const result = await service.getArtBatch(batch.id);
  assert.equal(spawned, 32);
  assert.equal(result?.progress.inFlight, 0);
  assert.equal(result?.progress.paidAttemptsTotal, 32);
  assert.equal(result?.progress.unknownOutcome, 0);
  assert.equal(result?.circuitBreaker?.code, 'TEST_CLIENT_DONE');
  const state = JSON.parse(await readFile(path.join(root, 'output/imagegen/scene-production/.private/state.json'), 'utf8'));
  assert.equal(state.batches[0].jobs.filter((job: { errorCode?: string }) => job.errorCode === 'ART_STORE_BUSY').length, 0);
});

test('a failed 32-slot wave blocks remaining jobs and never resubmits its unknown attempt', { timeout: 30000 }, async () => {
  let submitted = 0, reachedLimit!: () => void, releaseFirstWave!: () => void;
  const limitReached = new Promise<void>(resolve => { reachedLimit = resolve; });
  const held = new Promise<void>(resolve => { releaseFirstWave = resolve; });
  const { service } = await setup(async ({ directory }) => {
    const marker = ++submitted;
    if (submitted === 32) reachedLimit();
    await held;
    return marker === 1
      ? { state: 'unknown_outcome', errorCode: 'TRANSPORT_TIMEOUT_UNKNOWN', recoveryAvailable: false }
      : delivered(directory, 4096, 2304, marker);
  });
  const batch = await service.prepareArtBatch({ world: fixture('failed-wave', Array.from({ length: 34 }, (_, i) => `scene-${i}`)) });
  await service.runArtBatch(batch.id, { maxJobs: 34, concurrency: 32 });
  const draining = service.drain();
  try { await within(limitReached, 10000); }
  finally { releaseFirstWave(); await draining; }
  const stopped = (await service.getArtBatch(batch.id))!;
  assert.equal(submitted, 32);
  assert.equal(stopped.state, 'blocked');
  assert.equal(stopped.progress.queued, 2);
  assert.equal(stopped.progress.unknownOutcome, 1);
  assert.equal(stopped.progress.paidAttemptsTotal, 32);
  await assert.rejects(service.runArtBatch(batch.id, { concurrency: 32 }), /ART_CIRCUIT_OPEN/);
  const unknown = stopped.jobs.find(job => job.state === 'unknown_outcome')!;
  await service.runArtBatch(batch.id, { maxJobs: 1, concurrency: 32, acknowledgeBlock: true, jobIds: [unknown.id] });
  await service.drain();
  assert.equal(submitted, 32);
  assert.equal((await service.getArtBatch(batch.id))!.jobs.find(job => job.id === unknown.id)!.paidAttempts, 1);
});

test('a serial batch retains its own cap without reducing another batch explicit eight-slot allowance', { timeout: 15000 }, async () => {
  const owners = new Map<string, string>(), inFlight = new Map<string, number>(), peak = new Map<string, number>();
  let submitted = 0, reachedEight!: () => void, releaseFirstWave!: () => void;
  const eight = new Promise<void>(resolve => { reachedEight = resolve; });
  const held = new Promise<void>(resolve => { releaseFirstWave = resolve; });
  const { service } = await setup(async ({ directory }) => {
    const owner = owners.get(path.basename(directory))!;
    const marker = ++submitted, active = (inFlight.get(owner) ?? 0) + 1;
    inFlight.set(owner, active); peak.set(owner, Math.max(peak.get(owner) ?? 0, active));
    if ([...inFlight.values()].reduce((sum, value) => sum + value, 0) === 8) reachedEight();
    try { await held; return await delivered(directory, 4096, 2304, marker); }
    finally { inFlight.set(owner, inFlight.get(owner)! - 1); }
  });
  const a = await service.prepareArtBatch({ world: fixture('serial') });
  const b = await service.prepareArtBatch({ world: fixture('parallel', Array.from({ length: 10 }, (_, i) => `scene-${i}`)) });
  for (const batch of [a, b]) for (const job of batch.jobs) owners.set(job.id, batch.id);
  await service.runArtBatch(a.id, { maxJobs: 3, concurrency: 1 });
  await service.runArtBatch(b.id, { maxJobs: 10, concurrency: 8 });
  const draining = service.drain();
  try {
    await within(eight);
    assert.equal((await service.getArtBatch(a.id))?.progress.inFlight, 1);
    assert.equal((await service.getArtBatch(b.id))?.progress.inFlight, 7);
  } finally { releaseFirstWave(); await draining; }
  assert.equal(peak.get(a.id), 1); assert.ok(peak.get(b.id)! >= 7 && peak.get(b.id)! <= 8);
  assert.equal(submitted, 13);
});

test('concurrency defaults to two and invalid limits are rejected before any run state is saved', async () => {
  const { root, service } = await setup();
  const batch = await service.prepareArtBatch({ world: fixture('concurrency-validation') });
  assert.equal(batch.concurrency, 2);
  const stateFile = path.join(root, 'output/imagegen/scene-production/.private/state.json');
  const before = await readFile(stateFile, 'utf8');
  for (const concurrency of [0, 65, -1, 1.5, NaN, Infinity, '64']) {
    await assert.rejects(service.runArtBatch(batch.id, { concurrency: concurrency as ArtConcurrency }), /INVALID_ART_CONCURRENCY/);
  }
  assert.equal(await readFile(stateFile, 'utf8'), before);
  assert.equal((await service.runArtBatch(batch.id)).concurrency, 2);
  await service.pauseArtBatch(batch.id);
  for (let concurrency = 1; concurrency <= 64; concurrency++) {
    assert.equal((await service.runArtBatch(batch.id, { concurrency: concurrency as ArtConcurrency })).concurrency, concurrency);
    await service.pauseArtBatch(batch.id);
  }
});

test('a late second batch uses the free slot while the first request is still pending', { timeout: 8000 }, async () => {
  let firstStarted!: () => void, secondStarted!: () => void, releaseFirst!: () => void;
  const firstSeen = new Promise<void>(resolve => { firstStarted = resolve; });
  const secondSeen = new Promise<void>(resolve => { secondStarted = resolve; });
  const held = new Promise<void>(resolve => { releaseFirst = resolve; });
  let calls = 0;
  const { service } = await setup(async ({ directory }) => {
    const marker = ++calls;
    if (marker === 1) { firstStarted(); await held; }
    else secondStarted();
    return delivered(directory, 4096, 2304, marker);
  });
  const a = await service.prepareArtBatch({ world: fixture('late-a', ['first']) });
  const b = await service.prepareArtBatch({ world: fixture('late-b', ['first']) });
  await service.runArtBatch(a.id, { maxJobs: 1 });
  const draining = service.drain();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await firstSeen;
    await service.runArtBatch(b.id, { maxJobs: 1 });
    await Promise.race([secondSeen, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('FREE_SLOT_WAS_NOT_FILLED')), 3500);
    })]);
    assert.equal((await service.getArtBatch(a.id))?.jobs[0].state, 'generating');
    assert.equal(calls, 2);
  } finally {
    clearTimeout(timer);
    releaseFirst();
    await draining;
  }
  assert.equal((await service.getArtBatch(b.id))?.progress.generated, 1);
});

test('pause allows delivery of in-flight job but stops new paid jobs', async () => {
  let calls = 0; let service: ReturnType<typeof createArtProductionService>; let id = '';
  ({ service } = await setup(async ({ directory }) => { calls++; await service.pauseArtBatch(id); return delivered(directory); }));
  id = (await service.prepareArtBatch({ world: fixture() })).id;
  await service.runArtBatch(id, { maxJobs: 3, concurrency: 1 }); await service.drain();
  const batch = await service.getArtBatch(id); assert.equal(calls, 1); assert.equal(batch?.state, 'paused'); assert.equal(batch?.progress.queued, 2);
});

for (const code of ['HTTP_401', 'HTTP_402', 'HTTP_403', 'HTTP_429', 'HTTP_502', 'TRANSPORT_TIMEOUT_UNKNOWN']) {
  test(`${code} stops scheduling and never retries transmitted POST`, async () => {
    let calls = 0;
    const { service } = await setup(async () => { calls++; return { state: code === 'HTTP_502' || code.includes('TIMEOUT') ? 'unknown_outcome' : 'blocked', errorCode: code, recoveryAvailable: false }; });
    const a = await service.prepareArtBatch({ world: fixture() }); await service.runArtBatch(a.id, { maxJobs: 3, concurrency: 1 }); await service.drain();
    assert.equal(calls, 1); const b = (await service.getArtBatch(a.id))!; assert.equal(b.progress.queued, 2); assert.equal(b.circuitBreaker?.code, code);
    await assert.rejects(service.runArtBatch(a.id), /ART_CIRCUIT_OPEN/); await service.drain(); assert.equal(calls, 1);
    await service.runArtBatch(a.id, { maxJobs: 1, acknowledgeBlock: true, jobIds: [b.jobs[0].id] }); await service.drain();
    assert.equal(calls, 1); assert.equal((await service.getArtBatch(a.id))!.jobs[0].paidAttempts, 1);
  });
}

test('recover uses saved delivery mode only and does not increase paid attempt count', async () => {
  const actions: string[] = [];
  const { service } = await setup(async ({ action, directory }) => {
    actions.push(action); return action === 'generate' ? { state: 'recoverable', recoveryAvailable: true, errorCode: 'DOWNLOAD_FAILED' } : delivered(directory);
  });
  const a = await service.prepareArtBatch({ world: fixture() }); await service.runArtBatch(a.id, { maxJobs: 1 }); await service.drain();
  await service.runArtBatch(a.id, { recoverOnly: true, maxJobs: 3 }); await service.drain();
  const b = (await service.getArtBatch(a.id))!;
  assert.deepEqual(actions, ['generate', 'recover']); assert.equal(b.jobs[0].paidAttempts, 1); assert.equal(b.jobs[0].recoveryAttempts, 1); assert.equal(b.progress.generated, 1);
});

test('unknown saved-response recovery never selects untouched queued jobs', async () => {
  const actions: string[] = [];
  const { service } = await setup(async ({ action }) => { actions.push(action); return { state: 'unknown_outcome', recoveryAvailable: false, errorCode: 'NO_SAVED_RESPONSE_NO_RESUBMISSION' }; });
  const a = await service.prepareArtBatch({ world: fixture() }); await service.runArtBatch(a.id, { maxJobs: 1 }); await service.drain();
  await service.runArtBatch(a.id, { recoverOnly: true, maxJobs: 30 }); await service.drain();
  assert.deepEqual(actions, ['generate', 'recover']); assert.equal((await service.getArtBatch(a.id))?.progress.queued, 2);
});

test('new source revision cannot bypass an unknown POST on the same world/node', async () => {
  let calls = 0;
  const { service } = await setup(async () => { calls++; return { state: 'unknown_outcome', recoveryAvailable: false, errorCode: 'HTTP_502' }; });
  const world = fixture(); const a = await service.prepareArtBatch({ world });
  await service.runArtBatch(a.id, { maxJobs: 1, jobIds: [a.jobs[0].id] }); await service.drain();
  world.nodes.first.text = ['New revision must not resubmit unconfirmed scene.'];
  const b = await service.prepareArtBatch({ world }); const revised = b.jobs.find(j => j.nodeId === 'first' && !j.stale)!;
  await service.runArtBatch(a.id, { maxJobs: 1, jobIds: [revised.id], acknowledgeBlock: true }); await service.drain();
  assert.equal(calls, 1); assert.equal((await service.getArtBatch(a.id))!.jobs.find(j => j.id === revised.id)?.paidAttempts, 0);
});

test('explicit fresh-scene calibration leaves an unrelated unknown attempt untouched', async () => {
  const requests: string[] = [];
  const { service } = await setup(async ({ directory }) => {
    const id = path.basename(directory); requests.push(id);
    return requests.length === 1
      ? { state: 'unknown_outcome', recoveryAvailable: false, errorCode: 'TRANSPORT_TIMEOUT_UNKNOWN' }
      : delivered(directory);
  });
  const a = await service.prepareArtBatch({ world: fixture('old-story', ['first']) });
  await service.runArtBatch(a.id, { maxJobs: 1 }); await service.drain();
  const b = await service.prepareArtBatch({ world: fixture('new-story', ['first', 'second']) });
  await service.runArtBatch(b.id, { maxJobs: 1, jobIds: [b.jobs[0].id], acknowledgeBlock: true });
  await service.drain();
  assert.deepEqual(requests, [a.jobs[0].id, b.jobs[0].id]);
  const prior = (await service.getArtBatch(a.id))!.jobs[0];
  assert.equal(prior.state, 'unknown_outcome');
  assert.equal(prior.paidAttempts, 1); assert.equal(prior.recoveryAttempts, 0);
  assert.equal((await service.getArtBatch(b.id))!.jobs[1].paidAttempts, 0);
});

test('explicit high quality creates an immutable new request and rejects mixed legacy size', async () => {
  const { root, service } = await setup();
  const world = fixture('quality-calibration', ['first']);
  const old = await service.prepareArtBatch({ world });
  const qualityService = createArtProductionService({ root, startWorker: () => {},
    buildBrief: async (...args) => ({ ...await brief(...args), quality: 'high' }),
  });
  const updated = await qualityService.prepareArtBatch({ world });
  const current = updated.jobs.find(job => !job.stale)!;
  assert.notEqual(current.id, old.jobs[0].id);
  assert.equal(current.requested.quality, 'high');
  assert.equal(current.paidAttempts, 0);
  assert.equal(updated.jobs.find(job => job.id === old.jobs[0].id)?.stale, true);
  const conflicting = createArtProductionService({ root, startWorker: () => {},
    buildBrief: async (...args) => ({ ...await brief(...args), quality: 'high', pixelSize: '4096x2304' }),
  });
  await assert.rejects(conflicting.prepareArtBatch({ world }), /ART_QUALITY_GEOMETRY_CONFLICT/);
});

test('manual approval requires distinct native actual file, and public DTOs redact private metadata', async () => {
  let n = 0;
  const { root, service } = await setup(async ({ directory }) => { n++; return delivered(directory, n === 3 ? 2048 : 4096, n === 3 ? 1152 : 2304); });
  const a = await service.prepareArtBatch({ world: fixture() }); await service.runArtBatch(a.id, { maxJobs: 2, concurrency: 1 }); await service.drain();
  await service.runArtBatch(a.id, { maxJobs: 1, concurrency: 1, acknowledgeBlock: true }); await service.drain();
  const b = (await service.getArtBatch(a.id))!; assert.equal(b.progress.duplicates, 1); assert.equal(b.progress.resolutionMismatch, 1);
  assert.equal(b.progress.generated, 3); assert.equal(b.progress.covered, 0);
  await service.reviewArtJob(a.id, b.jobs[0].id, { decision: 'approved', reviewer: 'tester', notes: 'Test-only simulated review, not production. https://private.test/token?q=secret E:/private/job.recovery.json' });
  for (const job of b.jobs.slice(1)) await assert.rejects(service.reviewArtJob(a.id, job.id, { decision: 'approved', reviewer: 'tester', notes: 'synthetic test' }), /DISTINCT_NATIVE_4K/);
  const json = JSON.stringify(await service.getArtBatch(a.id));
  assert.ok(!json.includes('private.test')); assert.ok(!json.includes('.recovery.json')); assert.ok(!json.includes('test-only-reference')); assert.ok(!json.includes('prompt"'));
  assert.ok(!json.includes(root)); assert.ok(json.includes('/generated-art/'));
  assert.equal((await service.getArtBatch(a.id))?.progress.covered, 1);
  await writeFile(path.join(root, 'public/generated-art', `${b.jobs[0].id}.png`), 'tampered');
  await assert.rejects(service.reviewArtJob(a.id, b.jobs[0].id, { decision: 'approved', reviewer: 'tester', notes: 'synthetic test' }), /INTEGRITY_FAILED/);
});

test('startup recovers a dead worker by inspecting delivery, no paid retry', async () => {
  const actions: string[] = [];
  const { root, service } = await setup(async ({ action, directory }) => { actions.push(action); return delivered(directory); });
  const a = await service.prepareArtBatch({ world: fixture() });
  const filename = path.join(root, 'output/imagegen/scene-production/.private/state.json');
  const state = JSON.parse(await readFile(filename, 'utf8'));
  Object.assign(state.batches[0].jobs[0], { state: 'generating', paidAttempts: 1, workerPid: 999999999, childPid: 999999999 });
  await writeFile(filename, JSON.stringify(state)); await service.drain();
  assert.deepEqual(actions, ['inspect']); assert.equal((await service.getArtBatch(a.id))?.progress.generated, 1);
});

test('new source revision cannot bypass unknown-outcome lock for same world/node', async () => {
  let calls = 0;
  const { service } = await setup(async () => { calls++; return { state: 'unknown_outcome', errorCode: 'HTTP_502', recoveryAvailable: false }; });
  const world = fixture('unknown-revision', ['first']); const a = await service.prepareArtBatch({ world });
  await service.runArtBatch(a.id, { maxJobs: 1 }); await service.drain();
  world.nodes.first.text = ['new text must not create a duplicate unknown paid job']; await service.prepareArtBatch({ world });
  await service.runArtBatch(a.id, { maxJobs: 1, acknowledgeBlock: true }); await service.drain();
  assert.equal(calls, 1); assert.equal((await service.getArtBatch(a.id))?.progress.queued, 1);
});

test('art private file guard blocks raw/private/fs paths, allows safe public assets', () => {
  for (const url of ['/output/imagegen/scene-production/.private/state.json', '/@fs/E:/project/output/archive/job.recovery.json', '/%6futput/x', '/%256futput/x', '/x/private.recovery.json']) {
    let status = 0, next = false;
    artPrivateFileGuard({ originalUrl: url }, { status: n => { status = n; return { end() {} }; } }, () => { next = true; });
    assert.equal(status, 404); assert.equal(next, false);
  }
  let passed = false;
  artPrivateFileGuard({ url: '/generated-art/scene_fixture.png' }, { status: () => { throw new Error('public blocked'); } }, () => { passed = true; });
  assert.equal(passed, true);
});

test('non-native output stops bulk paid expansion immediately', async () => {
  let calls = 0;
  const { service } = await setup(async ({ directory }) => { calls++; return delivered(directory, 1672, 941); });
  const a = await service.prepareArtBatch({ world: fixture() });
  await service.runArtBatch(a.id, { maxJobs: 30, concurrency: 1 }); await service.drain();
  assert.equal(calls, 1); assert.equal((await service.getArtBatch(a.id))?.circuitBreaker?.code, 'NATIVE_4K_GATE_FAILED');
});

test('saved recovery remains callable after source revision makes its job stale', async () => {
  const actions: string[] = [];
  const { service } = await setup(async ({ action, directory }) => { actions.push(action); return action === 'generate'
    ? { state: 'recoverable', recoveryAvailable: true, errorCode: 'DOWNLOAD_FAILED' } : delivered(directory); });
  const world = fixture('stale-recovery', ['first']); const a = await service.prepareArtBatch({ world });
  await service.runArtBatch(a.id, { maxJobs: 1 }); await service.drain();
  world.nodes.first.text = ['changed scene']; await service.prepareArtBatch({ world });
  await service.runArtBatch(a.id, { recoverOnly: true, jobIds: [a.jobs[0].id] }); await service.drain();
  const batch = (await service.getArtBatch(a.id))!;
  assert.deepEqual(actions, ['generate', 'recover']); assert.equal(batch.progress.deliveredTotal, 1); assert.equal(batch.progress.generated, 0);
  assert.equal(batch.jobs[0].failureHistory?.[0].code, 'DOWNLOAD_FAILED');
});
