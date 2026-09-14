import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ArtAsset, ArtJob } from '../shared/production.ts';
import type { ShortAssetPlan } from '../server/art-production-short.ts';
import { sha256 } from '../server/art-production-prompts.ts';
import { formalStyleBrief, formalSupervisorOptions, runFormalSupervisor, selectFormalJobs,
  type FormalRow, type FormalSnapshot, type FormalSupervisorPorts, type FormalSupervisorState } from '../scripts/art-production-formal-supervisor.ts';

const at = '2026-09-07T00:00:00.000Z';
const asset = (): ArtAsset => ({ url: '/generated-art/test.png', width: 1600, height: 900, bytes: 3,
  sha256: 'fixture', native4k: false, originalPixels: true, duplicate: false });
const job = (id: string, extra: Partial<ArtJob> = {}): ArtJob => ({ id: `scene_${id}`, worldId: 'world-a', nodeId: id,
  sceneTitle: id, assetKind: 'scene', sourceHash: `source-${id}`, promptHash: `prompt-${id}`, referenceHash: 'references',
  stale: false, state: 'queued', requested: { aspectRatio: '16:9', resolution: '4K' }, paidAttempts: 0,
  recoveryAttempts: 0, recoveryAvailable: false, createdAt: at, updatedAt: at, ...extra });
const row = (item: ArtJob, status = item.state): FormalRow => ({ worldId: item.worldId, nodeId: item.nodeId,
  kind: item.assetKind ?? 'scene', status, jobId: item.id, batchId: `batch-${item.worldId}`, job: item });
const snapshot = (jobs: ArtJob[]): FormalSnapshot => ({ jobs: jobs.map(item => row(item)), allJobs: jobs,
  worldOrder: [...new Set(jobs.map(item => item.worldId))], inFlight: 0 });
function harness(initial: FormalSnapshot) {
  const current = initial;
  let time = Date.parse(at);
  const states: FormalSupervisorState[] = [], dispatches: Array<{ ids: string[]; gate?: string }> = [];
  const sleeps: number[] = [], recoveries: string[][] = [];
  const deliver = (item: ArtJob) => {
    item.asset = asset(); item.state = 'resolution_mismatch';
    const planned = current.jobs.find(candidate => candidate.jobId === item.id);
    if (planned) planned.status = 'resolution_mismatch';
  };
  const ports: FormalSupervisorPorts = {
    now: () => time,
    load: async () => current,
    persist: async state => { states.push(state); },
    sleep: async milliseconds => { sleeps.push(milliseconds); time += milliseconds; current.paused = true; },
    drain: async () => { current.inFlight = 0; current.runningBatches = 0; },
    recover: async items => { recoveries.push(items.map(item => item.id)); for (const item of items) deliver(item); current.circuitBreaker = undefined; },
    dispatch: async (rows, gate) => {
      dispatches.push({ ids: rows.map(item => item.jobId!), gate });
      for (const selected of rows) { const item = current.allJobs.find(item => item.id === selected.jobId)!; item.paidAttempts++; deliver(item); }
      current.circuitBreaker = undefined;
    },
  };
  return { current, ports, states, dispatches, sleeps, recoveries,
    advance: (milliseconds: number) => { sleeps.push(milliseconds); time += milliseconds; } };
}

test('supervisor keeps 32 defaults, accepts local capacity 64, and bounds rate-limit cooldown', () => {
  const defaults = formalSupervisorOptions([]);
  assert.equal(defaults.maxWave, 32); assert.equal(defaults.concurrency, 32);
  assert.equal(defaults.cooldownSeconds, 60); assert.equal(defaults.maxCooldownSeconds, 900);
  const expanded = formalSupervisorOptions(['--concurrency=64', '--max-wave=64']);
  assert.equal(expanded.concurrency, 64); assert.equal(expanded.maxWave, 64);
  for (const args of [['--max-wave=65'], ['--concurrency=65'], ['--concurrency=0'], ['--concurrency=1.5'],
    ['--cooldown-seconds=59'], ['--max-cooldown-seconds=3601'],
    ['--cooldown-seconds=120', '--max-cooldown-seconds=60'], ['--max-recovery-attempts=4'], ['--unknown=true']])
    assert.throws(() => formalSupervisorOptions(args), /INVALID_FORMAL/);
  assert.equal(formalSupervisorOptions(['--job-ids=scene_a']).once, true);
});

