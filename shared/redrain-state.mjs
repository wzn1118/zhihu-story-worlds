export { createSnapshot as createSave, validateSnapshot as normalizeSave, summarizeSnapshot as summarizeSave, parseTransfer, MAX_SAVE_BYTES } from '../public/games/redrain/src/platform-state.js';
import { validateSnapshot, getEnding } from '../public/games/redrain/src/platform-state.js';
export function endingRecords(save) { return validateSnapshot(save).endings.map(id => { const e = getEnding(id); return { id, title: e.title, kind: id.startsWith('BE') ? 'bad' : 'normal' }; }); }
export function mergeSaveEndings(save, previous = null) {
  const current = validateSnapshot(save);
  const history = previous ? validateSnapshot(previous).endings : [];
  return { ...current, endings: [...new Set([...history, ...current.endings])] };
}
