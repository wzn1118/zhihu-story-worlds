import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { deflateSync } from 'node:zlib';
import { currentSceneSourceHash, withApprovedArt } from '../server/workshop-art.ts';
import { buildSceneBrief } from '../server/art-production-prompts.ts';
import { buildShortPlans } from '../server/art-production-short.ts';
import { authoredWorlds } from '../content/worlds.ts';
import { createApp } from '../server/app.ts';
import { StoryWorkshop, writeJson } from '../server/story-workshop.ts';
import { StorySourceService } from '../server/story-source.ts';
import { getWorld } from '../server/worlds.ts';
import { originalSeed } from '../shared/workshop.ts';
import { choose, restoreSession, saveSession, startSession } from '../src/game.ts';
import type { ArtBatch, ArtJob } from '../shared/production.ts';
import type { GameWorld } from '../shared/types.ts';

function png(width = 3840, height = 2160) {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    let crc = 0xffffffff;
    for (const value of body) { crc ^= value; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    const output = Buffer.alloc(body.length + 8); output.writeUInt32BE(data.length); body.copy(output, 4); output.writeUInt32BE((crc ^ 0xffffffff) >>> 0, output.length - 4); return output;
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.alloc((width * 3 + 1) * height))), chunk('IEND', Buffer.alloc(0))]);
}
function world(): GameWorld {
  return { id: 'art-binding-unit-test', storyId: '123456789', title: 'test', subtitle: '', summary: '', version: 'r1', startNodeId: 'first',
    introduction: [], player: { name: 'test', role: 'test' }, objective: '', source: { title: 'test', author: 'test', url: '' }, characters: [],
    background: '/original-background.png', cover: '/original-cover.png', ink: {}, clueVariables: {}, adaptation: { scope: 'based-on-api-excerpt', adultCast: true, note: '' },
    nodes: Object.fromEntries(['first', 'second'].map(id => [id, { id, title: id, chapter: '', location: '', time: '', text: [], choices: [], background: `/original-${id}.png` }])) };
}
async function fixture(t: { after: (fn: () => Promise<void>) => void }, base = world()) {
  const url = `/generated-art/workshop-test-${randomUUID()}/image.png`, dir = resolve('public', `.${url}`, '..');
  await mkdir(dir, { recursive: true }); t.after(() => rm(dir, { recursive: true, force: true }));
  const bytes = png(); await writeFile(resolve('public', `.${url}`), bytes);
  const job: ArtJob = { id: 'job', worldId: base.id, nodeId: base.startNodeId, sceneTitle: base.startNodeId, sourceHash: currentSceneSourceHash(base, base.nodes[base.startNodeId]), promptHash: 'test', referenceHash: 'test', stale: false, state: 'generated', requested: { aspectRatio: '16:9', resolution: '4K' }, paidAttempts: 0, recoveryAttempts: 0, recoveryAvailable: false, createdAt: '', updatedAt: '',
    asset: { url, width: 3840, height: 2160, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), native4k: true, originalPixels: true, duplicate: false },
    review: { decision: 'approved', reviewer: 'unit-test-only', notes: 'Synthetic unit-test PNG, not production artwork.', reviewedAt: '' } };
  const batch = { id: base.storyId.startsWith('import-') ? `wart_${randomUUID().replaceAll('-', '').slice(0, 20)}` : randomUUID(), worldId: base.id, storyId: base.storyId, worldVersion: base.version, jobs: [job] } as ArtBatch;
  const service = { getArtBatch: async () => batch, listArtBatches: async () => [batch] };
  return { batch, job, service, bytes };
}
test('authored art lookup uses a fresh immutable snapshot; rejection is visible on the next read', async t => {
  const { job, service } = await fixture(t), base = world(), original = structuredClone(base);
  const bound = await withApprovedArt(base, undefined, service);
  assert.equal(bound.nodes.first.background, job.asset!.url); assert.equal(bound.cover, job.asset!.url);
  assert.deepEqual(base, original); assert.notEqual(bound.nodes.first, base.nodes.first);
  job.review!.decision = 'rejected';
  assert.deepEqual(await withApprovedArt(base, undefined, service), original);
  const rebound = await withApprovedArt(bound, undefined, service);
  assert.equal(rebound.nodes.first.background, ''); assert.equal(rebound.cover, ''); assert.equal(rebound.background, '');
});

