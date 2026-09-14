import { INITIAL_STATS, PROLOGUE, SCENES, ENDING_DEFS, applyEffects, getSceneForRoute, resolveEnding } from './content.js';
import { BAD_ENDINGS, preparationsAt, resolveDanger } from './danger.js';
import { createReadingPages } from './reading.js';

export const REDRAIN_ID = 'redrain-rebirth-week';
export const CONTENT_VERSION = '20260910';
export const MAX_SAVE_BYTES = 512 * 1024;
const FORMAT = 'redleaf-redrain-save';
const ALL_ENDINGS = [...ENDING_DEFS, ...BAD_ENDINGS];
const endingById = new Map(ALL_ENDINGS.map(ending => [ending.id, ending]));

function fail(message) { throw new Error(message); }
function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }

// Bound untrusted transfer objects before walking them or replaying their choices.
function cloneInput(value) {
  let encoded;
  try { encoded = JSON.stringify(value); } catch { fail('存档必须是可读取的 JSON 数据。'); }
  if (typeof encoded !== 'string') fail('存档内容为空。');
  if (new TextEncoder().encode(encoded).byteLength > MAX_SAVE_BYTES) fail('存档文件过大，请选择完整主线的存档文件。');
  return JSON.parse(encoded);
}

export function freshPlatformState() {
  return {
    mode: 'prologue', prologueIndex: 0, tutorialSeen: false, sceneIndex: 0,
    stats: { ...INITIAL_STATS }, route: [], outcome: null, endingId: null,
    readingCursor: null, pendingBadEnd: null, retryCheckpoint: null, preparationCheckpoints: {},
  };
}

function readingCursor(sceneIndex, route, outcome, value, completed = false) {
  const scene = getSceneForRoute(sceneIndex, route);
  const pages = createReadingPages(scene, outcome);
  const identity = `${scene.id}:${outcome || ''}`;
  if (completed) return { identity, page: pages.length - 1, complete: true, reachedEnd: true };
  if (!isObject(value) || value.identity !== identity || !Number.isInteger(value.page)
    || value.page < 0 || value.page >= pages.length) return null;
  const complete = value.complete === true;
  // Readers can revisit an earlier page after reaching the end; retain that history.
  const reachedEnd = value.reachedEnd === true && (value.page < pages.length - 1 || complete);
  return { identity, page: value.page, complete, reachedEnd };
}

function checkpoint(index, route, stats) {
  return {
    sceneIndex: index, stats: { ...stats }, route: [...route],
    readingCursor: readingCursor(index, route, null, null, true),
  };
}

function canonicalState(raw) {
  if (!isObject(raw)) fail('存档缺少主线进度。');
  if (!['prologue', 'game', 'ending'].includes(raw.mode)) fail('存档的游玩模式无效。');
  if (!Array.isArray(raw.route) || raw.route.length > SCENES.length
    || raw.route.some(choice => !Number.isInteger(choice) || choice < 0 || choice > 2)) {
    fail('存档包含无效的剧情选择。');
  }
  if (!Number.isInteger(raw.sceneIndex) || raw.sceneIndex < 0 || raw.sceneIndex >= SCENES.length) {
    fail('存档的章节位置无效。');
  }
  const prologueIndex = raw.prologueIndex ?? 0;
  if (!Number.isInteger(prologueIndex) || prologueIndex < 0 || prologueIndex >= PROLOGUE.length) {
    fail('存档的序幕位置无效。');
  }
  if (raw.tutorialSeen !== undefined && typeof raw.tutorialSeen !== 'boolean') fail('存档的阅读指引状态无效。');

  const route = [...raw.route];
  let stats = { ...INITIAL_STATS };
  let lastOutcome = null;
  let failure = null;
  let retryCheckpoint = null;
  const preparationCheckpoints = {};
  for (let index = 0; index < route.length; index++) {
    if (failure) fail('存档的路线越过了已经发生的失败结局。');
    const priorRoute = route.slice(0, index);
    const before = checkpoint(index, priorRoute, stats);
    for (const preparation of preparationsAt(index)) preparationCheckpoints[preparation.id] = before;
    const scene = getSceneForRoute(index, priorRoute);
    const choice = scene.choices[route[index]];
    if (!choice) fail('存档的选择无法在当前剧情中重放。');
    failure = resolveDanger(index, route[index], priorRoute);
    retryCheckpoint = failure ? before : null;
    stats = applyEffects(stats, choice.effects);
    lastOutcome = choice.response;
  }

  const outcome = raw.outcome ?? null;
  const pendingBadEnd = raw.pendingBadEnd ?? null;
  const endingId = raw.endingId ?? null;
  if (raw.mode === 'prologue') {
    if (route.length !== 0 || raw.sceneIndex !== 0 || outcome !== null || endingId !== null || pendingBadEnd !== null) {
      fail('序幕存档不能包含后续剧情进度。');
    }
  } else if (raw.mode === 'game') {
    const chose = route.length === raw.sceneIndex + 1;
    if (!chose && route.length !== raw.sceneIndex) fail('存档章节与选择记录不一致。');
    if (outcome !== (chose ? lastOutcome : null)) fail('存档的行动结果与选择记录不一致。');
    if (endingId !== null || pendingBadEnd !== (failure?.id ?? null)) fail('存档的待结局状态与路线不一致。');
    if (failure && !chose) fail('失败路线不能继续下一章节。');
  } else {
    if (route.length !== raw.sceneIndex + 1 || (!failure && route.length !== SCENES.length)) {
      fail('存档尚未抵达可收录的结局。');
    }
    const ending = failure || resolveEnding(stats, route);
    if (endingId !== ending.id || outcome !== null || pendingBadEnd !== null) {
      fail('存档的结局与实际路线不一致。');
    }
  }

  // A preparation rewind can retain the checkpoint for its current, unchosen scene.
  if (raw.mode === 'game' && route.length === raw.sceneIndex) {
    for (const preparation of preparationsAt(raw.sceneIndex)) {
      if (isObject(raw.preparationCheckpoints) && Object.hasOwn(raw.preparationCheckpoints, preparation.id)) {
        preparationCheckpoints[preparation.id] = checkpoint(raw.sceneIndex, route, stats);
      }
    }
  }
  return {
    mode: raw.mode, prologueIndex, tutorialSeen: raw.tutorialSeen ?? false,
    sceneIndex: raw.sceneIndex, stats, route, outcome, endingId,
    readingCursor: raw.mode === 'game' ? readingCursor(raw.sceneIndex, route, outcome, raw.readingCursor) : null,
    pendingBadEnd, retryCheckpoint, preparationCheckpoints,
  };
}

