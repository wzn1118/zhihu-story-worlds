import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rm, rmdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { authoredWorlds } from '../content/worlds.ts';
import type { ArtBatch, ArtJob } from '../shared/production.ts';
import type { GameWorld } from '../shared/types.ts';
import { bindApprovedCharacters } from '../server/workshop-art-characters.ts';
import { currentFormalPlans, verifiedNativeArt } from '../server/workshop-art-assets.ts';

function png(width: number, height: number, shade = 0) {
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
const batchFor = (world: GameWorld, jobs: ArtJob[]) => ({ id: 'character-binding-test', worldId: world.id,
  storyId: world.storyId, worldVersion: world.version, jobs }) as ArtBatch;
const cast = (world: GameWorld, id = 'fangnuo') => world.characters.find(character => character.id === id)!;

async function fixture(t: TestContext, nodeId = '__art_character_fangnuo', shade = 0, width = 2720, height = 4080) {
  const world = sourceWorld(), plan = (await currentFormalPlans(world)).find(plan => plan.nodeId === nodeId)!;
  const id = `scene_${randomUUID().replaceAll('-', '')}`;
  const url = `/generated-art/workshop-character-test-${randomUUID()}/image.png`;
  const file = resolve('public', `.${url}`), reviewFile = resolve('output/imagegen/scene-production/formal-production-20260907/reviews', `${id}.json`);
  await mkdir(dirname(file), { recursive: true });
  await mkdir(dirname(reviewFile), { recursive: true });
  t.after(async () => { await rm(file, { force: true }); await rmdir(dirname(file)); await rm(reviewFile, { force: true }); });
  const bytes = png(width, height, shade);
  await writeFile(file, bytes);
  const job: ArtJob = { id, worldId: world.id, nodeId, sceneTitle: nodeId, assetKind: plan.kind, sourceHash: plan.sourceHash,
    promptHash: 'fixture', referenceHash: 'fixture', stale: false, state: 'generated',
    requested: { aspectRatio: '2:3', resolution: '4K' }, paidAttempts: 0, recoveryAttempts: 0, recoveryAvailable: false,
    createdAt: '', updatedAt: '', asset: { url, width, height, bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'), native4k: true, originalPixels: true, duplicate: false },
    review: { decision: 'approved', reviewer: 'synthetic-test-only', notes: 'Synthetic fixture, never a production visual review.', reviewedAt: '' } };
  const review = { jobId: id, sha256: job.asset!.sha256, decision: 'approved', reviewer: 'synthetic-test-only',
    notes: 'Synthetic fixture, never evidence that production artwork has been visually reviewed.',
    fullImageViewed: true, nativeDetailViewed: true, styleReviewed: true, styleBaseline: 'film-frames-20260907' };
  await writeFile(reviewFile, JSON.stringify(review));
  return { world, job, bytes, file, review, reviewFile };
}

test('binds an exact character mother and reaction without mutating the source world', async t => {
  const main = await fixture(t), reaction = await fixture(t, '__art_reaction_fangnuo', 1);
  const orphan = await fixture(t, '__art_reaction_zhangwei', 2);
  const original = structuredClone(main.world);
  const result = await bindApprovedCharacters(main.world, batchFor(main.world, [reaction.job, orphan.job, main.job]));
  assert.equal(cast(result).portrait, main.job.asset!.url);
  assert.deepEqual(cast(result).portraits, { main: main.job.asset!.url, reaction: reaction.job.asset!.url });
  assert.notEqual(cast(result, 'zhangwei').portrait, orphan.job.asset!.url);
  assert.equal(cast(result, 'zhangwei').portraits?.reaction, undefined);
  assert.deepEqual(main.world, original);
  result.nodes[result.startNodeId].text.push('Only the returned snapshot changes.');
  cast(result).name = 'Only the returned character changes.';
  assert.deepEqual(main.world, original);
});

test('revocation clears generated character fields and a reaction never acts as the mother', async t => {
  const main = await fixture(t), reaction = await fixture(t, '__art_reaction_fangnuo', 1);
  const bound = await bindApprovedCharacters(main.world, batchFor(main.world, [main.job, reaction.job]));
  cast(bound, 'zhangwei').portrait = '/authored-manager.png';
  main.job.review!.decision = 'rejected';
  const result = await bindApprovedCharacters(bound, batchFor(bound, [reaction.job, main.job]));
  assert.equal(cast(result).portrait, undefined);
  assert.equal(cast(result).portraits, undefined);
  assert.equal(cast(result, 'zhangwei').portrait, '/authored-manager.png');
  assert.equal(cast(bound).portrait, main.job.asset!.url);
});

test('wrong batch identity and mismatched character source or kind never bind', async t => {
  const f = await fixture(t);
  for (const change of [{ worldId: 'other' }, { worldVersion: 'older' }, { storyId: 'other-source' }]) {
    const result = await bindApprovedCharacters(f.world, { ...batchFor(f.world, [f.job]), ...change });
    assert.notEqual(cast(result).portrait, f.job.asset!.url);
  }
  for (const change of [{ worldId: 'other' }, { nodeId: '__art_character_fangnuo_extra' },
    { sourceHash: 'changed-source' }, { assetKind: 'character-reaction' as const }]) {
    const result = await bindApprovedCharacters(f.world, batchFor(f.world, [{ ...f.job, ...change }]));
    assert.notEqual(cast(result).portrait, f.job.asset!.url);
  }
});

test('queue, native-pixel and duplicate metadata all remain mandatory', async t => {
  const f = await fixture(t);
  assert.equal(await verifiedNativeArt(f.job, 'portrait'), true);
  for (const change of [{ stale: true }, { state: 'resolution_mismatch' as const }, { review: undefined },
    { review: { ...f.job.review!, decision: 'rejected' as const } }]) {
    assert.equal(await verifiedNativeArt({ ...f.job, ...change }, 'portrait'), false);
  }
  for (const change of [{ native4k: false }, { originalPixels: false }, { duplicate: true }, { bytes: f.bytes.length + 1 },
    { width: 2730 }, { sha256: '0'.repeat(64) }, { url: '/generated-art/../secret.png' }]) {
    const job = { ...f.job, asset: { ...f.job.asset!, ...change } } as ArtJob;
    assert.equal(await verifiedNativeArt(job, 'portrait'), false);
  }
});

test('fresh full-frame, native-detail, style, baseline and SHA evidence is required on every read', async t => {
  const f = await fixture(t);
  for (const change of [{ nativeDetailViewed: false }, { fullImageViewed: false }, { styleReviewed: false },
    { styleBaseline: 'old-baseline' }, { sha256: '0'.repeat(64) }, { decision: 'rejected' }, { reviewer: '' }, { notes: 'Too short' }]) {
    await writeFile(f.reviewFile, JSON.stringify({ ...f.review, ...change }));
    assert.equal(await verifiedNativeArt(f.job, 'portrait'), false);
  }
  await writeFile(f.reviewFile, JSON.stringify(f.review));
  assert.equal(await verifiedNativeArt(f.job, 'portrait'), true);
  await writeFile(f.file, 'corrupt PNG');
  assert.equal(await verifiedNativeArt(f.job, 'portrait'), false);
  await writeFile(f.file, f.bytes);
  await rm(f.reviewFile);
  assert.equal(await verifiedNativeArt(f.job, 'portrait'), false);
});

test('portrait and landscape dimensions are verified from the original PNG independently of metadata claims', async t => {
  const small = await fixture(t, '__art_character_fangnuo', 0, 1024, 1536);
  const portrait = await fixture(t), landscape = await fixture(t, '__art_character_zhangwei', 2, 3840, 2160);
  assert.equal(await verifiedNativeArt(small.job, 'portrait'), false);
  assert.equal(await verifiedNativeArt(portrait.job, 'portrait'), true);
  assert.equal(await verifiedNativeArt(portrait.job, 'landscape'), false);
  assert.equal(await verifiedNativeArt(landscape.job, 'portrait'), false);
  assert.equal(await verifiedNativeArt(landscape.job, 'landscape'), true);
});

test('identical pixels cannot be assigned to a second character even if both queue flags claim distinct originals', async t => {
  const trainer = await fixture(t), manager = await fixture(t, '__art_character_zhangwei');
  assert.equal(trainer.job.asset!.sha256, manager.job.asset!.sha256);
  const world = trainer.world;
  world.characters = [cast(world), cast(world, 'zhangwei')];
  const result = await bindApprovedCharacters(world, batchFor(world, [trainer.job, manager.job]));
  assert.equal(cast(result).portrait, trainer.job.asset!.url);
  assert.notEqual(cast(result, 'zhangwei').portrait, manager.job.asset!.url);
});

test('an approved source-book supporting character binds without changing the authored cast', async t => {
  const main = await fixture(t, '__art_character_trainer');
  const reaction = await fixture(t, '__art_reaction_trainer', 1);
  const before = structuredClone(main.world.characters);
  const bound = await bindApprovedCharacters(main.world, batchFor(main.world, [reaction.job, main.job]));
  assert.deepEqual(bound.characters, before);
  assert.equal(bound.artCharacters?.find(character => character.id === 'trainer')?.portraits?.main, main.job.asset!.url);
  assert.equal(bound.artCharacters?.find(character => character.id === 'trainer')?.portraits?.reaction, reaction.job.asset!.url);
  main.job.review!.decision = 'rejected';
  const revoked = await bindApprovedCharacters(bound, batchFor(main.world, [reaction.job, main.job]));
  assert.equal(revoked.artCharacters, undefined);
});

test('the station worker has its own display identity and a manager reaction still requires a mother', async t => {
  const staff = await fixture(t, '__art_character_staff');
  const manager = await fixture(t, '__art_reaction_manager', 1);
  const bound = await bindApprovedCharacters(staff.world, batchFor(staff.world, [staff.job, manager.job]));
  assert.equal(bound.artCharacters?.length, 1);
  assert.equal(bound.artCharacters?.[0].id, 'staff');
  assert.equal(bound.artCharacters?.[0].name, '地铁工作人员');
});
