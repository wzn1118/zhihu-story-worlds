import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONTENT_VERSION, MAX_SAVE_BYTES, REDRAIN_ID, createSnapshot, freshPlatformState,
  getEnding, parseTransfer, summarizeSnapshot, validateSnapshot,
  type RedRainState,
} from '../public/games/redrain/src/platform-state.js';
// The packaged original story modules intentionally remain plain JavaScript.
// @ts-expect-error original mainline content has no TypeScript declaration
import { SCENES, ENDING_DEFS, applyEffects, getSceneForRoute, resolveEnding } from '../public/games/redrain/src/content.js';
// @ts-expect-error original mainline danger rules have no TypeScript declaration
import { BAD_ENDINGS, getPreparation, resolveDanger } from '../public/games/redrain/src/danger.js';
// @ts-expect-error original mainline reading module has no TypeScript declaration
import { createReadingPages } from '../public/games/redrain/src/reading.js';

const savedAt = 1789200000000;

function routeTo(length: number, forced: Record<number, number> = {}): number[] {
  const route: number[] = [];
  for (let index = 0; index < length; index++) {
    const choice = forced[index] ?? [0, 1, 2].find(value => !resolveDanger(index, value, route));
    assert.notEqual(choice, undefined);
    if (resolveDanger(index, choice, route)) assert.equal(index, length - 1, 'Fixture must terminate at its first failure.');
    route.push(choice!);
  }
  return route;
}

function atChoices(route: number[], mode: 'pending' | 'next' | 'ending' = 'pending'): RedRainState {
  const state = freshPlatformState();
  state.mode = 'game';
  state.tutorialSeen = true;
  for (let index = 0; index < route.length; index++) {
    const scene = getSceneForRoute(index, state.route);
    const choice = scene.choices[route[index]];
    state.pendingBadEnd = resolveDanger(index, route[index], state.route)?.id ?? null;
    state.stats = applyEffects(state.stats, choice.effects);
    state.route.push(route[index]);
    state.sceneIndex = index;
    state.outcome = choice.response;
  }
  if (mode === 'next') {
    assert.equal(state.pendingBadEnd, null);
    state.sceneIndex = route.length;
    state.outcome = null;
  } else if (mode === 'ending') {
    state.mode = 'ending';
    state.endingId = state.pendingBadEnd ?? resolveEnding(state.stats, route).id;
    state.outcome = null;
    state.pendingBadEnd = null;
  }
  return state;
}

test('RedRain mainline starts in prologue and transfers a canonical detached snapshot', () => {
  const raw = freshPlatformState();
  const snapshot = createSnapshot(raw, [], savedAt);
  assert.equal(snapshot.experienceId, REDRAIN_ID);
  assert.equal(snapshot.contentVersion, CONTENT_VERSION);
  assert.deepEqual(snapshot.state, raw);
  assert.deepEqual(parseTransfer(JSON.stringify(snapshot)), snapshot);
  const summary = summarizeSnapshot(snapshot);
  assert.equal(summary.mode, 'prologue');
  assert.equal(summary.choiceCount, 0);
  assert.match(summary.title, /安眠药/);
  snapshot.state.stats.trust = 0;
  assert.equal(raw.stats.trust, 42);
});

test('RedRain replays the real branch text and state at every surviving chapter boundary', () => {
  const route = routeTo(SCENES.length);
  for (let index = 0; index < route.length; index++) {
    const pending = atChoices(route.slice(0, index + 1));
    const snapshot = createSnapshot(pending, [], savedAt);
    assert.deepEqual(snapshot.state.stats, pending.stats);
    assert.equal(snapshot.state.outcome, pending.outcome);
    assert.deepEqual(validateSnapshot(snapshot), snapshot);
    assert.deepEqual(parseTransfer(JSON.stringify(snapshot)), snapshot);
    if (index < route.length - 1) {
      const next = atChoices(route.slice(0, index + 1), 'next');
      assert.equal(createSnapshot(next).state.sceneIndex, index + 1);
    }
  }
  const state = atChoices(route, 'ending');
  const finished = createSnapshot(state, [], savedAt);
  assert.deepEqual(finished.endings, [state.endingId]);
  assert.equal(summarizeSnapshot(finished).title, getEnding(state.endingId!)!.title);
});

