import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import express from 'express';
import { authoredWorlds } from '../content/worlds.ts';
import { getWorld } from '../server/worlds.ts';
import { artBindingSource } from '../shared/art-binding-source.ts';
import { ART_MANIFESTS, invalidateArtManifest, readArtManifest, type ArtManifestUrl } from '../src/art-manifest-cache.ts';
import { checkArtRevisions } from '../src/live-published-art.ts';
import { withPublishedArt } from '../src/published-art.ts';

const [production, cutouts] = ART_MANIFESTS;
beforeEach(() => ART_MANIFESTS.forEach(invalidateArtManifest));

test('concurrent games share one request and one JSON parse, then revalidate without downloading a 304 body', async t => {
  let resolve!: (response: Response) => void;
  const calls: RequestInit[] = [];
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    calls.push(init);
    if (calls.length === 1) return new Promise<Response>(done => { resolve = done; });
    assert.deepEqual(init.headers, { 'If-None-Match': '"release-1"', 'Cache-Control': 'max-age=0' });
    const response = new Response(null, { status: 304 });
    t.mock.method(response, 'json', () => { throw new Error('304 has no body'); });
    return response;
  });
  const reads = Array.from({ length: 20 }, () => readArtManifest<{ worlds: string[] }>(production));
  assert.equal(calls.length, 1);
  const response = new Response(JSON.stringify({ worlds: ['first', 'second'] }), { headers: { etag: '"release-1"' } });
  const json = t.mock.method(response, 'json');
  resolve(response);
  const values = await Promise.all(reads);
  assert.equal(json.mock.callCount(), 1);
  assert.ok(values.every(value => value === values[0]));
  assert.equal(await readArtManifest(production), values[0]);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(init => init.cache === 'no-store' && init.signal instanceof AbortSignal));
});

test('changed approval is read immediately even directly after the previous successful request', async t => {
  let approved = true;
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    const etag = approved ? '"approved"' : '"revoked"';
    if (!approved) assert.deepEqual(init.headers, { 'If-None-Match': '"approved"', 'Cache-Control': 'max-age=0' });
    return new Response(JSON.stringify({ review: approved ? 'approved' : 'rejected' }), { headers: { etag } });
  });
  assert.deepEqual(await readArtManifest(cutouts), { review: 'approved' });
  approved = false;
  assert.deepEqual(await readArtManifest(cutouts), { review: 'rejected' });
});

test('Last-Modified is conditional when ETag is absent; missing validators force a fresh read', async t => {
  const modified = 'Mon, 14 Sep 2026 09:00:00 GMT';
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    calls++;
    if (calls === 1) return new Response('{"revision":1}', { headers: { 'last-modified': modified } });
    if (calls === 2) assert.deepEqual(init.headers, { 'If-Modified-Since': modified, 'Cache-Control': 'max-age=0' });
    else assert.deepEqual(init.headers, {});
    return new Response(JSON.stringify({ revision: calls }));
  });
  await readArtManifest(production);
  assert.deepEqual(await readArtManifest(production), { revision: 2 });
  assert.deepEqual(await readArtManifest(production), { revision: 3 });
});

test('a failed or malformed refresh rejects instead of returning cached approval and a later read retries', async t => {
  let attempt = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    attempt++;
    if (attempt === 1) return new Response('{"review":"approved"}', { headers: { etag: '"one"' } });
    if (attempt === 2) return new Response(null, { status: 503 });
    if (attempt === 3) return new Response('not json', { headers: { etag: '"two"' } });
    return new Response('{"review":"rejected"}', { headers: { etag: '"three"' } });
  });
  await readArtManifest(cutouts);
  await assert.rejects(readArtManifest(cutouts), /ART_MANIFEST_UNAVAILABLE/);
  await assert.rejects(readArtManifest(cutouts), SyntaxError);
  assert.deepEqual(await readArtManifest(cutouts), { review: 'rejected' });
  assert.equal(attempt, 4);
});

