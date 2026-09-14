import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ArtBatch, ArtJob } from '../shared/production.ts';
import { inspectArtWave, nextArtWaveJobs, planArtWave, resolveArtWave } from '../server/art-production-wave.ts';

const job = (worldId: string, nodeId: string, extra: Partial<ArtJob> = {}): ArtJob => ({
  id: `${worldId}-${nodeId}`, worldId, nodeId, state: 'queued', paidAttempts: 0, stale: false,
  sourceHash: 'source', promptHash: 'prompt', referenceHash: 'refs', ...extra,
} as ArtJob);
const batch = (worldId: string, jobs: ArtJob[]): ArtBatch => ({ id: worldId, worldId, jobs } as ArtBatch);
const fixture = () => ['a', 'b', 'c'].map(world => batch(world, ['one', 'two', 'three'].map(node => job(world, node))));

test('wave ordering covers every story before the second independent scene', () => {
  const selected = planArtWave(fixture(), ['a', 'b', 'c']);
  assert.deepEqual(selected.map(item => item.jobId), ['a-one', 'b-one', 'c-one', 'a-two', 'b-two', 'c-two']);
  assert.equal(new Set(selected.map(item => item.jobId)).size, 6);
});

test('any paid or uncertain historical revision excludes that whole scene identity', () => {
  const batches = fixture();
  batches[0].jobs.push(job('a', 'one', { id: 'old', stale: true, paidAttempts: 1, state: 'unknown_outcome' }));
  assert.deepEqual(planArtWave(batches, ['a'], 2).map(item => item.nodeId), ['two', 'three']);
  assert.throws(() => planArtWave(batches, ['a'], 3), /SHORTFALL/);
  assert.throws(() => planArtWave(batches, ['a', 'a']), /INVALID/);
});

test('artist-selected moments are prioritized without reinstating paid scene identities', () => {
  const batches = fixture();
  batches[0].jobs[1].paidAttempts = 1;
  batches[0].jobs[1].state = 'failed';
  const selected = planArtWave(batches, ['a'], 2, { a: ['two', 'three'] });
  assert.deepEqual(selected.map(item => item.nodeId), ['three', 'one']);
});

test('a saved wave never silently switches stale source, prompt or reference identity', () => {
  for (const change of [{ stale: true }, { sourceHash: 'new' }, { promptHash: 'new' }, { referenceHash: 'new' }]) {
    const batches = fixture();
    const selected = planArtWave(batches, ['a', 'b', 'c']);
    Object.assign(batches[0].jobs[0], change);
    assert.throws(() => resolveArtWave(selected, batches), /REVISION_CHANGED/);
  }
});

test('next dispatch honors global two-request capacity and requires real manual review', () => {
  const batches = fixture();
  const selected = planArtWave(batches, ['a', 'b', 'c']);
  assert.deepEqual(nextArtWaveJobs(selected, batches).map(item => item.id), ['a-one', 'b-one']);
  batches.push(batch('elsewhere', [job('elsewhere', 'active', { state: 'generating', paidAttempts: 1 })]));
  assert.equal(nextArtWaveJobs(selected, batches).length, 1);
  batches[0].jobs[0].asset = { native4k: true } as ArtJob['asset'];
  assert.throws(() => nextArtWaveJobs(selected, batches), /MANUAL_REVIEW/);
});

test('a running batch retains its frozen selection rather than swallowing a new job', () => {
  const batches = fixture();
  const selected = planArtWave(batches, ['a', 'b', 'c']);
  batches[0].state = 'running';
  assert.deepEqual(nextArtWaveJobs(selected, batches).map(item => item.id), ['b-one', 'c-one']);
});

test('status remains inspectable after a source or style revision while dispatch still fails closed', () => {
  const batches = fixture();
  const selected = planArtWave(batches, ['a', 'b', 'c']);
  Object.assign(batches[0].jobs[0], { stale: true, paidAttempts: 1,
    asset: { native4k: true }, review: { decision: 'approved' } });
  batches[1].jobs.shift();
  const status = inspectArtWave(selected, batches);
  assert.equal(status.planned, 6);
  assert.equal(status.missing, 1);
  assert.equal(status.changed, 1);
  assert.equal(status.generated, 1);
  assert.equal(status.reviewed, 1);
  assert.equal(status.approved, 0);
  assert.equal(status.paidAttempts, 1);
  assert.throws(() => nextArtWaveJobs(selected, batches), /REVISION_CHANGED/);
});
