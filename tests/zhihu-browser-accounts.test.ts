import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';
import express from 'express';
import { createZhihuAccountBrowserRouter, ZhihuBrowserAccounts, zhihuBrowserAccountKey } from '../server/zhihu-browser-accounts.ts';
import { ZhihuBrowserError, ZhihuBrowserService } from '../server/zhihu-browser.ts';
import { ZhihuDiscoveryService } from '../server/zhihu-discovery.ts';
import { WorkshopError } from '../server/story-workshop.ts';
import type { ZhihuBrowserFrame } from '../shared/zhihu-browser.ts';

const root = join(tmpdir(), `zhihu-account-browsers-${randomUUID()}`);
const discovery = (owner: string) => ({ capturePage: async (post: unknown) => ({ owner, post }) }) as unknown as ZhihuDiscoveryService;
function closed(): ZhihuBrowserFrame { return { status: 'closed', frameId: '', url: '', title: '', width: 1100, height: 720, capturedAt: '', posts: [] }; }

test('unopened accounts remain lazy, reject missing identities and cannot select filesystem paths', async () => {
  let created = 0;
  const manager = new ZhihuBrowserAccounts({ root, createService: () => { created++; throw new Error('must stay lazy'); } });
  try {
    assert.equal((await manager.frame('account-a')).status, 'closed');
    assert.equal((await manager.close('account-a')).status, 'closed');
    assert.equal(created, 0);
    await assert.rejects(manager.frame(''), { code: 'AUTH_REQUIRED' });
    assert.throws(() => manager.action('account-a', { kind: 'reload' }), { code: 'BROWSER_CLOSED' });
    assert.match(zhihuBrowserAccountKey('../../other-account'), /^[a-f0-9]{64}$/);
    assert.notEqual(zhihuBrowserAccountKey('account-a'), zhihuBrowserAccountKey('account-b'));
  } finally { await manager.closeAll(); }
});

