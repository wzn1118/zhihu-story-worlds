import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import { createZhihuOAuth, zhihuOAuth, type ZhihuOAuthOptions } from '../server/zhihu-oauth.ts';
import { StoryWorkshop } from '../server/story-workshop.ts';

const configuration = { enabled: true, appId: 'test-app-id', appKey: 'private-app-key', accessSecret: 'private-access-secret', redirectUri: 'https://story.example.com/auth/callback' };
const summary = '小城连续七天停雨，档案员在旧车站发现一封未寄出的信。信中的名字恰好属于十年前失踪的朋友，而明天的列车将把所有证据带走。他必须在家人、工作与真相之间作出选择，找到当年的值班员，弄清谁改写了最后一页记录。';
const favorite = { ContentType: 'answer', Url: 'https://www.zhihu.com/question/123456/answer/987654?utm_source=collection', Title: '旧车站的信', Summary: summary, Author: { Name: '收藏作者', UrlToken: 'unused-private-author-token' } };
function json(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } }); }

async function fixture(t: TestContext, userFetch: typeof fetch = async () => json({ Code: 0, Data: { Items: [] } }), options: ZhihuOAuthOptions = {}) {
  const root = await mkdtemp(join(tmpdir(), 'oauth-favorites-'));
  const env = { PUBLIC_MODE: '1', NODE_ENV: 'test', ALLOWED_HOSTS: '127.0.0.1', LIUKAN_USERS_ROOT: join(root, 'accounts'), AUTH_STORE: join(root, 'auth.json') };
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  t.after(async () => { for (const key of Object.keys(env)) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; } await rm(root, { recursive: true, force: true }); });
  const oauth = createZhihuOAuth({ config: configuration, report: () => {}, fetch: async (input, init) => {
    const url = String(input);
    if (url.endsWith('/access_token')) {
      const username = new URLSearchParams(String(init?.body)).get('code');
      return json({ access_token: `private-token-${username}`, expires_in: 60 });
    }
    if (url.endsWith('/user')) {
      const token = new Headers(init?.headers).get('Authorization')!.replace('Bearer private-token-', '');
      return json({ hash_id: token, fullname: token });
    }
    return userFetch(input, init);
  }, ...options });
  for (const method of ['router', 'callback', 'status', 'currentUser', 'logout', 'favoritesRecent', 'favoritesLists', 'favoritesItems', 'favoriteSource'] as const) t.mock.method(zhihuOAuth, method, oauth[method]);
  const { createApp } = await import('../server/app.ts');
  const { StorySourceService } = await import('../server/story-source.ts');
  const { ZhihuDiscoveryService } = await import('../server/zhihu-discovery.ts');
  const workshop = new StoryWorkshop(join(root, 'workshop'));
  const app = createApp(new StorySourceService({ cacheDir: join(root, 'sources') }), workshop, new ZhihuDiscoveryService(join(root, 'discovery')), undefined, { getImages: async () => null, listImages: async () => [] });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  function client() {
    let cookie = '', account = '';
    async function request(path: string, body?: unknown, headers: Record<string, string> = {}) {
      const response = await fetch(`${base}${path}`, { method: body === undefined ? 'GET' : 'POST', redirect: 'manual', headers: {
        ...(cookie ? { Cookie: cookie } : {}), ...(account ? { 'X-Redleaf-Account': account } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers,
      }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      for (const line of response.headers.getSetCookie()) if (line.startsWith('zhihu_oauth_session=')) cookie = line.split(';')[0];
      return response;
    }
    async function login(name = 'alice') {
      const started = await request('/api/oauth/start'); assert.equal(started.status, 302);
      const state = new URL(started.headers.get('location')!).searchParams.get('state');
      const callback = await request(`/auth/callback?code=${name}&state=${state}`); assert.equal(callback.status, 303);
      const me = await (await request('/api/auth/me')).json(); account = me.user?.id ?? '';
      return me;
    }
    return { request, login, account: () => account, cookie: () => cookie };
  }
  return { root, oauth, workshop, client };
}

test('OAuth favorites forward both credentials and remain transient until selected for import', async t => {
  const requests: Array<{ url: URL; headers: Headers }> = [];
  const f = await fixture(t, async (input, init) => { requests.push({ url: new URL(String(input)), headers: new Headers(init?.headers) }); return json({ Code: 0, Data: { Items: [favorite] } }); });
  const alice = f.client(); await alice.login();
  const response = await alice.request('/api/workshop/favorites/recent');
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  const output = await response.json(), item = output.items[0];
  assert.equal(output.nextOffset, undefined); assert.equal(item.title, favorite.Title); assert.equal(item.author, favorite.Author.Name);
  assert.equal(item.summary, summary); assert.equal(item.characters, summary.length); assert.equal(item.importable, true);
  assert.equal(item.url, 'https://www.zhihu.com/question/123456/answer/987654');
  assert.equal(requests[0].headers.get('Authorization'), `Bearer ${configuration.accessSecret}`);
  assert.equal(requests[0].headers.get('X-OAuth-Token'), 'private-token-alice');
  assert.match(requests[0].headers.get('X-Request-Timestamp')!, /^[0-9]+$/);
  assert.equal(requests[0].url.searchParams.get('Limit'), '20'); assert.equal(requests[0].url.searchParams.has('Offset'), false);
  assert.doesNotMatch(JSON.stringify(output), /private-access-secret|private-token|unused-private-author-token/);
  assert.deepEqual(await readdir(join(f.root, 'workshop')).catch(() => []), [], 'browsing must not create persistent collection records');
  const options = { mode: 'fast', adaptation: 'inspiration', images: 'none' };
  const imported = await alice.request('/api/workshop/favorites/import', { itemId: item.id, generate: false, generationOptions: options });
  assert.equal(imported.status, 201); const project = await imported.json();
  assert.equal(project.ownerId, alice.account()); assert.deepEqual(project.generationOptions, options);
  const saved = await f.workshop.source(project.id);
  assert.equal(saved.text, summary); assert.equal(saved.scope, 'zhihu-excerpt'); assert.equal(saved.title, favorite.Title); assert.equal(saved.author, favorite.Author.Name);
  assert.equal(saved.origin?.contentScope, 'favorite-summary'); assert.equal(saved.origin?.kind, 'zhihu-answer'); assert.equal(saved.origin?.workId, '987654');
  assert.doesNotMatch(await readFile(join(f.workshop.dir(project.id), 'source.json'), 'utf8'), /private-token|private-access-secret/);
});

test('each OAuth account reads its own recent favorites and folders with the same platform credential', async t => {
  const upstream: { user: string; path: string }[] = [];
  const accountFavorites = {
    alice: { ...favorite, Title: 'Alice 收藏的故事', Summary: `${summary}这是 Alice 选中的素材。` },
    bob: { ...favorite, Title: 'Bob 收藏的故事', Summary: `${summary}这是 Bob 选中的素材。`, Url: 'https://www.zhihu.com/question/123456/answer/987655' },
  };
  const folders = { alice: '111', bob: '222' };
  const f = await fixture(t, async (input, init) => {
    const headers = new Headers(init?.headers), url = new URL(String(input));
    assert.equal(headers.get('Authorization'), `Bearer ${configuration.accessSecret}`);
    const token = headers.get('X-OAuth-Token');
    assert.ok(token === 'private-token-alice' || token === 'private-token-bob', 'Every favorites call must identify an OAuth user');
    const user = token === 'private-token-alice' ? 'alice' : 'bob';
    upstream.push({ user, path: url.pathname });
    if (url.pathname.endsWith('/favlists')) return json({ Code: 0, Data: { Items: [{ UrlToken: folders[user], Title: `${user} 的收藏夹` }] } });
    if (url.pathname.endsWith('/favlist_contents')) {
      assert.equal(url.searchParams.get('FavlistUrlToken'), folders[user]);
      return json({ Code: 0, Data: { Items: [accountFavorites[user]], Paging: { IsEnd: true } } });
    }
    assert.equal(url.pathname, '/api/v1/user/collections');
    return json({ Code: 0, Data: { Items: [accountFavorites[user]] } });
  });
  const alice = f.client(), bob = f.client();
  await alice.login('alice'); await bob.login('bob');
  assert.notEqual(alice.account(), bob.account());
  for (const [user, client] of [['alice', alice], ['bob', bob]] as const) {
    const recent = await client.request('/api/workshop/favorites/recent'); assert.equal(recent.status, 200);
    assert.equal((await recent.json()).items[0].summary, accountFavorites[user].Summary);
    const lists = await client.request('/api/workshop/favorites/lists'); assert.equal(lists.status, 200);
    assert.equal((await lists.json()).lists[0].id, folders[user]);
    const items = await client.request(`/api/workshop/favorites/lists/${folders[user]}/items`); assert.equal(items.status, 200);
    const item = (await items.json()).items[0]; assert.equal(item.title, accountFavorites[user].Title);
    const imported = await client.request('/api/workshop/favorites/import', { itemId: item.id }); assert.equal(imported.status, 201);
    const project = await imported.json(); assert.equal(project.ownerId, client.account());
    assert.equal((await f.workshop.source(project.id)).text, accountFavorites[user].Summary);
  }
  assert.equal(upstream.length, 6);
  assert.deepEqual(upstream.map(call => call.user), ['alice', 'alice', 'alice', 'bob', 'bob', 'bob']);
  assert.equal((await alice.request(`/api/workshop/favorites/lists/${folders.bob}/items`)).status, 404);
  assert.equal((await bob.request(`/api/workshop/favorites/lists/${folders.alice}/items`)).status, 404);
  await alice.request('/api/oauth/logout', {});
  assert.equal((await alice.request('/api/workshop/favorites/recent')).status, 401);
  assert.equal(upstream.length, 6, 'Cross-account and logged-out reads must never reach the provider');
});

test('favorites require the active OAuth session and never reuse another session selection', async t => {
  let calls = 0;
  const f = await fixture(t, async () => { calls++; return json({ Code: 0, Data: { Items: [favorite] } }); });
  const anonymous = f.client();
  assert.equal((await anonymous.request('/api/workshop/favorites/recent')).status, 401);
  assert.equal((await anonymous.request('/api/workshop/favorites/import', { itemId: 'forged' })).status, 401);
  assert.equal(calls, 0);
  const alice = f.client(), bob = f.client(), aliceOtherSession = f.client();
  await alice.login('alice'); await bob.login('bob'); await aliceOtherSession.login('alice');
  const item = (await (await alice.request('/api/workshop/favorites/recent')).json()).items[0];
  for (const other of [bob, aliceOtherSession]) {
    const response = await other.request('/api/workshop/favorites/import', { itemId: item.id });
    assert.equal(response.status, 404); assert.equal((await response.json()).error.code, 'FAVORITE_NOT_FOUND');
  }
  const changed = await alice.request('/api/workshop/favorites/recent', undefined, { 'X-Redleaf-Account': bob.account() });
  assert.equal(changed.status, 409); assert.equal(calls, 1);
  await alice.request('/api/oauth/logout', {});
  assert.equal((await alice.request('/api/workshop/favorites/import', { itemId: item.id })).status, 401);
  assert.deepEqual(await readdir(join(f.root, 'workshop')).catch(() => []), []);
});

test('a returned selection keeps its exact snapshot when the same favorite is updated upstream', async t => {
  let reads = 0;
  const updatedSummary = `${summary}第二天，他终于在报社找到那份被藏起的调查笔记。`;
  const f = await fixture(t, async () => json({ Code: 0, Data: { Items: [{ ...favorite, Title: '  旧车站的信  ', Author: { Name: ' 作者名字 ' }, Summary: reads++ === 0 ? summary : updatedSummary }] } }));
  const alice = f.client(); await alice.login();
  const first = (await (await alice.request('/api/workshop/favorites/recent')).json()).items[0];
  const second = (await (await alice.request('/api/workshop/favorites/recent')).json()).items[0];
  assert.notEqual(first.id, second.id);
  const response = await alice.request('/api/workshop/favorites/import', { itemId: first.id }); assert.equal(response.status, 201);
  const source = await f.workshop.source((await response.json()).id);
  assert.equal(source.text, summary); assert.equal(source.title, '  旧车站的信  '); assert.equal(source.author, ' 作者名字 ');
});

test('folder identifiers and int64 pagination stay lossless; recent collections have no fabricated pagination', async t => {
  const folder = '969570047710216201', cursor = '9223372036854775806';
  const requests: URL[] = [];
  const f = await fixture(t, async input => {
    const url = new URL(String(input)); requests.push(url);
    if (url.pathname.endsWith('/favlists')) return new Response(`{"Code":0,"Data":{"Items":[{"UrlToken":${folder},"Title":"小说收藏","Description":"准备改编"}]}}`);
    if (url.pathname.endsWith('/favlist_contents')) return json({ Code: 0, Data: { Items: [favorite], Paging: url.searchParams.get('Offset') === '0' ? { IsEnd: false, NextOffset: cursor } : { IsEnd: true } } });
    return json({ Code: 0, Data: { Items: [], Paging: { IsEnd: false, NextOffset: cursor } } });
  });
  const alice = f.client(); await alice.login();
  assert.equal((await alice.request(`/api/workshop/favorites/lists/${folder}/items`)).status, 404); assert.equal(requests.length, 0);
  const lists = await (await alice.request('/api/workshop/favorites/lists?limit=50')).json();
  assert.equal(lists.lists[0].id, folder); assert.equal(lists.lists[0].url, `https://www.zhihu.com/collection/${folder}`);
  assert.equal(requests[0].searchParams.get('Limit'), '50'); assert.equal(requests[0].searchParams.has('Offset'), false);
  const first = await (await alice.request(`/api/workshop/favorites/lists/${folder}/items`)).json(); assert.equal(first.nextOffset, cursor);
  const second = await (await alice.request(`/api/workshop/favorites/lists/${folder}/items?offset=${first.nextOffset}`)).json(); assert.equal(second.nextOffset, undefined);
  assert.equal(requests[2].searchParams.get('Offset'), cursor); assert.equal(requests[2].searchParams.get('FavlistUrlToken'), folder);
  assert.deepEqual(await (await alice.request('/api/workshop/favorites/recent')).json(), { items: [] });
  for (const path of ['/recent?offset=1', '/lists?offset=1', '/recent?limit=51', `/lists/${folder}/items?offset=9223372036854775808`, `/lists/${folder}/items?offset=9.6957e17`, `/lists/${folder}/items?offset=-1`]) assert.equal((await alice.request(`/api/workshop/favorites${path}`)).status, 400);
  assert.equal(requests.length, 4);
});

test('short, unsupported, and untrusted favorite sources cannot import or override server text', async t => {
  const f = await fixture(t, async () => json({ Code: 0, Data: { Items: [
    { ...favorite, Summary: '短摘要' },
    { ...favorite, ContentType: 'zvideo', Url: 'https://www.zhihu.com/zvideo/123456' },
    { ...favorite, Url: 'https://attacker.example/answer/987654' },
    { ...favorite, Url: 'javascript:alert(1)' },
    { ...favorite, ContentType: 'article', Url: 'https://zhuanlan.zhihu.com/p/234567' },
  ] } }));
  const alice = f.client(); await alice.login();
  const items = (await (await alice.request('/api/workshop/favorites/recent')).json()).items;
  assert.deepEqual(items.map((item: { importable: boolean }) => item.importable), [false, false, false, false, true]);
  assert.equal(items[2].url, ''); assert.equal(items[3].url, '');
  for (const item of items.slice(0, 4)) {
    const denied = await alice.request('/api/workshop/favorites/import', { itemId: item.id });
    assert.equal(denied.status, 400); assert.equal((await denied.json()).error.code, 'FAVORITE_NOT_IMPORTABLE');
  }
  const injected = await alice.request('/api/workshop/favorites/import', { itemId: items[4].id, sourceUrl: 'https://attacker.example', text: summary });
  assert.equal(injected.status, 400); assert.equal((await injected.json()).error.code, 'INVALID_FAVORITE_IMPORT');
  const response = await alice.request('/api/workshop/favorites/import', { itemId: items[4].id }); assert.equal(response.status, 201);
  assert.equal((await response.json()).origin.kind, 'zhihu-article');
});

test('expiry and logout while a favorites request is in flight do not return or retain private selections', async t => {
  for (const action of ['expire', 'logout'] as const) {
    await t.test(action, async t => {
      let instant = Date.now(), release!: (response: Response) => void, started!: () => void;
      const pending = new Promise<Response>(resolve => { release = resolve; }), began = new Promise<void>(resolve => { started = resolve; });
      const f = await fixture(t, async () => { started(); return pending; }, { now: () => instant });
      const alice = f.client(); await alice.login();
      const reading = alice.request('/api/workshop/favorites/recent'); await began;
      if (action === 'expire') instant += 60_000; else await alice.request('/api/oauth/logout', {});
      release(json({ Code: 0, Data: { Items: [favorite] } }));
      const result = await reading; assert.equal(result.status, 401);
      assert.doesNotMatch(await result.text(), /旧车站|private-token|private-access-secret/);
      assert.equal((await alice.request('/api/workshop/favorites/recent')).status, 401);
      assert.deepEqual(await readdir(join(f.root, 'workshop')).catch(() => []), []);
    });
  }
});

test('favorites configuration, upstream auth errors, rate limits and malformed replies expose only safe errors', async t => {
  for (const scenario of ['unconfigured', 'auth', 'http-limit', 'business-limit', 'quota', 'malformed'] as const) {
    await t.test(scenario, async t => {
      let calls = 0;
      const f = await fixture(t, async () => {
        calls++;
        if (scenario === 'auth') return json({ Code: 20001, Message: 'private-token-alice private-access-secret' });
        if (scenario === 'http-limit') return json({ Message: 'private-access-secret' }, 429);
        if (scenario === 'business-limit' || scenario === 'quota') return json({ Code: scenario === 'quota' ? 30002 : 30001, Message: 'private-token-alice' });
        return json({ Code: 0, Data: { private: 'private-access-secret' } });
      }, scenario === 'unconfigured' ? { config: { ...configuration, accessSecret: '' } } : {});
      const alice = f.client(); await alice.login();
      const result = await alice.request('/api/workshop/favorites/recent');
      assert.equal(result.status, scenario === 'unconfigured' ? 503 : scenario === 'auth' ? 401 : scenario === 'malformed' ? 502 : 429);
      assert.doesNotMatch(await result.text(), /private-token|private-access-secret/);
      if (scenario === 'unconfigured') assert.equal(calls, 0);
      const status = await (await alice.request('/api/oauth/status')).json(); assert.equal(status.authorized, scenario !== 'auth');
    });
  }
});

test('selected favorite generation preserves owner and requested options and rechecks authorization after import', async t => {
  const f = await fixture(t, async () => json({ Code: 0, Data: { Items: [favorite] } }));
  const alice = f.client(); await alice.login();
  const item = (await (await alice.request('/api/workshop/favorites/recent')).json()).items[0];
  const generated: Array<{ id: string; mode: string; options: unknown }> = [];
  t.mock.method(f.workshop, 'generate', async (id: string, mode: string, options: unknown) => { generated.push({ id, mode, options }); return f.workshop.get(id); });
  const options = { mode: 'fast', adaptation: 'inspiration', images: 'none' };
  const result = await alice.request('/api/workshop/favorites/import', { itemId: item.id, generate: true, generationOptions: options });
  assert.equal(result.status, 202); const project = await result.json();
  assert.equal(project.ownerId, alice.account()); assert.deepEqual(generated, [{ id: project.id, mode: 'resume', options }]);
  const originalImport = f.workshop.importZhihuSearch.bind(f.workshop);
  t.mock.method(f.workshop, 'importZhihuSearch', async (...args: Parameters<StoryWorkshop['importZhihuSearch']>) => {
    const saved = await originalImport(...args); await alice.request('/api/oauth/logout', {}); return saved;
  });
  const interrupted = await alice.request('/api/workshop/favorites/import', { itemId: item.id, generate: true, generationOptions: options });
  assert.equal(interrupted.status, 401); assert.equal(generated.length, 1, 'an expired selection must not launch a generation after import');
});