test('fresh short corrections are eligible after multiple known deliveries without a global historical review gate', () => {
  const fresh = job('new', { nodeId: 'a' });
  const prior = Array.from({ length: 4 }, (_, i) => job(`old-${i}`, { nodeId: 'a', paidAttempts: 1, stale: true,
    state: 'resolution_mismatch', asset: asset(), ...(i % 2 ? { review: { decision: 'rejected', reviewer: 'test', notes: 'style correction', reviewedAt: at } } : {}) }));
  const state = snapshot([fresh]); state.allJobs.push(...prior);
  assert.deepEqual(selectFormalJobs(state, 32).map(item => item.jobId), [fresh.id]);
  state.allJobs.push(job('uncertain', { nodeId: 'a', stale: true, paidAttempts: 1, state: 'unknown_outcome' }));
  assert.equal(selectFormalJobs(state, 32).length, 0);
});

test('selection interleaves all 20 stories before second scenes and excludes submitted jobs', () => {
  const jobs = Array.from({ length: 20 }, (_, i) => [job(`first-${i}`, { worldId: `world-${i}` }), job(`second-${i}`, { worldId: `world-${i}` })]).flat();
  const state = snapshot(jobs);
  const selected = selectFormalJobs(state, 32);
  assert.equal(selected.length, 32); assert.equal(new Set(selected.slice(0, 20).map(item => item.worldId)).size, 20);
  jobs[0].paidAttempts = 1;
  assert.ok(!selectFormalJobs(state, 32).some(item => item.jobId === jobs[0].id));
});

test('selection prioritizes ready anchors to unlock stories, then scenes and environments', () => {
  const jobs = [job('cover', { assetKind: 'cover' }), job('reaction', { assetKind: 'character-reaction' }),
    job('environment', { assetKind: 'environment' }), job('scene'),
    job('anchor-a', { assetKind: 'character-anchor' }), job('anchor-b', { worldId: 'world-b', assetKind: 'character-anchor' }),
    job('anchor-uncertain', { assetKind: 'character-anchor' })];
  const state = snapshot(jobs);
  state.allJobs.push(job('prior-unknown-anchor', { nodeId: 'anchor-uncertain', paidAttempts: 1, state: 'unknown_outcome', stale: true }));
  assert.deepEqual(selectFormalJobs(state, 4).map(item => item.jobId),
    ['scene_anchor-a', 'scene_anchor-b', 'scene_scene', 'scene_environment']);
  assert.ok(!selectFormalJobs(state, 64).some(item => item.jobId === 'scene_anchor-uncertain'));
});

test('one 64-job wave reserves exactly 64 fresh jobs across stories', async () => {
  const jobs = Array.from({ length: 70 }, (_, i) => job(`job-${i}`, { worldId: `world-${i % 20}` }));
  const run = harness(snapshot(jobs));
  const result = await runFormalSupervisor(run.ports,
    formalSupervisorOptions(['--concurrency=64', '--max-wave=64', '--once']));
  assert.equal(result.status, 'yielded');
  assert.equal(run.dispatches.length, 1); assert.equal(run.dispatches[0].ids.length, 64);
  assert.equal(new Set(run.dispatches[0].ids).size, 64);
  assert.equal(jobs.filter(item => item.paidAttempts === 1).length, 64);
  assert.equal(jobs.filter(item => item.paidAttempts === 0).length, 6);
});

test('style-approved lower-resolution anchors are used without changing factual dimensions and must match saved hashes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'formal-anchor-test-'));
  await mkdir(path.join(root, 'public/generated-art'), { recursive: true });
  const bytes = Buffer.from('offline-reference');
  const anchor = job('anchor', { nodeId: '__art_character_a', assetKind: 'character-anchor', state: 'resolution_mismatch', paidAttempts: 1,
    asset: { ...asset(), bytes: bytes.length, sha256: sha256(bytes) },
    review: { decision: 'approved', reviewer: 'test', notes: 'Style approved', reviewedAt: at } });
  const file = path.join(root, 'public/generated-art', `${anchor.id}.png`);
  await writeFile(file, bytes);
  const plan: ShortAssetPlan = { worldId: 'world-a', nodeId: 'a', kind: 'scene', owner: 'test', prompt: 'Short scene',
    sourceHash: 'source', sourceFacts: [], dependencies: ['__art_character_a'] };
  assert.deepEqual((await formalStyleBrief(root, plan, [anchor]))?.references, [file]);
  assert.equal(anchor.asset?.native4k, false);
  assert.equal(await formalStyleBrief(root, plan, [{ ...anchor, review: undefined }]), undefined);
  assert.equal(await formalStyleBrief(root, plan, [{ ...anchor, stale: true }]), undefined);
  assert.equal(await formalStyleBrief(root, plan, [{ ...anchor, asset: { ...anchor.asset!, duplicate: true } }]), undefined);
  await writeFile(file, 'changed');
  await assert.rejects(formalStyleBrief(root, plan, [anchor]), /SHORT_ANCHOR_HASH_CHANGED/);
});

