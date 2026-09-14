import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { ArtJob } from '../shared/production.ts';
import { FILM_PREFIX, FILM_SUFFIX, FILM_REFERENCE_ROLE, FILM_PROFILE, guardFilmRun, heldFilmJobs, validateFilmDirection, validateFilmDispatch, type FilmSelection } from '../server/art-production-film.ts';

const row = { prompt: FILM_PREFIX + 'Original character, actual scene. ' + FILM_REFERENCE_ROLE + FILM_SUFFIX,
  sourceSnapshotHash: 'actual-source-hash', sourceFacts: ['Actual node action'] };
const job = (worldId = 'world-a', extra: Partial<ArtJob> = {}) => ({ id: `${worldId}-first`, worldId, nodeId: 'first',
  state: 'queued', stale: false, paidAttempts: 0, recoveryAvailable: false, ...extra } as ArtJob);

test('film directions preserve exact short prompt and require source freshness', () => {
  validateFilmDirection(row, row.sourceSnapshotHash);
  assert.throws(() => validateFilmDirection(row, 'changed-source'), /SOURCE_CHANGED/);
  assert.throws(() => validateFilmDirection({ ...row, prompt: 'old technical recipe' }, row.sourceSnapshotHash), /INVALID_FILM/);
  assert.throws(() => validateFilmDirection({ ...row, sourceFacts: [] }, row.sourceSnapshotHash), /INVALID_FILM/);
});
test('at most two distinct worlds and global paid concurrency', () => {
  validateFilmDispatch([], [job(), job('world-b')], []);
  assert.throws(() => validateFilmDispatch([], [job(), job()], []), /DISTINCT/);
  assert.throws(() => validateFilmDispatch([], [job(), job('b'), job('c')], []), /DISTINCT/);
  assert.throws(() => validateFilmDispatch([job('running', { state: 'generating' })], [job(), job('b')], []), /GLOBAL_TWO/);
});
test('a revised prompt never permits repeating a previously paid scene', () => {
  assert.throws(() => validateFilmDispatch([job('world-a', { id: 'old-revision', paidAttempts: 1 })], [job()], []), /PREVIOUSLY_PAID/);
  assert.throws(() => validateFilmDispatch([], [job('a', { paidAttempts: 1 })], []), /UNTOUCHED/);
});
test('unknown outcomes require inspection and no new batch follows unreviewed deliveries', () => {
  assert.throws(() => validateFilmDispatch([job('unknown', { state: 'unknown_outcome', paidAttempts: 1 })], [job()], []), /UNCERTAINTY/);
  assert.throws(() => validateFilmDispatch([], [job()], [job('previous', { paidAttempts: 1, state: 'generated' })]), /REQUIRE_APPROVAL/);
  const prior = job('previous', { asset: { native4k: true, duplicate: false } as ArtJob['asset'],
    review: { decision: 'approved' } as ArtJob['review'] });
  validateFilmDispatch([], [job()], [prior]);
  assert.throws(() => validateFilmDispatch([], [job()], [{ ...prior, stale: true }]), /REQUIRE_APPROVAL/);
});

test('explicit correction accepts only a reviewed known delivery, never an uncertain or repeated history', () => {
  const previous = job('world-a', { id: 'known-old', state: 'resolution_mismatch', stale: true, paidAttempts: 1,
    asset: { originalPixels: true, native4k: false } as ArtJob['asset'], review: { decision: 'rejected' } as ArtJob['review'] });
  validateFilmDispatch([previous], [job()], [], { 'world-a-first': 'known-old' });
  assert.throws(() => validateFilmDispatch([{ ...previous, asset: undefined }], [job()], [], { 'world-a-first': 'known-old' }), /PREVIOUSLY_PAID/);
  assert.throws(() => validateFilmDispatch([{ ...previous, review: undefined }], [job()], [], { 'world-a-first': 'known-old' }), /PREVIOUSLY_PAID/);
  assert.throws(() => validateFilmDispatch([previous, { ...previous, id: 'second-history' }], [job()], [], { 'world-a-first': 'known-old' }), /PREVIOUSLY_PAID/);
});

test('a manual per-node hold only skips a known rejected delivery, never an unknown outcome', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'film-hold-test-'));
  const folder = path.join(root, 'output/imagegen/scene-production', FILM_PROFILE);
  await mkdir(folder, { recursive: true });
  const held = job('world-a', { state: 'resolution_mismatch', paidAttempts: 1,
    asset: { originalPixels: true, sha256: 'known-hash' } as ArtJob['asset'],
    review: { decision: 'rejected' } as ArtJob['review'] });
  const rows = [{ jobId: held.id, worldId: held.worldId, nodeId: held.nodeId } as FilmSelection];
  await writeFile(path.join(folder, 'holds.json'), JSON.stringify([{ jobId: held.id,
    worldId: held.worldId, nodeId: held.nodeId, sha256: 'known-hash', reason: 'Inspected low-resolution original' }]));
  assert.deepEqual(await heldFilmJobs(root, rows, [held]), new Set([held.id]));
  await assert.rejects(heldFilmJobs(root, rows, [{ ...held, state: 'unknown_outcome' }]), /KNOWN_REVIEWED/);
  await assert.rejects(heldFilmJobs(root, rows, [{ ...held, review: undefined }]), /KNOWN_REVIEWED/);
  await assert.rejects(heldFilmJobs(root, rows, [{ ...held, asset: { ...held.asset!, sha256: 'changed' } }]), /KNOWN_REVIEWED/);
});

test('selecting a new profile leaves the old film hold intact for its exact job', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'film-selection-test-'));
  const folder = path.join(root, 'output/imagegen/scene-production', FILM_PROFILE);
  await mkdir(folder, { recursive: true });
  const held = { ...job('world-a', { state: 'resolution_mismatch', paidAttempts: 1,
    asset: { originalPixels: true, sha256: 'known-hash' } as ArtJob['asset'],
    review: { decision: 'rejected' } as ArtJob['review'] }), prompt: FILM_PREFIX + 'Held old film frame', references: [] };
  const short = { ...job('world-a', { id: 'short-frame', nodeId: 'second' }), prompt: 'New short frame', references: [] };
  const row = { jobId: held.id, worldId: held.worldId, nodeId: held.nodeId };
  await writeFile(path.join(folder, 'wave.json'), JSON.stringify({ profile: FILM_PROFILE, jobs: [row] }));
  await writeFile(path.join(folder, 'holds.json'), JSON.stringify([{ ...row, sha256: 'known-hash', reason: 'Known rejected frame' }]));
  await guardFilmRun(root, 'world-a', [short.id], 8, [held, short]);
  await assert.rejects(guardFilmRun(root, 'world-a', [held.id], 1, [held, short]), /FILM_NODE_HELD/);
});
