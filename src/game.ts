import { Story as InkStory } from 'inkjs';
import type { Choice, GameWorld, SceneNode } from '../shared/types';
import { resourceVariable } from '../shared/choice-rules';
import { isImportedId } from '../shared/workshop';
import { withReviewedWorkshopCopy } from '../shared/workshop-copy';
import { withPublishedArt } from './published-art';
import { challengeInitials, CHALLENGE_REWINDS, normalizeDifficulty, type DifficultyMode, type SessionDifficultyOptions } from './difficulty';
export { CHALLENGE_REWINDS, type DifficultyMode, type SessionDifficultyOptions } from './difficulty';

export interface HistoryEntry {
  nodeId: string;
  title: string;
  speaker: string;
  text: string;
  choice?: string;
  choiceId?: string;
}

export interface RuntimeChoice extends Choice { inkIndex: number }

export interface ChoiceOutcome {
  choiceId: string;
  choiceText: string;
  feedback?: Choice['feedback'];
  resources: { id: string; label: string; before: number; after: number; delta: number }[];
  clues: string[];
  resolve: number;
  trust: number;
}

export interface Session {
  world: GameWorld;
  engine: InkStory;
  node: SceneNode;
  paragraphs: string[];
  paragraphIndex: number;
  choices: RuntimeChoice[];
  resolve: number;
  trust: number;
  clues: string[];
  history: HistoryEntry[];
  choiceCount: number;
  startedAt: number;
  timeLabel: string;
  resources: Record<string, number>;
  lastOutcome: ChoiceOutcome | null;
  outcomes: ChoiceOutcome[];
  difficulty: DifficultyMode;
  /** Remaining rewinds for challenge runs; classic runs use Infinity. */
  rewindsRemaining: number;
}

export interface SavedGame {
  storyId: string;
  worldId: string;
  worldVersion: string;
  title: string;
  cover: string;
  chapter: string;
  location: string;
  savedAt: number;
  startedAt: number;
  nodeId: string;
  inkState: string;
  paragraphs: string[];
  paragraphIndex: number;
  history: HistoryEntry[];
  choiceCount: number;
  clues: string[];
  resolve: number;
  trust: number;
  resources?: Record<string, number>;
  /** Added in format 1. Classic and pre-challenge saves omit these fields. */
  difficulty?: DifficultyMode;
  rewindsRemaining?: number;
}

export const MAX_SAVE_FILE_BYTES = 1024 * 1024;
export const MAX_HISTORY_ENTRIES = 500;
const engineRevisions = new WeakMap<InkStory, number>();

interface SaveFile {
  format: 'redleaf-save';
  version: 1;
  game: SavedGame;
}

export interface EndingRecord {
  storyId: string;
  worldId: string;
  worldTitle: string;
  nodeId: string;
  title: string;
  cover: string;
  unlockedAt: number;
}

export interface Settings {
  textSize: number;
  textSpeed: number;
  reducedMotion: boolean;
  sound: boolean;
}

export const defaultSettings: Settings = {
  textSize: 18,
  textSpeed: 80,
  reducedMotion: false,
  sound: false,
};

export const storageKeys = {
  saves: 'redleaf.saves.v1',
  auto: 'redleaf.auto.v1',
  settings: 'redleaf.settings.v1',
  favorites: 'redleaf.favorites.v1',
  onboarding: 'redleaf.onboarding.v1',
  endings: 'redleaf.endings.v1',
  notes: 'redleaf.notes.v1',
};

export function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    const valid = key === storageKeys.saves ? Array.isArray(parsed) && parsed.length === 3 && parsed.every((entry) => entry === null || isSavedGame(entry))
      : key === storageKeys.auto ? parsed === null || isSavedGame(parsed)
      : key === storageKeys.favorites ? isStringArray(parsed)
      : key === storageKeys.onboarding ? typeof parsed === 'boolean'
      : key === storageKeys.settings ? isSettings(parsed)
      : key === storageKeys.notes ? isRecord(parsed) && Object.values(parsed).every((value) => typeof value === 'string')
      : key === storageKeys.endings ? Array.isArray(parsed) && parsed.every(isEndingRecord)
      : false;
    return valid ? parsed as T : fallback;
  } catch { return fallback; }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isSettings(value: unknown): value is Settings {
  return isRecord(value)
    && typeof value.textSize === 'number' && value.textSize >= 15 && value.textSize <= 23
    && typeof value.textSpeed === 'number' && value.textSpeed >= 15 && value.textSpeed <= 100
    && typeof value.reducedMotion === 'boolean' && typeof value.sound === 'boolean';
}

