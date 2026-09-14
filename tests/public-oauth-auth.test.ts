import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('public application requires Zhihu OAuth and rejects legacy account authentication', async t => {
  const root = await mkdtemp(join(tmpdir(), 'zhihu-public-oauth-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const originalFetch = globalThis.fetch;
  let upstreamCalls = 0;
  t.mock.method(globalThis, 'fetch', async () => { upstreamCalls++; throw new Error('Unexpected upstream request in authentication test'); });
  const environment = {
    PUBLIC_MODE: '1', NODE_ENV: 'test', ALLOWED_HOSTS: '127.0.0.1,zhihu.example.com', TRUST_PROXY: 'loopback',
    AUTH_STORE: join(root, 'users.json'), SESSION_SECRET: 'test-session-signing-secret-not-for-production-123456789',
    ZHIHU_OAUTH_APP_ID: 'test-app-580', ZHIHU_OAUTH_APP_KEY: 'private-test-app-key',
    ZHIHU_OAUTH_REDIRECT_URI: 'https://zhihu.example.com/auth/callback', ZHIHU_ACCESS_SECRET: 'private-test-access-secret',
  };
  const previous = Object.fromEntries(Object.keys(environment).map(key => [key, process.env[key]]));
  Object.assign(process.env, environment);
  t.after(() => { for (const key of Object.keys(environment)) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; } });

  // A correctly signed existing local account must still be rejected by public mode.
  const legacyUser = { id: 'existing-local-user', email: 'legacy@example.com', name: 'Legacy account', passwordHash: 'unused', createdAt: '2026-01-01T00:00:00.000Z' };
  const storeBefore = JSON.stringify({ users: [legacyUser] });
  await writeFile(environment.AUTH_STORE, storeBefore);
  const value = `${legacyUser.id}.${Date.now() + 3600_000}`;
  const signature = createHmac('sha256', environment.SESSION_SECRET).update(value).digest('base64url');
  const legacyCookie = `redleaf_session=${value}.${signature}`;

  // Import only after configuring the isolated test process: OAuth captures secrets once.
  const { createApp } = await import('../server/app.ts');
  const { StorySourceService } = await import('../server/story-source.ts');
  const { StoryWorkshop } = await import('../server/story-workshop.ts');
  const { ZhihuDiscoveryService } = await import('../server/zhihu-discovery.ts');
  const app = createApp(new StorySourceService({ cacheDir: join(root, 'cache') }), new StoryWorkshop(join(root, 'workshop')), new ZhihuDiscoveryService(join(root, 'discovery')));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test server');
  const base = `http://127.0.0.1:${address.port}`;
  function request(path: string, init: RequestInit = {}) { return originalFetch(`${base}${path}`, { ...init, redirect: 'manual' }); }

  await t.test('account discovery exposes public login capability without credentials', async () => {
    const response = await request('/api/auth/me');
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    const payload = await response.json();
    assert.equal(payload.user, null);
    assert.deepEqual(payload.authentication, { required: true, provider: 'zhihu', configured: true, loginUrl: '/api/oauth/start', browserAvailable: true });
    assert.doesNotMatch(JSON.stringify(payload), /private-test-app-key|private-test-access-secret|test-session-signing-secret/);
  });

  await t.test('valid local sessions and forged OAuth cookies cannot authenticate publicly', async () => {
    for (const cookie of [legacyCookie, 'redleaf_session=forged', `zhihu_oauth_session=${'a'.repeat(43)}`, `${legacyCookie}; zhihu_oauth_session=%invalid`]) {
      const response = await request('/api/auth/me', { headers: { Cookie: cookie } });
      assert.equal(response.status, 200); assert.equal((await response.json()).user, null);
      const protectedResponse = await request('/api/workshop/projects', { headers: { Cookie: cookie } });
      assert.equal(protectedResponse.status, 401);
      assert.equal((await protectedResponse.json()).error.code, 'AUTH_REQUIRED');
    }
  });

  await t.test('password login and registration are disabled before accessing the local store', async () => {
    for (const endpoint of ['login', 'register']) {
      const response = await request(`/api/auth/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: legacyCookie }, body: JSON.stringify({ email: legacyUser.email, name: legacyUser.name, password: 'test-password' }) });
      assert.equal(response.status, 403); assert.equal((await response.json()).error.code, 'OAUTH_REQUIRED');
      assert.equal(response.headers.get('set-cookie'), null);
    }
    assert.equal(await readFile(environment.AUTH_STORE, 'utf8'), storeBefore);
  });

  await t.test('protected API routes reject anonymous requests before local browser or data work', async () => {
    for (const path of ['/api/workshop/projects', '/api/stories', '/api/liukan/inbox', '/api/zhihu-browser/status']) {
      const response = await request(path);
      assert.equal(response.status, 401, path); assert.equal((await response.json()).error.code, 'AUTH_REQUIRED');
    }
  });

  await t.test('authorization starts on the registered HTTPS callback with secure opaque cookies', async () => {
    const response = await request('/api/oauth/start');
    assert.equal(response.status, 302);
    const location = new URL(response.headers.get('location')!);
    assert.equal(location.origin, 'https://openapi.zhihu.com'); assert.equal(location.pathname, '/authorize');
    assert.equal(location.searchParams.get('app_id'), environment.ZHIHU_OAUTH_APP_ID);
    assert.equal(location.searchParams.get('redirect_uri'), environment.ZHIHU_OAUTH_REDIRECT_URI);
    assert.equal(location.searchParams.get('response_type'), 'code');
    assert.match(location.searchParams.get('state')!, /^[A-Za-z0-9_-]{32}$/);
    const cookie = response.headers.getSetCookie().at(-1)!;
    assert.match(cookie, /^zhihu_oauth_session=[A-Za-z0-9_-]{43};/);
    assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Lax/); assert.match(cookie, /Secure/);
    assert.doesNotMatch(location.href + cookie, /private-test-app-key|private-test-access-secret/);
  });

  await t.test('invalid callbacks expose a safe error without attempting a token exchange', async () => {
    for (const suffix of ['', '&state=wrong-state']) {
      const start = await request('/api/oauth/start');
      const pendingCookie = start.headers.getSetCookie().at(-1)!.split(';')[0];
      const callback = await request(`/auth/callback?authorization_code=private-test-authorization-code${suffix}`, { headers: { Cookie: pendingCookie } });
      assert.equal(callback.status, 303); assert.equal(callback.headers.get('location'), '/');
      assert.equal(callback.headers.get('referrer-policy'), 'no-referrer');
      const account = await (await request('/api/auth/me', { headers: { Cookie: pendingCookie } })).json();
      assert.equal(account.user, null);
      assert.equal(account.error.code, suffix ? 'STATE_INVALID' : 'STATE_MISSING');
      assert.doesNotMatch(JSON.stringify(account), /private-test-authorization-code|private-test-app-key|private-test-access-secret/);
    }
    assert.equal(upstreamCalls, 0);
  });
});
