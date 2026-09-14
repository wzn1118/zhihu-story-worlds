import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createArtProductionService, isNative4k } from '../server/art-production.ts';
import type { SceneBrief } from '../server/art-production-prompts.ts';
import { authoredWorlds } from '../content/worlds.ts';

test('native portrait 4K uses the requested orientation, never a long-edge-only check', () => {
  assert(isNative4k(2730, 4096, '2:3'));
  assert(!isNative4k(1672, 2508, '2:3'));
  assert(!isNative4k(4096, 2304, '2:3'));
  assert(!isNative4k(2730, 4096));
});

test('portrait revision and blocked dependencies persist without paid calls', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'portrait-art-'));
  const world = authoredWorlds[0]; const id = Object.keys(world.nodes)[0];
  let brief: SceneBrief = { prompt: 'test', references: [], sourceHash: 'source', referenceHash: 'reference',
    aspectRatio: '2:3', blockedReason: 'AWAITING_APPROVED_ANCHORS' };
  let calls = 0;
  const service = createArtProductionService({ root, startWorker: () => {}, buildBrief: async () => brief,
    execute: async () => { calls++; throw new Error('No paid test execution'); } });
  const first = await service.prepareArtBatch({ world, nodeIds: [id], jobKinds: { [id]: 'character-reaction' } });
  assert.equal(first.jobs[0].requested.aspectRatio, '2:3');
  assert.equal(first.jobs[0].state, 'blocked');
  await service.runArtBatch(first.id, { jobIds: [first.jobs[0].id], maxJobs: 1, concurrency: 8 });
  await service.drain(); assert.equal(calls, 0);
  brief = { ...brief, blockedReason: undefined };
  const second = await service.prepareArtBatch({ world, nodeIds: [id], jobKinds: { [id]: 'character-reaction' } });
  assert.equal(second.jobs.length, 2);
  assert(second.jobs[0].stale);
  assert.equal(second.jobs[1].state, 'queued');
  await assert.rejects(service.prepareArtBatch({ world, nodeIds: [id] }), /ART_INVALID_ASSET_GEOMETRY/);
});
