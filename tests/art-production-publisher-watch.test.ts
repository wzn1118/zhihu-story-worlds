import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { currentReview, watchPublications } from '../scripts/art-production-publish-manifest.ts';

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'art-publisher-watch-'));
  const directory = path.join(root, 'output/imagegen/scene-production/formal-production-20260907');
  await mkdir(path.join(directory, 'reviews'), { recursive: true });
  const job = { id: 'scene_123abc', state: 'completed', stale: false, sourceHash: 'a'.repeat(64),
    asset: { url: '/generated-art/scene_123abc.png', width: 1, height: 1, bytes: 0, sha256: 'b'.repeat(64),
      native4k: false, duplicate: false, originalPixels: true },
    review: { decision: 'approved' as const, reviewer: 'fixture' } };
  const review = { jobId: job.id, sha256: job.asset.sha256, fullImageViewed: true, styleReviewed: true,
    nativeDetailViewed: true,
    decision: 'approved', reviewer: 'fixture' };
  const sidecar = path.join(directory, 'reviews', `${job.id}.json`);
  const stateFile = path.join(directory, 'state.json');
  await writeFile(stateFile, JSON.stringify({ jobs: [job] }));
  await writeFile(sidecar, JSON.stringify(review));
  const cleanup = async () => {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('art-publisher-watch-'));
    await rm(root, { recursive: true, force: true });
  };
  return { root, job, review, sidecar, stateFile, cleanup };
}

test('watch observes sidecar-only rejection and reapproval while preserving another approved asset', async () => {
  const f = await fixture();
  try {
    const stateBefore = await readFile(f.stateFile, 'utf8'), statBefore = await stat(f.stateFile);
    const untouched = { ...f.job, id: 'scene_456def' };
    const outcomes: unknown[] = [];
    const stop = new Error('TEST_WATCH_COMPLETE');
    let cycle = 0;
    await assert.rejects(watchPublications(async () => {
      outcomes.push([(await currentReview(f.job, f.root))?.decision, (await currentReview(untouched, f.root))?.decision]);
    }, async () => {
      if (++cycle > 2) throw stop;
      await writeFile(f.sidecar, JSON.stringify({ ...f.review, decision: cycle === 1 ? 'rejected' : 'approved' }));
    }), error => error === stop);
    assert.deepEqual(outcomes, [['rejected', 'approved'], ['approved', 'approved']]);
    assert.equal(await readFile(f.stateFile, 'utf8'), stateBefore);
    assert.equal((await stat(f.stateFile)).mtimeMs, statBefore.mtimeMs);
  } finally { await f.cleanup(); }
});

test('invalid current sidecars cannot fall back to stale queue approvals', async () => {
  const f = await fixture();
  try {
    for (const change of [{ sha256: 'c'.repeat(64) }, { jobId: 'scene_456def' },
      { fullImageViewed: false }, { styleReviewed: false }, { decision: 'pending' }]) {
      await writeFile(f.sidecar, JSON.stringify({ ...f.review, ...change }));
      assert.equal(await currentReview(f.job, f.root), undefined);
    }
    await writeFile(f.sidecar, '{');
    assert.equal(await currentReview(f.job, f.root), undefined);
  } finally { await f.cleanup(); }
});

test('watch retries after a transient publication failure', async t => {
  const errors: string[] = [];
  t.mock.method(console, 'error', (value: string) => errors.push(value));
  const stop = new Error('TEST_WATCH_COMPLETE');
  let cycles = 0, attempts = 0, completed = 0;
  await assert.rejects(watchPublications(async () => {
    if (++attempts === 1) throw new Error('ART_STORE_BUSY');
    completed++;
  }, async () => { if (++cycles > 2) throw stop; }), error => error === stop);
  assert.equal(attempts, 2);
  assert.equal(completed, 1);
  assert.equal(errors.length, 1);
  assert.equal(JSON.parse(errors[0]).error, 'ART_STORE_BUSY');
});