test('router binds renderer snapshots and captured answers to server account identity', async () => {
  const profiles = new Set<string>();
  const browsers = new Map<string, ZhihuBrowserService>();
  const manager = new ZhihuBrowserAccounts({ root, createService: (scopedDiscovery, profile) => {
    profiles.add(profile);
    const service = new ZhihuBrowserService(scopedDiscovery, profile);
    browsers.set(profile, service);
    service.open = async options => {
      assert.equal(options?.channel, 'chromium');
      const frameId = randomUUID(), postId = randomUUID();
      const post = { title: '当前账号的选篇', author: '原作者', sourceUrl: 'https://www.zhihu.com/question/123456/answer/654321', text: profile, visibleScope: 'expanded' };
      const frame: ZhihuBrowserFrame = { ...closed(), status: 'ready', frameId, posts: [{ id: postId, title: post.title, author: post.author, sourceUrl: post.sourceUrl, excerpt: post.text, characters: post.text.length }] };
      Reflect.set(service, 'page', { isClosed: () => false });
      Reflect.set(service, 'snapshot', async () => frame);
      Reflect.set(service, 'documents', new Map([[frameId, new Set([postId])]]));
      Reflect.set(service, 'capturedPosts', new Map([[postId, post]]));
      return frame;
    };
    return service;
  } });
  const app = express();
  app.use(express.json());
  // The real app supplies this identity from its verified OAuth session.
  app.use('/browser', createZhihuAccountBrowserRouter(manager, request => request.get('test-account') || '', request => discovery(request.get('test-account')!)));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address() as { port: number };
  const request = (account: string, path: string, body?: unknown) => fetch(`http://127.0.0.1:${address.port}/browser${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'test-account': account, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  try {
    const alice = await (await request('alice', '/open', { channel: 'msedge', accountId: 'bob' })).json() as ZhihuBrowserFrame;
    assert.equal((await (await request('bob', '/frame')).json()).status, 'closed');
    const bob = await (await request('bob', '/open', {})).json() as ZhihuBrowserFrame;
    assert.equal(profiles.size, 2);
    assert.equal(browsers.size, 2);
    assert.notEqual(alice.frameId, bob.frameId);
    assert.equal((await (await request('alice', '/frame')).json()).frameId, alice.frameId);
    assert.equal((await (await request('bob', '/frame')).json()).frameId, bob.frameId);
    const captureAlice = { frameId: alice.frameId, postId: alice.posts[0].id };
    const denied = await request('bob', '/capture', { ...captureAlice, accountId: 'alice' });
    assert.equal(denied.status, 409);
    assert.equal((await denied.json()).error.code, 'STALE_BROWSER_POST');
    const accepted = await request('alice', '/capture', captureAlice);
    assert.equal(accepted.status, 201);
    assert.equal((await accepted.json()).owner, 'alice');
    await request('alice', '/close', {});
    assert.equal((await (await request('alice', '/frame')).json()).status, 'closed');
    assert.equal((await (await request('bob', '/frame')).json()).frameId, bob.frameId);
  } finally { await manager.closeAll(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('concurrent openings reserve a bounded slot and idle cleanup preserves per-account profile choice', async () => {
  let now = 0, releaseOpen!: () => void, startOpen!: () => void, closedCount = 0;
  const pendingOpen = new Promise<void>(resolve => { releaseOpen = resolve; });
  const started = new Promise<void>(resolve => { startOpen = resolve; });
  const profiles: string[] = [];
  const manager = new ZhihuBrowserAccounts({ root, maxActive: 1, idleMs: 1000, now: () => now, createService: (_discovery, profile) => {
    profiles.push(profile);
    return { open: async () => { startOpen(); await pendingOpen; return closed(); }, frame: async () => closed(), action: async () => closed(), capture: async () => { throw new Error('unused'); }, captureCandidate: async () => { throw new Error('unused'); }, close: async () => { closedCount++; return closed(); } };
  } });
  try {
    const alice = manager.open('alice', discovery('alice'));
    await started;
    now = 2000;
    // A slow active request must not be evicted even after the idle threshold.
    await assert.rejects(manager.open('bob', discovery('bob')), { code: 'BROWSER_CAPACITY' });
    assert.equal(closedCount, 0);
    releaseOpen(); await alice;
    now = 3001;
    await manager.sweepIdle();
    assert.equal(closedCount, 1);
    await manager.open('bob', discovery('bob'));
    assert.notEqual(profiles[0], profiles[1]);
    await manager.close('bob');
    await manager.open('alice', discovery('alice'));
    assert.equal(profiles[0], profiles[2]);
  } finally { await manager.closeAll(); }
  await assert.rejects(manager.open('alice', discovery('alice')), { code: 'BROWSER_UNAVAILABLE' });
});

test('failed launches release their slot immediately without exposing another user browser', async () => {
  let fail = true;
  const manager = new ZhihuBrowserAccounts({ root, maxActive: 1, createService: () => ({
    open: async () => { if (fail) { fail = false; throw new ZhihuBrowserError('BROWSER_START_FAILED', 'unavailable', 503); } return closed(); },
    frame: async () => closed(), action: async () => closed(), capture: async () => { throw new Error('unused'); }, captureCandidate: async () => { throw new Error('unused'); }, close: async () => closed(),
  }) });
  try {
    await assert.rejects(manager.open('alice', discovery('alice')), { code: 'BROWSER_START_FAILED' });
    assert.equal((await manager.open('bob', discovery('bob'))).status, 'closed');
    assert.equal((await manager.frame('alice')).status, 'closed');
  } finally { await manager.closeAll(); }
});

test('a renderer closed outside the manager releases capacity and reconnects to its own saved profile', async () => {
  const profiles: string[] = [];
  let rendererClosed = false;
  const manager = new ZhihuBrowserAccounts({ root, maxActive: 1, createService: (_discovery, profile) => {
    profiles.push(profile);
    return {
      open: async () => ({ ...closed(), status: 'ready' }),
      frame: async () => ({ ...closed(), status: rendererClosed ? 'closed' : 'ready' }),
      action: async () => closed(), capture: async () => { throw new Error('unused'); }, captureCandidate: async () => { throw new Error('unused'); }, close: async () => closed(),
    };
  } });
  try {
    await manager.open('alice', discovery('alice'));
    rendererClosed = true;
    assert.equal((await manager.frame('alice')).status, 'closed');
    rendererClosed = false;
    await manager.open('bob', discovery('bob'));
    assert.notEqual(profiles[0], profiles[1]);
    await manager.close('bob');
    await manager.open('alice', discovery('alice'));
    assert.equal(profiles[0], profiles[2]);
  } finally { await manager.closeAll(); }
});

function unusedBrowserOperations() {
  return {
    open: async () => { throw new Error('capture must not navigate the visible page through open'); },
    frame: async () => closed(), action: async () => closed(),
    capture: async () => { throw new Error('unused native capture'); },
    close: async () => closed(),
  };
}
async function candidateSources(t: { after: (cleanup: () => Promise<void>) => void }) {
  const temporary = await mkdtemp(join(tmpdir(), 'zhihu-owned-candidates-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const sources = new Map(['alice', 'bob'].map(owner => [owner, new ZhihuDiscoveryService(join(temporary, owner), async () => { throw new Error('No official API calls in this test'); })]));
  const candidate = await sources.get('alice')!.capturePage({ title: '未展开的回答', author: '测试作者', sourceUrl: 'https://www.zhihu.com/question/123456/answer/654321', text: 'Alice 自己看到的节选…' });
  return { sources, candidate };
}

test('candidate capture lazily creates only the authenticated owner renderer after verifying its saved source', async t => {
  const { sources, candidate } = await candidateSources(t);
  const profiles: string[] = [], reads: string[] = [];
  const manager = new ZhihuBrowserAccounts({ root, createService: (scopedDiscovery, profile) => {
    profiles.push(profile);
    return { ...unusedBrowserOperations(), captureCandidate: async id => {
      const source = await scopedDiscovery.source(id); reads.push(source.text);
      return scopedDiscovery.capturePage({ title: source.title, author: source.author, sourceUrl: source.origin!.sourceUrl, text: '这是测试页面展开后的完整回答正文。' }, { visibleScope: 'expanded' });
    } };
  } });
  try {
    await assert.rejects(manager.captureCandidate('', sources.get('alice')!, candidate.id), { code: 'AUTH_REQUIRED' });
    await assert.rejects(manager.captureCandidate('bob', sources.get('bob')!, candidate.id), { code: 'CANDIDATE_NOT_FOUND' });
    await assert.rejects(manager.captureCandidate('alice', sources.get('alice')!, '../not-a-candidate'), { code: 'INVALID_CANDIDATE' });
    assert.equal(profiles.length, 0, 'missing, invalid or another account candidate never starts a renderer');
    assert.equal((await manager.frame('alice')).status, 'closed');
    const full = await manager.captureCandidate('alice', sources.get('alice')!, candidate.id);
    assert.equal(full.origin.webpageScope, 'expanded');
    assert.equal(full.excerpt, '这是测试页面展开后的完整回答正文。');
    assert.equal(profiles[0], join(root, zhihuBrowserAccountKey('alice'), 'profile'));
    assert.deepEqual(reads, [candidate.excerpt]);
    await assert.rejects(sources.get('bob')!.source(full.id), { code: 'CANDIDATE_NOT_FOUND' });
  } finally { await manager.closeAll(); }
});

test('candidate router ignores client account and URL substitutions and binds saved prose to its owner', async t => {
  const { sources, candidate } = await candidateSources(t);
  const profiles: string[] = [];
  const manager = new ZhihuBrowserAccounts({ root, createService: (scopedDiscovery, profile) => {
    profiles.push(profile);
    return { ...unusedBrowserOperations(), captureCandidate: async id => {
      const source = await scopedDiscovery.source(id);
      return scopedDiscovery.capturePage({ title: source.title, author: source.author, sourceUrl: source.origin!.sourceUrl, text: '仅从当前账号保存的回答地址获取到的测试全文。' }, { visibleScope: 'expanded' });
    } };
  } });
  const app = express(); app.use(express.json());
  app.use('/browser', createZhihuAccountBrowserRouter(manager, request => request.get('test-account') || '', request => sources.get(request.get('test-account')!)!));
  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    if (!(error instanceof WorkshopError)) { response.sendStatus(500); return; }
    response.status(error.status).json({ error: { code: error.code } });
  });
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(yes => server.once('listening', yes));
  const port = (server.address() as { port: number }).port;
  const post = (owner: string, body: unknown) => fetch(`http://127.0.0.1:${port}/browser/capture-candidate`, { method: 'POST', headers: { 'test-account': owner, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const denied = await post('bob', { candidateId: candidate.id, accountId: 'alice', sourceUrl: candidate.origin.sourceUrl });
    assert.equal(denied.status, 404); assert.equal((await denied.json()).error.code, 'CANDIDATE_NOT_FOUND'); assert.equal(profiles.length, 0);
    const accepted = await post('alice', { candidateId: candidate.id, accountId: 'bob', sourceUrl: 'https://evil.test/', text: 'client replacement' });
    assert.equal(accepted.status, 201);
    const full = await accepted.json();
    assert.equal(full.origin.sourceUrl, candidate.origin.sourceUrl);
    assert.equal(full.excerpt, '仅从当前账号保存的回答地址获取到的测试全文。');
    assert.equal(profiles[0], join(root, zhihuBrowserAccountKey('alice'), 'profile'));
  } finally { await manager.closeAll(); await new Promise<void>(yes => server.close(() => yes())); }
});

