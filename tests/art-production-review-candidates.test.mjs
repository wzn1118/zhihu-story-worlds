import assert from 'node:assert/strict';
import { test } from 'node:test';
import { needsVisualReview, orderReviewCandidates } from '../scripts/art-production-review-candidates.mjs';

test('first visual reviews cannot be starved by more than a wave of old anchor reviews', () => {
  const previous = Array.from({ length: 30 }, (_, i) => ({ row: { kind: 'character-anchor' },
    job: { id: `old-${i}`, review: { decision: 'approved' } } }));
  const unseen = [{ row: { kind: 'scene' }, job: { id: 'unseen-scene' } },
    { row: { kind: 'character-anchor' }, job: { id: 'unseen-anchor' } }];
  const sorted = orderReviewCandidates([...previous, ...unseen]);
  assert.deepEqual(sorted.slice(0, 2).map(x => x.job.id), ['unseen-anchor', 'unseen-scene']);
  assert.equal(sorted[2].job.id, 'old-0');
  assert.equal(previous[0].job.id, 'old-0');
});

test('selection and supervisor accept only complete matching evidence', () => {
  const job = { id: 'scene_abc', asset: { sha256: 'a'.repeat(64) } };
  const review = { jobId: job.id, sha256: job.asset.sha256, styleReviewed: true, fullImageViewed: true,
    nativeDetailViewed: true, decision: 'rejected', reviewer: 'fixture', notes: 'Concrete fixture observations of the entire image' };
  assert.equal(needsVisualReview(job, review), false);
  for (const broken of [undefined, { ...review, sha256: 'b'.repeat(64) }, { ...review, nativeDetailViewed: false },
    { ...review, jobId: 'scene_def' }, { ...review, notes: '' }, { ...review, decision: 'unknown' }])
    assert.equal(needsVisualReview(job, broken), true);
});