test('imported worlds reject global art namespace even when source and image approval match', async t => {
  const base = { ...world(), id: 'workshop-legacy-world-r1', storyId: 'import-00000000-0000-4000-8000-000000000001' };
  const { batch, job, service } = await fixture(t, base);
  const independentId = batch.id;
  assert.equal((await withApprovedArt(base, independentId, service)).nodes.first.background, job.asset!.url);
  batch.id = 'art_legacy_global';
  assert.equal((await withApprovedArt(base, batch.id, service)).nodes.first.background, base.nodes.first.background);
  assert.equal((await withApprovedArt(base, undefined, service)).nodes.first.background, base.nodes.first.background);
});
test('stale, wrong-version, duplicate, corrupted and non-native files never bind', async t => {
  const f = await fixture(t), base = world(), original = structuredClone(f.batch);
  for (const change of [
    () => { f.job.stale = true; }, () => { f.batch.worldVersion = 'r0'; }, () => { f.batch.storyId = 'import-other'; }, () => { f.job.asset!.duplicate = true; },
    () => { f.job.asset!.sha256 = '0'.repeat(64); }, () => { f.job.asset!.width = 2000; },
    () => { f.job.asset!.native4k = false; }, () => { f.job.asset!.url = '/generated-art/../secret.png'; },
  ]) {
    Object.assign(f.batch, structuredClone(original)); f.job = f.batch.jobs[0]; change();
    assert.deepEqual(await withApprovedArt(base, 'batch', f.service), base);
  }
});
test('one missing asset does not hide later valid scenes; distinct scene coverage is required', async t => {
  const { batch, job, service } = await fixture(t), base = world();
  base.generated = { projectId: 'import-test', revision: 1, artReady: false };
  batch.jobs = [{ ...job, asset: { ...job.asset!, url: '/generated-art/missing-workshop-unit-test.png' } }, { ...job, id: 'second', nodeId: 'second', sourceHash: currentSceneSourceHash(base, base.nodes.second) }];
  const result = await withApprovedArt(base, 'batch', service);
  assert.equal(result.nodes.first.background, base.nodes.first.background); assert.equal(result.nodes.second.background, job.asset!.url);
  assert.equal(result.generated!.artReady, false); assert.equal(result.cover, base.cover);
  batch.jobs = [job, { ...job, id: 'duplicate', nodeId: 'second', sourceHash: currentSceneSourceHash(base, base.nodes.second) }];
  const duplicate = await withApprovedArt(base, 'batch', service);
  assert.equal(duplicate.nodes.second.background, base.nodes.second.background);
});

test('current source projection matches the art producer without preparing a job', async () => {
  const base = world();
  base.nodes.first.text = ['A different action.'];
  assert.equal(currentSceneSourceHash(base, base.nodes.first), (await buildSceneBrief(resolve(), base, base.nodes.first)).sourceHash);
  const changedArt = structuredClone(base); changedArt.nodes.first.background = '/generated-art/old.png';
  assert.equal(currentSceneSourceHash(changedArt, changedArt.nodes.first), currentSceneSourceHash(base, base.nodes.first));
});

test('formal short-plan source hashes bind current authored scenes and still reject changed text', async t => {
  const authored = authoredWorlds.find(entry => entry.id === 'blue-blood')!;
  const compiled = getWorld(authored.storyId);
  const plan = (await buildShortPlans(resolve(), authoredWorlds)).find(entry => entry.worldId === authored.id && entry.nodeId === 'training')!;
  const f = await fixture(t, compiled);
  f.job.sourceHash = plan.sourceHash;
  const bound = await withApprovedArt(compiled, f.batch.id, f.service);
  assert.equal(bound.nodes.training.background, f.job.asset!.url);
  const changed = structuredClone(compiled);
  changed.nodes.training.text = ['Changed after the formal short-plan delivery.'];
  assert.equal((await withApprovedArt(changed, f.batch.id, f.service)).nodes.training.background,
    changed.nodes.training.background);
});

test('formal production scenes require current SHA-matched native-detail review evidence', async t => {
  const f = await fixture(t), base = world();
  const jobId = `scene_${randomUUID().replaceAll('-', '')}`;
  f.job.id = jobId;
  const reviewDir = resolve('output/imagegen/scene-production/formal-production-20260907/reviews');
  const reviewFile = join(reviewDir, `${jobId}.json`);
  await rm(reviewFile, { force: true });
  t.after(() => rm(reviewFile, { force: true }));
  assert.equal((await withApprovedArt(base, undefined, f.service)).nodes.first.background, base.nodes.first.background);
  await mkdir(reviewDir, { recursive: true });
  await writeFile(reviewFile, JSON.stringify({ jobId, sha256: f.job.asset!.sha256, decision: 'approved', reviewer: 'test-reviewer',
    notes: 'The original PNG was inspected at full frame and native detail for this synthetic regression fixture.',
    fullImageViewed: true, nativeDetailViewed: true, styleReviewed: true, styleBaseline: 'film-frames-20260907' }));
  assert.equal((await withApprovedArt(base, undefined, f.service)).nodes.first.background, f.job.asset!.url);
});

