import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StoryWorkshop, hashSource } from '../server/story-workshop.ts';
import { outlinePrompt } from '../server/workshop-creative.ts';
import { fastStoryPrompt } from '../server/workshop-fast.ts';
import { sourceReadingUrl, sourceScopeLabel } from '../shared/zhihu-source.ts';
import type { ImportedSource } from '../shared/workshop.ts';

const source: ImportedSource = {
  title: '仅供自动测试的收藏摘要', author: '测试作者', scope: 'zhihu-excerpt',
  text: `\uFEFF\r\n${'值班人把名单放在灯下，发现纸背留着一行陌生字迹。'.repeat(5)}\r\n<script>inert</script> `,
  origin: { kind: 'zhihu-answer', contentScope: 'favorite-summary', workId: '87654321', sourceUrl: 'https://www.zhihu.com/question/12345678/answer/87654321', fetchedAt: '2026-09-14T00:00:00.000Z' },
};

test('favorite summary imports preserve exact bytes and provenance without aliasing search excerpts', async context => {
  const root = await mkdtemp(join(tmpdir(), 'favorite-provenance-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const workshop = new StoryWorkshop(root);
  const project = await workshop.importZhihuSearch(source, undefined, 'test-owner');
  assert.equal(project.origin?.contentScope, 'favorite-summary');
  assert.equal(project.ownerId, 'test-owner');
  assert.match(project.events[0].message, /收藏接口摘要/);
  assert.deepEqual(await new StoryWorkshop(root).source(project.id), source);
  const refreshed = { ...source, origin: { ...source.origin!, fetchedAt: '2026-09-14T12:00:00.000Z' } };
  assert.equal((await workshop.importZhihuSearch(refreshed, undefined, 'test-owner')).id, project.id);
  const search = { ...source, origin: { ...source.origin!, contentScope: 'search-excerpt' as const } };
  assert.notEqual(hashSource(source), hashSource(search));
  assert.notEqual(hashSource(source), hashSource({ ...source, origin: { ...source.origin!, contentScope: 'webpage-selection' } }));
  assert.notEqual((await workshop.importZhihuSearch(search, undefined, 'test-owner')).id, project.id);
  // Existing search records keep their pre-favorites hashes for durable deduplication.
  assert.equal(hashSource(search), createHash('sha256').update(JSON.stringify({ title: search.title, author: search.author, text: search.text, scope: search.scope, zhihuSearchUrl: search.origin.sourceUrl })).digest('hex'));
  await assert.rejects(workshop.import(source), { code: 'INVALID_SCOPE' });
});

test('favorite source import requires at least 80 real characters and does not pad short summaries', async context => {
  const root = await mkdtemp(join(tmpdir(), 'favorite-length-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const workshop = new StoryWorkshop(root);
  for (const text of ['', '摘'.repeat(79), `\n ${'摘'.repeat(79)} \n`]) {
    await assert.rejects(workshop.importZhihuSearch({ ...source, text }), { code: 'INVALID_SOURCE' });
  }
  assert.equal((await workshop.list()).length, 0);
  const text = `\uFEFF\r\n${'摘'.repeat(80)} `;
  const project = await workshop.importZhihuSearch({ ...source, text });
  assert.equal((await workshop.source(project.id)).text, text);
});

test('favorite summaries retain their disclosure and canonical link in generation inputs and source labels', () => {
  assert.equal(sourceScopeLabel(source.scope, source.origin), '知乎收藏摘要');
  assert.equal(sourceReadingUrl(source), source.origin!.sourceUrl);
  for (const prompt of [outlinePrompt(source), fastStoryPrompt(source)]) {
    assert.ok(prompt.includes('"contentScope":"favorite-summary"'));
    assert.ok(prompt.includes('知乎收藏接口'));
    assert.ok(prompt.includes('并非完整原文'));
    assert.ok(prompt.includes(source.origin!.sourceUrl));
  }
});
