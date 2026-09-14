import assert from 'node:assert/strict';
import test from 'node:test';
import type { StorySummary, ZhihuOrigin } from '../shared/types.ts';
import type { WorkshopProject } from '../shared/workshop.ts';
import { mergeStoryLibrary, storyAdaptationStatus } from '../src/story-library.ts';

const timestamp = '2026-09-12T08:00:00.000Z';

function story(overrides: Partial<StorySummary> = {}): StorySummary {
  return {
    id: '2025684191967294692', title: '蓝血', author: '原作作者',
    description: '原作的公开节选。', labels: ['悬疑'],
    sourceUrl: 'https://api.zhihu.com/km-indep-home/hackathon/v2/story/2025684191967294692',
    cover: '/art/blue-blood.webp', playable: true, ...overrides,
  };
}

function origin(overrides: Partial<ZhihuOrigin> = {}): ZhihuOrigin {
  return {
    kind: 'zhihu-article', workId: '706674379',
    sourceUrl: 'https://zhuanlan.zhihu.com/p/706674379',
    fetchedAt: timestamp, contentScope: 'search-excerpt', ...overrides,
  };
}

function project(overrides: Partial<WorkshopProject> = {}): WorkshopProject {
  return {
    id: 'import-32bcca2e-c8e9-47bb-91b1-ee567f3cbe2f',
    title: '星航', author: '星航作者', scope: 'zhihu-excerpt', sourceHash: 'source-hash',
    origin: origin(), createdAt: timestamp, updatedAt: timestamp, revision: 1,
    status: 'ready', stage: 'ready', completedRoutes: 3, playable: true, attempts: 1,
    publishedVersion: 'r1', art: { status: 'pending', approved: 0, total: 0 }, events: [],
    ...overrides,
  };
}

test('a failed duplicate project does not downgrade an existing playable story or its game route', () => {
  const base = story();
  const failed = project({
    status: 'failed', playable: false, publishedVersion: undefined,
    origin: origin({ kind: 'zhihu-story', workId: base.id, sourceUrl: base.sourceUrl, contentScope: undefined }),
  });
  const entries = mergeStoryLibrary([base], [failed]);

  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, base.id);
  assert.equal(entries[0].playable, true);
  assert.equal(entries[0].playableId ?? entries[0].id, base.id);
  assert.equal(entries[0].addedFromWorkshop, undefined);
  assert.deepEqual(storyAdaptationStatus(entries[0]), { label: '已改编', tone: 'ready' });
});

test('search and webpage Zhihu stories join the library while private imports and original seeds stay out', () => {
  const search = project();
  const webpage = project({
    id: 'import-0b3ce5e1-1f96-474d-871d-5e2a2a541713', title: '网页选取的回答',
    origin: origin({ kind: 'zhihu-answer', workId: '2074553198715592769', contentScope: 'webpage-selection',
      sourceUrl: 'https://www.zhihu.com/question/2050680813310809035/answer/2074553198715592769' }),
  });
  const privateImport = project({ id: 'private-import', scope: 'user-import', origin: undefined });
  const originalSeed = project({ id: 'original-seed', scope: 'original-seed', origin: undefined });
  const missingOrigin = project({ id: 'missing-origin', origin: undefined });
  const entries = mergeStoryLibrary([story()], [privateImport, webpage, missingOrigin, search, originalSeed]);

  assert.equal(entries.length, 3);
  assert.deepEqual(new Set(entries.slice(1).map(entry => entry.id)), new Set([search.id, webpage.id]));
  assert.ok(entries.slice(1).every(entry => entry.addedFromWorkshop));
  assert.ok(entries.slice(1).every(entry => entry.playableId === entry.project?.id));
});