test('same-version text, choices, attribution and cast changes invalidate approval before watcher updates', async t => {
  const base = world(), f = await fixture(t, base);
  for (const change of [
    (w: GameWorld) => { w.nodes.first.text = ['The action changed.']; },
    (w: GameWorld) => { w.nodes.first.title = 'A different scene'; },
    (w: GameWorld) => { w.nodes.first.choices = [{ id: 'leave', text: 'Leave', nextNodeId: 'second' }]; },
    (w: GameWorld) => { w.source.author = 'Different author'; },
    (w: GameWorld) => { w.source.url = 'https://example.invalid/new-source'; },
    (w: GameWorld) => { w.summary = 'A different premise'; },
    (w: GameWorld) => { w.characters = [{ id: 'new-cast', name: 'New character', role: 'lead', description: 'Changed identity' }]; },
  ]) {
    const current = structuredClone(base); change(current);
    assert.equal(f.job.stale, false);
    assert.deepEqual(await withApprovedArt(current, undefined, f.service), current);
  }
  const otherScene = structuredClone(base); otherScene.nodes.second.text = ['Unrelated scene edit'];
  assert.equal((await withApprovedArt(otherScene, undefined, f.service)).nodes.first.background, f.job.asset!.url);
  const [a, b] = await Promise.all([withApprovedArt(base, undefined, f.service), withApprovedArt(base, undefined, f.service)]);
  a.nodes.first.title = 'Only this response';
  assert.equal(b.nodes.first.title, base.nodes.first.title);
});

test('both real HTTP world routes re-evaluate synthetic approval, staleness, source edits and missing/corrupt files', async t => {
  const root = await mkdtemp(join(tmpdir(), 'workshop-art-http-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workshop = new StoryWorkshop(root), project = await workshop.import(originalSeed);
  const authored = getWorld('2025684191967294692'), before = structuredClone(authored);
  const imported = { ...world(), id: `generated-${project.id}`, storyId: project.id, generated: { projectId: project.id, revision: 1, artReady: false } };
  const a = await fixture(t, authored), b = await fixture(t, imported), fixtures = [a, b];
  project.publishedVersion = 'r1'; project.playable = true; project.art.batchId = b.batch.id;
  await workshop.save(project);
  const worldFile = join(workshop.dir(project.id), 'r1/world.json');
  await mkdir(join(workshop.dir(project.id), 'r1'), { recursive: true });
  await writeJson(worldFile, imported);
  const source = new StorySourceService({ cacheDir: join(root, 'source-cache'), fetcher: async () => new Response(JSON.stringify([{ work_id: authored.storyId, title: authored.title, labels: [] }])) });
  const lookup = { getArtBatch: async (id: string) => structuredClone(fixtures.find(f => f.batch.id === id)?.batch ?? null), listArtBatches: async () => structuredClone(fixtures.map(f => f.batch)) };
  const server = createServer(createApp(source, workshop, undefined, lookup, { getImages: lookup.getArtBatch, listImages: lookup.listArtBatches }));
  await new Promise<void>(yes => server.listen(0, '127.0.0.1', yes));
  t.after(() => new Promise<void>((yes, no) => server.close(e => e ? no(e) : yes())));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const paths = [`/api/worlds/${authored.storyId}`, `/api/workshop/projects/${project.id}/world?version=r1`];
  async function read() {
    return Promise.all(paths.map(async path => {
      const response = await fetch(`${base}${path}`); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
      return await response.json() as GameWorld;
    }));
  }
  const visible = (worlds: GameWorld[], yes: boolean) => worlds.forEach((w, i) => assert.equal(w.nodes[w.startNodeId].background === fixtures[i].job.asset!.url, yes));
  const [one, two] = await Promise.all([read(), read()]); visible(one, true); visible(two, true);
  const playing = startSession(one[0]);
  const advanced = choose(playing, playing.choices[0]), saved = saveSession(advanced);
  assert.deepEqual(authored, before);
  for (const f of fixtures) f.job.review!.decision = 'rejected';
  const rejected = await read(); visible(rejected, false);
  const restored = restoreSession(rejected[0], saved);
  assert.equal(restored.node.id, saved.nodeId); assert.deepEqual(restored.resources, saved.resources);
  assert.deepEqual(restored.clues, saved.clues); assert.ok(restored.choices.length);
  for (const f of fixtures) { f.job.review!.decision = 'approved'; f.job.stale = true; } visible(await read(), false);
  for (const f of fixtures) f.job.stale = false; visible(await read(), true);
  imported.nodes.first.text = ['Changed without changing r1 or the watcher flag']; await writeJson(worldFile, imported);
  const changed = await read(); assert.equal(changed[1].nodes.first.background, imported.nodes.first.background);
  b.job.sourceHash = currentSceneSourceHash(imported, imported.nodes.first); visible(await read(), true);
  await writeFile(resolve('public', `.${a.job.asset!.url}`), Buffer.from('corrupt'));
  await rm(resolve('public', `.${b.job.asset!.url}`)); visible(await read(), false);
  assert.deepEqual(authored, before);
  assert.equal((await workshop.get(project.id)).attempts, 0);
  assert.ok(fixtures.every(f => f.job.paidAttempts === 0));
});
