import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import {
  createArtworkLoader, isArtworkAbort,
  type ArtworkImage, type ArtworkLoaderOptions, type ArtworkNetworkInfo,
} from '../src/art-loader.ts';

class FakeImage implements ArtworkImage {
  onload: ArtworkImage['onload'] = null;
  onerror: ArtworkImage['onerror'] = null;
  decoding = '';
  referrerPolicy = '';
  fetchPriority = '';
  naturalWidth = 100;
  naturalHeight = 100;
  value = '';
  decode = () => Promise.resolve();
  constructor(private requests: string[]) {}
  set src(source: string) { this.value = source; this.requests.push(source); }
  get src() { return this.value; }
  removeAttribute(name: string) { if (name === 'src') this.value = ''; }
  async succeed() { this.onload?.(new Event('load')); await tick(); }
  fail() { this.onerror?.(new Event('error')); }
}

const tick = () => new Promise<void>(resolve => setImmediate(resolve));

function fixture(t: TestContext, options: ArtworkLoaderOptions = {}) {
  const requests: string[] = [];
  const images: FakeImage[] = [];
  const loader = createArtworkLoader({
    getNetworkInfo: () => ({ effectiveType: '4g', downlink: 10 }),
    requestTimeoutMs: 0,
    ...options,
    createImage: () => { const image = new FakeImage(requests); images.push(image); return image; },
  });
  t.after(() => loader.reset());
  function imageFor(source: string) {
    const image = [...images].reverse().find(candidate => candidate.src === source);
    assert.ok(image, `${source} must have an active image request`);
    return image;
  }
  return { loader, requests, images, imageFor };
}

test('a shared download can be promoted and one released subscriber cannot cancel another', async t => {
  const { loader, imageFor, requests } = fixture(t);
  const speculative = loader.acquire('/portrait.png', { priority: 'prefetch' });
  const visible = loader.acquire('/portrait.png', { priority: 'critical' });
  assert.deepEqual(requests, ['/portrait.png']);
  assert.equal(imageFor('/portrait.png').fetchPriority, 'high');
  speculative.release();
  await assert.rejects(speculative.promise, isArtworkAbort);
  assert.equal(imageFor('/portrait.png').src, '/portrait.png');
  await imageFor('/portrait.png').succeed();
  assert.deepEqual(await visible.promise, { width: 100, height: 100, displaySource: '/portrait.png', cacheable: true });
  visible.release();
  const cached = loader.acquire('/portrait.png');
  await cached.promise;
  assert.equal(requests.length, 1);
});

test('critical work preempts lower priorities and every paused lease resumes in priority order', async t => {
  const { loader, requests, imageFor } = fixture(t, { maxConcurrent: 1 });
  const later = loader.acquire('/next-scene.png', { priority: 'prefetch' });
  const initialSpeculation = imageFor('/next-scene.png');
  const cover = loader.acquire('/cover.png', { priority: 'visible' });
  assert.equal(initialSpeculation.src, '');
  const initialCover = imageFor('/cover.png');
  const current = loader.acquire('/current-scene.png', { priority: 'critical' });
  assert.equal(initialCover.src, '');
  assert.equal(loader.snapshot().loading, 1);
  await imageFor('/current-scene.png').succeed();
  await current.promise;
  await imageFor('/cover.png').succeed();
  await cover.promise;
  await imageFor('/next-scene.png').succeed();
  await later.promise;
  assert.deepEqual(requests, ['/next-scene.png', '/cover.png', '/current-scene.png', '/cover.png', '/next-scene.png']);
  assert.equal(loader.snapshot().queued, 0);
});

test('speculation waits for foreground decoding and never occupies more than one connection', async t => {
  const { loader, requests, imageFor } = fixture(t);
  const current = loader.acquire('/current.png', { priority: 'critical' });
  const next = loader.acquire('/next.png', { priority: 'prefetch' });
  loader.acquire('/later.png', { priority: 'prefetch' });
  let finishDecode!: () => void;
  imageFor('/current.png').decode = () => new Promise(resolve => { finishDecode = resolve; });
  await imageFor('/current.png').succeed();
  assert.deepEqual(requests, ['/current.png']);
  finishDecode();
  await current.promise;
  assert.deepEqual(requests, ['/current.png', '/next.png']);
  await imageFor('/next.png').succeed();
  await next.promise;
  assert.deepEqual(requests, ['/current.png', '/next.png', '/later.png']);
});

