import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readArtReviewEvidence } from '../server/art-production-review-files.ts';

test('partial reviewer writes remain pending and are accepted only after complete valid evidence arrives', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'review-sidecar-'));
  const file = path.join(root, 'scene_abc.json');
  assert.equal((await readArtReviewEvidence(file)).warning, 'REVIEW_FILE_NOT_READY');
  await writeFile(file, '{"jobId":');
  assert.equal((await readArtReviewEvidence(file)).warning, 'REVIEW_FILE_NOT_READY');
  const review = { jobId: 'scene_abc', sha256: 'a'.repeat(64), decision: 'approved', reviewer: 'offline-test',
    notes: 'Actual fixture observations exceeding thirty characters', fullImageViewed: true, nativeDetailViewed: true, styleReviewed: true };
  await writeFile(file, JSON.stringify(review));
  assert.deepEqual((await readArtReviewEvidence(file)).review, review);
});

test('a wrong identity or incomplete evidence cannot become an approval', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'review-sidecar-'));
  const file = path.join(root, 'scene_abc.json');
  for (const value of [null, {}, { jobId: 'scene_other' }, { jobId: 'scene_abc', notes: 12 }]) {
    await writeFile(file, JSON.stringify(value));
    assert.equal((await readArtReviewEvidence(file)).warning, 'REVIEW_EVIDENCE_INVALID');
  }
});
