import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { parseZhihuCandidates, ZhihuDiscoveryService } from '../server/zhihu-discovery.ts';
import { canonicalZhihuSource } from '../shared/zhihu-discovery.ts';
import { StoryWorkshop, hashSource, writeJson } from '../server/story-workshop.ts';
import { createApp } from '../server/app.ts';
import { originalSeed } from '../shared/workshop.ts';

// Small synthetic SOURCE fixture only, never a production story or model result.
const exact = `\uFEFF\r\n${'值班人把名单放在灯下，发现纸背留着一行陌生字迹。'.repeat(5)}\r\n<script>inert</script> `;
const raw = { Code: 0, Data: { Items: [{ Title: '仅用于来源测试', AuthorName: '测试作者', ContentText: exact, ContentID: '-999999', Url: 'https://www.zhihu.com/question/12345678/answer/87654321?utm_source=test' }] } };
async function fixture(t: { after: (fn: () => Promise<void>) => void }) { const root = await mkdtemp(join(tmpdir(), 'redleaf-discovery-')); t.after(() => rm(root, { recursive: true, force: true })); return root; }
test('search IDs are taken from canonical real URLs, never opaque signed ContentID', () => {
  const rows = parseZhihuCandidates(raw, '测试', new Date(0).toISOString());
  assert.equal(rows[0].origin.workId, '87654321');
  assert.equal(rows[0].origin.kind, 'zhihu-answer');
  assert.equal(rows[0].excerpt, exact);
  assert.equal(rows[0].origin.contentScope, 'search-excerpt');
  assert.equal(rows[0].origin.sourceUrl, 'https://www.zhihu.com/question/12345678/answer/87654321');
});
test('source parser rejects foreign hosts, credentials, traversal and malformed search responses', () => {
  for (const url of ['http://www.zhihu.com/question/12345678/answer/87654321', 'https://www.zhihu.com.evil.test/p/12345678', 'https://x@zhuanlan.zhihu.com/p/12345678', 'https://zhuanlan.zhihu.com:999/p/12345678', 'https://www.zhihu.com/api/v4/answers/87654321']) assert.throws(() => canonicalZhihuSource(url));
  assert.throws(() => parseZhihuCandidates({ Code: 401 }, '测试', new Date().toISOString()));
  assert.equal(parseZhihuCandidates({ Code: 0, Data: { Items: [{ ...raw.Data.Items[0], Url: 'https://evil.test' }] } }, '测试', new Date().toISOString()).length, 0);
});
test('search errors distinguish provider credentials and quota without exposing upstream messages', () => {
  for (const [response, code, status] of [
    [{ ok: false, error: { code: 'KEYCHAIN_UNAVAILABLE', message: 'private-upstream-value' } }, 'ZHIHU_SEARCH_NOT_CONFIGURED', 503],
    [{ ok: false, error: { code: 'AUTH_REQUIRED' } }, 'ZHIHU_SEARCH_NOT_CONFIGURED', 503],
    [{ ok: false, error: { code: 'AUTH_INVALID' } }, 'ZHIHU_SEARCH_AUTH_FAILED', 503],
    [{ Code: 20001, Message: 'private-upstream-value' }, 'ZHIHU_SEARCH_AUTH_FAILED', 503],
    [{ Code: 30001 }, 'ZHIHU_SEARCH_RATE_LIMITED', 429],
    [{ Code: 30002 }, 'ZHIHU_SEARCH_QUOTA_EXCEEDED', 429],
  ] as const) {
    assert.throws(() => parseZhihuCandidates(response, '测试故事', new Date().toISOString()), (error: any) => {
      assert.equal(error.code, code); assert.equal(error.status, status);
      assert.doesNotMatch(error.message, /private-upstream-value/); return true;
    });
  }
});
test('nonzero CLI JSON failures reach HTTP as actionable errors and retain saved results', { skip: process.platform === 'win32' }, async t => {
  const root = await fixture(t), binary = join(root, 'test search cli');
  // Exercise the real spawn/exit path with a local executable, never the provider.
  await writeFile(binary, `#!${process.execPath}\nconst query = process.argv[process.argv.indexOf('--query') + 1];\nconst missing = query === '缺少凭据';\nconsole.log(JSON.stringify(missing ? { ok: false, error: { code: 'KEYCHAIN_UNAVAILABLE', message: 'private-upstream-value' } } : { Code: 20001, Message: 'private-upstream-value' }));\nprocess.exit(missing ? 7 : 3);\n`, { mode: 0o700 });
  const previous = process.env.ZHIHU_CLI_BIN; process.env.ZHIHU_CLI_BIN = binary;
  t.after(() => { if (previous === undefined) delete process.env.ZHIHU_CLI_BIN; else process.env.ZHIHU_CLI_BIN = previous; });
  const discovery = new ZhihuDiscoveryService(join(root, 'search'));
  const saved = await discovery.capturePage({ title: '已保存的故事', author: '测试作者', text: exact, sourceUrl: raw.Data.Items[0].Url });
  const server = createServer(createApp(undefined, new StoryWorkshop(join(root, 'workshop')), discovery));
  await new Promise<void>(yes => server.listen(0, '127.0.0.1', yes));
  t.after(() => new Promise<void>(yes => { server.closeAllConnections(); server.close(() => yes()); }));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/workshop/discovery`;
  for (const [query, code] of [['缺少凭据', 'ZHIHU_SEARCH_NOT_CONFIGURED'], ['凭据失效', 'ZHIHU_SEARCH_AUTH_FAILED']]) {
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query }) });
    assert.equal(response.status, 503); assert.match(response.headers.get('content-type')!, /application\/json/);
    const data = await response.json(); assert.equal(data.error.code, code);
    assert.doesNotMatch(JSON.stringify(data), /private-upstream-value/);
    assert.equal((await discovery.list()).candidates[0].id, saved.id);
    assert.equal((await discovery.source(saved.id)).text, exact);
  }
});
test('a pasted canonical Zhihu URL resolves through the official search result and preserves the URL', async t => {
  const root = await fixture(t), service = new ZhihuDiscoveryService(root, async () => raw);
  const candidate = await service.resolveUrl('https://www.zhihu.com/question/12345678/answer/87654321?utm_source=app');
  assert.equal(candidate.origin.sourceUrl, 'https://www.zhihu.com/question/12345678/answer/87654321');
  assert.equal(candidate.excerpt, exact);
  await assert.rejects(service.resolveUrl('https://evil.example/story'), { code: 'INVALID_ZHIHU_URL' });
});
test('discovery persists exact source, deduplicates concurrent search and caches the official response', async t => {
  const root = await fixture(t); let calls = 0;
  const service = new ZhihuDiscoveryService(root, async () => { calls++; await new Promise(r => setTimeout(r, 10)); return raw; });
  await Promise.all([service.search('测试故事'), service.search('测试故事')]); assert.equal(calls, 1);
  assert.equal((await service.search('测试故事')).cached, true); assert.equal(calls, 1);
  const copy = new ZhihuDiscoveryService(root, async () => { throw new Error('must not request'); });
  const [candidate] = (await copy.list()).candidates;
  assert.equal((await copy.source(candidate.id)).text, exact);
  await assert.rejects(copy.source('../outside'));
});
test('verified search imports are durable and distinct from manual imports, refresh times do not duplicate jobs', async t => {
  const root = await fixture(t), discovery = new ZhihuDiscoveryService(join(root, 'search'), async () => raw), workshop = new StoryWorkshop(join(root, 'workshop'));
  const [candidate] = (await discovery.search('测试故事')).candidates, source = await discovery.source(candidate.id);
  const a = await workshop.importZhihuSearch(source);
  const b = await workshop.importZhihuSearch({ ...source, origin: { ...source.origin!, fetchedAt: new Date(1).toISOString() } });
  assert.equal(a.id, b.id); assert.deepEqual(await workshop.source(a.id), source);
  assert.equal(a.origin?.kind, 'zhihu-answer'); assert.equal(a.sourceHash, hashSource(source));
  await assert.rejects(workshop.import(source), { code: 'INVALID_SCOPE' });
  const manual = await workshop.import({ title: source.title, author: source.author, text: source.text }); assert.notEqual(a.id, manual.id);
  assert.equal(hashSource(originalSeed), '88c07454f59ab081549a365b0bb789c736f1d6b8d213fd1038d9026c30f259cd');
});
test('a changed search excerpt gets an immutable candidate while previous selections still read their exact bytes', async t => {
  const root = await fixture(t);
  const service = new ZhihuDiscoveryService(root, async query => ({ Code: 0, Data: { Items: [{ ...raw.Data.Items[0], ContentText: query === '新版故事' ? `${exact}\n新增一段。` : exact }] } }));
  const old = (await service.search('旧版故事')).candidates[0];
  const next = (await service.search('新版故事')).candidates[0];
  assert.notEqual(old.id, next.id); assert.notEqual(old.sourceHash, next.sourceHash);
  assert.equal((await service.source(old.id)).text, exact);
  assert.equal((await service.source(next.id)).text, `${exact}\n新增一段。`);
  assert.equal((await service.list()).candidates.length, 1);
});
test('legacy URL-addressed selections remain readable but cannot bypass a present source hash', async t => {
  const root = await fixture(t), service = new ZhihuDiscoveryService(root, async () => raw);
  const candidate = (await service.search('测试故事')).candidates[0];
  const legacyId = createHash('sha256').update(candidate.origin.sourceUrl).digest('hex').slice(0, 32);
  const { sourceHash: _sourceHash, ...legacy } = candidate;
  const file = join(root, 'candidates', `${legacyId}.json`);
  await writeJson(file, { ...legacy, id: legacyId });
  assert.equal((await service.source(legacyId)).text, exact);
  await writeJson(file, { ...legacy, id: legacyId, sourceHash: '0'.repeat(64) });
  await assert.rejects(service.source(legacyId), { code: 'CANDIDATE_INVALID' });
});
test('HTTP search/import only accepts persisted candidates and preserves existing game generation ownership', async t => {
  const root = await fixture(t), discovery = new ZhihuDiscoveryService(join(root, 'search'), async () => raw), workshop = new StoryWorkshop(join(root, 'workshop'));
  const server = createServer(createApp(undefined, workshop, discovery)); await new Promise<void>(yes => server.listen(0, '127.0.0.1', yes));
  t.after(() => new Promise<void>(yes => server.close(() => yes())));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const post = (path: string, body: unknown) => fetch(`${url}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const response = await post('/api/workshop/discovery', { query: '测试故事' }); assert.equal(response.status, 200);
  const candidate = (await response.json()).candidates[0];
  const imported = await post('/api/workshop/discovery/import', { candidateId: candidate.id, text: 'malicious replacement ignored' }); assert.equal(imported.status, 201);
  const project = await imported.json(); assert.equal(project.revision, 0); assert.equal((await workshop.source(project.id)).text, exact);
  project.status = 'running'; project.stage = 'scenes'; project.revision = 1; project.jobId = 'existing-test-worker';
  await workshop.save(project);
  const lock = join(workshop.dir(project.id), 'job.lock'); await mkdir(lock);
  await writeJson(join(lock, 'owner.json'), { token: project.jobId, pid: process.pid, heartbeat: new Date().toISOString() });
  const repeated = await Promise.all(Array.from({ length: 3 }, () => post('/api/workshop/discovery/import', { candidateId: candidate.id, generate: true })));
  for (const response of repeated) {
    assert.equal(response.status, 202);
    const same = await response.json();
    assert.equal(same.id, project.id); assert.equal(same.jobId, project.jobId); assert.equal(same.revision, 1);
  }
  assert.equal((await workshop.list()).length, 1);
  assert.equal((await workshop.source(project.id)).text, exact);
  assert.equal((await post('/api/workshop/discovery/import', { candidateId: 'f'.repeat(32) })).status, 404);
});
