import type { Character, SceneNode } from './types.ts';

/** Browser-safe contract: no filesystem paths, provider URLs, credentials or raw logs. */
export interface ArtWorldInput {
  id: string; storyId: string; title: string; version: string;
  nodes: Record<string, SceneNode>; characters: Character[];
  source: { title: string; author: string; url: string };
  introduction?: string[]; summary?: string;
  adaptation?: { scope: string; adultCast: boolean; note: string };
}
export type ArtConcurrency = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
  | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16
  | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24
  | 25 | 26 | 27 | 28 | 29 | 30 | 31 | 32
  | 33 | 34 | 35 | 36 | 37 | 38 | 39 | 40
  | 41 | 42 | 43 | 44 | 45 | 46 | 47 | 48
  | 49 | 50 | 51 | 52 | 53 | 54 | 55 | 56
  | 57 | 58 | 59 | 60 | 61 | 62 | 63 | 64;
export type ArtJobKind = 'scene' | 'character-anchor' | 'character-reaction' | 'cover' | 'environment';
export type ArtQualityPolicy = 'native-4k' | 'style-first';
export interface PrepareArtBatchInput {
  world: ArtWorldInput; nodeIds?: string[]; minimumImages?: number;
  /** Omitted on existing batches preserves their policy; new batches default to native-4k. */
  qualityPolicy?: ArtQualityPolicy;
  /** Missing kinds retain the historical scene classification. */
  jobKinds?: Record<string, ArtJobKind>;
}
export type ArtJobState = 'queued' | 'generating' | 'recoverable' | 'generated'
  | 'resolution_mismatch' | 'blocked' | 'unknown_outcome' | 'failed';
export interface ArtReview {
  decision: 'approved' | 'rejected'; reviewer: string; notes: string; reviewedAt: string;
}
export interface ArtAsset {
  url: string; width: number; height: number; bytes: number; sha256: string;
  native4k: boolean; originalPixels: true; duplicate: boolean;
}
export interface ArtJob {
  id: string; worldId: string; nodeId: string; sceneTitle: string;
  assetKind?: ArtJobKind;
  sourceHash: string; promptHash: string; referenceHash: string; stale: boolean;
  state: ArtJobState; requested: { aspectRatio: '16:9' | '2:3'; resolution: '4K'; pixelSize?: '4096x2304'; quality?: 'high' };
  paidAttempts: number; recoveryAttempts: number; recoveryAvailable: boolean;
  asset?: ArtAsset; review?: ArtReview; errorCode?: string;
  failureHistory?: { code: string; at: string }[];
  createdAt: string; updatedAt: string;
}
export interface ArtProgress {
  /** Historical deliveries/reviews include stale revisions, never current coverage. */
  deliveredTotal: number; reviewedTotal: number; paidAttemptsTotal: number; unknownOutcomeTotal: number;
  total: number; current: number; queued: number; inFlight: number;
  generated: number; native4k: number; reviewed: number; approved: number;
  rejected: number; blocked: number; unknownOutcome: number; recoverable: number;
  failed: number; stale: number; duplicates: number; resolutionMismatch: number;
  /** Ancillary assets contribute to delivery totals, never scene coverage. */
  sceneCurrent: number; ancillaryCurrent: number; ancillaryGenerated: number;
  ancillaryNative4k: number; ancillaryReviewed: number; ancillaryApproved: number; ancillaryCovered: number;
  required: number; covered: number; missing: number; sceneShortfall: number;
}
export interface ArtBatch {
  id: string; worldId: string; storyId: string; worldTitle: string; worldVersion: string;
  state: 'prepared' | 'running' | 'paused' | 'blocked' | 'idle';
  minimumImages: number; remainingRunBudget: number; concurrency: ArtConcurrency;
  qualityPolicy?: ArtQualityPolicy;
  recoverOnly: boolean; circuitBreaker?: { code: string; at: string };
  createdAt: string; updatedAt: string; jobs: ArtJob[]; progress: ArtProgress;
}
export interface RunArtBatchOptions {
  maxJobs?: number;
  /** Concurrency persists across runs; the largest active limit sets the local global ceiling, at most 64. */
  concurrency?: ArtConcurrency; recoverOnly?: boolean; acknowledgeBlock?: boolean;
  /** Optional exact existing job IDs; used for calibration before broad production. */
  jobIds?: string[];
}
export interface ReviewArtJobInput {
  decision: 'approved' | 'rejected'; reviewer: string; notes: string;
}
