import assert from 'node:assert/strict';
import { mkdir, readFile, rename, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import test from 'node:test';
import type { GeneratedDraft, ImportedSource } from '../shared/workshop.ts';
import { editorialHash } from '../server/workshop-editorial.ts';
import { applyDraftRecovery, stageDraftRecovery } from '../server/workshop-recovery.ts';
import { jsonFile, writeJson, type LockOwner } from '../server/story-workshop.ts';
import { extendedRoute, recoveryFixture, recoveryObservations, recoverySource, testText } from './helpers/workshop-recovery-fixture.ts';

type Fixture = Awaited<ReturnType<typeof recoveryFixture>>;
interface Selection {
  id: string; revision: number; sourceHash: string; draftHash: string; draft: GeneratedDraft;
  notes: { sourceHash: string; observedDraftHash: string; notes: string[]; repairMode: string };
  provenance: string[]; appliedAt?: string;
}
interface Output { inputHash: string; outputHash?: string; message?: string; data: Record<string, unknown> }
const selectionFile = (fixture: Fixture) => join(fixture.directory, 'draft-recovery.json');
const stage = (fixture: Fixture) => stageDraftRecovery(fixture.service, fixture.project.id, fixture.snapshot, fixture.repairs, recoveryObservations);
async function owner(fixture: Fixture, overrides: Partial<LockOwner> = {}): Promise<LockOwner> {
  const lock = join(fixture.service.dir(fixture.project.id), 'job.lock');
  await mkdir(lock, { recursive: true });
  const value: LockOwner = { token: 'test-next-worker-token', pid: process.pid, heartbeat: new Date().toISOString(), ...overrides };
  await writeJson(join(lock, 'owner.json'), value);
  return value;
}
async function unchangedFiles(fixture: Fixture) {
  const paths = [join(fixture.service.dir(fixture.project.id), 'source.json'), join(fixture.service.dir(fixture.project.id), 'project.json'),
    join(fixture.published, 'world.json'), join(fixture.published, 'draft.json'), join(fixture.directory, 'draft.json'),
    join(fixture.directory, 'outline.json'), ...fixture.draft.routes.map(route => join(fixture.directory, `route-${route.routeId}.json`))];
  const contents = new Map<string, string>();
  for (const file of paths) contents.set(file, await readFile(file, 'utf8'));
  return async () => { for (const [file, bytes] of contents) assert.equal(await readFile(file, 'utf8'), bytes, basename(file)); };
}

test('recovery stages an actual accepted/rejected checkpoint chain without changing source, published, or active draft files', async context => {
  const fixture = await recoveryFixture(context), assertUnchanged = await unchangedFiles(fixture);
  const review = await jsonFile<Output>(fixture.acceptedReview), route = await jsonFile<Output>(fixture.routeRepair);
  const reviewInput = await jsonFile(fixture.acceptedReview.replace(/-a1\.accepted\.json$/, '.input.json'));
  const routeInput = await jsonFile(fixture.routeRepair.replace(/-a1\.rejected\.json$/, '.input.json'));
  assert.equal(review.inputHash, editorialHash(reviewInput)); assert.equal(review.outputHash, editorialHash(review.data));
  assert.equal(route.inputHash, editorialHash(routeInput)); assert.equal(route.message, 'Editorial IDs differ: route_a');
  const result = await stage(fixture), selection = await jsonFile<Selection>(selectionFile(fixture));
  assert.deepEqual(selection.provenance, [fixture.snapshot, ...fixture.repairs]);
  assert.deepEqual(result.provenance, selection.provenance);
  assert.equal(selection.draftHash, editorialHash(selection.draft)); assert.equal(result.draftHash, selection.draftHash);
  assert.equal((result.validation as { status: string }).status, 'passed');
  assert.equal(selection.draft.outline.opening.title, 'TEST repaired opening');
  assert.deepEqual(selection.draft.routes[0], extendedRoute(fixture.draft.routes[0]));
  assert.deepEqual(selection.draft.routes.slice(1), fixture.draft.routes.slice(1));
  assert.deepEqual(selection.notes, { sourceHash: editorialHash(recoverySource), observedDraftHash: selection.draftHash,
    notes: recoveryObservations, repairMode: 'preserve-and-extend-v2' });
  assert.equal(selection.appliedAt, undefined);
  assert.deepEqual(await jsonFile(join(result.archive, 'previous-draft.json')), fixture.draft);
  assert.deepEqual(await jsonFile(join(result.archive, 'selection.json')), selection);
  await assertUnchanged();
  await assert.rejects(readFile(join(fixture.service.dir(fixture.project.id), 'job.lock', 'owner.json')), { code: 'ENOENT' });
});

test('recovery accepts genuine accepted repair output hashes and rejects changes to review and repair checksums', async context => {
  const accepted = await recoveryFixture(context, 'accepted');
  await stage(accepted);
  assert.match((await jsonFile<Selection>(selectionFile(accepted))).draft.routes[0].scenes[0].text[0], /^TEST accepted repair/);
  for (const target of ['review-input', 'review-output', 'repair-input', 'repair-output'] as const) {
    const fixture = await recoveryFixture(context, 'accepted');
    const file = target.startsWith('review') ? fixture.acceptedReview : fixture.routeRepair;
    const output = await jsonFile<Output>(file);
    if (target.endsWith('input')) output.inputHash = 'test-invalid-input-hash';
    else output.outputHash = 'test-invalid-output-hash';
    await writeJson(file, output);
    await assert.rejects(stage(fixture), /checksum differs|exact previous draft|unrelated reason/, target);
    await assert.rejects(readFile(selectionFile(fixture)), { code: 'ENOENT' });
  }
});

test('recovery requires a verified whole-round review and exact hash-addressed input filename', async context => {
  const noReview = await recoveryFixture(context);
  await rename(noReview.acceptedReview, `${noReview.acceptedReview}.test-backup`);
  await assert.rejects(stage(noReview), /no complete verified model review/);
  const badName = await recoveryFixture(context);
  const file = badName.acceptedReview.replace(/-a1\.accepted\.json$/, '.input.json');
  await rename(file, join(badName.runDirectory, 'review-r0-test-invalid-hash.input.json'));
  await assert.rejects(stage(badName), /no complete verified model review/);
  const wrongSnapshot = await recoveryFixture(context);
  await assert.rejects(stageDraftRecovery(wrongSnapshot.service, wrongSnapshot.project.id,
    join(wrongSnapshot.directory, 'draft.json'), [], recoveryObservations), /outside its editorial run/);
  await assert.rejects(stageDraftRecovery(wrongSnapshot.service, wrongSnapshot.project.id,
    wrongSnapshot.acceptedReview, [], recoveryObservations), /complete editorial round snapshot/);
});

test('recovery rejects changed source envelopes, stale draft chains, removed IDs, and unrelated rejection reasons', async context => {
  const source = await recoveryFixture(context);
  await writeJson(join(source.service.dir(source.project.id), 'source.json'), { ...recoverySource, author: 'TEST changed source author' });
  await assert.rejects(stage(source), /source envelope differs|original source hash differs/);
  const chain = await recoveryFixture(context);
  await assert.rejects(stageDraftRecovery(chain.service, chain.project.id, chain.snapshot, [chain.routeRepair], recoveryObservations), /exact previous draft/);
  await assert.rejects(stageDraftRecovery(chain.service, chain.project.id, chain.snapshot, [...chain.repairs, chain.routeRepair], recoveryObservations), /exact previous draft/);
  for (const mode of ['replace-scene', 'remove-choice', 'unrelated-rejection'] as const) {
    const fixture = await recoveryFixture(context, mode), assertUnchanged = await unchangedFiles(fixture);
    await assert.rejects(stage(fixture), /removed a scene or choice|unrelated reason/);
    await assertUnchanged();
    await assert.rejects(readFile(selectionFile(fixture)), { code: 'ENOENT' });
  }
});

test('recovery rejects changed run identities and bounded observation violations before publishing a selection', async context => {
  for (const field of ['protocol', 'inputDraftHash', 'sourceHash', 'draft'] as const) {
    const fixture = await recoveryFixture(context), file = join(fixture.runDirectory, 'input.json');
    const input = await jsonFile<Record<string, unknown>>(file);
    if (field === 'draft') (input.draft as GeneratedDraft).outline.opening.title = 'TEST tampered original';
    else input[field] = 'test-invalid-run-identity';
    await writeJson(file, input);
    await assert.rejects(stage(fixture), /run identity differs|source envelope differs/);
    await assert.rejects(readFile(selectionFile(fixture)), { code: 'ENOENT' });
  }
  const fixture = await recoveryFixture(context), assertUnchanged = await unchangedFiles(fixture);
  for (const notes of [[], [' '], ['x'.repeat(2501)], Array<string>(33).fill('TEST observation')]) {
    await assert.rejects(stageDraftRecovery(fixture.service, fixture.project.id, fixture.snapshot, fixture.repairs, notes), /bounded review observations/);
  }
  await assertUnchanged();
  await assert.rejects(readFile(selectionFile(fixture)), { code: 'ENOENT' });
});

test('staging refuses live locks and running or already-published revisions without replacing their owner', async context => {
  const fixture = await recoveryFixture(context), currentOwner = await owner(fixture), assertUnchanged = await unchangedFiles(fixture);
  await assert.rejects(stage(fixture), { code: 'EEXIST' });
  assert.deepEqual(await jsonFile(join(fixture.service.dir(fixture.project.id), 'job.lock', 'owner.json')), currentOwner);
  await assertUnchanged();
  fixture.project.status = 'running'; await fixture.service.save(fixture.project);
  await assert.rejects(stage(fixture), /inactive unpublished revision/);
  const published = await recoveryFixture(context);
  published.project.publishedVersion = 'r2'; await published.service.save(published.project);
  await assert.rejects(stage(published), /inactive unpublished revision/);
  const revision = await recoveryFixture(context);
  revision.project.revision = 3; await revision.service.save(revision.project);
  await mkdir(join(revision.service.dir(revision.project.id), 'r3', 'editorial'), { recursive: true });
  await assert.rejects(stage(revision), /outside its editorial run/);
});

test('apply requires exact owner token and PID plus matching source and revision checksums', async context => {
  const fixture = await recoveryFixture(context); await stage(fixture);
  const currentOwner = await owner(fixture);
  fixture.project.status = 'running'; fixture.project.jobId = currentOwner.token; await fixture.service.save(fixture.project);
  const assertUnchanged = await unchangedFiles(fixture);
  await assert.rejects(applyDraftRecovery(fixture.service, fixture.project, recoverySource, 'test-wrong-token'), /ownership or snapshot checksum differs/);
  await owner(fixture, { pid: process.ppid });
  await assert.rejects(applyDraftRecovery(fixture.service, fixture.project, recoverySource, currentOwner.token), /ownership or snapshot checksum differs/);
  await owner(fixture);
  const changed: ImportedSource = { ...recoverySource, text: `${recoverySource.text} TEST changed.` };
  await assert.rejects(applyDraftRecovery(fixture.service, fixture.project, changed, currentOwner.token), /ownership or snapshot checksum differs/);
  await assert.rejects(applyDraftRecovery(fixture.service, { ...fixture.project, sourceHash: 'test-wrong-source-hash' }, recoverySource, currentOwner.token), /ownership or snapshot checksum differs/);
  await assert.rejects(applyDraftRecovery(fixture.service, { ...fixture.project, publishedVersion: 'r2' }, recoverySource, currentOwner.token), /ownership or snapshot checksum differs/);
  const original = await jsonFile<Selection>(selectionFile(fixture));
  for (const change of [
    (value: Selection) => { value.id = 'import-00000000-0000-4000-8000-000000000000'; },
    (value: Selection) => { value.revision = 1; },
    (value: Selection) => { value.draft.outline.opening.title = 'TEST changed after selection'; },
    (value: Selection) => { value.notes.sourceHash = 'test-wrong-notes-source'; },
    (value: Selection) => { value.notes.observedDraftHash = 'test-wrong-observed-draft'; },
    (value: Selection) => { value.notes.repairMode = 'test-unexpected-repair-mode'; },
  ]) {
    const selection = structuredClone(original); change(selection); await writeJson(selectionFile(fixture), selection);
    await assert.rejects(applyDraftRecovery(fixture.service, fixture.project, recoverySource, currentOwner.token), /ownership or snapshot checksum differs/);
    assert.equal((await jsonFile<Selection>(selectionFile(fixture))).appliedAt, undefined);
  }
  await assertUnchanged();
});

test('apply reads current source, job, revision, and publication state instead of trusting an old caller snapshot', async context => {
  const fixture = await recoveryFixture(context); await stage(fixture);
  const currentOwner = await owner(fixture);
  fixture.project.status = 'running'; fixture.project.jobId = currentOwner.token; await fixture.service.save(fixture.project);
  const sourceFile = join(fixture.service.dir(fixture.project.id), 'source.json');
  await writeJson(sourceFile, { ...recoverySource, author: 'TEST changed on disk' });
  await assert.rejects(applyDraftRecovery(fixture.service, fixture.project, recoverySource, currentOwner.token), /ownership or snapshot checksum differs/);
  await writeJson(sourceFile, recoverySource);
  for (const change of [
    { jobId: 'test-new-job-owner' }, { revision: 3 }, { status: 'failed' as const }, { publishedVersion: 'r2' },
  ]) {
    await fixture.service.save({ ...fixture.project, ...change });
    await assert.rejects(applyDraftRecovery(fixture.service, fixture.project, recoverySource, currentOwner.token), /ownership or snapshot checksum differs/);
    assert.equal((await jsonFile<Selection>(selectionFile(fixture))).appliedAt, undefined);
  }
  assert.deepEqual(await jsonFile(join(fixture.directory, 'draft.json')), fixture.draft);
});

test('an interrupted apply leaves no applied marker and replays a complete candidate with its notes', async context => {
  const fixture = await recoveryFixture(context); await stage(fixture);
  const currentOwner = await owner(fixture);
  fixture.project.status = 'running'; fixture.project.jobId = currentOwner.token; await fixture.service.save(fixture.project);
  const selection = await jsonFile<Selection>(selectionFile(fixture)), notesFile = join(fixture.directory, 'editorial-notes.json');
  await mkdir(notesFile);
  await assert.rejects(applyDraftRecovery(fixture.service, fixture.project, recoverySource, currentOwner.token));
  assert.equal((await jsonFile<Selection>(selectionFile(fixture))).appliedAt, undefined);
  assert.deepEqual(await jsonFile(join(fixture.directory, 'draft.json')), selection.draft);
  await rm(notesFile, { recursive: true });
  await applyDraftRecovery(fixture.service, fixture.project, recoverySource, currentOwner.token);
  assert.deepEqual(await jsonFile(join(fixture.directory, 'editorial-notes.json')), selection.notes);
  assert.deepEqual(await jsonFile(join(fixture.directory, 'outline.json')), selection.draft.outline);
  for (const route of selection.draft.routes) assert.deepEqual(await jsonFile(join(fixture.directory, `route-${route.routeId}.json`)), route);
  assert.ok((await jsonFile<Selection>(selectionFile(fixture))).appliedAt);
});

test('apply writes the candidate and notes, marks applied last, and repeat apply preserves a later draft', async context => {
  const fixture = await recoveryFixture(context), publishedBefore = await readFile(join(fixture.published, 'world.json'), 'utf8');
  const sourceBefore = await readFile(join(fixture.service.dir(fixture.project.id), 'source.json'), 'utf8');
  await stage(fixture);
  const selection = await jsonFile<Selection>(selectionFile(fixture)), currentOwner = await owner(fixture);
  fixture.project.status = 'running'; fixture.project.jobId = currentOwner.token; await fixture.service.save(fixture.project);
  await applyDraftRecovery(fixture.service, fixture.project, recoverySource, currentOwner.token);
  assert.deepEqual(await jsonFile(join(fixture.directory, 'draft.json')), selection.draft);
  assert.deepEqual(await jsonFile(join(fixture.directory, 'outline.json')), selection.draft.outline);
  for (const route of selection.draft.routes) assert.deepEqual(await jsonFile(join(fixture.directory, `route-${route.routeId}.json`)), route);
  assert.deepEqual(await jsonFile(join(fixture.directory, 'editorial-notes.json')), selection.notes);
  const applied = await jsonFile<Selection>(selectionFile(fixture));
  assert.ok(applied.appliedAt && Number.isFinite(Date.parse(applied.appliedAt)));
  const later = structuredClone(selection.draft); later.outline.opening.text[0] = `TEST later worker draft. ${testText}`;
  await writeJson(join(fixture.directory, 'draft.json'), later);
  await writeJson(join(fixture.directory, 'outline.json'), later.outline);
  await applyDraftRecovery(fixture.service, fixture.project, recoverySource, currentOwner.token);
  assert.deepEqual(await jsonFile(join(fixture.directory, 'draft.json')), later);
  assert.deepEqual(await jsonFile(join(fixture.directory, 'outline.json')), later.outline);
  assert.deepEqual(await jsonFile(selectionFile(fixture)), applied);
  assert.equal(await readFile(join(fixture.published, 'world.json'), 'utf8'), publishedBefore);
  assert.equal(await readFile(join(fixture.service.dir(fixture.project.id), 'source.json'), 'utf8'), sourceBefore);
});