test('critical art owns bandwidth despite free slots, then resumes visible art before speculation', async t => {
  const { loader, requests, imageFor } = fixture(t, { maxConcurrent: 4 });
  const cover = loader.acquire('/cover.png', { priority: 'visible' });
  const initialCover = imageFor('/cover.png');
  const background = loader.acquire('/background.png', { priority: 'critical' });
  const portrait = loader.acquire('/portrait.png', { priority: 'critical' });
  const reference = loader.acquire('/reference.png', { priority: 'visible' });
  const next = loader.acquire('/next.png', { priority: 'prefetch' });
  assert.equal(initialCover.src, '');
  assert.deepEqual(requests, ['/cover.png', '/background.png', '/portrait.png']);
  assert.equal(loader.snapshot().loading, 2, 'both current scene images share the critical stage');
  await imageFor('/background.png').succeed();
  await background.promise;
  let finishDecode!: () => void;
  imageFor('/portrait.png').decode = () => new Promise(resolve => { finishDecode = resolve; });
  await imageFor('/portrait.png').succeed();
  assert.deepEqual(requests, ['/cover.png', '/background.png', '/portrait.png'], 'free slots remain unused until the entire current frame is decoded');
  finishDecode();
  await portrait.promise;
  assert.deepEqual(requests, ['/cover.png', '/background.png', '/portrait.png', '/cover.png', '/reference.png']);
  await imageFor('/cover.png').succeed();
  await cover.promise;
  assert.equal(requests.includes('/next.png'), false);
  await imageFor('/reference.png').succeed();
  await reference.promise;
  await imageFor('/next.png').succeed();
  await next.promise;
  assert.equal(loader.snapshot().queued, 0);
});

test('Save-Data and 2G suppress speculation but promotion always allows the actual frame', async t => {
  for (const info of [{ saveData: true }, { effectiveType: '2g' }, { downlink: 0.3 }]) {
    const { loader, requests, imageFor } = fixture(t, { getNetworkInfo: () => info });
    const next = loader.acquire('/next.png', { priority: 'prefetch' });
    assert.deepEqual(requests, []);
    next.setPriority('critical');
    await imageFor('/next.png').succeed();
    assert.equal((await next.promise).width, 100);
  }
});

test('a network policy change pauses existing speculation and resumes it when allowed', async t => {
  let network: ArtworkNetworkInfo = { effectiveType: '4g' };
  const { loader, imageFor, requests } = fixture(t, { getNetworkInfo: () => network });
  const next = loader.acquire('/next.png', { priority: 'prefetch' });
  const firstAttempt = imageFor('/next.png');
  network = { saveData: true };
  loader.refreshPolicy();
  assert.equal(firstAttempt.src, '');
  assert.equal(loader.snapshot().loading, 0);
  network = { effectiveType: '4g' };
  loader.refreshPolicy();
  await imageFor('/next.png').succeed();
  await next.promise;
  assert.deepEqual(requests, ['/next.png', '/next.png']);
});

test('the final release cancels queued and decoding work, and late decoding cannot populate cache', async t => {
  const { loader, imageFor, requests } = fixture(t, { maxConcurrent: 1 });
  const current = loader.acquire('/current.png', { priority: 'critical' });
  const queued = loader.acquire('/queued.png');
  queued.release();
  await assert.rejects(queued.promise, isArtworkAbort);
  let finishDecode!: () => void;
  const oldImage = imageFor('/current.png');
  oldImage.decode = () => new Promise(resolve => { finishDecode = resolve; });
  await oldImage.succeed();
  current.release();
  await assert.rejects(current.promise, isArtworkAbort);
  finishDecode();
  await tick();
  assert.equal(loader.snapshot().ready, 0);
  assert.equal(oldImage.src, '');
  const retry = loader.acquire('/current.png');
  await imageFor('/current.png').succeed();
  await retry.promise;
  assert.deepEqual(requests, ['/current.png', '/current.png']);
});