for (const ending of BAD_ENDINGS) {
  test(`RedRain ${ending.id} preserves pending failure, ending and safe retry`, () => {
    const forced: Record<number, number> = { [ending.index]: ending.choice };
    const preparation = getPreparation(ending.preparation);
    if (preparation) forced[preparation.index] = (preparation.choice + 1) % 3;
    const route = routeTo(ending.index + 1, forced);
    const pending = createSnapshot(atChoices(route), [], savedAt);
    assert.equal(pending.state.pendingBadEnd, ending.id);
    assert.equal(pending.endings.length, 0, 'A pending result has not yet entered the archive.');
    assert.deepEqual(parseTransfer(JSON.stringify(pending)), pending);
    const finished = createSnapshot(atChoices(route, 'ending'), [], savedAt);
    assert.equal(finished.state.endingId, ending.id);
    assert.deepEqual(finished.endings, [ending.id]);
    assert.deepEqual(parseTransfer(JSON.stringify(finished)), finished);
    const checkpoint = finished.state.retryCheckpoint!;
    assert.equal(checkpoint.sceneIndex, ending.index);
    assert.equal(checkpoint.route.length, ending.index);
    const retried = createSnapshot({ ...finished.state, ...checkpoint, mode: 'game',
      outcome: null, endingId: null, pendingBadEnd: null, retryCheckpoint: null }, finished.endings, savedAt);
    assert.equal(retried.state.outcome, null);
    assert.equal(retried.state.retryCheckpoint, null);
    assert.deepEqual(retried.endings, [ending.id]);
    const safeChoice = [0, 1, 2].find(value => !resolveDanger(ending.index, value, retried.state.route))!;
    assert.equal(createSnapshot(atChoices([...retried.state.route, safeChoice])).state.pendingBadEnd, null);

    if (preparation) {
      const beforePreparation = finished.state.preparationCheckpoints[preparation.id];
      assert.equal(beforePreparation.sceneIndex, preparation.index);
      const reprepare = createSnapshot({ ...finished.state, ...beforePreparation, mode: 'game',
        outcome: null, endingId: null, pendingBadEnd: null, retryCheckpoint: null }, finished.endings, savedAt);
      assert.equal(reprepare.state.route.length, preparation.index);
      assert.ok(reprepare.state.preparationCheckpoints[preparation.id]);
      const preparedRoute = routeTo(ending.index + 1, { [preparation.index]: preparation.choice, [ending.index]: ending.choice });
      const protectedSnapshot = createSnapshot(atChoices(preparedRoute), [], savedAt);
      assert.equal(protectedSnapshot.state.pendingBadEnd, null);
      assert.equal(protectedSnapshot.state.outcome, ending.success);
      assert.equal(protectedSnapshot.state.retryCheckpoint, null);
    }
  });
}

test('RedRain imports derive scores and retry checkpoints without mutating the input', () => {
  const raw = atChoices(routeTo(20, { 18: 0, 19: 2 }), 'ending');
  raw.stats = { trust: 9999, supply: -1, memory: 777, signal: 0, courage: 0 };
  raw.retryCheckpoint = { sceneIndex: 48, route: Array(48).fill(1), stats: raw.stats, readingCursor: null };
  raw.preparationCheckpoints = { recon: raw.retryCheckpoint, invented: raw.retryCheckpoint };
  const before = structuredClone(raw);
  const canonical = createSnapshot(raw, [], savedAt);
  const expected = atChoices(raw.route, 'ending');
  assert.deepEqual(canonical.state.stats, expected.stats);
  assert.equal(canonical.state.retryCheckpoint!.sceneIndex, 19);
  assert.equal(canonical.state.preparationCheckpoints.recon.sceneIndex, 18);
  assert.equal(canonical.state.preparationCheckpoints.invented, undefined);
  assert.deepEqual(raw, before);
});

test('RedRain preserves valid reading positions and resets stale or out of bounds cursors', () => {
  const state = atChoices(routeTo(4));
  const scene = getSceneForRoute(state.sceneIndex, state.route);
  const pages = createReadingPages(scene, state.outcome);
  const identity = `${scene.id}:${state.outcome || ''}`;
  state.readingCursor = { identity, page: pages.length - 1, complete: true, reachedEnd: true };
  assert.deepEqual(createSnapshot(state).state.readingCursor, state.readingCursor);
  state.readingCursor = { identity, page: 0, complete: true, reachedEnd: true };
  assert.deepEqual(createSnapshot(state).state.readingCursor, state.readingCursor, 'Backward reading preserves the already read ending.');
  state.readingCursor = { identity, page: pages.length - 1, complete: false, reachedEnd: true };
  assert.equal(createSnapshot(state).state.readingCursor!.reachedEnd, false);
  state.readingCursor = { identity, page: pages.length, complete: true, reachedEnd: true };
  assert.equal(createSnapshot(state).state.readingCursor, null);
  state.readingCursor = { identity: 'old-scene:', page: 0, complete: true, reachedEnd: true };
  assert.equal(createSnapshot(state).state.readingCursor, null);
});

