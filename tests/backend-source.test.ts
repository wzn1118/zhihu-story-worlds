import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { StorySourceService, validateStoryId } from '../server/story-source.ts';
import { createApp } from '../server/app.ts';

const id = '2025684191967294692';
const otherId = '999888777666';
const listData = [{ work_id: id, title: '蓝血', description: 'source description', labels: ['悬疑'], future_field: { retained: true } }, { work_id: otherId, title: '真实未改编故事', labels: [] }];
const detailData = { work_id: id, chapter_name: '蓝血', author_name: '桃花先生', content: 'actual source excerpt', introduction: 'source introduction', new_field: 42 };

async function fixture(context: { after: (fn: () => Promise<void>) => void }) {
  const cacheDir = await mkdtemp(join(tmpdir(), 'yuye-source-'));
  context.after(() => rm(cacheDir, { recursive: true, force: true }));
  return cacheDir;
}

test('IDs reject path traversal, query, whitespace and non-numeric strings before networking', () => {
  for (const unsafe of ['', '../list', '2025684191967294692?x=1', '2025684191967294692#x', '2025684191967294692\n', 'https://evil.invalid', '%2F', 'abc']) {
    assert.throws(() => validateStoryId(unsafe), { code: 'INVALID_STORY_ID', status: 400 });
  }
  validateStoryId(id);
});

test('live list and detail are normalized while unknown raw fields remain in cache', async (context) => {
  const cacheDir = await fixture(context);
  const requests: string[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    requests.push(url);
    assert.equal(new URL(url).host, 'api.zhihu.com');
    assert.equal(init?.redirect, 'error');
    assert.deepEqual(init?.headers, { Accept: 'application/json' });
    return Response.json(url.endsWith('/list') ? listData : detailData);
  };
  const service = new StorySourceService({ cacheDir, fetcher });
  const list = await service.list();
  assert.equal(list.source, 'live');
  assert.equal(list.stories[0].playable, true);
  assert.equal(list.stories[1].playable, false);
  const detail = await service.detail(id);
  assert.equal(detail.author, '桃花先生');
  assert.equal(detail.content, 'actual source excerpt');
  assert.equal(detail.contentScope, 'api-excerpt');
  assert.equal(requests.length, 2);
  assert.equal((await service.detail(id)).source, 'cache');
  assert.equal(requests.length, 2);
  const raw = JSON.parse(await readFile(join(cacheDir, `story-${id}.json`), 'utf8'));
  assert.equal(raw.data.new_field, 42);
  const rawList = JSON.parse(await readFile(join(cacheDir, 'story-list.json'), 'utf8'));
  assert.equal(rawList.data[0].future_field.retained, true);
});

test('unknown IDs must be list-confirmed before a detail request', async (context) => {
  let calls = 0;
  const service = new StorySourceService({ cacheDir: await fixture(context), fetcher: async () => { calls++; return Response.json(listData); } });
  await assert.rejects(service.detail('9999999999999999999'), { code: 'STORY_NOT_FOUND', status: 404 });
  assert.equal(calls, 1);
});

test('expired cache falls back once with original timestamp and explicit HTTP warning', async (context) => {
  let now = 1000000000000;
  let calls = 0;
  const service = new StorySourceService({ cacheDir: await fixture(context), now: () => now, fetcher: async () => {
    calls++;
    return calls === 1 ? Response.json(listData) : new Response('private upstream error', { status: 503 });
  } });
  const live = await service.list();
  now += 600000;
  const cached = await service.list();
  assert.equal(cached.source, 'cache');
  assert.equal(cached.fetchedAt, live.fetchedAt);
  assert.match(cached.warning ?? '', /HTTP 503/);
  assert.doesNotMatch(cached.warning ?? '', /private/);
  assert.equal(calls, 2);
});

test('failure without cache is an error and malformed responses never overwrite good data', async (context) => {
  let response = new Response('secret debug body', { status: 429 });
  const service = new StorySourceService({ cacheDir: await fixture(context), fetcher: async () => response.clone() });
  await assert.rejects(service.list(), { code: 'UPSTREAM_HTTP_ERROR', message: '知乎内容接口返回 HTTP 429。' });
  response = Response.json(listData);
  await service.list();
  response = Response.json({ not: 'a list' });
  const cached = await service.list(true);
  assert.equal(cached.source, 'cache');
  assert.match(cached.warning ?? '', /字段不完整/);
  assert.equal(cached.stories.length, 2);
});

test('mismatched detail IDs and oversized response bodies are rejected', async (context) => {
  let huge = false;
  const service = new StorySourceService({ cacheDir: await fixture(context), fetcher: async (input) => {
    if (String(input).endsWith('/list')) return Response.json(listData);
    return huge ? new Response('x', { headers: { 'Content-Length': String(5 * 1024 * 1024) } }) : Response.json({ ...detailData, work_id: otherId });
  } });
  await assert.rejects(service.detail(id), { code: 'UPSTREAM_INVALID_RESPONSE' });
  huge = true;
  await assert.rejects(service.detail(id), { code: 'UPSTREAM_TOO_LARGE' });
});

test('HTTP routes expose health, typed worlds, honest unsupported and safe errors', async (context) => {
  const source = new StorySourceService({ cacheDir: await fixture(context), fetcher: async () => Response.json(listData) });
  const server = createServer(createApp(source));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  assert.equal((await (await fetch(`${base}/api/health`)).json()).status, 'ok');
  const world = await (await fetch(`${base}/api/worlds/${id}`)).json();
  assert.equal(world.id, 'blue-blood');
  assert.ok(world.ink);
  const unsupported = await fetch(`${base}/api/worlds/${otherId}`);
  assert.equal(unsupported.status, 409);
  assert.equal((await unsupported.json()).error.code, 'WORLD_NOT_PREPARED');
  const bad = await fetch(`${base}/api/stories/not-an-id`);
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error.code, 'INVALID_STORY_ID');
  assert.equal((await fetch(`${base}/api/unknown`)).status, 404);
});
