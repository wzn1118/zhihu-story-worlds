import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import express from 'express';
import { createZhihuOAuth, type ZhihuOAuthOptions } from '../server/zhihu-oauth.ts';
import { createZhihuOAuthSessionStore } from '../server/zhihu-oauth-session-store.ts';

const testConfig = { enabled: true, appId: 'test-application', appKey: 'backend-app-key', accessSecret: 'backend-access-secret', redirectUri: 'https://zhihu.example.com/auth/callback' };
const token = 'private-user-oauth-token';
const origin = 'https://zhihu.example.com';
const json = (value: unknown, status = 200) => Response.json(value, { status });

async function persistentStore(t: { after: (fn: () => Promise<unknown>) => void }) {
  const root = await mkdtemp(join(tmpdir(), 'zhihu-oauth-session-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return { path: join(root, 'private', 'sessions.enc'), secret: 'test-only-persistent-session-secret-at-least-48-characters-long' };
}

async function fixture(t: { after: (fn: () => Promise<unknown>) => void }, options: ZhihuOAuthOptions = {}) {
  const oauth = createZhihuOAuth({ config: testConfig, report: () => {}, sessionStore: null, ...options });
  const app = express();
  app.use(express.json()); app.use('/api/oauth', oauth.router); app.get('/auth/callback', oauth.callback);
  app.get('/api/me', (req, res) => res.json({ user: oauth.currentUser(req) }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test server');
  const base = `http://127.0.0.1:${address.port}`;
  let cookie = '';
  async function request(path: string, init: RequestInit = {}) {
    const response = await fetch(`${base}${path}`, { ...init, redirect: 'manual', headers: { ...(cookie ? { Cookie: cookie } : {}), ...init.headers } });
    for (const line of response.headers.getSetCookie()) if (line.startsWith('zhihu_oauth_session=')) cookie = line.split(';')[0];
    return response;
  }
  async function start() {
    const response = await request('/api/oauth/start');
    assert.equal(response.status, 302);
    const location = new URL(response.headers.get('location')!);
    const state = location.searchParams.get('state')!;
    return { state, response, location, cookie };
  }
  async function login(codeName = 'authorization_code') {
    const { state } = await start();
    const response = await request(`/auth/callback?${codeName}=private-authorization-code&state=${state}`);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/');
    return (await request('/api/oauth/status')).json();
  }
  return { oauth, request, start, login, base, cookie: () => cookie };
}

test('OAuth uses server-only form exchange and rotating secure opaque sessions', async t => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const f = await fixture(t, { fetch: async (input, init) => {
    requests.push({ url: String(input), init });
    return String(input).endsWith('/access_token') ? json({ code: 20000, data: { access_token: token, expires_in: 7200 } }) : json({ code: 20000, data: { hash_id: 'provider-account-123', fullname: '知乎读者', avatar_path: 'https://pic.zhimg.com/avatar.jpg', email: 'private@example.com', phone_no: 'private-phone-number' } });
  } });
  const { state, location, response, cookie: pendingCookie } = await f.start();
  assert.equal(location.origin, 'https://openapi.zhihu.com');
  assert.equal(location.searchParams.get('app_id'), testConfig.appId);
  assert.equal(location.searchParams.get('redirect_uri'), testConfig.redirectUri);
  assert.equal(location.searchParams.get('response_type'), 'code');
  assert.match(state, /^[A-Za-z0-9_-]{32}$/);
  assert.match(response.headers.getSetCookie().at(-1)!, /HttpOnly/);
  assert.match(response.headers.getSetCookie().at(-1)!, /Secure/);
  assert.match(response.headers.getSetCookie().at(-1)!, /SameSite=Lax/);
  const result = await f.request(`/auth/callback?authorization_code=private-authorization-code&state=${state}`);
  assert.equal(result.status, 303);
  assert.notEqual(f.cookie(), pendingCookie);
  assert.match(f.cookie(), /^zhihu_oauth_session=[A-Za-z0-9_-]{43}$/);
  const form = new URLSearchParams(String(requests[0].init?.body));
  assert.equal(form.get('app_key'), testConfig.appKey);
  assert.equal(form.get('code'), 'private-authorization-code');
  assert.equal(form.get('grant_type'), 'authorization_code');
  assert.equal(form.get('redirect_uri'), testConfig.redirectUri);
  assert.equal(new Headers(requests[0].init?.headers).get('Content-Type'), 'application/x-www-form-urlencoded');
  assert.equal(requests[0].init?.redirect, 'error');
  const headers = new Headers(requests[1].init?.headers);
  assert.equal(headers.get('Authorization'), `Bearer ${token}`);
  assert.equal(headers.get('X-OAuth-Token'), null);
  assert.equal(headers.get('X-Request-Timestamp'), null);
  const status = await (await f.request('/api/oauth/status')).json();
  assert.equal(status.authorized, true); assert.equal(status.stateVerified, true); assert.equal(status.localBrowser, false);
  assert.ok(new Date(status.expiresAt).getTime() <= Date.now() + 3_600_000);
  const user = (await (await f.request('/api/me')).json()).user;
  assert.equal(user.provider, 'zhihu'); assert.match(user.id, /^zhihu:[a-f0-9]{64}$/); assert.equal(user.name, '知乎读者');
  assert.equal(status.identityVerified, true);
  assert.doesNotMatch(JSON.stringify({ status, user, cookie: f.cookie(), location: result.headers.get('location') }), /private-user-oauth-token|backend-app-key|backend-access-secret|private-authorization-code|private@example.com|private-phone-number/);
});

test('encrypted OAuth sessions survive restart with identity, rotation, and durable logout', async t => {
  const sessionStore = await persistentStore(t);
  const events: unknown[] = [];
  const options: ZhihuOAuthOptions = { sessionStore, report: event => events.push(event), fetch: async input => String(input).endsWith('/access_token')
    ? json({ access_token: token, expires_in: 3600 }) : json({ hash_id: 'persistent-provider-account', fullname: 'Persistent Reader' }) };
  const first = await fixture(t, options);
  const pending = await first.start();
  await first.request(`/auth/callback?code=private-authorization-code&state=${pending.state}`);
  const cookie = first.cookie(), user = (await (await first.request('/api/me')).json()).user;
  assert.ok(user);
  const encrypted = await readFile(sessionStore.path, 'utf8');
  const persisted = createZhihuOAuthSessionStore(sessionStore).load() as Array<Record<string, unknown>>;
  assert.deepEqual(Object.keys(persisted[0]).sort(), ['error', 'expiresAt', 'id', 'pendingUntil', 'profile', 'retainUntil', 'state', 'stateVerified', 'token', 'user'].sort());
  for (const sensitive of [token, cookie.split('=')[1], pending.state, user.id, user.name, 'persistent-provider-account', sessionStore.secret]) assert.ok(!encrypted.includes(sensitive));
  assert.equal((await stat(sessionStore.path)).mode & 0o777, 0o600);
  assert.equal((await stat(dirname(sessionStore.path))).mode & 0o777, 0o700);
  assert.deepEqual(await readdir(dirname(sessionStore.path)), ['sessions.enc']);
  assert.doesNotMatch(JSON.stringify(events), /private-user-oauth-token|persistent-provider-account|Persistent Reader/);

  const restarted = await fixture(t, { ...options, fetch: async () => { throw new Error('Restart must use the persisted identity without contacting the provider.'); } });
  assert.deepEqual((await (await restarted.request('/api/me', { headers: { Cookie: cookie } })).json()).user, user);
  assert.equal((await (await restarted.request('/api/me', { headers: { Cookie: pending.cookie } })).json()).user, null);
  assert.equal((await (await restarted.request('/api/oauth/status', { headers: { Cookie: cookie } })).json()).authorized, true);
  assert.equal((await restarted.request('/api/oauth/logout', { method: 'POST', headers: { Origin: origin, Cookie: cookie } })).status, 204);

  const afterLogout = await fixture(t, options);
  assert.equal((await (await afterLogout.request('/api/me', { headers: { Cookie: cookie } })).json()).user, null);
  assert.equal((await (await afterLogout.request('/api/oauth/status', { headers: { Cookie: cookie } })).json()).authorized, false);
});

test('pending OAuth state survives restart and is persisted as consumed before exchange', async t => {
  const sessionStore = await persistentStore(t);
  const first = await fixture(t, { sessionStore });
  const pending = await first.start();
  let exchanges = 0;
  const restarted = await fixture(t, { sessionStore, fetch: async input => {
    if (String(input).endsWith('/access_token')) {
      exchanges++;
      const saved = createZhihuOAuthSessionStore(sessionStore).load() as Array<{ state: string | null }>;
      assert.equal(saved.length, 1); assert.equal(saved[0].state, null);
      return json({ access_token: token, expires_in: 3600 });
    }
    return json({ hash_id: 'state-persisted-account', fullname: 'Reader' });
  } });
  const callback = `/auth/callback?code=private-authorization-code&state=${pending.state}`;
  assert.equal((await restarted.request(callback, { headers: { Cookie: pending.cookie } })).status, 303);
  assert.equal(exchanges, 1);
  const rotatedCookie = restarted.cookie();
  const afterRotation = await fixture(t, { sessionStore, fetch: async () => { throw new Error('Replayed callback must not contact the provider.'); } });
  await afterRotation.request(callback, { headers: { Cookie: pending.cookie } });
  assert.equal((await (await afterRotation.request('/api/oauth/status')).json()).error.code, 'STATE_INVALID');
  assert.ok((await (await afterRotation.request('/api/me', { headers: { Cookie: rotatedCookie } })).json()).user);
});

test('OAuth expiry and upstream revocation remain effective across restart', async t => {
  for (const reason of ['expiry', 'revocation'] as const) {
    const sessionStore = await persistentStore(t);
    let instant = Date.now();
    const options: ZhihuOAuthOptions = { sessionStore, now: () => instant, fetch: async input => {
      const url = String(input);
      if (url.endsWith('/access_token')) return json({ access_token: token, expires_in: 7200 });
      if (url.endsWith('/user')) return json({ hash_id: 'expiring-provider-account', fullname: 'Reader' });
      return json({}, 401);
    } };
    const first = await fixture(t, options);
    await first.login(); const cookie = first.cookie();
    const restarted = await fixture(t, options);
    if (reason === 'expiry') instant += 3_600_001;
    else await restarted.request('/api/oauth/run-all', { method: 'POST', headers: { Origin: origin, Cookie: cookie } });
    const status = await (await restarted.request('/api/oauth/status', { headers: { Cookie: cookie } })).json();
    assert.equal(status.authorized, false); assert.equal(status.identityVerified, false);
    assert.equal(status.error.code, reason === 'expiry' ? 'TOKEN_EXPIRED' : 'AUTH_FAILED');
    const afterInvalidation = await fixture(t, options);
    assert.equal((await (await afterInvalidation.request('/api/me', { headers: { Cookie: cookie } })).json()).user, null);
    assert.equal((await (await afterInvalidation.request('/api/oauth/status', { headers: { Cookie: cookie } })).json()).authorized, false);
  }
});

test('OAuth session persistence fails closed for tampering and a wrong or weak key', async t => {
  const sessionStore = await persistentStore(t);
  const first = await fixture(t, { sessionStore }); await first.start();
  assert.throws(() => createZhihuOAuth({ sessionStore: { ...sessionStore, secret: `${sessionStore.secret}-wrong` } }), /could not be read or authenticated/);
  assert.throws(() => createZhihuOAuth({ sessionStore: { ...sessionStore, secret: 'weak' } }), /at least 48 characters/);
  const data = JSON.parse(await readFile(sessionStore.path, 'utf8'));
  data.ciphertext = `${data.ciphertext[0] === 'A' ? 'B' : 'A'}${data.ciphertext.slice(1)}`;
  await writeFile(sessionStore.path, JSON.stringify(data));
  assert.throws(() => createZhihuOAuth({ sessionStore }), /could not be read or authenticated/);
});

test('missing, mismatched, expired and replayed state cannot exchange tokens', async t => {
  let instant = Date.now();
  let calls = 0;
  const f = await fixture(t, { now: () => instant, fetch: async input => { calls++; return String(input).endsWith('/access_token') ? json({ access_token: token, expires_in: 3600 }) : json({ hash_id: 'provider-id', fullname: 'Reader' }); } });
  for (const kind of ['missing', 'mismatch', 'expired']) {
    const { state } = await f.start();
    if (kind === 'expired') instant += 601_000;
    const suffix = kind === 'missing' ? '' : `&state=${kind === 'mismatch' ? 'wrong-state' : state}`;
    await f.request(`/auth/callback?authorization_code=private-code${suffix}`);
    const status = await (await f.request('/api/oauth/status')).json();
    assert.equal(status.authorized, false);
    assert.equal(status.error.code, kind === 'missing' ? 'STATE_MISSING' : 'STATE_INVALID');
  }
  assert.equal(calls, 0);
  const { state, cookie } = await f.start();
  await f.request(`/auth/callback?code=private-code&state=${state}`);
  assert.equal(calls, 2);
  const replay = await fetch(`${f.base}/auth/callback?code=private-code&state=${state}`, { headers: { Cookie: cookie }, redirect: 'manual' });
  assert.equal(replay.status, 303); assert.equal(calls, 2);
  const authorized = await (await f.request('/api/oauth/status')).json();
  assert.equal(authorized.authorized, true);
});

test('optional profile failure does not invent identity or block five user API checks', async t => {
  const requests: Array<{ url: string; headers: Headers }> = [];
  const f = await fixture(t, { fetch: async (input, init) => {
    const url = String(input); requests.push({ url, headers: new Headers(init?.headers) });
    if (url.endsWith('/access_token')) return json({ Code: 20000, Data: { access_token: token, expires_in: 3600 } });
    if (url.endsWith('/user')) return json({ code: 404, data: 'User does not exist' });
    if (url.includes('/favlists?')) return json({ Code: 0, Data: { Items: [{ UrlToken: 42, Title: 'Never exposed' }] } });
    return json({ Code: 0, Data: { Items: [{ Title: 'Never exposed', Summary: token }] } });
  } });
  const status = await f.login('code');
  assert.equal(status.authorized, true); assert.equal(status.identityVerified, false); assert.equal(status.error.code, 'IDENTITY_UNAVAILABLE');
  assert.equal((await (await f.request('/api/me')).json()).user, null);
  const response = await f.request('/api/oauth/run-all', { method: 'POST', headers: { Origin: origin } });
  const output = await response.json();
  assert.equal(output.results.length, 5); assert.deepEqual(output.results.map((item: { status: string }) => item.status), Array(5).fill('success'));
  assert.doesNotMatch(JSON.stringify(output), /Never exposed|private-user-oauth-token/);
  assert.equal(requests.length, 7);
  for (const request of requests.slice(2)) {
    assert.equal(request.headers.get('Authorization'), `Bearer ${testConfig.accessSecret}`);
    assert.equal(request.headers.get('X-OAuth-Token'), token);
    assert.equal(new URL(request.url).searchParams.get('Limit'), '1');
  }
  assert.equal(new URL(requests[5].url).searchParams.get('FavlistUrlToken'), '42');
});

test('authentication failure stops subsequent requests, clears identity and never falls back to CLI', async t => {
  let userCalls = 0;
  const f = await fixture(t, { fetch: async input => {
    const url = String(input);
    if (url.endsWith('/access_token')) return json({ access_token: token, expires_in: 3600 });
    if (url.endsWith('/user')) return json({ data: { hash_id: 'provider-account', fullname: 'Reader' } });
    userCalls++;
    return json({ Code: 20001, Message: `denied: ${token}, ${testConfig.accessSecret}` });
  } });
  await f.login();
  const output = await (await f.request('/api/oauth/run-all', { method: 'POST' })).json();
  assert.deepEqual(output.results.map((item: { status: string }) => item.status), ['error', 'skipped', 'skipped', 'skipped', 'skipped']);
  assert.equal(userCalls, 1);
  assert.doesNotMatch(JSON.stringify(output), /private-user-oauth-token|backend-access-secret/);
  assert.equal((await (await f.request('/api/me')).json()).user, null);
  assert.equal((await (await f.request('/api/oauth/status')).json()).error.code, 'AUTH_FAILED');
  assert.equal((await f.request('/api/oauth/run-all', { method: 'POST' })).status, 401);
  assert.equal(userCalls, 1);
});

test('empty collections are valid; tokens expire and logout clears all authorization', async t => {
  let instant = Date.now();
  let userCalls = 0;
  const f = await fixture(t, { now: () => instant, fetch: async input => {
    if (String(input).endsWith('/access_token')) return json({ access_token: token, expires_in: 60 });
    if (String(input).endsWith('/user')) return json({ data: { fullname: 'A display name is not an identity' } });
    userCalls++; return json({ Code: 0, Data: { Items: [] } });
  } });
  await f.login();
  assert.equal((await (await f.request('/api/me')).json()).user, null);
  const output = await (await f.request('/api/oauth/run-all', { method: 'POST' })).json();
  assert.deepEqual(output.results.map((item: { status: string }) => item.status), Array(5).fill('empty'));
  assert.equal(userCalls, 4);
  instant += 60_000;
  assert.equal((await (await f.request('/api/oauth/status')).json()).error.code, 'TOKEN_EXPIRED');
  assert.equal((await f.request('/api/oauth/run-all', { method: 'POST' })).status, 401);
  await f.login();
  assert.equal((await f.request('/api/oauth/logout', { method: 'POST', headers: { Origin: origin } })).status, 204);
  assert.equal((await (await f.request('/api/oauth/status')).json()).authorized, false);
});

test('login configuration requires app credentials and the registered public HTTPS callback', async t => {
  for (const overrides of [{ appId: '' }, { appKey: '' }, { redirectUri: 'http://localhost:8080/auth/callback' }, { redirectUri: 'https://127.0.0.1/auth/callback' }, { redirectUri: 'https://zhihu.example.com/other-callback' }, { enabled: false }]) {
    const f = await fixture(t, { config: { ...testConfig, ...overrides }, fetch: async () => { throw new Error('must not call provider'); } });
    const status = await (await f.request('/api/oauth/status')).json();
    assert.equal(status.configured, false);
    assert.equal((await f.request('/api/oauth/start')).status, 503);
  }
});

test('upstream diagnostics and malformed token responses cannot leak credentials', async t => {
  for (const payload of [{ error: token, message: testConfig.appKey }, { access_token: token }, { access_token: token, expires_in: -1 }, { access_token: token, expires_in: 'invalid' }]) {
    const f = await fixture(t, { fetch: async () => json(payload) });
    const status = await f.login();
    assert.equal(status.authorized, false); assert.equal(status.error.code, 'TOKEN_EXCHANGE_FAILED');
    assert.doesNotMatch(JSON.stringify(status), /private-user-oauth-token|backend-app-key/);
  }
});

test('cross-origin state changes fail and a forged cookie never authorizes a user', async t => {
  const f = await fixture(t);
  const response = await f.request('/api/oauth/logout', { method: 'POST', headers: { Origin: 'https://attacker.example' } });
  assert.equal(response.status, 403);
  const forged = await f.request('/api/me', { headers: { Cookie: 'zhihu_oauth_session=%malformed-cookie; redleaf_session=forged-account' } });
  assert.equal((await forged.json()).user, null);
});

test('an invalid collection identifier reports failure and skips dependent content', async t => {
  let contentCalls = 0;
  const f = await fixture(t, { fetch: async input => {
    const url = String(input);
    if (url.endsWith('/access_token')) return json({ access_token: token, expires_in: 3600 });
    if (url.endsWith('/user')) return json({ data: { hash_id: 'provider-id' } });
    if (url.includes('/favlists?')) return json({ Code: 0, Data: { Items: [{ UrlToken: 'invalid-token' }] } });
    if (url.includes('/favlist_contents?')) contentCalls++;
    return json({ Code: 0, Data: { Items: [] } });
  } });
  await f.login();
  const output = await (await f.request('/api/oauth/run-all', { method: 'POST' })).json();
  assert.equal(output.results[2].status, 'error');
  assert.equal(output.results[3].status, 'skipped');
  assert.equal(contentCalls, 0);
});

test('logout while token exchange is in flight cannot resurrect the old session', async t => {
  let exchangeStarted!: () => void;
  let finishExchange!: (response: Response) => void;
  const started = new Promise<void>(resolve => { exchangeStarted = resolve; });
  const pendingToken = new Promise<Response>(resolve => { finishExchange = resolve; });
  let profileCalls = 0;
  const f = await fixture(t, { fetch: async input => {
    if (String(input).endsWith('/access_token')) { exchangeStarted(); return pendingToken; }
    profileCalls++; return json({ hash_id: 'provider-id' });
  } });
  const { state, cookie } = await f.start();
  const callback = fetch(`${f.base}/auth/callback?code=private-code&state=${state}`, { headers: { Cookie: cookie }, redirect: 'manual' });
  await started;
  await f.request('/api/oauth/logout', { method: 'POST' });
  finishExchange(json({ access_token: token, expires_in: 3600 }));
  const result = await callback;
  assert.equal(result.status, 303);
  assert.equal(profileCalls, 0);
  assert.equal((await (await f.request('/api/oauth/status')).json()).authorized, false);
});

test('basic account login works without Access Secret and unavailable data features preserve the login', async t => {
  const requests: Array<{ url: string; headers: Headers }> = [];
  const f = await fixture(t, { config: { ...testConfig, accessSecret: '' }, fetch: async (input, init) => {
    const url = String(input); requests.push({ url, headers: new Headers(init?.headers) });
    if (url.endsWith('/access_token')) return json({ access_token: token, expires_in: 3600 });
    assert.equal(url, 'https://openapi.zhihu.com/user');
    assert.equal(init?.body, undefined);
    return json({ hash_id: 'stable-account-hash', fullname: 'Reader', avatar_path: 'https://picx.zhimg.com/avatar.jpg' });
  } });
  const status = await f.login();
  assert.equal(status.configured, true); assert.equal(status.userDataConfigured, false);
  assert.equal(status.authorized, true); assert.equal(status.identityVerified, true); assert.equal(status.error, null);
  assert.equal(requests[1].headers.get('Authorization'), `Bearer ${token}`);
  assert.equal(requests[1].headers.get('X-OAuth-Token'), null);
  assert.equal(requests[1].headers.get('X-Request-Timestamp'), null);
  const userBefore = (await (await f.request('/api/me')).json()).user;
  assert.equal(userBefore.name, 'Reader');
  const feature = await f.request('/api/oauth/run-all', { method: 'POST' });
  assert.equal(feature.status, 503); assert.equal((await feature.json()).error.code, 'USER_DATA_NOT_CONFIGURED');
  assert.equal(requests.length, 2);
  assert.deepEqual((await (await f.request('/api/me')).json()).user, userBefore);
  const after = await (await f.request('/api/oauth/status')).json();
  assert.equal(after.authorized, true); assert.equal(after.error, null);
});

test('raw and wrapped profile int64 UIDs remain lossless and distinguish adjacent accounts', async t => {
  const ids: string[] = [];
  for (const uid of ['969570047710216200', '969570047710216201', '9223372036854775807']) {
    const expected = `zhihu:${createHash('sha256').update(`uid:${uid}`).digest('hex')}`;
    for (const envelope of ['raw', 'data', 'Data']) {
      const profile = `{"uid":${uid},"fullname":"Digits 969570047710216201 and \\"quoted\\" stay intact","avatar_path":"https://picx.zhimg.com/example.jpg"}`;
      const f = await fixture(t, { fetch: async input => String(input).endsWith('/access_token') ? json({ access_token: token, expires_in: 3600 }) : new Response(envelope === 'raw' ? profile : `{"code":20000,"${envelope}":${profile}}`, { headers: { 'Content-Type': 'application/json' } }) });
      const status = await f.login();
      assert.equal(status.identityVerified, true);
      const user = (await (await f.request('/api/me')).json()).user;
      assert.equal(user.id, expected);
      assert.equal(user.name, 'Digits 969570047710216201 and "quoted" stay intact');
      if (envelope === 'raw') ids.push(user.id);
    }
  }
  assert.equal(new Set(ids).size, 3);
});

test('official hash_id is preferred and guessed id fields never authenticate accounts', async t => {
  const expected = `zhihu:${createHash('sha256').update('hash_id:stable-hash').digest('hex')}`;
  for (const uid of [1, 2]) {
    const f = await fixture(t, { fetch: async input => String(input).endsWith('/access_token') ? json({ access_token: token, expires_in: 3600 }) : json({ Data: { hash_id: 'stable-hash', uid, fullname: 'Reader' } }) });
    await f.login();
    assert.equal((await (await f.request('/api/me')).json()).user.id, expected);
  }
  for (const profile of [
    '{"id":"guessed-field","fullname":"Reader"}',
    '{"uid":9223372036854775808,"fullname":"Reader"}',
    '{"uid":9.695700477102162e17,"fullname":"Reader"}',
    '{"uid":-1,"fullname":"Reader"}',
    '{"uid":0,"fullname":"Reader"}',
    '{"uid":"00123","fullname":"Reader"}',
  ]) {
    const f = await fixture(t, { fetch: async input => String(input).endsWith('/access_token') ? json({ access_token: token, expires_in: 3600 }) : new Response(profile) });
    const status = await f.login();
    assert.equal(status.identityVerified, false); assert.equal(status.error.code, 'IDENTITY_UNAVAILABLE');
    assert.equal((await (await f.request('/api/me')).json()).user, null);
  }
});

test('profile authentication rejection invalidates OAuth before any user data request', async t => {
  let calls = 0;
  const f = await fixture(t, { fetch: async input => {
    calls++;
    return String(input).endsWith('/access_token') ? json({ access_token: token, expires_in: 3600 }) : json({ code: 20001, message: token });
  } });
  const status = await f.login();
  assert.equal(status.authorized, false); assert.equal(status.identityVerified, false); assert.equal(status.error.code, 'AUTH_FAILED');
  assert.doesNotMatch(JSON.stringify(status), /private-user-oauth-token/);
  assert.equal((await f.request('/api/oauth/run-all', { method: 'POST' })).status, 401);
  assert.equal(calls, 2);
});

test('operational events identify the failing OAuth stage without logging credentials or identity', async t => {
  const events: unknown[] = [];
  const f = await fixture(t, { report: event => events.push(event), fetch: async input => String(input).endsWith('/access_token')
    ? json({ access_token: token, expires_in: 3600 }) : json({ hash_id: 'private-account-id', fullname: 'Private Reader' }) });
  const { state } = await f.start();
  await f.request(`/auth/callback?authorization_code=private-code&state=${state}`);
  assert.deepEqual(events, [{ event: 'started' }, { event: 'callback_received' }, { event: 'state_verified' }, { event: 'token_received' }, { event: 'login_succeeded' }]);
  await f.start();
  await f.request('/auth/callback?authorization_code=private-code&state=wrong');
  assert.deepEqual(events.at(-1), { event: 'login_failed', code: 'STATE_INVALID' });
  assert.doesNotMatch(JSON.stringify(events), /private|backend|Private Reader/);
  assert.ok(!JSON.stringify(events).includes(state));
});