test('RedRain rejects impossible route transitions and forged outcomes or endings', () => {
  const valid = createSnapshot(atChoices(routeTo(4)), [], savedAt);
  for (const choice of [-1, 3, 1.5, '0', null]) {
    assert.throws(() => validateSnapshot({ ...valid, state: { ...valid.state, route: [choice] } }), /选择/);
  }
  assert.throws(() => validateSnapshot({ ...valid, state: { ...valid.state, route: Array(51).fill(1) } }), /选择/);
  assert.throws(() => validateSnapshot({ ...valid, state: { ...valid.state, sceneIndex: 20 } }), /章节/);
  assert.throws(() => validateSnapshot({ ...valid, state: { ...valid.state, mode: 'prologue' } }), /序幕/);
  assert.throws(() => validateSnapshot({ ...valid, state: { ...valid.state, outcome: '伪造结果' } }), /行动结果/);
  assert.throws(() => validateSnapshot({ ...valid, state: { ...valid.state, pendingBadEnd: 'BE01' } }), /结局状态/);
  assert.throws(() => validateSnapshot({ ...valid, state: { ...valid.state, endingId: 'BE01' } }), /结局状态/);
  assert.throws(() => validateSnapshot({ ...valid, state: { ...valid.state, mode: 'ending', outcome: null, endingId: 'BE01' } }), /尚未抵达/);
  const failed = atChoices(routeTo(14, { 13: 0 }));
  failed.route.push(1);
  failed.sceneIndex = 14;
  assert.throws(() => createSnapshot(failed), /越过/);
  const completed = createSnapshot(atChoices(routeTo(50), 'ending'));
  assert.throws(() => validateSnapshot({ ...completed, state: { ...completed.state, endingId: 'BE01' } }), /结局与实际路线/);
});

test('RedRain recognizes only known archive endings and deduplicates without sharing definitions', () => {
  const ids = [...ENDING_DEFS, ...BAD_ENDINGS].map((ending: { id: string }) => ending.id);
  assert.equal(ids.length, 28);
  const snapshot = createSnapshot(freshPlatformState(), [...ids, ids[0]], savedAt);
  assert.deepEqual(snapshot.endings, ids);
  assert.throws(() => createSnapshot(freshPlatformState(), ['first-night']), /未知/);
  assert.equal(getEnding('first-night'), null);
  const definition = getEnding(ids[0])!;
  definition.title = '外部修改';
  assert.notEqual(getEnding(ids[0])!.title, '外部修改');
});

test('RedRain accepts legacy mainline exports while rejecting other versions and oversized payloads', () => {
  const state = atChoices(routeTo(8), 'next');
  assert.deepEqual(parseTransfer(JSON.stringify(state)).state, createSnapshot(state).state);
  const legacy = { format: 'redrain-legacy-save', version: 1, contentVersion: CONTENT_VERSION,
    experienceId: REDRAIN_ID, savedAt, state, endings: ['BE01'] };
  assert.deepEqual(parseTransfer(JSON.stringify(legacy)), createSnapshot(state, ['BE01'], savedAt));
  assert.deepEqual(parseTransfer(JSON.stringify({ state, endings: [], savedAt })), createSnapshot(state, [], savedAt));
  const valid = createSnapshot(state, [], savedAt);
  assert.throws(() => validateSnapshot({ ...valid, version: 2 }), /不是赤页/);
  assert.throws(() => validateSnapshot({ ...valid, contentVersion: 'old' }), /版本/);
  assert.throws(() => parseTransfer(JSON.stringify({ ...legacy, contentVersion: 'old' })), /版本/);
  assert.throws(() => parseTransfer(JSON.stringify({ ...legacy, experienceId: 'first-night' })), /另一部作品/);
  assert.throws(() => parseTransfer(JSON.stringify({ ...legacy, format: 'first-night-save' })), /格式/);
  assert.throws(() => validateSnapshot({ ...valid, savedAt: -1 }), /保存时间/);
  assert.throws(() => parseTransfer('{'), /JSON/);
  assert.throws(() => parseTransfer(' '.repeat(MAX_SAVE_BYTES + 1)), /过大/);
  assert.throws(() => validateSnapshot({ ...valid, padding: 'x'.repeat(MAX_SAVE_BYTES) }), /过大/);
});
