import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createArtProductionService } from '../server/art-production.ts';
import { sha256 } from '../server/art-production-prompts.ts';

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'art-review-batch-'));
  const stateFile = path.join(root, 'output/imagegen/scene-production/.private/state.json');
  const manifestFile = path.join(root, 'output/imagegen/scene-production/manifest.json');
  await mkdir(path.dirname(stateFile), { recursive: true });
  await mkdir(path.join(root, 'public/generated-art'), { recursive: true });
  const batches = await Promise.all(['one', 'two'].map(async id => {
    // Test-only bytes exercise integrity checks without any production media or provider.
    const bytes = Buffer.from(`synthetic-${id}`);
    await writeFile(path.join(root, 'public/generated-art', `${id}.png`), bytes);
    return { id, worldId: id, storyId: id, worldTitle: id, worldVersion: '1', state: 'idle',
      minimumImages: 30, remainingRunBudget: 0, concurrency: 64, qualityPolicy: 'style-first',
      recoverOnly: false, createdAt: 'before', updatedAt: 'before', jobs: [{ id, worldId: id,
        nodeId: id, sceneTitle: id, state: 'resolution_mismatch', stale: false, assetKind: 'scene',
        prompt: id, references: [], sourceHash: sha256(id), referenceHash: sha256(''), promptHash: sha256(id),
        paidAttempts: 1, recoveryAttempts: 0, recoveryAvailable: false, requested: { resolution: '4K' },
        createdAt: 'before', updatedAt: 'before', asset: { sha256: sha256(bytes), bytes: bytes.length,
          url: `/generated-art/${id}.png`, originalPixels: true, native4k: false, duplicate: false,
          width: 1600, height: 900 } }] };
  }));
  const state = { schemaVersion: 1, batches, circuitBreaker: { code: 'HTTP_401', at: 'before' } };
  await writeFile(stateFile, JSON.stringify(state));
  await writeFile(manifestFile, 'original-manifest');
  const service = createArtProductionService({ root, startWorker: () => { throw Error('NO_WORKER_ALLOWED'); } });
  const entries = batches.map(batch => ({ batchId: batch.id, jobId: batch.id,
    sha256: batch.jobs[0].asset.sha256,
    review: { decision: 'approved' as 'approved' | 'rejected', reviewer: 'fixture reviewer', notes: 'Offline fixture review' } }));
  return { root, stateFile, manifestFile, service, entries, state };
}

test('batch review atomically imports multiple worlds, preserves gate and normalizes evidence', async () => {
  const f = await fixture();
  f.entries[1].review.decision = 'rejected';
  f.entries[0].review.reviewer = 'test https://private.invalid/token';
  f.entries[0].review.notes = 'n'.repeat(2100);
  assert.equal(await f.service.reviewArtJobs(f.entries), 2);
  const store = JSON.parse(await readFile(f.stateFile, 'utf8'));
  assert.equal(store.batches[0].jobs[0].review.decision, 'approved');
  assert.equal(store.batches[1].jobs[0].review.decision, 'rejected');
  assert.equal(store.batches[0].jobs[0].review.reviewer, 'test [redacted]');
  assert.equal(store.batches[0].jobs[0].review.notes.length, 2000);
  assert.deepEqual(store.circuitBreaker, f.state.circuitBreaker);
  const manifest = JSON.parse(await readFile(f.manifestFile, 'utf8'));
  assert.equal(manifest.batches[0].jobs[0].review.decision, 'approved');
  assert.equal(manifest.batches[1].jobs[0].review.decision, 'rejected');
});

for (const scenario of ['sha-drift', 'png-drift', 'stale', 'duplicate', 'strict-resolution', 'missing-asset', 'missing-job', 'missing-notes', 'duplicate-entry']) {
  test(`batch review rejects ${scenario} without persisting an earlier valid review`, async () => {
    const f = await fixture();
    const job = f.state.batches[1].jobs[0];
    if (scenario === 'sha-drift') f.entries[1].sha256 = '0'.repeat(64);
    if (scenario === 'png-drift') await writeFile(path.join(f.root, 'public/generated-art/two.png'), 'changed');
    if (scenario === 'stale') job.stale = true;
    if (scenario === 'duplicate') job.asset.duplicate = true;
    if (scenario === 'strict-resolution') f.state.batches[1].qualityPolicy = 'native-4k';
    if (scenario === 'missing-asset') delete (job as any).asset;
    if (scenario === 'missing-job') f.entries[1].jobId = 'missing';
    if (scenario === 'missing-notes') f.entries[1].review.notes = '';
    if (scenario === 'duplicate-entry') f.entries.push(f.entries[0]);
    await writeFile(f.stateFile, JSON.stringify(f.state));
    const before = await readFile(f.stateFile);
    await assert.rejects(f.service.reviewArtJobs(f.entries));
    assert.deepEqual(await readFile(f.stateFile), before);
    assert.equal(await readFile(f.manifestFile, 'utf8'), 'original-manifest');
  });
}

test('empty batch review performs no persistence', async () => {
  const f = await fixture();
  const before = await readFile(f.stateFile);
  assert.equal(await f.service.reviewArtJobs([]), 0);
  assert.deepEqual(await readFile(f.stateFile), before);
  assert.equal(await readFile(f.manifestFile, 'utf8'), 'original-manifest');
});
