import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StorySourceService, StorySourceError } from '../server/story-source.ts';

const id = '2025684191967294692';
const list = [{ work_id: id, title: 'Test source', description: 'Source description', labels: ['test'], unknown_field: { retained: true } }];

async function withCache(run: (cacheDir: string) => Promise<void>) {
  const cacheDir = await mkdtemp(join(tmpdir(), 'yupage-source-test-'));
  try { await run(cacheDir); }
  finally { await rm(cacheDir, { recursive: true, force: true }); }
}

test('parallel readers share one public request and retain unknown source fields in cache', async () => {
  await withCache(async (cacheDir) => {
    let calls = 0;
    const service = new StorySourceService({ cacheDir, fetcher: async (url, init) => {
      calls++;
      assert.equal(String(url), 'https://api.zhihu.com/km-indep-home/hackathon/v2/story/list');
      assert.equal(new Headers(init?.headers).has('Authorization'), false);
      assert.equal(init?.redirect, 'error');
      return Response.json(list);
    } });
    const results = await Promise.all([service.list(), service.list(), service.list()]);
    assert.equal(calls, 1);
    assert.ok(results.every((result) => result.source === 'live' && result.stories[0].id === id));
    const rawCache = JSON.parse(await readFile(join(cacheDir, 'story-list.json'), 'utf8'));
    assert.deepEqual(rawCache.data[0].unknown_field, { retained: true });
  });
});

test('a cached source is explicitly labelled during an upstream outage', async () => {
  await withCache(async (cacheDir) => {
    let now = Date.parse('2026-09-06T00:00:00Z');
    let calls = 0;
    const service = new StorySourceService({ cacheDir, now: () => now, fetcher: async () => {
      calls++;
      return calls === 1 ? Response.json(list) : new Response('Service unavailable', { status: 503 });
    } });
    const initial = await service.list();
    now += 6 * 60 * 1000;
    const cached = await service.list();
    assert.equal(cached.source, 'cache');
    assert.equal(cached.fetchedAt, initial.fetchedAt);
    assert.match(cached.warning ?? '', /503/);
    assert.equal(calls, 2);
  });
});

test('unknown identifiers cannot probe the detail endpoint', async () => {
  await withCache(async (cacheDir) => {
    let calls = 0;
    const service = new StorySourceService({ cacheDir, fetcher: async () => { calls++; return Response.json(list); } });
    await assert.rejects(service.detail('../secrets'), (error: unknown) => error instanceof StorySourceError && error.status === 400);
    assert.equal(calls, 0);
    await assert.rejects(service.detail('9999999999999999999'), (error: unknown) => error instanceof StorySourceError && error.status === 404);
    assert.equal(calls, 1);
  });
});

test('a detail response for a different story is rejected instead of attributed to the selected author', async () => {
  await withCache(async (cacheDir) => {
    const service = new StorySourceService({ cacheDir, fetcher: async (url) => String(url).endsWith('/list')
      ? Response.json(list)
      : Response.json({ work_id: '9999999999999999999', content: 'Wrong story', author_name: 'Wrong author' }) });
    await assert.rejects(service.detail(id), (error: unknown) => error instanceof StorySourceError && error.code === 'UPSTREAM_INVALID_RESPONSE');
  });
});

test('oversized upstream bodies are rejected without trusting content-length', async () => {
  await withCache(async (cacheDir) => {
    const service = new StorySourceService({ cacheDir, fetcher: async () => new Response('x'.repeat(4 * 1024 * 1024 + 1)) });
    await assert.rejects(service.list(), (error: unknown) => error instanceof StorySourceError && error.code === 'UPSTREAM_TOO_LARGE');
  });
});

test('a missing upstream response never becomes a fabricated story list', async () => {
  await withCache(async (cacheDir) => {
    const service = new StorySourceService({ cacheDir, fetcher: async () => { throw new Error('Connection failed'); } });
    await assert.rejects(service.list(), (error: unknown) => error instanceof StorySourceError && error.code === 'UPSTREAM_UNAVAILABLE');
  });
});
