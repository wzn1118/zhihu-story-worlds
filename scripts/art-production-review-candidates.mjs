export function needsVisualReview(job, review) {
  return !review || review.jobId !== job.id || review.sha256 !== job.asset?.sha256
    || review.styleReviewed !== true || review.fullImageViewed !== true || review.nativeDetailViewed !== true
    || !['approved', 'rejected'].includes(review.decision)
    || typeof review.notes !== 'string' || review.notes.length < 30
    || typeof review.reviewer !== 'string' || !review.reviewer.trim();
}

export function orderReviewCandidates(candidates) {
  return [...candidates].sort((a, b) => Number(Boolean(a.job.review)) - Number(Boolean(b.job.review))
    || Number(b.row.kind === 'character-anchor') - Number(a.row.kind === 'character-anchor'));
}
