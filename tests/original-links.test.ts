import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { originalWorkUrl, sourceReadingUrl, sourceSearchUrl, zhihuStoryApi } from '../shared/zhihu-source.ts';
import { originalStoryLinks } from '../shared/original-links.ts';
import { StorySourceService } from '../server/story-source.ts';

test('reading links accept actual work pages and reject APIs, redirects, credentials and scripts', () => {
  const expected = 'https://www.zhihu.com/question/37374497/answer/2028470806506644467';
  assert.equal(originalWorkUrl(`${expected}?utm_source=test#reply`), expected);
  for (const value of ['javascript:alert(1)', 'https://www.zhihu.com.evil.test/question/123456/answer/123456', 'https://user@www.zhihu.com/question/123456/answer/123456', 'https://www.zhihu.com:444/question/123456/answer/123456', `${zhihuStoryApi}2025684191967294692`, 'https://www.zhihu.com/search?q=book', 'https://www.zhihu.com/signin?next=evil', '//www.zhihu.com/question/123456/answer/123456']) assert.equal(originalWorkUrl(value), undefined);
});

test('catalog and existing imported worlds resolve the same original-author page without rewriting source URLs', () => {
  const sourceUrl = `${zhihuStoryApi}2025684191967294692`;
  const expected = originalStoryLinks['2025684191967294692'];
  const source = { id: '2025684191967294692', title: '蓝血', sourceUrl };
  assert.equal(sourceReadingUrl(source), expected);
  assert.equal(source.sourceUrl, sourceUrl);
  assert.equal(sourceReadingUrl({ title: '蓝血', url: sourceUrl }), expected);
  assert.equal(sourceReadingUrl({ title: '蓝血', origin: { workId: source.id, sourceUrl }, url: '/api/workshop/projects/import-example/source' }), expected);
});

test('search-imported sources open their saved answer or article directly', () => {
  const sourceUrl = 'https://zhuanlan.zhihu.com/p/1981694746016622023';
  assert.equal(sourceReadingUrl({ title: '原作', origin: { workId: '1981694746016622023', sourceUrl }, url: '/api/workshop/projects/import-example/source' }), sourceUrl);
});

test('unverified works have no invented direct URL and get an encoded title/author search', () => {
  const source = { id: '999888777666', title: '名字 & 问号？', author: '原作者', sourceUrl: `${zhihuStoryApi}999888777666` };
  assert.equal(sourceReadingUrl(source), undefined);
  const search = new URL(sourceSearchUrl(source));
  assert.equal(search.origin, 'https://www.zhihu.com');
  assert.equal(search.searchParams.get('q'), '名字 & 问号？ 原作者');
});

test('optional upstream original link is preserved separately from the excerpt API, including cached reads', async context => {
  const cacheDir = await mkdtemp(join(tmpdir(), 'redleaf-original-link-'));
  context.after(() => rm(cacheDir, { recursive: true, force: true }));
  const id = '999888777666';
  const original = 'https://www.zhihu.com/question/123456789/answer/987654321';
  let calls = 0;
  const source = new StorySourceService({ cacheDir, fetcher: async input => {
    calls++;
    return Response.json(String(input).endsWith('/list') ? [{ work_id: id, title: '原作品', labels: [], original_url: 'javascript:alert(1)' }] : { work_id: id, chapter_name: '原作品', content: '真实节选', author_name: '原作者', original_url: `${original}?utm_source=test` });
  } });
  const list = await source.list();
  assert.equal(list.stories[0].originalUrl, undefined);
  const detail = await source.detail(id);
  assert.equal(detail.originalUrl, original);
  assert.equal(detail.sourceUrl, `${zhihuStoryApi}${id}`);
  assert.equal(detail.content, '真实节选');
  assert.equal(detail.contentScope, 'api-excerpt');
  assert.equal((await source.detail(id)).originalUrl, original);
  assert.equal(calls, 2);
});
