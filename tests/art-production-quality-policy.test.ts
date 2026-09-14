import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createArtProductionService, type ArtClientResult } from '../server/art-production.ts';
import { canonical, sha256 } from '../server/art-production-prompts.ts';
import type { ArtQualityPolicy, ArtWorldInput } from '../shared/production.ts';

const world = (id = 'quality-policy', ids = ['first', 'second', 'cover']): ArtWorldInput => ({
  id, storyId: `import-${id}`, title: 'Quality policy fixture', version: '1', characters: [],
  source: { title: 'Offline fixture', author: 'Test', url: '' },
  nodes: Object.fromEntries(ids.map(nodeId => [nodeId, { id: nodeId, title: nodeId, chapter: 'one',
    location: 'set', time: 'day', text: [`Scene ${nodeId}`], background: '', choices: [] }])),
});
const brief = async (_root: string, source: ArtWorldInput, node: ArtWorldInput['nodes'][string]) => ({
  prompt: `${source.id}/${node.id}`, references: [], sourceHash: sha256(canonical(node)), referenceHash: sha256('no-references'),
});
async function setup(execute: NonNullable<Parameters<typeof createArtProductionService>[0]>['execute']) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'art-quality-policy-test-'));
  return { root, service: createArtProductionService({ root, buildBrief: brief, startWorker: () => {}, execute }) };
}
// The injected executor uses synthetic headers, never production media or a provider.
async function lowResolution(directory: string, marker: number): Promise<ArtClientResult> {
  const binary = Buffer.alloc(64);
  binary.write('89504e470d0a1a0a', 0, 'hex');
  binary.writeUInt32BE(1600, 16); binary.writeUInt32BE(900, 20); binary.writeUInt32BE(marker, 32);
  const file = path.join(directory, 'test-only.png');
  await writeFile(file, binary);
  return { state: 'resolution_mismatch', file, width: 1600, height: 900, bytes: binary.length,
    sha256: sha256(binary), native4k: false, recoveryAvailable: true };
}
const review = { decision: 'approved' as const, reviewer: 'test', notes: 'Offline simulated visual approval' };

test('style-first continues after lower-resolution deliveries and approved distinct images count toward coverage', async () => {
  let calls = 0;
  const { root, service } = await setup(async ({ directory }) => lowResolution(directory, ++calls));
  const batch = await service.prepareArtBatch({ world: world(), qualityPolicy: 'style-first', jobKinds: { cover: 'cover' } });
  await service.runArtBatch(batch.id, { maxJobs: 3, concurrency: 1 });
  await service.drain();
  const delivered = (await service.getArtBatch(batch.id))!;
  assert.equal(calls, 3); assert.equal(delivered.state, 'idle'); assert.equal(delivered.circuitBreaker, undefined);
  assert.equal(delivered.progress.generated, 3); assert.equal(delivered.progress.native4k, 0);
  assert.equal(delivered.progress.resolutionMismatch, 3); assert.equal(delivered.progress.covered, 0);
  for (const job of delivered.jobs) {
    assert.equal(job.state, 'resolution_mismatch');
    assert.equal(job.asset?.native4k, false); assert.equal(job.asset?.originalPixels, true);
    assert.equal(job.asset?.width, 1600); assert.equal(job.asset?.height, 900);
    const pixels = await readFile(path.join(root, 'public/generated-art', `${job.id}.png`));
    assert.equal(sha256(pixels), job.asset?.sha256);
    await service.reviewArtJob(batch.id, job.id, review);
  }
  const approved = (await service.getArtBatch(batch.id))!;
  assert.equal(approved.progress.approved, 3); assert.equal(approved.progress.covered, 2);
  assert.equal(approved.progress.ancillaryCovered, 1); assert.equal(approved.progress.missing, 28);
  assert.equal(approved.progress.native4k, 0); assert.equal(approved.progress.ancillaryNative4k, 0);
});

test('default native-4k still stops scheduling and rejects lower-resolution approval', async () => {
  let calls = 0;
  const { service } = await setup(async ({ directory }) => lowResolution(directory, ++calls));
  const batch = await service.prepareArtBatch({ world: world('strict') });
  assert.equal(batch.qualityPolicy, 'native-4k');
  await service.runArtBatch(batch.id, { maxJobs: 3, concurrency: 1 });
  await service.drain();
  const stopped = (await service.getArtBatch(batch.id))!;
  assert.equal(calls, 1); assert.equal(stopped.progress.queued, 2);
  assert.equal(stopped.circuitBreaker?.code, 'NATIVE_4K_GATE_FAILED');
  await assert.rejects(service.reviewArtJob(batch.id, stopped.jobs[0].id, review), /DISTINCT_NATIVE_4K/);
  assert.equal(stopped.progress.covered, 0);
});