function isEndingRecord(value: unknown): value is EndingRecord {
  return isRecord(value) && ['storyId', 'worldId', 'worldTitle', 'nodeId', 'title', 'cover'].every((key) => typeof value[key] === 'string')
    && typeof value.unlockedAt === 'number' && Number.isFinite(value.unlockedAt);
}

export function isSavedGame(value: unknown): value is SavedGame {
  return isRecord(value)
    && ['storyId', 'worldId', 'worldVersion', 'title', 'cover', 'chapter', 'location', 'nodeId', 'inkState'].every((key) => typeof value[key] === 'string')
    && ['savedAt', 'startedAt', 'paragraphIndex', 'choiceCount', 'resolve', 'trust'].every((key) => typeof value[key] === 'number' && Number.isFinite(value[key]))
    && Number.isInteger(value.paragraphIndex) && Number(value.paragraphIndex) >= 0
    && Number.isInteger(value.choiceCount) && Number(value.choiceCount) >= 0
    && Number(value.resolve) >= 0 && Number(value.resolve) <= 100
    && Number(value.trust) >= 0 && Number(value.trust) <= 100
    && Number.isInteger(value.startedAt) && Number(value.startedAt) >= 0
    && Number.isInteger(value.savedAt) && Number(value.savedAt) <= 8_640_000_000_000_000
    && Number(value.savedAt) >= Number(value.startedAt)
    && (/^\d{8,24}$/.test(String(value.storyId)) || isImportedId(String(value.storyId)))
    && /^[a-z][a-z0-9-]*$/.test(String(value.worldId))
    && String(value.inkState).length <= MAX_SAVE_FILE_BYTES
    && isStringArray(value.paragraphs) && value.paragraphs.length > 0
    && Number(value.paragraphIndex) < value.paragraphs.length
    && isStringArray(value.clues)
    && (value.resources === undefined || (isRecord(value.resources) && Object.values(value.resources).every(entry => typeof entry === 'number' && Number.isSafeInteger(entry))))
    && (value.difficulty === undefined || value.difficulty === 'classic' || value.difficulty === 'challenge')
    && (value.difficulty === 'challenge'
      ? Number.isInteger(value.rewindsRemaining) && Number(value.rewindsRemaining) >= 0 && Number(value.rewindsRemaining) <= CHALLENGE_REWINDS
      : value.rewindsRemaining === undefined)
    && Array.isArray(value.history) && value.history.length > 0 && value.history.length <= MAX_HISTORY_ENTRIES
    && value.history.length === Number(value.choiceCount) + 1
    && value.history.every((entry) => isRecord(entry)
      && ['nodeId', 'title', 'speaker', 'text'].every((key) => typeof entry[key] === 'string')
      && (entry.choice === undefined || typeof entry.choice === 'string')
      && (entry.choiceId === undefined || typeof entry.choiceId === 'string'));
}

export function encodeSaveFile(game: SavedGame): string {
  if (!isSavedGame(game)) throw new Error('这个存档不完整，无法导出。');
  const file: SaveFile = { format: 'redleaf-save', version: 1, game };
  const text = JSON.stringify(file, null, 2);
  if (new TextEncoder().encode(text).byteLength > MAX_SAVE_FILE_BYTES) throw new Error('存档文件超过 1 MB 上限。');
  return text;
}

export function parseSaveFile(text: string): SavedGame {
  if (new TextEncoder().encode(text).byteLength > MAX_SAVE_FILE_BYTES) throw new Error('存档文件超过 1 MB 上限。');
  let file: unknown;
  try { file = JSON.parse(text); }
  catch { throw new Error('无法读取这个 JSON 文件，请选择赤页导出的存档。'); }
  if (!isRecord(file) || file.format !== 'redleaf-save') throw new Error('这不是赤页存档文件。');
  if (file.version !== 1) throw new Error('暂不支持这个存档文件版本。');
  if (!isSavedGame(file.game)) throw new Error('这个存档的内容不完整，无法导入。');
  return file.game;
}

