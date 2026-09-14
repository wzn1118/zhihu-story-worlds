import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const origin = new URL(process.argv[2] ?? 'https://zhihu.hegelsalon.com/').origin;
const publicConfig = JSON.parse(await readFile(new URL('../hackathon.config.json', import.meta.url), 'utf8'));
const expectedAppId = process.env.ZHIHU_OAUTH_APP_ID ?? publicConfig.oauth.appId;
const expectedRedirect = process.env.ZHIHU_OAUTH_REDIRECT_URI ?? publicConfig.oauth.redirectUri;
async function check(path, status, options = {}) {
  // Never follow the authorization redirect or send a request to the provider.
  const response = await fetch(new URL(path, origin), { ...options, redirect: 'manual', signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, status, `${path}: expected HTTP ${status}, received ${response.status}`);
  if (path.startsWith('/api/')) assert.equal(response.headers.get('cache-control'), 'no-store', `${path}: must not be cached`);
  console.log(`PASS ${options.method ?? 'GET'} ${path}: ${status}`);
  return response;
}

const health = await (await check('/healthz', 200)).json();
assert.equal(health.status, 'ok');
assert.equal(health.service, 'zhihu-story-worlds');
const html = await (await check('/', 200)).text();
assert.match(html, /<div id="root"><\/div>/);
const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+\.(?:js|css))"/g)].map(match => match[1]);
assert.ok(assets.length, 'No built frontend assets found in the homepage');
for (const asset of new Set(assets)) {
  const response = await check(asset, 200, { method: 'HEAD' });
  assert.match(response.headers.get('content-type') ?? '', asset.endsWith('.js') ? /javascript/ : /text\/css/);
}
const art = await check('/assets/blue-blood-cover.webp', 200, { method: 'HEAD' });
assert.match(art.headers.get('content-type') ?? '', /image\/webp/);
const account = await (await check('/api/auth/me', 200)).json();
assert.ok(account.user === null, 'Anonymous account discovery must not return a user');
assert.deepEqual(account.authentication, {
  required: true, provider: 'zhihu', configured: true, loginUrl: '/api/oauth/start', browserAvailable: true,
});
assert.ok(!account.error, 'OAuth login configuration must be available');

const authorization = await check('/api/oauth/start', 302);
let location;
try { location = new URL(authorization.headers.get('location')); }
catch { throw new Error('OAuth start must return a valid authorization URL'); }
assert.equal(location.origin, 'https://openapi.zhihu.com');
assert.equal(location.pathname, '/authorize');
assert.equal(location.searchParams.get('app_id'), expectedAppId);
assert.equal(location.searchParams.get('redirect_uri'), expectedRedirect);
assert.equal(location.searchParams.get('response_type'), 'code');
assert.deepEqual([...location.searchParams.keys()].sort(), ['app_id', 'redirect_uri', 'response_type', 'state']);
// Boolean assertions keep state and cookies out of failed-check diagnostics too.
assert.ok(/^[A-Za-z0-9_-]{32}$/.test(location.searchParams.get('state') ?? ''), 'OAuth state must use the supported 32-character format');
const sessionCookie = authorization.headers.getSetCookie().filter(value => value.startsWith('zhihu_oauth_session=')).at(-1) ?? '';
assert.ok(/^zhihu_oauth_session=[A-Za-z0-9_-]{43};/.test(sessionCookie), 'OAuth start must set an opaque session cookie');
for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/']) {
  assert.ok(sessionCookie.split(';').map(value => value.trim()).includes(attribute), `OAuth session cookie requires ${attribute}`);
}
assert.equal(authorization.headers.get('referrer-policy'), 'no-referrer');

const protectedApi = await (await check('/api/workshop/projects', 401)).json();
assert.equal(protectedApi.error.code, 'AUTH_REQUIRED');
const login = await (await check('/api/auth/login', 403, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: '{}',
})).json();
assert.equal(login.error.code, 'OAUTH_REQUIRED');
for (const path of ['/api/auth/login', '/api/oauth/logout']) {
  const crossOrigin = await (await check(path, 403, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://untrusted.invalid', 'Sec-Fetch-Site': 'cross-site' }, body: '{}',
  })).json();
  assert.equal(crossOrigin.error.code, 'CROSS_ORIGIN');
}
console.log(`Verified application, assets, and OAuth authentication boundaries at ${origin}; real user authorization is not exercised`);
