import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('public story import, generation and progress agree on project ownership', async t => {
  const root = await mkdtemp(join(tmpdir(), 'workshop-project-access-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const environment = { PUBLIC_MODE: '1', NODE_ENV: 'test', ALLOWED_HOSTS: '127.0.0.1', AUTH_STORE: join(root, 'auth.json'), WORKSHOP_CONFIG_PATH: join(root, 'relay.json'), LIUKAN_USERS_ROOT: join(root, 'accounts') };
  const previous = Object.fromEntries(Object.keys(environment).map(key => [key, process.env[key]]));
  Object.assign(process.env, environment);
  t.after(() => { for (const key of Object.keys(environment)) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; } });
  const { createApp } = await import('../server/app.ts');
  const { StoryWorkshop, writeJson } = await import('../server/story-workshop.ts');
  const { StorySourceService } = await import('../server/story-source.ts');
  const { ZhihuDiscoveryService } = await import('../server/zhihu-discovery.ts');
  const { zhihuOAuth } = await import('../server/zhihu-oauth.ts');
  const { originalSeed } = await import('../shared/workshop.ts');
  const workshop = new StoryWorkshop(join(root, 'workshop'));
  const options = { mode: 'fast', adaptation: 'inspiration', images: 'none' };
  const importedSource = { ...originalSeed, generationOptions: options };
  const legacy = await workshop.import(importedSource);
  const legacyBefore = await readFile(join(workshop.dir(legacy.id), 'project.json'), 'utf8');
  const users = {
    alice: { id: 'zhihu-alice-fixture', name: 'Alice', email: '', provider: 'zhihu' as const, createdAt: '2026-01-01T00:00:00Z' },
    bob: { id: 'zhihu-bob-fixture', name: 'Bob', email: '', provider: 'zhihu' as const, createdAt: '2026-01-01T00:00:00Z' },
  };
  t.mock.method(zhihuOAuth, 'currentUser', (request: { headers: { cookie?: string } }) => users[request.headers.cookie?.replace('fixture_session=', '') as keyof typeof users] ?? null);
  const networkFetch = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('This regression must not call external services'); });
  const generated: string[] = [];
  t.mock.method(workshop, 'generate', async (id: string) => {
    generated.push(id);
    const project = await workshop.get(id);
    await mkdir(join(workshop.dir(id), 'job.lock'), { recursive: true });
    await writeJson(join(workshop.dir(id), 'job.lock', 'owner.json'), { token: 'fixture', pid: process.pid, heartbeat: new Date().toISOString() });
    project.status = 'running'; project.stage = 'outline'; project.revision = 1;
    await workshop.save(project);
    return project;
  });
  const app = createApp(new StorySourceService({ cacheDir: join(root, 'sources') }), workshop, new ZhihuDiscoveryService(join(root, 'discovery')), undefined, { getImages: async () => null, listImages: async () => [] });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  async function request(user: keyof typeof users, path: string, body?: unknown) {
    const response = await networkFetch(`http://127.0.0.1:${address.port}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Cookie: `fixture_session=${user}`, 'X-Redleaf-Account': users[user].id, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    assert.match(response.headers.get('content-type') ?? '', /application\/json/, `${path} must always return JSON, including HTTP errors`);
    return { status: response.status, data: await response.json() };
  }

  const alice = await request('alice', '/api/workshop/projects', importedSource);
  assert.equal(alice.status, 201); assert.equal(alice.data.ownerId, users.alice.id);
  assert.notEqual(alice.data.id, legacy.id, 'a logged-in import must not reuse the ownerless legacy record');
  const retries = await Promise.all(Array.from({ length: 3 }, () => request('alice', '/api/workshop/projects', importedSource)));
  assert.ok(retries.every(result => result.status === 201 && result.data.id === alice.data.id));
  const bob = await request('bob', '/api/workshop/projects', importedSource);
  assert.equal(bob.status, 201); assert.equal(bob.data.ownerId, users.bob.id); assert.notEqual(bob.data.id, alice.data.id);

  for (const [user, own, other] of [['alice', alice, bob], ['bob', bob, alice]] as const) {
    const listed = await request(user, '/api/workshop/projects');
    assert.deepEqual(listed.data.projects.map((project: { id: string }) => project.id), [own.data.id]);
    const started = await request(user, `/api/workshop/projects/${own.data.id}/generate`, { mode: 'resume', generationOptions: options });
    assert.equal(started.status, 202); assert.equal(started.data.status, 'running');
    const progress = await request(user, `/api/workshop/projects/${own.data.id}`);
    assert.equal(progress.status, 200); assert.equal(progress.data.status, 'running'); assert.equal(progress.data.ownerId, users[user].id);
    for (const deniedId of [legacy.id, other.data.id]) {
      for (const suffix of ['', '/source', '/world']) {
        const denied = await request(user, `/api/workshop/projects/${deniedId}${suffix}`);
        assert.equal(denied.status, 404); assert.equal(denied.data.error.code, 'PROJECT_NOT_FOUND');
      }
      const denied = await request(user, `/api/workshop/projects/${deniedId}/generate`, {});
      assert.equal(denied.status, 404); assert.equal(denied.data.error.code, 'PROJECT_NOT_FOUND');
    }
  }
  assert.deepEqual(generated.sort(), [alice.data.id, bob.data.id].sort(), 'denied projects must not start a worker');
  assert.equal(await readFile(join(workshop.dir(legacy.id), 'project.json'), 'utf8'), legacyBefore, 'legacy work remains unchanged');
});
