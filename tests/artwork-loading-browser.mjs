// Run with: node tests/artwork-loading-browser.mjs
// Real React components + browser requests, without a live server or account.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const project = fileURLToPath(new URL('../', import.meta.url));
const bundled = await build({
  absWorkingDir: project, entryPoints: ['tests/fixtures/artwork-loading-browser.tsx'],
  bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
});
const javascript = bundled.outputFiles[0].contents;
// A fixed transparent 1×1 PNG fixture. No game asset is resized or regenerated.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const requests = new Map();
const aborted = new Map();
const pending = new Map();
const pageErrors = [];
const results = [];
const count = path => requests.get(path) ?? 0;
const abortCount = path => aborted.get(path) ?? 0;

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/fixture.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript' });
    res.end(javascript);
    return;
  }
  if (!url.pathname.startsWith('/art/')) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!doctype html><html><head><style>
      html,body{margin:0;padding:0}.frame{width:180px;height:180px;margin:10px;position:relative}
      .frame img{width:160px;height:160px;object-fit:contain}summary{height:40px}
    </style></head><body><div id="app"></div><script type="module" src="/fixture.js"></script></body></html>`);
    return;
  }
  const path = url.pathname + url.search;
  requests.set(path, count(path) + 1);
  if (url.searchParams.has('missing')) {
    res.writeHead(404, { 'Cache-Control': 'no-store' });
    res.end('missing fixture');
    return;
  }
  res.writeHead(200, {
    'Content-Type': 'image/png', 'Content-Length': png.length,
    'Cache-Control': url.searchParams.has('private') ? 'private, no-store' : 'public, max-age=3600',
  });
  if (url.searchParams.has('slow')) {
    const bucket = pending.get(path) ?? new Set();
    bucket.add(res);
    pending.set(path, bucket);
    req.on('aborted', () => aborted.set(path, abortCount(path) + 1));
    res.on('close', () => { bucket.delete(res); if (!bucket.size) pending.delete(path); });
    res.write(png.subarray(0, 16));
    return;
  }
  res.end(png);
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });

async function eventually(predicate, description) {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, description);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

function finish(path) {
  const responses = [...(pending.get(path) ?? [])];
  assert.ok(responses.length, `${path} has a pending HTTP response`);
  for (const response of responses) response.end(png.subarray(16));
}

async function mount(page, config) {
  await page.evaluate(config => window.renderArtFixture(config), config);
}

async function ready(page, id, source) {
  await page.waitForFunction(({ id, source }) => {
    const image = document.querySelector(`[data-frame="${id}"] img`);
    return image?.dataset.artState === 'ready' && image.naturalWidth === 1
      && (!source || image.dataset.artSource === source);
  }, { id, source }, { timeout: 5000 });
}

async function scenario(name, check) {
  const started = Date.now();
  const page = await browser.newPage({ viewport: { width: 1000, height: 720 } });
  page.on('pageerror', error => pageErrors.push(`${name}: ${error.message}`));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { effectiveType: '4g', downlink: 10, saveData: false, addEventListener() {} },
    });
  });
  // An accidental dependency on a live service should fail the test immediately.
  await page.route('**/*', route => {
    const requestOrigin = new URL(route.request().url()).origin;
    if (requestOrigin !== origin) {
      pageErrors.push(`${name}: unexpected external request ${requestOrigin}`);
      return route.abort();
    }
    return route.continue();
  });
  try {
    await page.goto(origin);
    await page.waitForFunction(() => typeof window.renderArtFixture === 'function');
    await check(page);
    results.push({ name, passed: true, durationMs: Date.now() - started });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, passed: false, error: String(error), durationMs: Date.now() - started });
    console.error(`FAIL ${name}: ${error.message}`);
  } finally {
    await page.close();
  }
}

try {
  await scenario('same-URL key remount keeps one in-flight HTTP request', async page => {
    const source = '/art/remount.png?slow';
    await mount(page, { items: [{ id: 'stage', key: 'first', source, priority: 'critical' }] });
    await eventually(() => count(source) === 1, 'the first scene started loading');
    await mount(page, { items: [{ id: 'stage', key: 'second', source, priority: 'critical' }] });
    await page.waitForTimeout(120);
    assert.equal(count(source), 1);
    assert.equal(abortCount(source), 0);
    finish(source);
    await ready(page, 'stage', source);
  });

  await scenario('prefetch-to-critical handoff reuses the original request', async page => {
    const source = '/art/handoff.png?slow';
    await mount(page, { prefetch: [source] });
    await eventually(() => count(source) === 1, 'prefetch started after its intent delay');
    await mount(page, { items: [{ id: 'stage', source, priority: 'critical' }] });
    await page.waitForTimeout(120);
    assert.equal(count(source), 1);
    assert.equal(abortCount(source), 0);
    finish(source);
    await ready(page, 'stage', source);
  });

  await scenario('completed public and private prefetches both survive handoff without a second download', async page => {
    const sources = ['/art/completed-prefetch.png', '/art/completed-private-prefetch.png?private'];
    for (const [index, source] of sources.entries()) {
      await mount(page, { prefetch: [source] });
      await eventually(() => count(source) === 1, 'prefetch requests the expected source');
      await page.waitForFunction(expected => window.artFixtureSnapshot().ready === expected
        && window.artFixtureSnapshot().loading === 0, index + 1);
      await mount(page, { items: [{ id: 'stage', source, priority: 'critical' }] });
      await ready(page, 'stage', source);
      assert.equal(count(source), 1);
    }
  });

  await scenario('offscreen art waits and appears after scrolling into view', async page => {
    const source = '/art/offscreen.png';
    await mount(page, { items: [{ id: 'below', source, before: 1800 }] });
    await page.waitForTimeout(220);
    assert.equal(count(source), 0);
    await page.locator('[data-frame="below"]').scrollIntoViewIfNeeded();
    await ready(page, 'below', source);
    assert.equal(count(source), 1);
  });

  await scenario('closed details defers its art until opened', async page => {
    const source = '/art/details.png';
    await mount(page, { items: [{ id: 'reference', source, details: true }] });
    await page.waitForTimeout(220);
    assert.equal(count(source), 0);
    await page.locator('summary').click();
    await ready(page, 'reference', source);
    assert.equal(count(source), 1);
  });

  await scenario('scrolling away aborts a slow image without requesting its fallback', async page => {
    const source = '/art/leave-viewport.png?slow';
    const fallback = '/art/leave-viewport-fallback.png';
    await mount(page, { items: [{ id: 'cover', source, fallback }] });
    await eventually(() => count(source) === 1, 'visible cover starts loading');
    await page.evaluate(() => window.scrollTo(0, 1800));
    await eventually(() => abortCount(source) === 1, 'the hidden cover HTTP stream is aborted');
    assert.equal(count(fallback), 0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await eventually(() => count(source) === 2, 'visible again retries the original source');
    finish(source);
    await ready(page, 'cover', source);
    assert.equal(count(fallback), 0);
  });

  await scenario('404 advances to fallback and reports its original source identity', async page => {
    const source = '/art/missing.png?missing';
    const fallback = '/art/fallback.png';
    await mount(page, { items: [{ id: 'portrait', source, fallback, priority: 'critical' }] });
    await ready(page, 'portrait', fallback);
    assert.equal(count(source), 1);
    assert.equal(count(fallback), 1);
    const state = await page.evaluate(() => window.artFixtureStates.filter(state => state.id === 'portrait').at(-1));
    assert.equal(state.requestedSource, source);
    assert.equal(state.source, fallback);
    assert.equal(state.degraded, true);
  });

  await scenario('changing sources aborts stale work and never displays its late result', async page => {
    const old = '/art/old-source.png?slow';
    const fresh = '/art/new-source.png';
    const fallback = '/art/source-switch-fallback.png';
    await mount(page, { items: [{ id: 'portrait', source: old, fallback, priority: 'critical' }] });
    await eventually(() => count(old) === 1, 'old source starts loading');
    await mount(page, { items: [{ id: 'portrait', source: fresh, fallback, priority: 'critical' }] });
    await ready(page, 'portrait', fresh);
    await eventually(() => abortCount(old) === 1, 'old source request is aborted');
    assert.equal(count(fresh), 1);
    assert.equal(count(fallback), 0);
    const staleReady = await page.evaluate(old => window.artFixtureStates.some(state => state.source === old && state.status === 'ready'), old);
    assert.equal(staleReady, false);
  });

  await scenario('inactive artwork context cancels critical art and resumes the same source', async page => {
    const source = '/art/context.png?slow';
    const fallback = '/art/context-fallback.png';
    const items = [{ id: 'stage', source, fallback, priority: 'critical' }];
    await mount(page, { active: false, items });
    await page.waitForTimeout(220);
    assert.equal(count(source), 0);
    await mount(page, { active: true, items });
    await eventually(() => count(source) === 1, 'context activation starts loading');
    await mount(page, { active: false, items });
    await eventually(() => abortCount(source) === 1, 'context deactivation aborts loading');
    assert.equal(count(fallback), 0);
    await mount(page, { active: true, items });
    await eventually(() => count(source) === 2, 'reactivation retries the original source');
    finish(source);
    await ready(page, 'stage', source);
  });

  await scenario('two private images and their DOM display share exactly one HTTP request', async page => {
    const source = '/art/private.png?private';
    await mount(page, { items: [{ id: 'first', source, priority: 'critical' }, { id: 'second', source, priority: 'critical' }] });
    await ready(page, 'first', source);
    await ready(page, 'second', source);
    const before = await page.evaluate(() => [...document.querySelectorAll('.frame img')].map(image => image.src));
    assert.ok(before.every(url => url.startsWith('blob:')));
    assert.equal(before[0], before[1]);
    assert.equal(count(source), 1);
    await mount(page, { items: [{ id: 'second', source, priority: 'critical' }] });
    await ready(page, 'second', source);
    assert.equal(count(source), 1);
    await mount(page, { items: [] });
    await page.waitForFunction(() => window.artFixtureSnapshot().ready === 0);
    const revoked = await page.evaluate(async url => {
      try { await fetch(url); return false; } catch { return true; }
    }, before[0]);
    assert.equal(revoked, true);
    await mount(page, { items: [{ id: 'again', source, priority: 'critical' }] });
    await ready(page, 'again', source);
    assert.equal(count(source), 2);
  });

  await scenario('prefetch intent delay cancels obsolete scenes before downloading', async page => {
    const old = '/art/obsolete-prefetch.png';
    const current = '/art/desired-prefetch.png?slow';
    await mount(page, { prefetch: [old] });
    await mount(page, { prefetch: [current] });
    await eventually(() => count(current) === 1, 'new prefetch intent starts');
    assert.equal(count(old), 0);
    await mount(page, { prefetch: [] });
    await eventually(() => abortCount(current) === 1, 'old prefetch scope cancels its HTTP stream');
  });

  await scenario('prefetch is deduplicated, bounded and canceled when its scope is disabled', async page => {
    const sources = ['/art/prefetch-one.png?slow', '/art/prefetch-two.png?slow', '/art/prefetch-three.png?slow', '/art/prefetch-four.png?slow'];
    await mount(page, { prefetch: [sources[0], sources[0], ...sources.slice(1)] });
    await eventually(() => count(sources[0]) === 1, 'first speculative source starts');
    assert.equal(count(sources[1]), 0);
    finish(sources[0]);
    await eventually(() => count(sources[1]) === 1, 'second speculative source starts serially');
    finish(sources[1]);
    await eventually(() => count(sources[2]) === 1, 'third speculative source starts serially');
    await mount(page, { prefetch: sources, prefetchEnabled: false });
    await eventually(() => abortCount(sources[2]) === 1, 'disabled scope aborts its active request');
    assert.equal(count(sources[3]), 0);
  });

  assert.deepEqual(pageErrors, [], 'the harness has no page errors or external requests');
  console.log(JSON.stringify({ passed: results.filter(result => result.passed).length, failed: results.filter(result => !result.passed).length, results }, null, 2));
  assert.ok(results.every(result => result.passed), 'all artwork browser scenarios must pass');
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
