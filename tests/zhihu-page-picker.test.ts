import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readZhihuPageSelection, zhihuPageBookmarklet } from '../src/zhihu-page-picker.ts';
import { ZhihuDiscoveryService } from '../server/zhihu-discovery.ts';
import { hashSource, StoryWorkshop } from '../server/story-workshop.ts';

const selection = { title: '网页选文传输测试', author: '测试作者', text: `\uFEFF\r\n${'失联的人留下半张纸条，窗外的脚步声越来越近。'.repeat(5)}\r\n<script>只是原文</script> `, sourceUrl: 'https://www.zhihu.com/question/12345678/answer/87654321' };
test('browser transfer preserves Unicode, whitespace and literal markup without evaluating it', () => {
  const hash = `#zhihu-page=${encodeURIComponent(JSON.stringify(selection))}`;
  assert.deepEqual(readZhihuPageSelection(hash), selection);
  assert.equal(readZhihuPageSelection('#other'), null);
  assert.throws(() => readZhihuPageSelection('#zhihu-page=%bad'));
  assert.throws(() => zhihuPageBookmarklet('https://outside.example'));
  const bookmark = zhihuPageBookmarklet('http://127.0.0.1:4173');
  assert.ok(bookmark.includes('location.assign'));
  assert.ok(!bookmark.includes('window.open'));
});
test('webpage selection stays exact and distinguishable from an official search excerpt', async t => {
  const root = await mkdtemp(join(tmpdir(), 'zhihu-page-')); t.after(() => rm(root, { recursive: true, force: true }));
  const service = new ZhihuDiscoveryService(join(root, 'discovery'), async () => { throw new Error('Page selection does not search'); });
  const candidate = await service.capturePage(selection), source = await service.source(candidate.id);
  assert.equal(source.text, selection.text); assert.equal(source.origin?.contentScope, 'webpage-selection');
  assert.notEqual(hashSource(source), hashSource({ ...source, origin: { ...source.origin!, contentScope: 'search-excerpt' } }));
  const workshop = new StoryWorkshop(join(root, 'workshop')), project = await workshop.importZhihuSearch(source);
  assert.equal((await workshop.source(project.id)).text, selection.text);
  assert.equal((await workshop.importZhihuSearch(source)).id, project.id);
  assert.equal(project.status, 'idle'); assert.equal(project.jobId, undefined);
  await assert.rejects(service.capturePage({ ...selection, sourceUrl: 'https://outside.example/answer/87654321' }), { code: 'INVALID_ZHIHU_URL' });
  await assert.rejects(service.capturePage({ ...selection, text: 'too short' }), { code: 'INVALID_PAGE_SELECTION' });
});
