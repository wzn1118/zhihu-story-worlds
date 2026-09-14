import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ArtJob } from '../shared/production.ts';
import type { GameWorld } from '../shared/types.ts';
import { buildShortPlans, SHORT_FOLDER } from './art-production-short.ts';
import { readArtReviewEvidence } from './art-production-review-files.ts';

/** Rebuild against the caller's source snapshot before adding any runtime art. */
export function currentFormalPlans(world: GameWorld) {
  return buildShortPlans(resolve(), [world]);
}

/** A queue approval alone cannot authorize a file for the player-facing world. */
export async function verifiedNativeArt(job: ArtJob, shape: 'portrait' | 'landscape'): Promise<boolean> {
  const asset = job.asset;
  if (job.stale || job.state !== 'generated' || job.review?.decision !== 'approved'
    || !/^scene_[a-f0-9]+$/.test(job.id) || !asset || asset.native4k !== true
    || asset.originalPixels !== true || asset.duplicate !== false
    || !/^[a-f0-9]{64}$/.test(asset.sha256)
    || !/^\/generated-art\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.png$/.test(asset.url)) return false;
  try {
    const { review } = await readArtReviewEvidence(resolve(SHORT_FOLDER, 'reviews', `${job.id}.json`));
    if (!review || review.decision !== 'approved' || review.sha256 !== asset.sha256
      || review.fullImageViewed !== true || review.nativeDetailViewed !== true || review.styleReviewed !== true
      || (review as typeof review & { styleBaseline?: unknown }).styleBaseline !== 'film-frames-20260907') return false;
    const bytes = await readFile(resolve('public', `.${asset.url}`));
    if (bytes.length < 45 || bytes.length !== asset.bytes
      || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
      || bytes.readUInt32BE(8) !== 13 || bytes.subarray(12, 16).toString() !== 'IHDR'
      || createHash('sha256').update(bytes).digest('hex') !== asset.sha256) return false;
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
    const portrait = shape === 'portrait', ratio = portrait ? 2 / 3 : 16 / 9;
    return width === asset.width && height === asset.height
      && width >= (portrait ? 2160 : 3840) && height >= (portrait ? 3840 : 2160)
      && Math.abs(width / height / ratio - 1) <= .005;
  } catch {
    // Missing, revoked or concurrently replaced evidence removes this asset only.
    return false;
  }
}