function canonicalEndings(value, current) {
  if (!Array.isArray(value) || value.length > 1000 || value.some(id => typeof id !== 'string' || !endingById.has(id))) {
    fail('存档的结局档案包含未知记录。');
  }
  return [...new Set([...value, ...(current ? [current] : [])])];
}

export function validateSnapshot(value) {
  const input = cloneInput(value);
  if (!isObject(input) || input.format !== FORMAT || input.version !== 1 || input.experienceId !== REDRAIN_ID) {
    fail('这份文件不是赤页《重生周》主线存档。');
  }
  if (input.contentVersion !== CONTENT_VERSION) fail('存档的剧情版本不匹配，当前支持 20260910 版主线。');
  if (!Number.isSafeInteger(input.savedAt) || input.savedAt < 0) fail('存档的保存时间无效。');
  const state = canonicalState(input.state);
  return {
    format: FORMAT, version: 1, experienceId: REDRAIN_ID, contentVersion: CONTENT_VERSION,
    savedAt: input.savedAt, state, endings: canonicalEndings(input.endings, state.endingId),
  };
}

export function createSnapshot(state, endings = [], savedAt = Date.now()) {
  return validateSnapshot({ format: FORMAT, version: 1, experienceId: REDRAIN_ID,
    contentVersion: CONTENT_VERSION, savedAt, state, endings });
}

export function getEnding(id) {
  const ending = endingById.get(id);
  return ending ? structuredClone(ending) : null;
}

export function summarizeSnapshot(value) {
  const { state } = validateSnapshot(value);
  const scene = getSceneForRoute(state.sceneIndex, state.route);
  const prologue = PROLOGUE[state.prologueIndex];
  return {
    chapter: state.mode === 'prologue' ? `序幕 ${state.prologueIndex + 1} / ${PROLOGUE.length}` : scene.day,
    location: state.mode === 'prologue' ? prologue.kicker : scene.location,
    title: state.mode === 'ending' ? endingById.get(state.endingId).title : state.mode === 'prologue' ? prologue.title : scene.title,
    choiceCount: state.route.length, mode: state.mode, endingId: state.endingId,
  };
}

export function parseTransfer(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > MAX_SAVE_BYTES) {
    fail('存档文件过大或内容无效。');
  }
  let input;
  try { input = JSON.parse(text); } catch { fail('存档不是有效的 JSON 文件。'); }
  if (!isObject(input)) fail('存档缺少主线进度。');
  if (input.format === FORMAT) return validateSnapshot(input);
  // Raw localStorage saves and the dedicated legacy exporter preserve the same state.
  if (input.format !== undefined && input.format !== 'redrain-legacy-save') fail('无法识别这份主线存档格式。');
  if (input.contentVersion !== undefined && input.contentVersion !== CONTENT_VERSION) fail('存档的剧情版本不匹配。');
  if (input.experienceId !== undefined && input.experienceId !== REDRAIN_ID) fail('这份文件属于另一部作品。');
  if (input.version !== undefined && input.version !== 1) fail('不支持这份主线存档版本。');
  if (isObject(input.state)) return createSnapshot(input.state, input.endings ?? [], input.savedAt ?? Date.now());
  return createSnapshot(input);
}