test('persistent mode completes multiple fresh waves without requiring historical images to be reviewed first', async () => {
  const run = harness(snapshot([job('a'), job('b'), job('c')]));
  const result = await runFormalSupervisor(run.ports, formalSupervisorOptions(['--max-wave=2']));
  assert.equal(result.status, 'paused');
  assert.ok(run.states.some(state => state.status === 'waiting-work'));
  assert.ok(!run.states.some(state => state.status === 'complete'));
  assert.deepEqual(run.dispatches.map(item => item.ids.length), [2, 1]);
  assert.equal(new Set(run.dispatches.flatMap(item => item.ids)).size, 3);
  assert.ok(run.current.allJobs.every(item => item.paidAttempts === 1 && !item.asset?.native4k));
});

test('429 waits at least 60 seconds then dispatches a different untouched job, never the earlier submitted ID', async () => {
  const limited = job('a', { state: 'blocked', paidAttempts: 1, errorCode: 'HTTP_429' });
  const run = harness(snapshot([limited, job('b')])); run.current.circuitBreaker = { code: 'HTTP_429', at };
  run.ports.sleep = async milliseconds => { run.advance(milliseconds); };
  const result = await runFormalSupervisor(run.ports, formalSupervisorOptions(['--once']));
  assert.equal(result.status, 'yielded'); assert.equal(run.sleeps.reduce((a, b) => a + b, 0), 60000);
  assert.deepEqual(run.dispatches, [{ ids: ['scene_b'], gate: at }]);
  assert.equal(limited.paidAttempts, 1); assert.ok(run.states.some(state => state.status === 'cooldown' && state.wakeAt));
});

test('a restart resumes the saved 429 deadline rather than restarting or skipping its cooldown', async () => {
  const run = harness(snapshot([job('b')])); run.current.circuitBreaker = { code: 'HTTP_429', at };
  run.advance(30000); run.sleeps.length = 0;
  run.ports.sleep = async milliseconds => { run.advance(milliseconds); };
  const previous: FormalSupervisorState = { schemaVersion: 1, status: 'cooldown', updatedAt: at, code: 'HTTP_429',
    wakeAt: new Date(Date.parse(at) + 120000).toISOString(), coolingGate: at, rateLimitCount: 2,
    wave: 1, lastDispatchJobIds: [], recoveryAttempts: {} };
  await runFormalSupervisor(run.ports, formalSupervisorOptions(['--once']), previous);
  assert.equal(run.sleeps.reduce((a, b) => a + b, 0), 90000);
  assert.equal(run.dispatches.length, 1);
  assert.equal(run.states[0].status, 'cooldown');
});

test('rate-limit cooldown never exceeds the configured ceiling even after repeated different failed jobs', async () => {
  const run = harness(snapshot([job('b')])); run.current.circuitBreaker = { code: 'HTTP_429', at };
  run.ports.sleep = async milliseconds => { run.advance(milliseconds); };
  const previous: FormalSupervisorState = { schemaVersion: 1, status: 'starting', updatedAt: at,
    rateLimitCount: 100, wave: 100, lastDispatchJobIds: [], recoveryAttempts: {} };
  await runFormalSupervisor(run.ports, formalSupervisorOptions(['--once']), previous);
  assert.equal(run.sleeps.reduce((a, b) => a + b, 0), 900000);
});

for (const code of ['HTTP_402', 'HTTP_403']) test(`${code} stops even when an acknowledgement or another 429 exists`, async () => {
  const failed = job('a', { state: 'blocked', paidAttempts: 1, errorCode: code });
  const run = harness(snapshot([failed, job('b')])); run.current.circuitBreaker = { code: 'HTTP_429', at };
  const previous: FormalSupervisorState = { schemaVersion: 1, status: 'dispatching', updatedAt: at,
    rateLimitCount: 0, wave: 1, lastDispatchJobIds: [failed.id], recoveryAttempts: {} };
  const result = await runFormalSupervisor(run.ports, formalSupervisorOptions([`--acknowledge-gate=${at}`]), previous);
  assert.equal(result.status, 'stopped'); assert.equal(result.code, code); assert.equal(run.dispatches.length, 0); assert.equal(run.sleeps.length, 0);
});

