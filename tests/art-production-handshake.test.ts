import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { test } from 'node:test';
import { createArtProductionService } from '../server/art-production.ts';
import { sha256 } from '../server/art-production-prompts.ts';
import type { ArtWorldInput } from '../shared/production.ts';

test('32 real child START handshakes observe their already-persisted PID before any client work', { timeout: 90000 }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'art-real-handshake-'));
  const world: ArtWorldInput = { id: 'synthetic-32', storyId: 'test', title: 'Synthetic only', version: '1',
    characters: [], source: { title: 'Test only', author: 'Test', url: '' },
    nodes: Object.fromEntries(Array.from({ length: 32 }, (_, index) => {
      const id = `test-${index}`;
      return [id, { id, chapter: '', title: id, location: '', time: '', background: '', text: [id], choices: [] }];
    })) };
  let children = 0;
  const service = createArtProductionService({ root, startWorker: () => {},
    buildBrief: async (_root, _world, node) => ({ prompt: node.id, references: [],
      sourceHash: sha256(node.id), referenceHash: sha256('none') }),
    spawnClient: ({ directory }) => {
      children++;
      return spawn(process.execPath, [path.resolve('tests/fixtures/art-handshake-client.mjs'), directory, root],
        { stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true });
    } });
  const batch = await service.prepareArtBatch({ world });
  await service.runArtBatch(batch.id, { maxJobs: 32, concurrency: 32 });
  await service.drain();
  const result = (await service.getArtBatch(batch.id))!;
  assert.equal(children, 32);
  for (const job of result.jobs) {
    assert.equal(job.state, 'failed');
    assert.equal(job.errorCode, 'SYNTHETIC_HANDSHAKE_NO_POST');
    const evidence = JSON.parse(await readFile(path.join(root,
      'output/imagegen/scene-production/.private/jobs', job.id, 'handshake-test.json'), 'utf8'));
    assert.equal(evidence.durable, true);
  }
});