export function writeStorage<T>(key: string, value: T): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch { return false; }
}

function readState(engine: InkStory, world: GameWorld, node: SceneNode) {
  const currentChoices: RuntimeChoice[] = engine.currentChoices.map((inkChoice) => {
    const choiceId = inkChoice.tags?.find((tag) => tag.startsWith('choice:'))?.slice(7).trim();
    const definition = node.choices.find((choice) => choice.id === choiceId)
      ?? node.choices.find((choice) => choice.text.trim() === inkChoice.text.trim());
    if (!definition) throw new Error('剧情选项与当前章节不一致，请重新进入故事。');
    return { ...definition, text: world.generated ? definition.text : inkChoice.text.trim(), inkIndex: inkChoice.index };
  });
  return {
    choices: currentChoices,
    resolve: Number(engine.variablesState.$('resolve') ?? 50),
    trust: Number(engine.variablesState.$('trust') ?? 30),
    resources: Object.fromEntries((world.resources ?? []).map(resource => [resource.id, Number(engine.variablesState.$(resourceVariable(resource.id)) ?? resource.initial)])),
    clues: Object.entries(world.clueVariables)
      .filter(([, variable]) => Boolean(engine.variablesState.$(variable)))
      .map(([clue]) => clue),
  };
}

function continueEngine(engine: InkStory, world: GameWorld, fallbackNodeId: string) {
  const paragraphs: string[] = [];
  let nodeId = fallbackNodeId;
  let count = 0;
  while (engine.canContinue) {
    if (++count > 500) throw new Error('剧情推进超出安全限制。');
    const line = engine.Continue()?.trim();
    if (line) paragraphs.push(line);
    for (const tag of engine.currentTags ?? []) {
      if (tag.startsWith('node:')) nodeId = tag.slice(5).trim();
    }
  }
  const node = world.nodes[nodeId];
  if (!node) throw new Error('无法找到当前章节。');
  return { node, paragraphs: paragraphs.length ? paragraphs : node.text, ...readState(engine, world, node) };
}

export function startSession(world: GameWorld, options: SessionDifficultyOptions = {}): Session {
  world = world.generated?.editorial ? world : withReviewedWorkshopCopy(world);
  const difficulty = normalizeDifficulty(options.difficulty);
  const engine = new InkStory(world.ink);
  if (difficulty === 'challenge') {
    const initials = challengeInitials(world);
    for (const resource of world.resources ?? []) {
      const value = initials[resource.id];
      if (value !== undefined && value !== resource.initial) engine.variablesState.$(resourceVariable(resource.id), value);
    }
  }
  const state = continueEngine(engine, world, world.startNodeId);
  engineRevisions.set(engine, 0);
  return {
    world, engine, ...state, paragraphIndex: 0, choiceCount: 0, startedAt: Date.now(), lastOutcome: null, outcomes: [],
    timeLabel: sceneTimeLabel(world, [state.node.id]), difficulty,
    rewindsRemaining: difficulty === 'challenge' ? CHALLENGE_REWINDS : Infinity,
    history: [{ nodeId: state.node.id, title: state.node.title, speaker: state.node.speaker ?? '旁白', text: state.paragraphs.join('\n\n') }],
  };
}