test('an unknown identity is quarantined while other untouched scenes continue', async () => {
  const unknown = job('unknown', { nodeId: 'a', stale: true, paidAttempts: 1, state: 'unknown_outcome', errorCode: 'HTTP_502' });
  const revision = job('revision', { nodeId: 'a' });
  const run = harness(snapshot([revision, job('b')])); run.current.allJobs.push(unknown);
  run.current.circuitBreaker = { code: 'HTTP_502', at };
  await runFormalSupervisor(run.ports, formalSupervisorOptions(['--once']));
  assert.deepEqual(run.dispatches, [{ ids: ['scene_b'], gate: at }]);
  assert.equal(unknown.paidAttempts, 1); assert.equal(revision.paidAttempts, 0);
});

test('saved responses use recovery only and failed recoveries are bounded across restarts', async () => {
  const item = job('a', { state: 'recoverable', paidAttempts: 1, recoveryAvailable: true, errorCode: 'DOWNLOAD_FAILED' });
  const run = harness(snapshot([item]));
  run.ports.recover = async items => { run.recoveries.push(items.map(item => item.id)); };
  const result = await runFormalSupervisor(run.ports, formalSupervisorOptions([]));
  assert.equal(run.recoveries.length, 2); assert.equal(run.dispatches.length, 0); assert.equal(item.paidAttempts, 1);
  run.current.paused = false;
  await runFormalSupervisor(run.ports, formalSupervisorOptions([]), result);
  assert.equal(run.recoveries.length, 2);
});

test('a successful saved-response recovery never enters a paid dispatch', async () => {
  const item = job('a', { state: 'recoverable', paidAttempts: 1, recoveryAvailable: true, errorCode: 'DOWNLOAD_FAILED' });
  const run = harness(snapshot([item]));
  const result = await runFormalSupervisor(run.ports, formalSupervisorOptions([]));
  assert.equal(result.status, 'paused'); assert.deepEqual(run.recoveries, [[item.id]]);
  assert.equal(run.dispatches.length, 0); assert.equal(item.paidAttempts, 1);
});

test('completion requires actual style approvals, not only delivered pixels', async () => {
  const item = job('a', { state: 'resolution_mismatch', asset: asset(), paidAttempts: 1,
    review: { decision: 'approved', reviewer: 'offline-test', notes: 'Simulated style review', reviewedAt: at } });
  const run = harness(snapshot([item]));
  const result = await runFormalSupervisor(run.ports, formalSupervisorOptions([]));
  assert.equal(result.status, 'complete'); assert.equal(result.code, 'ALL_CURRENT_ASSETS_STYLE_REVIEWED');
  assert.equal(run.dispatches.length, 0);
});

test('a verified saved recovery releases its own file-error gate and then continues untouched work', async () => {
  const item = job('a', { state: 'recoverable', paidAttempts: 1, recoveryAvailable: true, errorCode: 'EPERM' });
  const run = harness(snapshot([item, job('b')]));
  const gate = { code: 'EPERM', at };
  run.current.circuitBreaker = gate;
  const recover = run.ports.recover;
  run.ports.recover = async items => { await recover(items); run.current.circuitBreaker = gate; };
  await runFormalSupervisor(run.ports, formalSupervisorOptions(['--once']));
  assert.deepEqual(run.dispatches, [{ ids: ['scene_b'], gate: at }]);
  assert.equal(item.paidAttempts, 1); assert.deepEqual(run.recoveries, [['scene_a']]);
});

test('an old dimension-only gate is acknowledged for fresh style-first jobs without altering earlier pixels', async () => {
  const previous = job('old', { paidAttempts: 1, state: 'resolution_mismatch', asset: asset(), stale: true });
  const run = harness(snapshot([job('a')])); run.current.allJobs.push(previous);
  run.current.circuitBreaker = { code: 'NATIVE_4K_GATE_FAILED', at };
  await runFormalSupervisor(run.ports, formalSupervisorOptions(['--once']));
  assert.deepEqual(run.dispatches, [{ ids: ['scene_a'], gate: at }]);
  assert.equal(previous.asset?.native4k, false); assert.equal(previous.paidAttempts, 1);
});

for (const reason of ['empty', 'anchors', 'source'] as const) test(`${reason} remains a durable wait rather than false completion`, async () => {
  const run = harness(snapshot(reason === 'empty' ? [] : [job('a')]));
  if (reason === 'anchors') run.current.jobs[0].status = 'awaiting-approved-anchors';
  if (reason === 'source') run.current.sourceChanged = true;
  await runFormalSupervisor(run.ports, formalSupervisorOptions([]));
  const expected = reason === 'empty' ? 'waiting-work' : reason === 'anchors' ? 'waiting-anchors' : 'waiting-source-refresh';
  assert.ok(run.states.some(state => state.status === expected && state.wakeAt));
  assert.ok(!run.states.some(state => state.status === 'complete')); assert.equal(run.dispatches.length, 0);
});
