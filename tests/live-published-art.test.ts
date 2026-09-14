import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import type { AuthoredWorld } from '../content/worlds.ts';
import { compileWorld } from '../server/worlds.ts';
import type { GameWorld } from '../shared/types.ts';
import { choose, restoreSession, rewindSession, saveSession, startSession, type Session } from '../src/game.ts';
import {
  ART_MANIFESTS, ART_REFRESH_INTERVAL, applySessionArt, checkArtRevisions, versionedArtUrl, type ArtRevisions,
} from '../src/live-published-art.ts';

const [productionUrl, cutoutsUrl] = ART_MANIFESTS;
const modified = 'Thu, 10 Sep 2026 10:00:00 GMT';
const newerModified = 'Thu, 10 Sep 2026 10:01:00 GMT';

function mockHeads(t: TestContext, respond: (url: string) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    assert.ok(ART_MANIFESTS.some(manifest => manifest === url));
    assert.equal(init?.method, 'HEAD');
    assert.equal(init?.cache, 'no-store');
    assert.ok(init?.signal instanceof AbortSignal);
    return respond(url);
  });
  return calls;
}

function fixture(): GameWorld {
  const authored: AuthoredWorld = {
    id: 'live-art-fixture', storyId: '9999999900000000001', version: '1', title: 'Night watch', subtitle: '',
    player: { name: 'Reader', role: 'investigator' }, introduction: [], objective: 'Check the record',
    startNodeId: 'entry', characters: [], cover: '/assets/cover.webp', background: '/assets/entry.webp',
    source: { title: 'Fixture', author: 'Test', url: '' }, summary: '',
    adaptation: { scope: 'original-seed', adultCast: true, note: 'Test fixture' },
    resources: [{ id: 'time', label: 'Time', initial: 5, min: 0, max: 5, description: 'Investigation budget' }],
    nodes: {
      entry: {
        id: 'entry', chapter: 'Arrival', title: 'The door', location: 'Hall', time: '20:00',
        background: '/assets/entry.webp', text: ['You open the door.', 'A record waits on the desk.'],
        choices: [{ id: 'inspect', text: 'Read the record', nextNodeId: 'decision',
          effects: { resources: { time: -1 }, clues: ['record'], resolve: 4, trust: 2 },
          feedback: { tone: 'success', text: 'The dates match.' } }],
      },
      decision: {
        id: 'decision', chapter: 'Evidence', title: 'The record', location: 'Office', time: '20:05',
        background: '/assets/decision.webp', text: ['You copy the date.', 'The guard waits for your reply.'],
        choices: [{ id: 'submit', text: 'Deliver the record', nextNodeId: 'ending',
          requires: { allClues: ['record'] }, effects: { resources: { time: -1 }, clues: ['delivered'] } }],
      },
      ending: {
        id: 'ending', chapter: 'End', title: 'Signed', location: 'Office', time: '20:10',
        background: '/assets/ending.webp', text: ['The guard signs the record.'], choices: [],
        ending: { title: 'Signed', text: 'Your evidence is recorded.', tone: 'hopeful' },
      },
    },
  };
  return compileWorld(authored);
}

function step(session: Session, id: string): Session {
  const choice = session.choices.find(candidate => candidate.id === id);
  assert.ok(choice, `${session.node.id}: ${id} must remain available`);
  return choose(session, choice);
}

function newArt(world: GameWorld): GameWorld {
  const updated = structuredClone(world);
  updated.cover = '/generated-art/scene_abcd.png';
  for (const node of Object.values(updated.nodes)) {
    node.background = '/generated-art/scene_1234.png';
    node.backgroundArtKind = 'environment';
  }
  return updated;
}

test('live artwork checks use a sixty-second interval', () => {
  assert.equal(ART_REFRESH_INTERVAL, 60_000);
});

test('initial HEAD checks capture both manifest validators without reading a body', async t => {
  const calls = mockHeads(t, url => {
    const response = new Response(null, { headers: { etag: url === productionUrl ? '"p1"' : '"c1"', 'last-modified': modified } });
    t.mock.method(response, 'json', () => { throw new Error('HEAD must not read JSON'); });
    t.mock.method(response, 'text', () => { throw new Error('HEAD must not read text'); });
    return response;
  });
  const result = await checkArtRevisions();
  assert.equal(result.changed, true);
  assert.deepEqual(result.revisions, {
    [productionUrl]: { etag: '"p1"', modified }, [cutoutsUrl]: { etag: '"c1"', modified },
  });
  assert.deepEqual(calls.map(call => call.url).sort(), [...ART_MANIFESTS].sort());
  for (const call of calls) assert.deepEqual(call.init?.headers, {});
});

