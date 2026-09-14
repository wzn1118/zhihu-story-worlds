import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rm, rmdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { authoredWorlds } from '../content/worlds.ts';
import { getWorld } from '../server/worlds.ts';
import { currentFormalPlans } from '../server/workshop-art-assets.ts';
import { withApprovedArt } from '../server/workshop-art.ts';
import type { ArtBatch, ArtJob } from '../shared/production.ts';

function opaquePortrait() {
  const width = 2720, height = 4080;
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    let crc = 0xffffffff;
    for (const value of body) { crc ^= value; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    const output = Buffer.alloc(body.length + 8);
    output.writeUInt32BE(data.length); body.copy(output, 4);
    output.writeUInt32BE((crc ^ 0xffffffff) >>> 0, output.length - 4);
    return output;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.alloc((width * 3 + 1) * height))), chunk('IEND', Buffer.alloc(0))]);
}

async function fixture(t: TestContext, worldId: string, characterId: string) {
  const original = structuredClone(getWorld(authoredWorlds.find(world => world.id === worldId)!.storyId));
  const nodeId = `__art_character_${characterId}`;
  const plan = (await currentFormalPlans(original)).find(plan => plan.nodeId === nodeId)!;
  const jobId = `scene_${randomUUID().replaceAll('-', '')}`;
  const url = `/generated-art/workshop-presence-test-${randomUUID()}/image.png`;
  const file = resolve('public', `.${url}`);
  const reviewFile = resolve('output/imagegen/scene-production/formal-production-20260907/reviews', `${jobId}.json`);
  await mkdir(dirname(file), { recursive: true });
  await mkdir(dirname(reviewFile), { recursive: true });
  t.after(async () => { await rm(file, { force: true }); await rmdir(dirname(file)); await rm(reviewFile, { force: true }); });
  const bytes = opaquePortrait(), sha256 = createHash('sha256').update(bytes).digest('hex');
  await writeFile(file, bytes);
  await writeFile(reviewFile, JSON.stringify({ jobId, sha256, decision: 'approved', reviewer: 'synthetic-presence-test',
    notes: 'Synthetic opaque portrait fixture used to verify that reference approval cannot create stage presence.',
    fullImageViewed: true, nativeDetailViewed: true, styleReviewed: true, styleBaseline: 'film-frames-20260907' }));
  const job: ArtJob = { id: jobId, worldId, nodeId, sceneTitle: nodeId, assetKind: 'character-anchor',
    sourceHash: plan.sourceHash, promptHash: 'fixture', referenceHash: 'fixture', stale: false, state: 'generated',
    requested: { aspectRatio: '2:3', resolution: '4K' }, paidAttempts: 0, recoveryAttempts: 0, recoveryAvailable: false,
    createdAt: '', updatedAt: '', asset: { url, width: 2720, height: 4080, bytes: bytes.length, sha256,
      native4k: true, originalPixels: true, duplicate: false },
    review: { decision: 'approved', reviewer: 'synthetic-presence-test',
      notes: 'Synthetic opaque portrait fixture, never production art.', reviewedAt: '' } };
  const batch = { id: `presence-${worldId}`, worldId, storyId: original.storyId, worldVersion: original.version, jobs: [job] } as ArtBatch;
  return { original, url, service: { getArtBatch: async () => batch, listArtBatches: async () => [batch] } };
}

test('an approved opaque supporting mother stays a reference and cannot replace authored scene actors', async t => {
  const f = await fixture(t, 'blue-blood', 'trainer'), before = structuredClone(f.original);
  const bound = await withApprovedArt(f.original, undefined, f.service);
  assert.equal(bound.artCharacters?.find(character => character.id === 'trainer')?.portrait, f.url);
  assert.deepEqual(bound.nodes.training.character, before.nodes.training.character);
  assert.deepEqual(bound.nodes.test.character, before.nodes.test.character);
  assert.deepEqual(bound.nodes, before.nodes);
  assert.deepEqual(f.original, before);
});

test('an approved opaque cast mother cannot create appearances in scenes without an authored actor', async t => {
  const f = await fixture(t, 'happy-home', 'hong'), before = structuredClone(f.original);
  const bound = await withApprovedArt(f.original, undefined, f.service);
  assert.equal(bound.characters.find(character => character.id === 'hong')?.portrait, f.url);
  assert.equal(bound.nodes.arrival.character, undefined);
  assert.deepEqual(bound.nodes, before.nodes);
  assert.deepEqual(f.original, before);
});
