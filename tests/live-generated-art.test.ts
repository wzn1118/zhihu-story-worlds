import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import express from 'express';
import { liveGeneratedArt } from '../server/live-generated-art.ts';

test('new and atomically replaced generated art is served without a watcher or SPA fallback', async () => {
  const root = await mkdtemp(join(tmpdir(), 'live-generated-art-'));
  const folder = join(root, 'public/generated-art');
  await mkdir(folder, { recursive: true });
  const app = express();
  app.use('/generated-art', liveGeneratedArt(root));
  app.use((_request, response) => { response.type('html').send('<html>SPA</html>'); });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
  try {
    // The image does not exist until after the server has started.
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1kAAAAASUVORK5CYII=', 'base64');
    await writeFile(join(folder, 'new.png'), png);
    const response = await fetch(`${base}/generated-art/new.png?sha256=${hash(png)}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /^image\/png/);
    assert.equal(hash(Buffer.from(await response.arrayBuffer())), hash(png));
    const head = await fetch(`${base}/generated-art/new.png`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('content-length'), String(png.length));

    await writeFile(join(folder, 'production-manifest.json'), '{"version":1}');
    const initial = await fetch(`${base}/generated-art/production-manifest.json`);
    assert.deepEqual(await initial.json(), { version: 1 });
    await writeFile(join(folder, 'next.tmp'), '{"version":2}');
    await rename(join(folder, 'next.tmp'), join(folder, 'production-manifest.json'));
    const updated = await fetch(`${base}/generated-art/production-manifest.json`);
    assert.deepEqual(await updated.json(), { version: 2 });

    for (const path of ['/generated-art/missing.png', '/generated-art/']) {
      const missing = await fetch(base + path);
      assert.equal(missing.status, 404);
      assert.equal(await missing.text(), '');
    }
    assert.equal(await (await fetch(base + '/story')).text(), '<html>SPA</html>');
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()));
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.ok(basename(root).startsWith('live-generated-art-'));
    await rm(root, { recursive: true, force: true });
  }
});