test('ETag detects a changed cutout at an unchanged URL and stable 200 responses do not refresh', async t => {
  const previous: ArtRevisions = {
    [productionUrl]: { etag: '"p1"', modified }, [cutoutsUrl]: { etag: '"c1"', modified },
  };
  let cutoutTag = '"c1"';
  const calls = mockHeads(t, url => new Response(null, {
    headers: { etag: url === productionUrl ? '"p1"' : cutoutTag, 'last-modified': modified },
  }));
  assert.equal((await checkArtRevisions(previous)).changed, false);
  cutoutTag = '"c2"';
  const changed = await checkArtRevisions(previous);
  assert.equal(changed.changed, true);
  assert.equal(changed.revisions[cutoutsUrl].etag, '"c2"');
  assert.equal(previous[cutoutsUrl].etag, '"c1"');
  for (const call of calls) assert.deepEqual(call.init?.headers, { 'If-None-Match': previous[call.url].etag });
});

test('Last-Modified is used when ETag is absent and its revision change is observed', async t => {
  const previous: ArtRevisions = Object.fromEntries(ART_MANIFESTS.map(url => [url, { etag: null, modified }]));
  let currentModified = modified;
  const calls = mockHeads(t, () => new Response(null, { headers: { 'last-modified': currentModified } }));
  assert.equal((await checkArtRevisions(previous)).changed, false);
  currentModified = newerModified;
  const result = await checkArtRevisions(previous);
  assert.equal(result.changed, true);
  assert.equal(result.revisions[productionUrl].modified, newerModified);
  for (const call of calls) assert.deepEqual(call.init?.headers, { 'If-Modified-Since': modified });
});

test('304 responses retain prior revisions even when response validator headers are omitted', async t => {
  const previous: ArtRevisions = {
    [productionUrl]: { etag: '"p1"', modified }, [cutoutsUrl]: { etag: null, modified },
  };
  const calls = mockHeads(t, () => new Response(null, { status: 304 }));
  const result = await checkArtRevisions(previous);
  assert.equal(result.changed, false);
  assert.deepEqual(result.revisions, previous);
  assert.deepEqual(calls.find(call => call.url === productionUrl)?.init?.headers, { 'If-None-Match': '"p1"' });
  assert.deepEqual(calls.find(call => call.url === cutoutsUrl)?.init?.headers, { 'If-Modified-Since': modified });
});

test('missing validators request a refresh instead of declaring unknown revisions unchanged', async t => {
  const previous: ArtRevisions = Object.fromEntries(ART_MANIFESTS.map(url => [url, { etag: null, modified: null }]));
  mockHeads(t, () => new Response(null));
  assert.equal((await checkArtRevisions(previous)).changed, true);
});

test('HTTP and network HEAD failures reject without committing partial revision changes', async t => {
  const previous: ArtRevisions = {
    [productionUrl]: { etag: '"p1"', modified }, [cutoutsUrl]: { etag: '"c1"', modified },
  };
  const before = structuredClone(previous);
  let offline = false;
  mockHeads(t, url => {
    if (url === productionUrl) return new Response(null, { headers: { etag: '"p2"' } });
    if (offline) throw new TypeError('network offline');
    return new Response(null, { status: 503 });
  });
  await assert.rejects(checkArtRevisions(previous), /ART_REVISION_UNAVAILABLE/);
  assert.deepEqual(previous, before);
  offline = true;
  await assert.rejects(checkArtRevisions(previous), /network offline/);
  assert.deepEqual(previous, before);
});

test('an artwork response preserves a paragraph advanced while the request was pending', () => {
  const requested = startSession(fixture());
  const current = { ...requested, paragraphIndex: 1 };
  const world = newArt(requested.world), inkState = current.engine.state.ToJson();
  const updated = applySessionArt(current, requested, world);
  assert.ok(updated);
  assert.equal(updated.world, world);
  assert.equal(updated.node, world.nodes.entry);
  assert.equal(updated.paragraphIndex, 1);
  assert.equal(updated.engine, current.engine);
  assert.equal(updated.engine.state.ToJson(), inkState);
  const { world: _world, node: _node, ...progress } = updated;
  const { world: _oldWorld, node: _oldNode, ...oldProgress } = current;
  assert.deepEqual(progress, oldProgress);
  assert.equal(requested.paragraphIndex, 0);
});