test('a matching initial HEAD retains the body; a changed HEAD invalidates an older pending response', async t => {
  let tag = '"one"', suspend = false, release!: (response: Response) => void;
  let oldSignal: AbortSignal | null | undefined;
  let lastHeaders: HeadersInit | undefined;
  t.mock.method(globalThis, 'fetch', async (url: unknown, init: RequestInit) => {
    if (init.method === 'HEAD') return new Response(null, { headers: { etag: String(url) === production ? tag : '"cutouts"' } });
    lastHeaders = init.headers;
    if (suspend) {
      oldSignal = init.signal;
      return new Promise<Response>(done => { release = done; });
    }
    return new Response(JSON.stringify({ revision: tag }), { headers: { etag: tag } });
  });
  await readArtManifest(production);
  const initial = await checkArtRevisions();
  await readArtManifest(production);
  assert.deepEqual(lastHeaders, { 'If-None-Match': '"one"', 'Cache-Control': 'max-age=0' }, 'An initial HEAD should not force a duplicate full body');
  suspend = true;
  const obsolete = readArtManifest(production);
  const rejected = assert.rejects(obsolete, /ART_MANIFEST_SUPERSEDED/);
  tag = '"two"';
  assert.equal((await checkArtRevisions(initial.revisions)).changed, true);
  assert.equal(oldSignal?.aborted, true);
  suspend = false;
  assert.deepEqual(await readArtManifest(production), { revision: '"two"' });
  assert.deepEqual(lastHeaders, {});
  release(new Response('{"revision":"old"}', { headers: { etag: '"one"' } }));
  await rejected;
  await readArtManifest(production);
  assert.deepEqual(lastHeaders, { 'If-None-Match': '"two"', 'Cache-Control': 'max-age=0' }, 'An obsolete response cannot overwrite the new cached body');
});

test('private or imported world endpoints cannot enter the public manifest cache', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected private read'); });
  for (const url of ['/generated-art/workshop/manifest.json', '/api/imports/private/world', `${production}?account=other`])
    await assert.rejects(readArtManifest(url as ArtManifestUrl), /ART_MANIFEST_NOT_PUBLIC/);
  const imported = structuredClone(getWorld(authoredWorlds[0].storyId));
  imported.storyId = 'import-private';
  assert.equal(await withPublishedArt(imported), imported);
  assert.equal(fetch.mock.callCount(), 0);
});

test('multiple worlds fetch production and cutouts in parallel while retaining separate verified bindings', async t => {
  const worlds = authoredWorlds.slice(0, 2).map(world => structuredClone(getWorld(world.storyId)));
  const entries = worlds.map((world, index) => ({ worldId: world.id, storyId: world.storyId, version: world.version,
    bindingSourceHash: createHash('sha256').update(artBindingSource(world)).digest('hex'),
    assets: [{ nodeId: world.startNodeId, assetKind: 'scene', review: 'approved', bindingReady: true, gameReady: true,
      asset: { url: `/generated-art/scene_${index + 1}.png`, sha256: String(index + 1).repeat(64) } }] }));
  const responses = new Map<string, (response: Response) => void>();
  t.mock.method(globalThis, 'fetch', async (url: unknown) => new Promise<Response>(resolve => { responses.set(String(url), resolve); }));
  const loading = worlds.map(world => withPublishedArt(world));
  assert.deepEqual([...responses.keys()], [...ART_MANIFESTS], 'Both metadata requests must start before either finishes');
  responses.get(cutouts)!(new Response('{"schemaVersion":1,"entries":[]}'));
  responses.get(production)!(new Response(JSON.stringify({ bindingPolicy: 'style-first-approved-current-v1', worlds: entries })));
  const bound = await Promise.all(loading);
  bound.forEach((world, index) => {
    assert.equal(world.nodes[world.startNodeId].background, entries[index].assets[0].asset.url);
    assert.notEqual(world, worlds[index]);
    assert.notEqual(world.nodes[world.startNodeId].background, worlds[index].nodes[world.startNodeId].background);
  });
});

test('real HTTP revalidation receives 304 from Express and immediately receives a revoked release body', async t => {
  const app = express();
  let approved = true;
  app.get(production, (_request, response) => {
    response.set('Cache-Control', 'no-cache, must-revalidate');
    response.json({ review: approved ? 'approved' : 'rejected' });
  });
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve, reject) => {
    server.closeAllConnections();
    server.close(error => error ? reject(error) : resolve());
  }));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const fetch = globalThis.fetch, statuses: number[] = [];
  t.mock.method(globalThis, 'fetch', async (url: unknown, init: RequestInit) => {
    const response = await fetch(`http://127.0.0.1:${address.port}${String(url)}`, init);
    statuses.push(response.status);
    return response;
  });
  const first = await readArtManifest(production);
  assert.equal(await readArtManifest(production), first);
  approved = false;
  assert.deepEqual(await readArtManifest(production), { review: 'rejected' });
  assert.deepEqual(statuses, [200, 304, 200]);
});