test('policy changes persist without new job identities, retain existing gates, and publish only the safe policy', async () => {
  const { root, service } = await setup(async ({ directory }) => lowResolution(directory, 1));
  const source = world('policy-update', ['first']);
  const original = await service.prepareArtBatch({ world: source });
  await service.runArtBatch(original.id, { maxJobs: 1 }); await service.drain();
  const before = (await service.getArtBatch(original.id))!;
  const changed = await service.prepareArtBatch({ world: source, qualityPolicy: 'style-first' });
  assert.equal(changed.jobs[0].id, original.jobs[0].id);
  assert.equal(changed.jobs[0].promptHash, original.jobs[0].promptHash);
  assert.equal(changed.jobs[0].sourceHash, original.jobs[0].sourceHash);
  assert.equal(changed.jobs[0].referenceHash, original.jobs[0].referenceHash);
  assert.equal(changed.jobs[0].paidAttempts, 1);
  assert.deepEqual(changed.circuitBreaker, before.circuitBreaker);
  await service.reviewArtJob(changed.id, changed.jobs[0].id, review);
  assert.equal((await service.prepareArtBatch({ world: source })).qualityPolicy, 'style-first');
  const reopened = createArtProductionService({ root, buildBrief: brief, startWorker: () => {} });
  const persisted = (await reopened.getArtBatch(changed.id))!;
  assert.equal(persisted.qualityPolicy, 'style-first'); assert.equal(persisted.progress.covered, 1);
  assert.equal((await reopened.listArtBatches())[0].qualityPolicy, 'style-first');
  const serialized = JSON.stringify(persisted);
  assert.ok(!serialized.includes(root)); assert.ok(!serialized.includes('"prompt":')); assert.ok(!serialized.includes('"references":'));
  const stateFile = path.join(root, 'output/imagegen/scene-production/.private/state.json');
  const saved = JSON.parse(await readFile(stateFile, 'utf8'));
  assert.equal(saved.batches[0].qualityPolicy, 'style-first');
  const strict = await service.prepareArtBatch({ world: source, qualityPolicy: 'native-4k' });
  assert.equal(strict.jobs[0].id, original.jobs[0].id); assert.equal(strict.progress.covered, 0);
  assert.equal(strict.jobs[0].review?.decision, 'approved');
  const unchanged = await readFile(stateFile, 'utf8');
  await assert.rejects(service.prepareArtBatch({ world: source, qualityPolicy: 'invalid' as ArtQualityPolicy }), /INVALID_ART_QUALITY_POLICY/);
  assert.equal(await readFile(stateFile, 'utf8'), unchanged);
});

test('style-first retains duplicate, integrity and current-revision approval checks', async () => {
  const { root, service } = await setup(async ({ directory }) => lowResolution(directory, 1));
  const source = world('approval-checks', ['first', 'second']);
  const batch = await service.prepareArtBatch({ world: source, qualityPolicy: 'style-first' });
  await service.runArtBatch(batch.id, { maxJobs: 2, concurrency: 1 }); await service.drain();
  const delivered = (await service.getArtBatch(batch.id))!;
  assert.equal(delivered.circuitBreaker?.code, 'DUPLICATE_IMAGE_HASH');
  assert.equal(delivered.jobs[1].asset?.duplicate, true);
  await assert.rejects(service.reviewArtJob(batch.id, delivered.jobs[1].id, review), /DISTINCT_IMAGE/);
  await writeFile(path.join(root, 'public/generated-art', `${delivered.jobs[0].id}.png`), 'tampered');
  await assert.rejects(service.reviewArtJob(batch.id, delivered.jobs[0].id, review), /INTEGRITY_FAILED/);
  source.nodes.first.text = ['A changed current scene'];
  await service.prepareArtBatch({ world: source });
  await assert.rejects(service.reviewArtJob(batch.id, delivered.jobs[0].id, review), /CURRENT_IMAGE/);
});

test('style-first does not clear unknown submissions or permit resubmitting their identities', async () => {
  let calls = 0;
  const { service } = await setup(async () => {
    calls++;
    return { state: 'unknown_outcome', errorCode: 'TRANSPORT_TIMEOUT_UNKNOWN', recoveryAvailable: false };
  });
  const source = world('unknown-policy', ['first']);
  const batch = await service.prepareArtBatch({ world: source });
  await service.runArtBatch(batch.id, { maxJobs: 1 }); await service.drain();
  const changed = await service.prepareArtBatch({ world: source, qualityPolicy: 'style-first' });
  assert.equal(changed.jobs[0].state, 'unknown_outcome'); assert.equal(changed.jobs[0].paidAttempts, 1);
  await assert.rejects(service.runArtBatch(batch.id), /ART_CIRCUIT_OPEN/);
  await service.runArtBatch(batch.id, { maxJobs: 1, acknowledgeBlock: true, jobIds: [batch.jobs[0].id] });
  await service.drain();
  assert.equal(calls, 1);
});

test('an ingestion filesystem failure retains the delivered recovery instead of losing it as an unknown POST', async () => {
  const actions: string[] = [];
  const { root, service } = await setup(async ({ directory, action }) => {
    actions.push(action); return lowResolution(directory, 1);
  });
  await mkdir(path.join(root, 'public'), { recursive: true });
  const obstacle = path.join(root, 'public/generated-art');
  await writeFile(obstacle, 'Offline filesystem failure fixture');
  const batch = await service.prepareArtBatch({ world: world('ingest-recovery', ['first']), qualityPolicy: 'style-first' });
  await service.runArtBatch(batch.id, { maxJobs: 1 }); await service.drain();
  const failed = (await service.getArtBatch(batch.id))!.jobs[0];
  assert.equal(failed.state, 'recoverable'); assert.equal(failed.recoveryAvailable, true);
  assert.equal(failed.paidAttempts, 1); assert.equal(failed.asset, undefined);
  await unlink(obstacle);
  await service.runArtBatch(batch.id, { recoverOnly: true, maxJobs: 1 }); await service.drain();
  const recovered = (await service.getArtBatch(batch.id))!.jobs[0];
  assert.ok(recovered.asset); assert.equal(recovered.paidAttempts, 1);
  assert.deepEqual(actions, ['generate', 'recover']);
});
