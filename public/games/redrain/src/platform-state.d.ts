export const REDRAIN_ID: 'redrain-rebirth-week';
export const CONTENT_VERSION: '20260910';
export const MAX_SAVE_BYTES: number;
export interface RedRainStats { trust: number; supply: number; memory: number; signal: number; courage: number }
export interface RedRainReadingCursor { identity: string; page: number; complete: boolean; reachedEnd: boolean }
export interface RedRainCheckpoint { sceneIndex: number; stats: RedRainStats; route: number[]; readingCursor: RedRainReadingCursor | null }
export interface RedRainState {
  mode: 'prologue' | 'game' | 'ending';
  prologueIndex: number;
  tutorialSeen: boolean;
  sceneIndex: number;
  stats: RedRainStats;
  route: number[];
  outcome: string | null;
  endingId: string | null;
  readingCursor: RedRainReadingCursor | null;
  pendingBadEnd: string | null;
  retryCheckpoint: RedRainCheckpoint | null;
  preparationCheckpoints: Record<string, RedRainCheckpoint>;
}
export interface RedRainSnapshot {
  format: 'redleaf-redrain-save'; version: 1;
  experienceId: typeof REDRAIN_ID; contentVersion: typeof CONTENT_VERSION;
  savedAt: number; state: RedRainState; endings: string[];
}
export interface RedRainEnding {
  id: string; title: string; grade: string; epilogue: string;
  index?: number; preparation?: string; reason?: string; hint?: string;
  [key: string]: unknown;
}
export interface RedRainSummary {
  chapter: string; location: string; title: string; choiceCount: number;
  mode: RedRainState['mode']; endingId: string | null;
}
export function freshPlatformState(): RedRainState;
export function createSnapshot(state: unknown, endings?: string[], savedAt?: number): RedRainSnapshot;
export function validateSnapshot(value: unknown): RedRainSnapshot;
export function summarizeSnapshot(value: unknown): RedRainSummary;
export function getEnding(id: string): RedRainEnding | null;
export function parseTransfer(text: string): RedRainSnapshot;
