import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { StoryWorkshop, hashSource } from '../server/story-workshop.ts';
import { StorySourceService } from '../server/story-source.ts';
import { createApp } from '../server/app.ts';
import { originalSeed, isImportedId } from '../shared/workshop.ts';
import { zhihuImage, zhihuStoryApi, sourceScopeLabel } from '../shared/zhihu-source.ts';
import type { StoryDetail } from '../shared/types.ts';

const id = '2025684191967294692';
const detail: StoryDetail = { id, title: '真实来源传输测试', author: '原作者', description: '', labels: ['悬疑'], playable: false,
  sourceUrl: `${zhihuStoryApi}${id}`, source: 'cache', fetchedAt: '2026-09-06T00:00:00.000Z', contentScope: 'api-excerpt',
  introduction: '导语与正文分开保留。', content: `\uFEFF\r\n<script>inert source</script>\r\n${originalSeed.text}\n `,
  authorAvatar: 'https://pic1.zhimg.com/avatar.png', sourceCover: 'https://pic1.zhimg.com/cover.jpg',
};
async function workshop(t: { after: (fn: () => Promise<void>) => void }) {
  const root = await mkdtemp(join(tmpdir(), 'redleaf-zhihu-')); t.after(() => rm(root, { recursive: true, force: true }));
  return new StoryWorkshop(root);
}

test('verified Zhihu import preserves exact excerpt and authorship in a separate registry', async t => {
  const service = await workshop(t), project = await service.importZhihu(detail), source = await service.source(project.id);
  assert.ok(isImportedId(project.id)); assert.notEqual(project.id, id);
  assert.equal(project.scope, 'zhihu-excerpt'); assert.equal(project.playable, false); assert.equal(project.attempts, 0);
  assert.equal(source.text, detail.content); assert.equal(source.author, detail.author); assert.equal(source.title, detail.title);
  assert.deepEqual(source.origin, { kind: 'zhihu-story', workId: id, sourceUrl: detail.sourceUrl, fetchedAt: detail.fetchedAt, authorAvatar: detail.authorAvatar, cover: detail.sourceCover });
  assert.deepEqual((await new StoryWorkshop(service.root).source(project.id)), source);
  assert.equal(sourceScopeLabel(source.scope), '知乎原作节选');
});

test('concurrent imports and refreshed fetch timestamps reuse the same immutable source snapshot', async t => {
  const service = await workshop(t);
  const projects = await Promise.all(Array.from({ length: 4 }, () => new StoryWorkshop(service.root).importZhihu(detail)));
  assert.equal(new Set(projects.map(project => project.id)).size, 1);
  const refreshed = await service.importZhihu({ ...detail, fetchedAt: '2026-09-06T05:00:00.000Z' });
  assert.equal(refreshed.id, projects[0].id);
  assert.equal((await service.source(refreshed.id)).origin?.fetchedAt, detail.fetchedAt);
  const changed = await service.importZhihu({ ...detail, content: `${detail.content}新增原文` });
  assert.notEqual(changed.id, refreshed.id);
});

test('personal paste cannot claim platform provenance and identical text keeps a different identity', async t => {
  const service = await workshop(t);
  await assert.rejects(service.import({ ...originalSeed, scope: 'zhihu-excerpt' }), { code: 'INVALID_SCOPE' });
  await assert.rejects(service.import({ ...originalSeed, origin: { kind: 'zhihu-story', workId: id } }), { code: 'INVALID_ORIGIN' });
  const imported = await service.import({ title: detail.title, author: detail.author, text: detail.content, scope: 'user-import' });
  const zhihu = await service.importZhihu(detail);
  assert.notEqual(imported.id, zhihu.id);
  assert.equal((await service.source(imported.id)).origin, undefined);
});

test('existing source hashes remain byte compatible and origin IDs distinguish different works', () => {
  const oldHash = createHash('sha256').update(JSON.stringify({ title: originalSeed.title, author: originalSeed.author, text: originalSeed.text, scope: originalSeed.scope })).digest('hex');
  assert.equal(hashSource(originalSeed), oldHash);
  const base = { ...originalSeed, scope: 'zhihu-excerpt' as const, origin: { kind: 'zhihu-story' as const, workId: id, sourceUrl: detail.sourceUrl, fetchedAt: detail.fetchedAt } };
  assert.notEqual(hashSource(base), hashSource({ ...base, origin: { ...base.origin, workId: '2025333783608537435' } }));
});

test('unsafe or mismatched provenance is rejected, optional images accept only HTTPS Zhihu hosts', async t => {
  const service = await workshop(t);
  await assert.rejects(service.importZhihu({ ...detail, sourceUrl: 'https://untrusted.invalid/' }), { code: 'INVALID_ORIGIN' });
  await assert.rejects(service.importZhihu({ ...detail, id: '../path' }), { code: 'INVALID_ORIGIN' });
  await assert.rejects(service.importZhihu({ ...detail, content: '摘要不是全文' }), { code: 'INVALID_SOURCE' });
  for (const url of ['javascript:alert(1)', 'https://zhimg.com.evil.invalid/a.png', 'http://pic1.zhimg.com/a.png', 'https://name:password@pic1.zhimg.com/a.png', '//pic1.zhimg.com/a.png']) assert.equal(zhihuImage(url), undefined);
  assert.equal(zhihuImage(detail.authorAvatar), detail.authorAvatar);
});

test('source adapter retains real source artwork and author avatar without changing original content', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'redleaf-source-metadata-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const fetcher: typeof fetch = async input => new Response(JSON.stringify(String(input).endsWith('/list')
    ? [{ work_id: id, title: detail.title, artwork: detail.sourceCover, labels: [] }]
    : { work_id: id, chapter_name: detail.title, author_name: detail.author, author_avatar: detail.authorAvatar, content: detail.content }), { headers: { 'content-type': 'application/json' } });
  const service = new StorySourceService({ cacheDir: directory, fetcher });
  const value = await service.detail(id);
  assert.equal(value.sourceCover, detail.sourceCover); assert.equal(value.authorAvatar, detail.authorAvatar);
  assert.equal(value.content, detail.content); assert.equal(value.contentScope, 'api-excerpt');
});

test('HTTP source import ignores client prose, respects origin checks and never starts a job', async t => {
  const service = await workshop(t); let reads = 0;
  class Source extends StorySourceService { override async detail(workId: string) { reads++; assert.equal(workId, id); return detail; } }
  const server = createServer(createApp(new Source(), service));
  await new Promise<void>(yes => server.listen(0, '127.0.0.1', yes));
  t.after(() => new Promise<void>((yes, no) => server.close(error => error ? no(error) : yes())));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const request = (body: unknown, headers = {}) => fetch(`${base}/api/workshop/from-zhihu`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  assert.equal((await request({ storyId: id }, { origin: 'https://untrusted.invalid' })).status, 403); assert.equal(reads, 0);
  assert.equal((await request({ storyId: '../path' })).status, 400); assert.equal(reads, 0);
  const response = await request({ storyId: id, content: 'forged client source', author: 'forged author' }); assert.equal(response.status, 201);
  const project = await response.json(); assert.equal(project.status, 'idle'); assert.equal(project.jobId, undefined);
  assert.equal((await service.source(project.id)).text, detail.content);
  assert.equal((await (await request({ storyId: id })).json()).id, project.id);
  assert.equal((await (await fetch(`${base}/api/workshop/projects`)).json()).capabilities.zhihuImport, true);
});
