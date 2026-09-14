export { createSnapshot as createSave, validateSnapshot as normalizeSave, summarizeSnapshot as summarizeSave, parseTransfer, MAX_SAVE_BYTES } from '../public/games/redrain/src/platform-state.js';
export type { RedRainSnapshot as RedRainSave } from '../public/games/redrain/src/platform-state.js';
import type { RedRainSnapshot } from '../public/games/redrain/src/platform-state.js';
export function endingRecords(save: RedRainSnapshot): Array<{id: string; title: string; kind: 'bad' | 'normal'}>;
export function mergeSaveEndings(save: unknown, previous?: RedRainSnapshot | null): RedRainSnapshot;
