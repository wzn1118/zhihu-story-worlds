import assert from 'node:assert/strict';
import test from 'node:test';
import { authenticateAccount, logoutAccount, readAccount, readAuthSession, sessionFetch } from '../src/auth-session.ts';
import { watchAccountChanges } from '../src/account-sync.ts';

const account = { id: 'account-a', email: 'reader@example.com', name: 'Reader' };
const credentials = { email: account.email, name: account.name, password: 'example-password' };

test('login returns only the account confirmed by a subsequent session request', async t => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  t.mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return Response.json({ user: account });
  });
  assert.deepEqual(await authenticateAccount('login', credentials), account);
  assert.deepEqual(calls.map(call => call.url), ['/api/auth/login', '/api/auth/me']);
  assert.equal(calls[0].init?.credentials, 'same-origin');
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), credentials);
  assert.equal(calls[1].init?.credentials, 'same-origin');
  assert.equal(calls[1].init?.cache, 'no-store');
});

test('a successful login without a retained session remains a login error', async t => {
  t.mock.method(globalThis, 'fetch', async (url: string) => Response.json({ user: url.endsWith('/me') ? null : account }));
  await assert.rejects(authenticateAccount('login', credentials), /登录状态未能保存/);
});

test('registration also verifies the session and rejects a different existing account', async t => {
  const urls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    urls.push(url);
    return Response.json({ user: url.endsWith('/me') ? { ...account, id: 'account-b' } : account });
  });
  await assert.rejects(authenticateAccount('register', credentials), /登录状态未能保存/);
  assert.deepEqual(urls, ['/api/auth/register', '/api/auth/me']);
});

test('rejected credentials preserve the server error and do not accept an old session', async t => {
  const urls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    urls.push(url);
    return Response.json({ error: { message: '邮箱或密码不正确。' } }, { status: 401 });
  });
  await assert.rejects(authenticateAccount('login', credentials), /邮箱或密码不正确/);
  assert.deepEqual(urls, ['/api/auth/login']);
});

test('session lookup rejects service failures rather than treating the response as authenticated', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ user: account }, { status: 503 }));
  await assert.rejects(readAccount(), /暂时无法检查登录状态/);
});

test('public session exposes the OAuth gate and disables the local browser', async t => {
  const authentication = { required: true, provider: 'zhihu', configured: true, loginUrl: '/api/oauth/start', browserAvailable: false };
  const error = { code: 'OAUTH_STATE_MISMATCH', message: '授权状态已失效，请重新登录。' };
  t.mock.method(globalThis, 'fetch', async () => Response.json({ user: null, authentication, error }));
  assert.deepEqual(await readAuthSession(), { user: null, authentication, error });
});

test('logout clears the session using a same-origin JSON request', async t => {
  t.mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
    assert.equal(url, '/api/auth/logout');
    assert.equal(init?.method, 'POST');
    assert.equal(init?.credentials, 'same-origin');
    assert.deepEqual(JSON.parse(String(init?.body)), {});
    return new Response(null, { status: 204 });
  });
  await logoutAccount();
});

test('a failed logout is reported without claiming the session was cleared', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: { message: '退出失败，请重试。' } }, { status: 503 }));
  await assert.rejects(logoutAccount(), /退出失败，请重试/);
});

test('protected session failures request a recheck and preserve the original response', async t => {
  const previous = new Map(['window', 'document', 'location'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: new EventTarget() });
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { origin: 'https://redleaf.example' } });
  let rechecks = 0;
  const unwatch = watchAccountChanges(() => { rechecks++; });
  t.after(() => { unwatch(); for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } });
  let status = 401, code = 'AUTH_REQUIRED';
  const init: RequestInit = { credentials: 'same-origin', method: 'POST', body: '{}' };
  t.mock.method(globalThis, 'fetch', async (_input, passedInit) => {
    assert.equal(passedInit, init, 'preserve the original request, including its credentials');
    return Response.json({ error: { code } }, { status });
  });
  for (const path of ['/api/liukan/inbox', '/api/liukan/reading']) {
    const response = await sessionFetch(path, init);
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error: { code } });
  }
  assert.equal(rechecks, 2);
  status = 409; code = 'ACCOUNT_CHANGED';
  await sessionFetch(new Request('https://redleaf.example/api/liukan/reading'), init);
  assert.equal(rechecks, 3);

  // Upstream authorization errors and ordinary conflicts are not an expired app login.
  for (const [nextStatus, nextCode] of [[401, 'AUTH_FAILED'], [409, 'READING_BUSY'], [503, 'AUTH_REQUIRED']] as const) {
    status = nextStatus; code = nextCode;
    await sessionFetch('/api/liukan/reading', init);
  }
  status = 401; code = 'AUTH_REQUIRED';
  for (const path of ['https://other.example/api/liukan/inbox', '/api/auth/me', '/api/oauth/status', '/generated-art/image.png']) await sessionFetch(path, init);
  assert.equal(rechecks, 3);
  unwatch();
  await sessionFetch('/api/liukan/reading', init);
  assert.equal(rechecks, 3, 'unmounted listeners do not keep receiving session failures');
});
