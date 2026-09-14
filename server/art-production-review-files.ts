import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { retryArtFileOperation } from './art-production-files.ts';

export interface ArtReviewEvidence {
  jobId: string; sha256: string; decision: 'approved' | 'rejected'; reviewer: string; notes: string;
  fullImageViewed: true; nativeDetailViewed: true; styleReviewed?: boolean;
}

/** Independent reviewers may be mid-write; an incomplete sidecar must not abort paid scheduling. */
export async function readArtReviewEvidence(file: string): Promise<{ review?: ArtReviewEvidence; warning?: string }> {
  let review: ArtReviewEvidence;
  try { review = JSON.parse(await retryArtFileOperation(() => readFile(file, 'utf8'))); }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (error instanceof SyntaxError || ['ENOENT', 'EPERM', 'EACCES', 'EBUSY'].includes(code ?? ''))
      return { warning: 'REVIEW_FILE_NOT_READY' };
    throw error;
  }
  if (!review || review.jobId !== path.basename(file, '.json') || !/^scene_[a-f0-9]+$/.test(review.jobId)
    || typeof review.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(review.sha256)
    || !['approved', 'rejected'].includes(review.decision) || review.fullImageViewed !== true
    || review.nativeDetailViewed !== true
    || typeof review.notes !== 'string' || review.notes.length < 30
    || typeof review.reviewer !== 'string' || !review.reviewer.trim()) return { warning: 'REVIEW_EVIDENCE_INVALID' };
  return { review };
}
