import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createArtProductionService } from '../server/art-production.ts';
import type { ArtWorldInput } from '../shared/production.ts';

const world: ArtWorldInput = {
  id: 'readonly-test', storyId: 'readonly-test', title: 'Read-only fixture', version: '1',
  source: { title: 'Fixture', author: 'Test', url: '' }, characters: [],
  nodes: { opening: { id: 'opening', title: 'Opening', chapter: 'one', location: 'room', time: 'morning', text: ['Test-only scene'], background: '', choices: [] } },
};
async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'art-readonly-'));
  const production = path.join(root, 'output/imagegen/scene-production');
  const service = createArtProductionService({ root, startWorker: () => {},
    buildBrief: async () => ({ prompt: 'Test-only brief', references: ['fixture.png'], sourceHash: 'test-source', referenceHash: 'test-reference' }),
    execute: async () => { throw new Error('No image requests allowed'); },
  });
  return { root, production, service };
}

test('art reads return the committed snapshot while a live writer owns the lease', async () => {
  const { root, production, service } = await setup();
  const lock = path.join(production, '.private/state.lock');
  try {
    const batch = await service.prepareArtBatch({ world });
    const owner = JSON.stringify({ pid: process.pid, token: 'test-live-writer', at: new Date().toISOString() });
    await writeFile(lock, owner, { flag: 'wx' });
    const reading = Promise.all([service.listArtBatches(), service.getArtBatch(batch.id)]);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const [all, one] = await Promise.race([reading, new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('A read waited for the live writer lease')), 2000);
      })]);
      assert.deepEqual(all, [batch]);
      assert.deepEqual(one, batch);
      assert.equal(await readFile(lock, 'utf8'), owner, 'A read must not steal a writer lease');
    } finally {
      clearTimeout(timer);
      await rm(lock, { force: true });
      await reading.catch(() => {});
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('list/get do not rewrite store or public manifest and observe the next committed change', async () => {
  const { root, production, service } = await setup();
  try {
    const batch = await service.prepareArtBatch({ world });
    const files = [path.join(production, '.private/state.json'), path.join(production, 'manifest.json')];
    const before = await Promise.all(files.map(async file => ({ text: await readFile(file, 'utf8'), stat: await stat(file) })));
    await service.listArtBatches();
    await service.getArtBatch(batch.id);
    for (let index = 0; index < files.length; index++) {
      assert.equal(await readFile(files[index], 'utf8'), before[index].text);
      assert.equal((await stat(files[index])).mtimeMs, before[index].stat.mtimeMs);
    }
    await service.prepareArtBatch({ world: { ...world, version: '2' } });
    assert.equal((await service.getArtBatch(batch.id))?.worldVersion, '2');
    assert.equal((await service.listArtBatches())[0].worldVersion, '2');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('an empty read creates no production files and corrupted state is not reported as empty', async () => {
  const { root, production, service } = await setup();
  try {
    assert.deepEqual(await service.listArtBatches(), []);
    assert.equal(await service.getArtBatch('absent'), null);
    await assert.rejects(stat(production), { code: 'ENOENT' });
    await service.prepareArtBatch({ world });
    await writeFile(path.join(production, '.private/state.json'), '{broken');
    await assert.rejects(service.listArtBatches(), /ART_STORE_CORRUPT/);
    await assert.rejects(service.getArtBatch('absent'), /ART_STORE_CORRUPT/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