test('network and decode failures are retryable and do not block the queue', async t => {
  const { loader, imageFor, requests } = fixture(t, { maxConcurrent: 1 });
  const broken = loader.acquire('/broken.png');
  const next = loader.acquire('/next.png');
  imageFor('/broken.png').fail();
  await assert.rejects(broken.promise, /could not be loaded/);
  await imageFor('/next.png').succeed();
  await next.promise;
  const badDecode = loader.acquire('/broken.png');
  imageFor('/broken.png').decode = () => Promise.reject(new Error('invalid image bytes'));
  await imageFor('/broken.png').succeed();
  await assert.rejects(badDecode.promise, /invalid image bytes/);
  const repaired = loader.acquire('/broken.png');
  await imageFor('/broken.png').succeed();
  await repaired.promise;
  assert.equal(requests.filter(source => source === '/broken.png').length, 3);
});

test('decoded LRU eviction counts bytes, retains displayed images and honors cache entry limits', async t => {
  const { loader, requests, imageFor } = fixture(t, { maxDecodedBytes: 80_000, maxCacheEntries: 2 });
  async function ready(source: string) {
    const lease = loader.acquire(source);
    await imageFor(source).succeed();
    await lease.promise;
    return lease;
  }
  const pinned = await ready('/pinned.png');
  const older = await ready('/older.png');
  older.release();
  const newer = await ready('/newer.png');
  newer.release();
  assert.equal(loader.snapshot().retainedBytes, 80_000);
  assert.equal(loader.snapshot().ready, 2);
  assert.equal((await loader.acquire('/pinned.png').promise).width, 100);
  const evicted = loader.acquire('/older.png');
  await imageFor('/older.png').succeed();
  await evicted.promise;
  assert.equal(requests.filter(source => source === '/pinned.png').length, 1);
  assert.equal(requests.filter(source => source === '/older.png').length, 2);
  pinned.release();
});

function fetchFixture(t: TestContext, options: ArtworkLoaderOptions = {}) {
  const fetches: { source: string; init: RequestInit; resolve: (response: Response) => void; reject: (error: Error) => void }[] = [];
  const blobs = new Map<string, Blob>();
  const revoked: string[] = [];
  let blobId = 0;
  const base = fixture(t, {
    getBaseUrl: () => 'https://game.example/library',
    fetch: ((source: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
      fetches.push({ source: String(source), init: init ?? {}, resolve, reject });
      init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
    })) as typeof fetch,
    createObjectURL: blob => { const url = `blob:art-${++blobId}`; blobs.set(url, blob); return url; },
    revokeObjectURL: url => { revoked.push(url); blobs.delete(url); },
    ...options,
  });
  return { ...base, fetches, blobs, revoked };
}

test('same-origin art downloads once, decodes its reusable blob and includes account cookies', async t => {
  const { loader, fetches, imageFor, requests } = fetchFixture(t);
  const first = loader.acquire('/generated-art/scene.png', { priority: 'critical' });
  const second = loader.acquire('https://game.example/generated-art/scene.png');
  assert.equal(fetches.length, 1);
  assert.equal(fetches[0].init.credentials, 'same-origin');
  assert.equal(fetches[0].init.referrerPolicy, 'no-referrer');
  assert.equal((fetches[0].init as RequestInit & { priority: string }).priority, 'high');
  fetches[0].resolve(new Response('image bytes', { headers: { 'Content-Type': 'image/png' } }));
  await tick();
  assert.deepEqual(requests, ['blob:art-1']);
  assert.equal(imageFor('blob:art-1').referrerPolicy, 'no-referrer');
  await imageFor('blob:art-1').succeed();
  assert.equal((await first.promise).displaySource, 'blob:art-1');
  assert.deepEqual(await first.promise, await second.promise);
});

test('preempting a fetch aborts its HTTP request without rejecting its eventual consumer', async t => {
  const { loader, fetches, imageFor } = fetchFixture(t);
  const next = loader.acquire('/next.png', { priority: 'prefetch' });
  const current = loader.acquire('/current.png', { priority: 'critical' });
  assert.equal(fetches[0].init.signal?.aborted, true);
  fetches[1].resolve(new Response('current'));
  await tick();
  await imageFor('blob:art-1').succeed();
  await current.promise;
  assert.equal(fetches.length, 3);
  assert.equal(fetches[2].source, '/next.png');
  fetches[2].resolve(new Response('next'));
  await tick();
  await imageFor('blob:art-2').succeed();
  assert.equal((await next.promise).displaySource, 'blob:art-2');
});