test('art merges into a later choice and keeps restored Ink, resources, history and spent rewinds playable', () => {
  const initial = startSession(fixture(), { difficulty: 'challenge' });
  const rewind = rewindSession(step(initial, 'inspect'), 0);
  const requested = restoreSession(rewind.world, saveSession(rewind));
  assert.equal(requested.rewindsRemaining, initial.rewindsRemaining - 1);
  const current = { ...step(requested, 'inspect'), paragraphIndex: 1 };
  assert.equal(current.engine, requested.engine);
  assert.equal(current.world, requested.world);
  assert.equal(current.node.id, 'decision');
  assert.equal(requested.node.id, 'entry');
  assert.equal(current.choiceCount, 1);
  assert.equal(current.resources.time, 3);
  const inkState = current.engine.state.ToJson(), history = structuredClone(current.history);
  const world = newArt(requested.world), updated = applySessionArt(current, requested, world);
  assert.ok(updated);
  assert.equal(updated.world, world);
  assert.equal(updated.node, world.nodes.decision);
  assert.equal(updated.engine, current.engine);
  assert.equal(updated.engine.state.ToJson(), inkState);
  assert.equal(updated.paragraphIndex, 1);
  for (const key of ['paragraphs', 'history', 'choices', 'resources', 'clues', 'outcomes', 'lastOutcome'] as const)
    assert.equal(updated[key], current[key]);
  for (const key of ['choiceCount', 'resolve', 'trust', 'startedAt', 'timeLabel', 'difficulty', 'rewindsRemaining'] as const)
    assert.equal(updated[key], current[key]);
  assert.deepEqual(updated.history, history);
  assert.equal(current.world.nodes.decision.background, '/assets/decision.webp');
  const restored = restoreSession(world, saveSession(updated));
  assert.deepEqual(restored.history, updated.history);
  assert.deepEqual(restored.resources, updated.resources);
  assert.equal(restored.paragraphIndex, updated.paragraphIndex);
  assert.equal(restored.rewindsRemaining, updated.rewindsRemaining);
  const ending = step(updated, 'submit');
  assert.equal(ending.node, world.nodes.ending);
  assert.equal(ending.resources.time, 2);
  assert.deepEqual(ending.clues, ['record', 'delivered']);
  assert.equal(ending.rewindsRemaining, rewind.rewindsRemaining);
});

test('responses for an exited, restarted or restored engine cannot replace the active session', () => {
  const requested = startSession(fixture()), world = newArt(requested.world);
  assert.equal(applySessionArt(null, requested, world), null);
  for (const current of [startSession(requested.world), restoreSession(requested.world, saveSession(requested))]) {
    assert.notEqual(current.engine, requested.engine);
    assert.equal(current.world, requested.world);
    const before = current.engine.state.ToJson();
    assert.equal(applySessionArt(current, requested, world), current);
    assert.equal(current.engine.state.ToJson(), before);
  }
});

test('older requests cannot overwrite an already refreshed world on the same engine', () => {
  const requested = startSession(fixture());
  const firstWorld = newArt(requested.world), current = applySessionArt(requested, requested, firstWorld);
  assert.ok(current);
  assert.equal(current.engine, requested.engine);
  assert.notEqual(current.world, requested.world);
  const obsoleteWorld = newArt(requested.world);
  obsoleteWorld.cover = '/generated-art/scene_dead.png';
  assert.equal(applySessionArt(current, requested, obsoleteWorld), current);
  const nextWorld = newArt(current.world);
  assert.equal(applySessionArt(current, current, nextWorld)?.world, nextWorld);
});

test('different story, world, version and missing current node reject the incoming artwork', () => {
  const requested = startSession(fixture()), current = step(requested, 'inspect');
  const candidates = [
    { ...newArt(current.world), storyId: 'other-story' },
    { ...newArt(current.world), id: 'other-world' },
    { ...newArt(current.world), version: '2' },
    { ...newArt(current.world), nodes: { entry: current.world.nodes.entry } },
  ];
  const before = current.engine.state.ToJson();
  for (const world of candidates) assert.equal(applySessionArt(current, requested, world), current);
  assert.equal(current.engine.state.ToJson(), before);
});

test('the same cutout path gets distinct browser sources for distinct approved SHA values', () => {
  const url = '/generated-art/cutouts/scene_abcd-123456789abc.png';
  const first = versionedArtUrl(url, 'a'.repeat(64)), second = versionedArtUrl(url, 'b'.repeat(64));
  assert.notEqual(first, second);
  assert.equal(first, `${url}?sha256=${'a'.repeat(64)}`);
  assert.equal(second, `${url}?sha256=${'b'.repeat(64)}`);
  assert.equal(versionedArtUrl(`${url}?preview=1`, 'a'.repeat(64)), `${url}?preview=1&sha256=${'a'.repeat(64)}`);
});

test('invalid SHA values and paths outside cutouts retain their original image source', () => {
  const url = '/generated-art/cutouts/scene_abcd-123456789abc.png';
  for (const sha of [undefined, '', 'invalid', 'a'.repeat(63), 'a'.repeat(65), 'g'.repeat(64), 'A'.repeat(64)])
    assert.equal(versionedArtUrl(url, sha), url);
  for (const source of ['/assets/portrait.png', '/generated-art/scene_abcd.png', 'https://example.test/portrait.png'])
    assert.equal(versionedArtUrl(source, 'a'.repeat(64)), source);
});