export function choose(session: Session, choice: RuntimeChoice): Session {
  if (session.history.length >= MAX_HISTORY_ENTRIES) throw new Error('这条时间线已达到 499 次行动。当前进度仍可保存；请在手记中返回更早的选择后继续。');
  if (engineRevisions.get(session.engine) !== session.choiceCount) throw new Error('当前选项已变化，请重新选择。');
  const selected = session.choices.find(candidate => candidate.id === choice.id && candidate.inkIndex === choice.inkIndex);
  if (!selected) throw new Error('当前选项已变化，请重新选择。');
  const before = session.engine.state.ToJson();
  let state: ReturnType<typeof continueEngine>;
  try {
    session.engine.ChooseChoiceIndex(selected.inkIndex);
    state = continueEngine(session.engine, session.world, selected.nextNodeId);
  } catch (error) {
    session.engine.state.LoadJson(before);
    throw error;
  }
  engineRevisions.set(session.engine, session.choiceCount + 1);
  const history = session.history.map((entry, index) => index === session.history.length - 1 ? { ...entry, choice: selected.text, choiceId: selected.id } : entry);
  history.push({ nodeId: state.node.id, title: state.node.title, speaker: state.node.speaker ?? '旁白', text: state.paragraphs.join('\n\n') });
  const lastOutcome: ChoiceOutcome = {
    choiceId: selected.id, choiceText: selected.text, feedback: selected.feedback,
    resources: (session.world.resources ?? []).map(resource => ({ id: resource.id, label: resource.label, before: session.resources[resource.id], after: state.resources[resource.id], delta: state.resources[resource.id] - session.resources[resource.id] })).filter(resource => resource.delta !== 0),
    clues: state.clues.filter(clue => !session.clues.includes(clue)),
    resolve: state.resolve - session.resolve, trust: state.trust - session.trust,
  };
  return { ...session, ...state, paragraphIndex: 0, choiceCount: session.choiceCount + 1, history,
    timeLabel: sceneTimeLabel(session.world, history.map(entry => entry.nodeId)), lastOutcome, outcomes: [...session.outcomes, lastOutcome] };
}

export function rewindSession(session: Session, historyIndex: number): Session {
  if (!Number.isInteger(historyIndex) || historyIndex < 0 || historyIndex >= session.history.length - 1) throw new Error('只能返回已经做过选择的章节。');
  if (session.difficulty === 'challenge' && engineRevisions.get(session.engine) !== session.choiceCount) throw new Error('当前进度已经改变，请重新选择回溯位置。');
  if (session.difficulty === 'challenge' && session.rewindsRemaining <= 0) throw new Error('挑战模式的回溯次数已经用完。');
  let replay = startSession(session.world, { difficulty: session.difficulty });
  for (let index = 0; index < historyIndex; index++) {
    const entry = session.history[index];
    if (entry.nodeId !== replay.node.id) throw new Error('当前记录的路径不一致。');
    const selected = replay.choices.find(choice => recordedChoiceMatches(choice, entry));
    if (!selected) throw new Error('无法还原这次选择之前的进度。');
    replay = choose(replay, selected);
  }
  if (replay.node.id !== session.history[historyIndex].nodeId) throw new Error('无法还原目标章节。');
  if (session.difficulty === 'challenge') engineRevisions.set(session.engine, session.choiceCount + 1);
  return {
    ...replay, startedAt: session.startedAt, paragraphIndex: replay.paragraphs.length - 1,
    lastOutcome: null,
    // A rewind is a timeline action. Its cost belongs to the new timeline and
    // must not be restored by replaying the earlier choices.
    rewindsRemaining: session.difficulty === 'challenge' ? session.rewindsRemaining - 1 : Infinity,
  };
}

const storyClockFormatter = new Intl.DateTimeFormat('zh-CN', {
  weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC',
});

function recordedChoiceMatches(choice: Choice, entry: HistoryEntry): boolean {
  return (entry.choiceId === undefined || entry.choiceId === choice.id)
    && (entry.choice === choice.text || choice.legacyTexts?.includes(entry.choice ?? '') === true);
}

function sceneTimeLabel(world: GameWorld, path: string[]): string {
  const current = world.nodes[path[path.length - 1]];
  if (!world.calendar || !current.clock) return current.time;
  let day = 0;
  let minuteOfDay = 0;
  for (const id of path) {
    const clock = world.nodes[id].clock;
    if (!clock) continue;
    const earliestDay = Math.max(day, clock.notBeforeDay ?? 0);
    day = earliestDay + Number(earliestDay === day && clock.minuteOfDay < minuteOfDay);
    minuteOfDay = clock.minuteOfDay;
  }
  // A fixed Sunday is only a weekday reference; no real calendar date is shown.
  const instant = new Date(Date.UTC(2000, 0, 2 + world.calendar.firstWeekday + day, 0, minuteOfDay));
  return storyClockFormatter.format(instant);
}