test('a newer unfinished revision cannot hide the old playable version or duplicate the source card', () => {
  const published = project({ updatedAt: '2026-09-10T08:00:00.000Z' });
  const newer = project({
    id: 'import-71ea1ce0-5f47-439a-9661-37c61d8ca6fb', status: 'failed', playable: false,
    publishedVersion: undefined, revision: 2, updatedAt: '2026-09-12T09:00:00.000Z',
  });

  for (const projects of [[newer, published], [published, newer]]) {
    const entries = mergeStoryLibrary([], projects);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].playable, true);
    assert.equal(entries[0].playableId, published.id);
    assert.equal(entries[0].project?.publishedVersion, 'r1');
  }
});

test('a ready project makes a previously unplayable catalogue story playable with its imported route', () => {
  const base = story({ playable: false });
  const ready = project({
    origin: origin({ kind: 'zhihu-story', workId: base.id, sourceUrl: base.sourceUrl, contentScope: undefined }),
  });
  const entries = mergeStoryLibrary([base], [ready]);

  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, base.id);
  assert.equal(entries[0].title, base.title);
  assert.equal(entries[0].cover, base.cover);
  assert.equal(entries[0].playable, true);
  assert.equal(entries[0].playableId, ready.id);
});

test('adaptation status prioritizes a playable release and distinguishes unfinished project states', () => {
  const cases = [
    { status: 'running', label: '改编中', tone: 'running' },
    { status: 'failed', label: '改编失败', tone: 'failed' },
    { status: 'interrupted', label: '待继续', tone: 'pending' },
    { status: 'idle', label: '待改编', tone: 'pending' },
  ] as const;

  for (const { status, label, tone } of cases) {
    const unfinished = { ...story({ playable: false }), project: project({ status, playable: false }) };
    assert.deepEqual(storyAdaptationStatus(unfinished), { label, tone });
    assert.deepEqual(storyAdaptationStatus({ ...unfinished, playable: true }), { label: '已改编', tone: 'ready' });
  }
  assert.deepEqual(storyAdaptationStatus(story({ playable: false })), { label: '待改编', tone: 'pending' });
});

test('new cards preserve author, original URLs and cover metadata without mutating either input', () => {
  const baseStories = [story()];
  const metadata = origin({
    authorAvatar: 'https://picx.zhimg.com/author.jpg', cover: 'https://picx.zhimg.com/cover.jpg',
    originalUrl: 'https://zhuanlan.zhihu.com/p/706674379',
  });
  const older = project({ id: 'older-project', updatedAt: '2026-09-10T08:00:00.000Z', playable: false });
  const published = project({ origin: metadata });
  const projects = [older, published];
  const before = structuredClone({ baseStories, projects });
  const entries = mergeStoryLibrary(baseStories, projects);
  const added = entries.find(entry => entry.addedFromWorkshop)!;

  assert.equal(added.title, published.title);
  assert.equal(added.author, published.author);
  assert.equal(added.authorAvatar, metadata.authorAvatar);
  assert.equal(added.sourceCover, metadata.cover);
  assert.equal(added.sourceUrl, metadata.sourceUrl);
  assert.equal(added.originalUrl, metadata.originalUrl);
  assert.notEqual(entries[0], baseStories[0]);
  assert.deepEqual({ baseStories, projects }, before);
});

test('multiple published versions keep the latest one while equal numeric IDs from different source kinds stay distinct', () => {
  const older = project({ id: 'older-project', updatedAt: '2026-09-10T08:00:00.000Z' });
  const latest = project({ updatedAt: '2026-09-12T09:00:00.000Z', publishedVersion: 'r2', revision: 2 });
  const answer = project({
    id: 'answer-project', origin: origin({ kind: 'zhihu-answer', sourceUrl: 'https://www.zhihu.com/question/123456/answer/706674379' }),
  });
  const entries = mergeStoryLibrary([], [older, answer, latest]);

  assert.equal(entries.length, 2);
  assert.deepEqual(new Set(entries.map(entry => entry.playableId)), new Set([latest.id, answer.id]));
  assert.equal(entries.find(entry => entry.id === latest.id)?.project?.publishedVersion, 'r2');
});
