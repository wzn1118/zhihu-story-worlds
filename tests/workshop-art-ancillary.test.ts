import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rm, rmdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { authoredWorlds } from '../content/worlds.ts';
import type { ArtBatch, ArtJob } from '../shared/production.ts';
import type { GameWorld } from '../shared/types.ts';
import { bindApprovedAncillaryArt } from '../server/workshop-art-ancillary.ts';
import { currentFormalPlans } from '../server/workshop-art-assets.ts';

function png(width: number, height: number, shade: number) {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    let crc = 0xffffffff;
    for (const value of body) { crc ^= value; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    const output = Buffer.alloc(body.length + 8);
    output.writeUInt32BE(data.length); body.copy(output, 4);
    output.writeUInt32BE((crc ^ 0xffffffff) >>> 0, output.length - 4);
    return output;
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const pixels = Buffer.alloc((width * 3 + 1) * height, shade);
  for (let row = 0; row < height; row++) pixels[row * (width * 3 + 1)] = 0;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}
const sourceWorld = (): GameWorld => structuredClone({ ...authoredWorlds.find(world => world.id === 'blue-blood')!, ink: {}, clueVariables: {} });
const batchFor = (world: GameWorld, jobs: ArtJob[]) => ({ id: 'ancillary-binding-test', worldId: world.id,
  storyId: world.storyId, worldVersion: world.version, jobs }) as ArtBatch;

async function fixture(t: TestContext, nodeId: string, shade = 0, width = 3840, height = 2160) {
  const world = sourceWorld(), plan = (await currentFormalPlans(world)).find(plan => plan.nodeId === nodeId)!;
  assert.ok(plan, `Expected an authored short plan for ${nodeId}`);
  const id = `scene_${randomUUID().replaceAll('-', '')}`;
  const url = `/generated-art/workshop-ancillary-test-${randomUUID()}/image.png`;
  const file = resolve('public', `.${url}`), reviewFile = resolve('output/imagegen/scene-production/formal-production-20260907/reviews', `${id}.json`);
  await mkdir(dirname(file), { recursive: true });
  await mkdir(dirname(reviewFile), { recursive: true });
  t.after(async () => { await rm(file, { force: true }); await rmdir(dirname(file)); await rm(reviewFile, { force: true }); });
  const bytes = png(width, height, shade);
  await writeFile(file, bytes);
  const job: ArtJob = { id, worldId: world.id, nodeId, sceneTitle: nodeId, assetKind: plan.kind, sourceHash: plan.sourceHash,
    promptHash: 'fixture', referenceHash: 'fixture', stale: false, state: 'generated', requested: { aspectRatio: '16:9', resolution: '4K' },
    paidAttempts: 0, recoveryAttempts: 0, recoveryAvailable: false, createdAt: '', updatedAt: '',
    asset: { url, width, height, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
      native4k: true, originalPixels: true, duplicate: false },
    review: { decision: 'approved', reviewer: 'synthetic-ancillary-test-only', notes: 'Synthetic fixture, never a production visual review.', reviewedAt: '' } };
  const review = { jobId: id, sha256: job.asset!.sha256, decision: 'approved', reviewer: 'synthetic-ancillary-test-only',
    notes: 'Synthetic fixture, never evidence that production artwork has been visually reviewed.',
    fullImageViewed: true, nativeDetailViewed: true, styleReviewed: true, styleBaseline: 'film-frames-20260907' };
  await writeFile(reviewFile, JSON.stringify(review));
  return { world, job, file, reviewFile, review };
}
const environmentId = '__art_environment_blue-blood-training-environment';

test('binds only the exact cover and node environment and preserves immutable scene coverage', async t => {
  const cover = await fixture(t, '__art_cover'), environment = await fixture(t, environmentId, 1);
  const world = cover.world;
  world.generated = { projectId: 'synthetic', revision: 1, artReady: false };
  const original = structuredClone(world);
  const result = await bindApprovedAncillaryArt(world, batchFor(world, [environment.job, cover.job]));
  assert.equal(result.cover, cover.job.asset!.url);
  assert.equal(result.nodes.training.background, environment.job.asset!.url);
  assert.equal(result.background, environment.job.asset!.url);
  assert.equal(result.generated!.artReady, false);
  const otherNode = Object.keys(world.nodes).find(id => id !== 'training')!;
  assert.equal(result.nodes[otherNode].background, world.nodes[otherNode].background);
  result.nodes.training.text.push('Only the result changes.');
  result.generated!.artReady = true;
  assert.deepEqual(world, original);
});

test('a verified scene wins over its environment while a dedicated cover can bind', async t => {
  const scene = await fixture(t, 'training'), environment = await fixture(t, environmentId, 1), cover = await fixture(t, '__art_cover', 2);
  const original = scene.world, bound = structuredClone(original);
  bound.nodes.training.background = scene.job.asset!.url;
  bound.background = bound.cover = scene.job.asset!.url;
  const result = await bindApprovedAncillaryArt(bound, batchFor(original, [environment.job, scene.job, cover.job]), original);
  assert.equal(result.nodes.training.background, scene.job.asset!.url);
  assert.equal(result.background, scene.job.asset!.url);
  assert.equal(result.cover, cover.job.asset!.url);
  assert.equal(original.nodes.training.background, scene.world.nodes.training.background);
});

test('revoked and missing ancillary approvals clear prior generated URLs on the next read', async t => {
  const cover = await fixture(t, '__art_cover'), environment = await fixture(t, environmentId, 1);
  const batch = batchFor(cover.world, [cover.job, environment.job]);
  const bound = await bindApprovedAncillaryArt(cover.world, batch);
  cover.job.review!.decision = 'rejected';
  await rm(environment.reviewFile);
  const revoked = await bindApprovedAncillaryArt(bound, batch, cover.world);
  assert.equal(revoked.cover, '');
  assert.equal(revoked.background, '');
  assert.equal(revoked.nodes.training.background, '');
  assert.equal(bound.cover, cover.job.asset!.url);
  const removed = await bindApprovedAncillaryArt(bound, batchFor(bound, []), cover.world);
  assert.equal(removed.nodes.training.background, '');
  assert.equal(removed.cover, '');
});

test('legacy environment labels and wrong source, kind or batch identity never guess a target', async t => {
  const f = await fixture(t, environmentId);
  for (const change of [{ nodeId: '__art_environment_training' }, { nodeId: '__art_environment_other-training-environment' },
    { sourceHash: 'changed-source' }, { assetKind: 'cover' as const }, { worldId: 'other' }]) {
    assert.deepEqual(await bindApprovedAncillaryArt(f.world, batchFor(f.world, [{ ...f.job, ...change }])), f.world);
  }
  for (const change of [{ worldId: 'other' }, { storyId: 'other' }, { worldVersion: 'older' }]) {
    assert.deepEqual(await bindApprovedAncillaryArt(f.world, { ...batchFor(f.world, [f.job]), ...change }), f.world);
  }
  const cover = await fixture(t, '__art_cover', 1);
  assert.deepEqual(await bindApprovedAncillaryArt(cover.world, batchFor(cover.world, [{ ...cover.job, nodeId: '__art_cover_extra' }])), cover.world);
});

test('actual landscape pixels and full current review evidence remain mandatory', async t => {
  const f = await fixture(t, environmentId);
  for (const change of [{ fullImageViewed: false }, { nativeDetailViewed: false }, { styleReviewed: false },
    { styleBaseline: 'old-baseline' }, { sha256: '0'.repeat(64) }, { decision: 'rejected' }]) {
    await writeFile(f.reviewFile, JSON.stringify({ ...f.review, ...change }));
    assert.deepEqual(await bindApprovedAncillaryArt(f.world, batchFor(f.world, [f.job])), f.world);
  }
  await writeFile(f.reviewFile, JSON.stringify(f.review));
  await writeFile(f.file, 'corrupt PNG');
  assert.deepEqual(await bindApprovedAncillaryArt(f.world, batchFor(f.world, [f.job])), f.world);
  const small = await fixture(t, '__art_cover', 0, 1536, 1024);
  assert.deepEqual(await bindApprovedAncillaryArt(small.world, batchFor(small.world, [small.job])), small.world);
});

test('duplicate pixels cannot fill cover and environment independently', async t => {
  const cover = await fixture(t, '__art_cover'), environment = await fixture(t, environmentId);
  assert.equal(cover.job.asset!.sha256, environment.job.asset!.sha256);
  const result = await bindApprovedAncillaryArt(cover.world, batchFor(cover.world, [environment.job, cover.job]));
  assert.equal(result.cover, cover.job.asset!.url);
  assert.equal(result.nodes.training.background, cover.world.nodes.training.background);
});