test('private no-store blobs are shared only while displayed and revoked on final release', async t => {
  const { loader, fetches, imageFor, revoked } = fetchFixture(t);
  const first = loader.acquire('/generated-art/workshop/private.png');
  const second = loader.acquire('/generated-art/workshop/private.png');
  fetches[0].resolve(new Response('private', { headers: { 'Cache-Control': 'private, no-store' } }));
  await tick();
  await imageFor('blob:art-1').succeed();
  await first.promise;
  await second.promise;
  assert.equal((await first.promise).cacheable, false);
  first.release();
  assert.deepEqual(revoked, []);
  second.release();
  assert.deepEqual(revoked, ['blob:art-1']);
  assert.equal(loader.snapshot().ready, 0);
  loader.acquire('/generated-art/workshop/private.png');
  assert.equal(fetches.length, 2);
});

test('account reset aborts old downloads, revokes displayed blobs and discards late response bodies', async t => {
  const { loader, fetches, imageFor, revoked, blobs } = fetchFixture(t);
  const displayed = loader.acquire('/displayed.png');
  fetches[0].resolve(new Response('public'));
  await tick();
  await imageFor('blob:art-1').succeed();
  await displayed.promise;
  let finishBody!: (blob: Blob) => void;
  const inFlight = loader.acquire('/private.png');
  const response = new Response(null);
  response.blob = () => new Promise(resolve => { finishBody = resolve; });
  fetches[1].resolve(response);
  await tick();
  loader.reset();
  await assert.rejects(inFlight.promise, isArtworkAbort);
  assert.equal(fetches[1].init.signal?.aborted, true);
  finishBody(new Blob(['late private bytes']));
  await tick();
  assert.deepEqual(revoked, ['blob:art-1']);
  assert.equal(blobs.size, 0);
  assert.deepEqual(loader.snapshot(), { queued: 0, loading: 0, ready: 0, retainedBytes: 0 });
});

test('external non-CORS cover images keep the browser image transport', async t => {
  const { loader, fetches, imageFor } = fetchFixture(t);
  const external = loader.acquire('https://external.example/cover.png');
  assert.equal(fetches.length, 0);
  await imageFor('https://external.example/cover.png').succeed();
  assert.equal((await external.promise).displaySource, 'https://external.example/cover.png');
});

test('large images can transfer beyond the watchdog interval while new bytes keep arriving', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { loader, fetches, imageFor } = fetchFixture(t, { requestTimeoutMs: 50 });
  const current = loader.acquire('/large-original.png', { priority: 'critical' });
  let stream!: ReadableStreamDefaultController<Uint8Array>;
  fetches[0].resolve(new Response(new ReadableStream({ start(controller) { stream = controller; } }), {
    headers: { 'Content-Type': 'image/png' },
  }));
  await tick();
  for (let chunk = 0; chunk < 4; chunk++) {
    t.mock.timers.tick(40);
    stream.enqueue(new Uint8Array([chunk]));
    await tick();
    assert.equal(fetches[0].init.signal?.aborted, false);
  }
  stream.close();
  await tick();
  await imageFor('blob:art-1').succeed();
  assert.equal((await current.promise).displaySource, 'blob:art-1');
});

test('a stalled request times out and frees its foreground slot', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { loader, fetches } = fetchFixture(t, { requestTimeoutMs: 50, maxConcurrent: 1 });
  const stalled = loader.acquire('/stalled.png', { priority: 'critical' });
  loader.acquire('/next.png', { priority: 'visible' });
  t.mock.timers.tick(51);
  await assert.rejects(stalled.promise, /timed out/);
  assert.equal(fetches[0].init.signal?.aborted, true);
  assert.equal(fetches[1].source, '/next.png');
});

test('cache entry limits evict small icons even when the memory budget is not reached', async t => {
  const { loader, requests, imageFor } = fixture(t, { maxCacheEntries: 1, maxDecodedBytes: 1_000_000 });
  for (const source of ['/first-icon.png', '/second-icon.png']) {
    const lease = loader.acquire(source);
    await imageFor(source).succeed();
    await lease.promise;
    lease.release();
  }
  assert.equal(loader.snapshot().ready, 1);
  loader.acquire('/first-icon.png');
  assert.deepEqual(requests, ['/first-icon.png', '/second-icon.png', '/first-icon.png']);
});
