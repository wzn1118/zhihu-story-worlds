import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.ts';
import { StoryWorkshop, writeJson } from '../server/story-workshop.ts';
import { createWorkshopImageService } from '../server/workshop-images.ts';
import { originalSeed } from '../shared/workshop.ts';
import type { ArtBatch } from '../shared/production.ts';
import type { GameWorld } from '../shared/types.ts';

function world(projectId: string, version = 'r1'): GameWorld {
  return { id: `generated-${projectId}`, storyId: projectId, title: 'Same title', subtitle: '', summary: '', version,
    source: { title: 'Fixture source', author: 'Fixture author', url: '' }, introduction: [], objective: '',
    player: { name: 'Fixture', role: 'Fixture' }, characters: [], background: '', cover: '', ink: {}, clueVariables: {},
    generated: { projectId, revision: Number(version.slice(1)), artReady: false }, startNodeId: 'first',
    adaptation: { scope: 'based-on-imported-source', adultCast: true, note: '' },
    nodes: { first: { id: 'first', title: 'First scene', chapter: '', location: 'Room', time: 'Night', text: ['Fixture scene.'], background: '', choices: [], artBrief: 'Fixture only.' } } };
}

test('project art reads use current independent snapshots and exact project/version identities without creating jobs', async t => {
  const root = await mkdtemp(join(tmpdir(), 'workshop-manifest-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workshop = new StoryWorkshop(join(root, 'projects-store'));
  const projects = await Promise.all([0, 1, 2].map(index => workshop.import({ ...originalSeed, scope: 'user-import', text: `${originalSeed.text}\nFixture ${index}`, generationOptions: { images: 'image2' } })));
  const service = createWorkshopImageService({ root, startWorker: () => { throw new Error('Reads must not start a worker'); } });
  const versions = [world(projects[0].id), world(projects[0].id, 'r2'), world(projects[1].id), world(projects[2].id)];
  versions[0].id = `workshop-${projects[0].id.slice('import-'.length)}-r1`;
  for (const version of versions) {
    await mkdir(join(workshop.dir(version.storyId), version.version));
    await writeJson(join(workshop.dir(version.storyId), version.version, 'world.json'), version);
  }
  const batches = await Promise.all(versions.slice(0, 3).map(version => service.prepareImages(version)));
  assert.notEqual(batches[0].id, batches[1].id);
  assert.notEqual(batches[0].id, batches[2].id);
  assert.notEqual(batches[0].jobs[0].id, batches[2].jobs[0].id);
  for (const project of projects) {
    project.publishedVersion = 'r1'; project.playable = true;
    project.art = { status: 'ready', batchId: batches[1].id, approved: 999, total: 999 };
    await workshop.save(project);
  }
  projects[0].revision = 2; projects[0].status = 'failed';
  projects[0].art.batchId = 'art_legacy_global';
  await workshop.save(projects[0]);
  const savedProjects = await Promise.all(projects.map(project => readFile(join(workshop.dir(project.id), 'project.json'), 'utf8')));
  const stateFile = join(root, 'output/workshop-images/.private/state.json'), savedImages = await readFile(stateFile, 'utf8');
  let globalReads = 0;
  const legacyBatch = { ...structuredClone(batches[0]), id: 'art_legacy_global' };
  const lookup = { getImages: async (id: string) => structuredClone([legacyBatch, ...batches].find(batch => batch.id === id) ?? null), listImages: async () => structuredClone([legacyBatch, ...batches]) };
  const server = createServer(createApp(undefined, workshop, undefined, {
    getArtBatch: async () => { globalReads++; return batches[0]; }, listArtBatches: async () => { globalReads++; return batches; },
  }, lookup));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  async function get(path: string) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    return response.json();
  }
  assert.deepEqual(await get(`/api/workshop/projects/${projects[0].id}/art`), batches[0]);
  assert.deepEqual(await get(`/api/workshop/projects/${projects[0].id}/art?version=r2`), batches[1]);
  assert.deepEqual(await get(`/api/workshop/projects/${projects[1].id}/art?version=r1`), batches[2]);
  assert.equal(await get(`/api/workshop/projects/${projects[2].id}/art?version=r1`), null);
  assert.equal((await fetch(`${base}/api/workshop/projects/${projects[0].id}/art?version=r9`)).status, 404);
  assert.equal((await fetch(`${base}/api/workshop/projects/${projects[0].id}/art?version=invalid`)).status, 409);

  const list = await get('/api/workshop/projects');
  assert.equal(list.projects.find((project: { id: string }) => project.id === projects[0].id).art.batchId, batches[0].id);
  assert.equal(list.projects.find((project: { id: string }) => project.id === projects[1].id).art.batchId, batches[2].id);
  assert.equal(list.projects.find((project: { id: string }) => project.id === projects[2].id).art.batchId, undefined);
  const detail = await get(`/api/workshop/projects/${projects[0].id}`);
  assert.equal(detail.publishedVersion, 'r1'); assert.equal(detail.revision, 2); assert.equal(detail.art.approved, 0); assert.equal(detail.art.total, 1);
  // Simulate a new public worker snapshot, leaving the persisted project unchanged.
  batches[0].progress.generated = 1; batches[0].progress.covered = 1;
  assert.equal((await get(`/api/workshop/projects/${projects[0].id}`)).art.approved, 1);
  const updatedList = await get('/api/workshop/projects');
  assert.equal(updatedList.projects.find((project: { id: string }) => project.id === projects[0].id).art.approved, 1);
  const bound = await get(`/api/workshop/projects/${projects[0].id}/world?version=r1`);
  assert.equal(bound.storyId, projects[0].id); assert.equal(bound.id, versions[0].id); assert.equal(bound.version, 'r1'); assert.equal(globalReads, 0);
  const all = await get('/api/workshop/images');
  assert.equal(all.batches.length, 4);
  assert.deepEqual(await get(`/api/workshop/images/${batches[0].id}`), batches[0]);
  const legacyPost = await fetch(`${base}/api/art/batches`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ storyId: projects[0].id }) });
  assert.equal(legacyPost.status, 409); assert.equal((await legacyPost.json()).error.code, 'WORKSHOP_ART_ENDPOINT_REQUIRED');
  assert.equal(globalReads, 0);
  assert.equal(await readFile(stateFile, 'utf8'), savedImages);
  assert.deepEqual(await Promise.all(projects.map(project => readFile(join(workshop.dir(project.id), 'project.json'), 'utf8'))), savedProjects);
  assert.ok((await service.listImages()).every((batch: ArtBatch) => batch.progress.paidAttemptsTotal === 0));
});