export function saveSession(session: Session): SavedGame {
  if (session.difficulty === 'challenge' && engineRevisions.get(session.engine) !== session.choiceCount) throw new Error('当前进度已经改变，请保存最新的进度。');
  const saved: SavedGame = {
    storyId: session.world.storyId, worldId: session.world.id, worldVersion: session.world.version,
    title: session.world.title, cover: session.world.cover, chapter: session.node.chapter,
    location: session.node.location, savedAt: Date.now(), startedAt: session.startedAt,
    nodeId: session.node.id, inkState: session.engine.state.ToJson(), paragraphs: session.paragraphs,
    paragraphIndex: session.paragraphIndex, history: session.history, choiceCount: session.choiceCount,
    clues: session.clues, resolve: session.resolve, trust: session.trust, resources: session.resources,
  };
  if (session.difficulty === 'challenge') {
    saved.difficulty = 'challenge';
    saved.rewindsRemaining = session.rewindsRemaining;
  }
  return saved;
}

export function restoreSession(world: GameWorld, saved: SavedGame): Session {
  world = world.generated?.editorial ? world : withReviewedWorkshopCopy(world);
  if (!isSavedGame(saved)) throw new Error('这个存档的内容不完整，无法载入。');
  if (saved.storyId !== world.storyId || saved.worldId !== world.id) throw new Error('这个存档不属于当前故事。');
  const migrating = saved.worldVersion !== world.version;
  if (migrating && !world.compatibleSaveVersions?.includes(saved.worldVersion)) {
    throw new Error('这个存档来自不同版本的故事，请重新开始。');
  }
  const node = world.nodes[saved.nodeId];
  if (!node) throw new Error('存档对应的章节不存在。');
  const engine = new InkStory(world.ink);
  engine.state.LoadJson(saved.inkState);

  // Replay the recorded choices to verify imported state against this world's actual Ink graph.
  const difficulty = normalizeDifficulty(saved.difficulty);
  let replay = startSession(world, { difficulty });
  for (let index = 0; index < saved.history.length; index++) {
    const entry = saved.history[index];
    if (entry.nodeId !== replay.node.id) throw new Error('存档中的剧情路径不一致。');
    if (index === saved.history.length - 1) {
      if (entry.choice !== undefined || entry.choiceId !== undefined) throw new Error('存档的最后一页不完整。');
      break;
    }
    const choice = replay.choices.find((candidate) => recordedChoiceMatches(candidate, entry));
    if (!choice) throw new Error('存档中包含无法还原的选择。');
    replay = choose(replay, choice);
  }
  const loaded = readState(engine, world, node);
  const choiceState = (story: InkStory) => story.currentChoices.map((choice) => {
    const id = choice.tags?.find(tag => tag.startsWith('choice:'))?.slice(7).trim();
    const definition = node.choices.find(candidate => candidate.id === id);
    const text = definition?.legacyTexts?.includes(choice.text.trim()) ? definition.text : choice.text.trim();
    return { source: choice.sourcePath, text, tags: choice.tags };
  });
  // Explicitly compatible revisions replay existing decisions using corrected effects.
  // The old Ink state remains structurally checked, but its old effects are not reused.
  const sameRevisionStateMatches = JSON.stringify(choiceState(engine)) === JSON.stringify(choiceState(replay.engine))
    && loaded.resolve === replay.resolve && loaded.trust === replay.trust
    && JSON.stringify(loaded.resources) === JSON.stringify(replay.resources)
    && JSON.stringify(loaded.clues) === JSON.stringify(replay.clues);
  if (replay.node.id !== saved.nodeId || engine.canContinue
    || (!migrating && !sameRevisionStateMatches) || saved.paragraphIndex >= replay.paragraphs.length) {
    throw new Error('存档的剧情状态与选择记录不一致。');
  }
  return {
    ...replay, paragraphIndex: saved.paragraphIndex, startedAt: saved.startedAt,
    rewindsRemaining: difficulty === 'challenge' ? saved.rewindsRemaining! : Infinity,
  };
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 35_000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message ?? `请求失败 (${response.status})`);
    return (data?.id && data?.storyId && data?.nodes && Array.isArray(data?.characters)
      ? await withPublishedArt(data as GameWorld) : data) as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('请求超时，请稍后重试。');
    if (error instanceof TypeError) throw new Error('暂时无法连接故事书库，请检查本地服务。');
    throw error;
  } finally { window.clearTimeout(timeout); }
}

export function prettyTime(time: number): string {
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(time);
}