test('background candidate reads reserve bounded slots, remain active during idle sweep and release failed launches', async t => {
  const { sources, candidate } = await candidateSources(t);
  const bob = await sources.get('bob')!.capturePage({ title: candidate.title, author: candidate.author, sourceUrl: candidate.origin.sourceUrl, text: 'Bob 自己看到的节选…' });
  let now = 0, finishRead!: () => void, startRead!: () => void, closes = 0;
  const pending = new Promise<void>(yes => { finishRead = yes; });
  const entered = new Promise<void>(yes => { startRead = yes; });
  const profiles: string[] = [];
  let fail = false;
  const manager = new ZhihuBrowserAccounts({ root, maxActive: 1, idleMs: 1000, now: () => now, createService: (scopedDiscovery, profile) => {
    profiles.push(profile);
    return { ...unusedBrowserOperations(), captureCandidate: async id => {
      if (fail) { fail = false; throw new ZhihuBrowserError('BROWSER_START_FAILED', 'fixture launch failure', 503); }
      startRead(); await pending;
      const source = await scopedDiscovery.source(id);
      return scopedDiscovery.capturePage({ title: source.title, author: source.author, sourceUrl: source.origin!.sourceUrl, text: '测试展开正文' }, { visibleScope: 'expanded' });
    }, close: async () => { closes++; return closed(); } };
  } });
  try {
    const reading = manager.captureCandidate('alice', sources.get('alice')!, candidate.id); await entered;
    now = 2000; await manager.sweepIdle(); assert.equal(closes, 0);
    await assert.rejects(manager.captureCandidate('bob', sources.get('bob')!, bob.id), { code: 'BROWSER_CAPACITY' });
    finishRead(); await reading;
    now = 3001; await manager.sweepIdle(); assert.equal(closes, 1);
    fail = true;
    await assert.rejects(manager.captureCandidate('bob', sources.get('bob')!, bob.id), { code: 'BROWSER_START_FAILED' });
    assert.equal(closes, 2, 'launch failure immediately releases the one available slot');
    const result = await manager.captureCandidate('alice', sources.get('alice')!, candidate.id);
    assert.equal(result.origin.webpageScope, 'expanded'); assert.equal(profiles[0], profiles[2]); assert.notEqual(profiles[0], profiles[1]);
  } finally { finishRead(); await manager.closeAll(); }
});

test('already saved expanded candidates never reserve account browser capacity', async t => {
  const { sources, candidate } = await candidateSources(t);
  const full = await sources.get('alice')!.capturePage({ title: candidate.title, author: candidate.author, sourceUrl: candidate.origin.sourceUrl, text: '当前账号已经保存的展开正文。' }, { visibleScope: 'expanded' });
  let creations = 0;
  const manager = new ZhihuBrowserAccounts({ root, maxActive: 1, createService: () => { creations++; throw new Error('expanded cache must not create a browser'); } });
  try {
    assert.equal((await manager.captureCandidate('alice', sources.get('alice')!, full.id)).id, full.id);
    assert.equal(creations, 0); assert.equal((await manager.frame('alice')).status, 'closed');
    await assert.rejects(manager.captureCandidate('bob', sources.get('bob')!, full.id), { code: 'CANDIDATE_NOT_FOUND' });
    assert.equal(creations, 0);
  } finally { await manager.closeAll(); }
});
