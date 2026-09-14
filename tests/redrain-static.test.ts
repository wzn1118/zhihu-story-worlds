import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { request } from 'node:http';
import { brotliCompressSync, brotliDecompressSync, gzipSync, gunzipSync } from 'node:zlib';
import { redrainStatic } from '../server/redrain-static.ts';

test('RedRain caches content-addressed art but revalidates code and returns actual missing-asset errors', async () => {
  const root = await mkdtemp(join(tmpdir(), 'redrain-static-'));
  await mkdir(join(root, 'public/assets/optimized'), { recursive: true });
  await writeFile(join(root, 'public/assets/optimized/portrait-main.0123456789abcdef.webp'), 'image fixture');
  await writeFile(join(root, 'public/assets/optimized/unversioned.webp'), 'image fixture');
  await writeFile(join(root, 'game.js'), 'export const version = 1;');
  await writeFile(join(root, 'index.html'), '<!doctype html>');
  const app = express();
  app.use('/games/redrain', redrainStatic(root));
  app.use((_request, response) => response.send('SPA fallback'));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}/games/redrain`;
  try {
    const art = await fetch(`${base}/public/assets/optimized/portrait-main.0123456789abcdef.webp`);
    assert.equal(art.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.equal(art.headers.get('content-type'), 'image/webp');
    await art.text();
    const etag = art.headers.get('etag')!;
    const cached = await fetch(`${base}/public/assets/optimized/portrait-main.0123456789abcdef.webp`, { headers: { 'If-None-Match': etag, 'Cache-Control': 'max-age=0' } });
    assert.equal(cached.status, 304);
    for (const path of ['game.js', 'index.html']) {
      const response = await fetch(`${base}/${path}`);
      assert.equal(response.headers.get('cache-control'), 'no-cache, must-revalidate');
      await response.text();
    }
    const unversioned = await fetch(`${base}/public/assets/optimized/unversioned.webp`);
    assert.doesNotMatch(unversioned.headers.get('cache-control')!, /immutable/);
    await unversioned.text();
    for (const path of ['missing.webp', '.secret']) {
      const missing = await fetch(`${base}/${path}`);
      assert.equal(missing.status, 404);
      assert.equal(await missing.text(), '');
    }
  } finally {
    await new Promise<void>(resolveClose => server.close(() => resolveClose()));
    await rm(root, { recursive: true, force: true });
  }
});

test('RedRain precompressed delivery negotiates representations, ranges and cache validators safely', async t => {
  const root = await mkdtemp(join(tmpdir(), 'redrain-compressed-'));
  const code = Buffer.from('export const chapter = "人物资源按需优先加载";\n'.repeat(100));
  const brotli = brotliCompressSync(code);
  const gzip = gzipSync(code);
  const asset = '/build/game.0123456789abcdef.js';
  await mkdir(join(root, 'build'), { recursive: true });
  await mkdir(join(root, 'public/assets/optimized'), { recursive: true });
  await Promise.all([
    writeFile(join(root, asset), code), writeFile(join(root, `${asset}.br`), brotli), writeFile(join(root, `${asset}.gz`), gzip),
    writeFile(join(root, 'build/game.fedcba9876543210.css'), 'body{color:red}'),
    writeFile(join(root, 'build/game.fedcba9876543210.css.br'), brotliCompressSync(Buffer.from('body{color:red}'))),
    writeFile(join(root, 'public/assets/optimized/portrait-main-640.0123456789abcdef.avif'), 'avif fixture'),
    writeFile(join(root, 'public/assets/optimized/portrait-main.w640.0123456789abcdef.webp'), 'webp fixture'),
    writeFile(join(root, 'plain.js'), code), writeFile(join(root, '.secret.js'), 'never public'),
    writeFile(join(root, 'orphan.js.br'), brotli), writeFile(join(root, 'index.html'), '<!doctype html>'),
  ]);
  const app = express();
  app.use('/games/redrain', redrainStatic(root));
  app.use((_request, response) => response.send('SPA fallback'));
  // Keep expected 412/416 errors from writing noisy Express stack traces in the test.
  app.use((error: { status?: number; headers?: Record<string, string> }, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    if (error.headers) response.set(error.headers);
    response.status(error.status ?? 500).end();
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  const get = (path: string, headers: Record<string, string> = {}, method = 'GET') => new Promise<{ status: number; headers: import('node:http').IncomingHttpHeaders; body: Buffer }>((resolveResponse, reject) => {
    const req = request({ host: '127.0.0.1', port, path: `/games/redrain${path}`, method, headers }, response => {
      const chunks: Buffer[] = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('error', reject);
      response.on('end', () => resolveResponse({ status: response.statusCode!, headers: response.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
  try {
    await t.test('negotiates quality, explicit exclusions, wildcard and missing sidecars', async () => {
      const cases: Array<[string | undefined, string | undefined, number]> = [
        ['br, gzip', 'br', 200], ['gzip', 'gzip', 200], ['br;q=0, gzip;q=1', 'gzip', 200],
        ['br;q=0.5, gzip;q=0.9', 'gzip', 200], ['br;q=0.9, gzip;q=0.5', 'br', 200],
        ['br;q=0, gzip;q=0', undefined, 200], ['*;q=1, br;q=0', 'gzip', 200],
        ['*;q=0, gzip;q=0.5', 'gzip', 200], ['identity;q=1, br;q=0.5', undefined, 200],
        ['BR; Q=1, gzip;q=0', 'br', 200], ['br;q=invalid, gzip;q=0', undefined, 200],
        ['br;q=0, gzip;q=0, identity;q=0', undefined, 406], ['*;q=0', undefined, 406],
        ['zstd, identity;q=0', undefined, 406], [undefined, undefined, 200], ['', undefined, 200],
      ];
      for (const [encoding, selected, status] of cases) {
        const response = await get(`${asset}?version=2`, encoding === undefined ? {} : { 'Accept-Encoding': encoding });
        assert.equal(response.status, status, encoding);
        assert.equal(response.headers['content-encoding'], selected, encoding);
        assert.match(response.headers.vary!, /Accept-Encoding/i);
        if (status === 200) {
          const decoded = selected === 'br' ? brotliDecompressSync(response.body) : selected === 'gzip' ? gunzipSync(response.body) : response.body;
          assert.deepEqual(decoded, code);
          assert.equal(response.headers['content-type'], 'text/javascript; charset=utf-8');
          assert.equal(Number(response.headers['content-length']), response.body.length);
          assert.equal(response.headers['cache-control'], 'public, max-age=31536000, immutable');
          assert.equal(response.headers['x-content-type-options'], 'nosniff');
        }
      }
      assert.equal((await get('/plain.js', { 'Accept-Encoding': 'br, gzip' })).headers['content-encoding'], undefined);
      assert.equal((await get('/plain.js', { 'Accept-Encoding': 'br, identity;q=0' })).status, 406);
      const css = await get('/build/game.fedcba9876543210.css', { 'Accept-Encoding': 'br' });
      assert.equal(css.headers['content-type'], 'text/css; charset=utf-8');
      assert.equal(brotliDecompressSync(css.body).toString(), 'body{color:red}');
    });
    await t.test('HEAD and conditional requests retain representation headers and validators', async () => {
      const response = await get(asset, { 'Accept-Encoding': 'br' });
      const head = await get(asset, { 'Accept-Encoding': 'br' }, 'HEAD');
      assert.equal(head.status, 200);
      assert.equal(head.body.length, 0);
      for (const key of ['content-encoding', 'content-type', 'content-length', 'cache-control', 'etag', 'vary']) assert.equal(head.headers[key], response.headers[key]);
      const cached = await get(asset, { 'Accept-Encoding': 'br', 'If-None-Match': response.headers.etag! });
      assert.equal(cached.status, 304);
      assert.equal(cached.body.length, 0);
      assert.equal(cached.headers.etag, response.headers.etag);
      assert.match(cached.headers.vary!, /Accept-Encoding/);
      const identity = await get(asset, { 'Accept-Encoding': 'identity', 'If-None-Match': response.headers.etag! });
      assert.equal(identity.status, 200);
      assert.notEqual(identity.headers.etag, response.headers.etag);
      assert.equal((await get(asset, { 'Accept-Encoding': 'gzip', 'If-Modified-Since': response.headers['last-modified']! })).status, 304);
      assert.equal((await get(asset, { 'If-Match': '"invalid"' })).status, 412);
    });
    await t.test('ranges use identity when allowed and encoded byte ranges when identity is excluded', async () => {
      const partial = await get(asset, { 'Accept-Encoding': 'br, gzip', Range: 'bytes=0-31' });
      assert.equal(partial.status, 206);
      assert.equal(partial.headers['content-encoding'], undefined);
      assert.equal(partial.headers['content-range'], `bytes 0-31/${code.length}`);
      assert.deepEqual(partial.body, code.subarray(0, 32));
      const encodedPartial = await get(asset, { 'Accept-Encoding': 'br, identity;q=0', Range: 'bytes=0-7' });
      assert.equal(encodedPartial.status, 206);
      assert.equal(encodedPartial.headers['content-encoding'], 'br');
      assert.deepEqual(encodedPartial.body, brotli.subarray(0, 8));
      const invalid = await get(asset, { Range: `bytes=${code.length + 1}-` });
      assert.equal(invalid.status, 416);
      assert.equal(invalid.headers['content-range'], `bytes */${code.length}`);
      assert.equal((await get(asset, { Range: 'bytes=0-31', 'If-Range': '"stale"' })).status, 200);
    });
    await t.test('hashed AVIF caches and unsafe/missing paths never fall through to the SPA', async () => {
      const image = await get('/public/assets/optimized/portrait-main-640.0123456789abcdef.avif');
      assert.equal(image.headers['content-type'], 'image/avif');
      assert.match(image.headers['cache-control']!, /immutable/);
      assert.match((await get('/public/assets/optimized/portrait-main.w640.0123456789abcdef.webp')).headers['cache-control']!, /immutable/);
      for (const path of ['/missing.js', '/orphan.js', `${asset}.br`, '/.secret.js', '/%2esecret.js', '/build/%2e%2e/plain.js', '/build%5c..%5cplain.js', '/%00.js', '/%E0%A4%A.js']) {
        const response = await get(path, { 'Accept-Encoding': 'br, gzip' });
        assert.equal(response.status, 404, path);
        assert.equal(response.body.toString(), '', path);
      }
      assert.equal((await get('/')).status, 200);
      assert.equal((await get(asset, {}, 'POST')).status, 404);
    });
  } finally {
    await new Promise<void>(resolveClose => server.close(() => resolveClose()));
    await rm(root, { recursive: true, force: true });
  }
});
