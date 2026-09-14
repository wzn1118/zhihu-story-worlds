import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Compiler } from 'inkjs/full';
import type { GameWorld } from '../shared/types.ts';

function publishedWorld(storyId: string, title: string): GameWorld {
  const ink = JSON.parse(new Compiler(['-> start', '=== start ===', '# node:start', '门后传来轻响。', '* [推门 # choice:open]', '  -> end', '=== end ===', '# node:end', '灯亮了。', '# ending:end', '-> END'].join('\n')).Compile().ToJson() as string);
  return { id: storyId, storyId, title, subtitle: '', introduction: [], player: { name: '我', role: '读者' }, objective: '', startNodeId: 'start',
    nodes: { start: { id: 'start', chapter: '一', title: '入口', location: '', time: '', background: '', text: ['门后传来轻响。'], choices: [{ id: 'open', text: '推门', nextNodeId: 'end' }] },
      end: { id: 'end', chapter: '一', title: '灯下', location: '', time: '', background: '', text: ['灯亮了。'], choices: [], ending: { title: `${title}的结局`, text: '结束', tone: 'hopeful' } } },
    characters: [], source: { title, author: '测试作者', url: '' }, version: 'r1', cover: '', background: '', summary: '', ink, clueVariables: {}, adaptation: { scope: 'original-seed', adultCast: true, note: '' } };
}

test('public LiuKanShan routes persist distinct accounts and never select data by a supplied playerId', async t => {
  const root = await mkdtemp(join(tmpdir(), 'liukan-multiuser-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const environment = { PUBLIC_MODE: '1', ALLOWED_HOSTS: '127.0.0.1', NODE_ENV: 'test', ZHIHU_ACCESS_SECRET: '', ZHIHU_CLI_BIN: '/no-cli-may-run-in-this-test',
    LIUKAN_CONFIG_PATH: join(root, 'config.json'), LIUKAN_USERS_ROOT: join(root, 'accounts'), WORKSHOP_CONFIG_PATH: join(root, 'creative.json'),
    OPENAI_BASE_URL: 'https://multiuser-model.example/v1', OPENAI_API_KEY: 'fixture-server-key', OPENAI_MODEL: 'fixture-server-model', OPENAI_TRANSPORT: 'chat-completions',
    WORKSHOP_RELAY_URL: '', WORKSHOP_RELAY_API_KEY: '', WORKSHOP_RELAY_MODEL: '' };
  const previous = Object.fromEntries(Object.keys(environment).map(key => [key, process.env[key]])); Object.assign(process.env, environment);
  t.after(() => { for (const key of Object.keys(environment)) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; } });
  const { createApp } = await import('../server/app.ts');
  const { StorySourceService } = await import('../server/story-source.ts');
  const { StoryWorkshop, writeJson } = await import('../server/story-workshop.ts');
  const { ZhihuDiscoveryService } = await import('../server/zhihu-discovery.ts');
  const { zhihuOAuth } = await import('../server/zhihu-oauth.ts');
  const { liukanAccountKey } = await import('../server/liukan/workspace.ts');
  const { liveGeneratedArt } = await import('../server/live-generated-art.ts');
  const users = {
    alice: { id: 'zhihu-alice-fixture', name: 'Alice', provider: 'zhihu' as const, email: '' as const, createdAt: '2026-01-01T00:00:00Z' },
    bob: { id: 'zhihu-bob-fixture', name: 'Bob', provider: 'zhihu' as const, email: '' as const, createdAt: '2026-01-01T00:00:00Z' },
  };
  // Mock only the already-verified OAuth identity and external model transport.
  // Every data operation below runs through the production Express/services.
  t.mock.method(zhihuOAuth, 'currentUser', (request: { headers: { cookie?: string } }) => users[request.headers.cookie?.replace('fixture_session=', '') as keyof typeof users] ?? null);
  const originalFetch = globalThis.fetch; const prompts: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    assert.equal(input, `${environment.OPENAI_BASE_URL}/chat/completions`);
    const body = JSON.parse(init!.body as string); assert.equal(body.model, environment.OPENAI_MODEL);
    assert.equal((init!.headers as Record<string, string>).Authorization, `Bearer ${environment.OPENAI_API_KEY}`);
    const prompt = body.messages[0].content as string; prompts.push(prompt);
    let answer = `模拟回复 ${prompts.length}`;
    if (prompt.includes('只输出一个合法 JSON 对象')) {
      const payload = JSON.parse(prompt.slice(prompt.lastIndexOf('\n') + 1)), context = payload.sources[0];
      answer = JSON.stringify({ title: context.source.title, summary: '根据原文整理。', sections: [{ heading: '原文里的线索', body: '角色留下的线索已保存在这篇原文。', evidence: [{ postId: context.source.postId, quote: context.passages[0].slice(0, 35) }] }] });
    }
    return new Response(JSON.stringify({ model: environment.OPENAI_MODEL, choices: [{ message: { content: answer }, finish_reason: 'stop' }] }), { headers: { 'Content-Type': 'application/json' } });
  });
  const source = new StorySourceService({ cacheDir: join(root, 'sources') }), workshop = new StoryWorkshop(join(root, 'workshop'));
  const discovery = new ZhihuDiscoveryService(join(root, 'discovery'), async () => { throw new Error('Unexpected search'); });
  const images: any[] = [];
  async function start() {
    const app = createApp(source, workshop, discovery, undefined, { getImages: async id => images.find(batch => batch.id === id) ?? null, listImages: async () => images });
    app.use('/generated-art', liveGeneratedArt(root));
    const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    t.after(async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    return `http://127.0.0.1:${address.port}`;
  }
  let base = await start();
  async function request(user: keyof typeof users | '', path: string, body?: unknown) {
    const response = await originalFetch(`${base}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { Cookie: user ? `fixture_session=${user}` : '', ...(user ? { 'X-Redleaf-Account': users[user].id } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await response.text(); let data: any; try { data = JSON.parse(text); } catch { data = text; }
    assert.doesNotMatch(text, /fixture-server-key/); return { status: response.status, data, cacheControl: response.headers.get('cache-control') };
  }
  const selection = (name: string) => ({ title: `${name}的故事`, author: `${name}作者`, text: `${name}把钥匙留在门边，之后楼道里的灯亮了。`.repeat(8), sourceUrl: 'https://www.zhihu.com/question/12345678/answer/87654321' });
  const posts: Record<string, any> = {}, projects: Record<string, any> = {}, notes: Record<string, any> = {};

  await t.test('a stale tab cannot read or write using a cookie changed to another account', async () => {
    for (const method of ['GET', 'POST']) {
      const response = await originalFetch(`${base}/api/liukan/inbox`, { method, headers: {
        Cookie: 'fixture_session=bob', 'X-Redleaf-Account': users.alice.id, 'Content-Type': 'application/json',
      }, ...(method === 'POST' ? { body: JSON.stringify({ candidateId: 'a'.repeat(32) }) } : {}) });
      assert.equal(response.status, 409); assert.equal((await response.json()).error.code, 'ACCOUNT_CHANGED');
    }
    assert.equal(prompts.length, 0);
  });

  await t.test('two accounts independently capture, feed, chat, read and import using the existing server relay', async () => {
    assert.equal((await request('', '/api/liukan/inbox')).status, 401);
    for (const user of ['alice', 'bob'] as const) {
      assert.deepEqual((await request(user, '/api/liukan/inbox')).data.posts, []);
      assert.deepEqual((await request(user, '/api/workshop/discovery')).data.candidates, []);
      const captured = await request(user, '/api/workshop/discovery/page', selection(user)); assert.equal(captured.status, 201);
      const feed = await request(user, '/api/liukan/inbox', { candidateId: captured.data.id }); assert.equal(feed.status, 201); posts[user] = feed.data;
      const chatted = await request(user, `/api/liukan/inbox/${posts[user].id}/chat`, { requestId: 'same-chat-id', question: `${user}的钥匙在哪里？` });
      assert.equal(chatted.status, 200); assert.equal(chatted.data.source, 'relay');
      const read = await request(user, '/api/liukan/reading/run', { requestId: 'same-reading-id', skill: 'recap', postIds: [posts[user].id] });
      assert.equal(read.status, 200); notes[user] = read.data; assert.equal(read.data.sources[0].title, selection(user).title);
      const imported = await request(user, '/api/workshop/discovery/import', { candidateId: posts[user].id, generationOptions: { mode: 'full', adaptation: 'faithful', images: 'none' } });
      assert.equal(imported.status, 201); projects[user] = imported.data; assert.equal(imported.data.ownerId, users[user].id);
      const general = await request(user, '/api/liukan/general-chat', { requestId: 'same-general-id', question: `${user}想怎么开始？` }); assert.equal(general.status, 200); assert.equal(general.data.source, 'relay');
    }
    assert.equal(prompts.length, 6); assert.notEqual(projects.alice.id, projects.bob.id);
    assert.doesNotMatch(prompts[0] + prompts[1], /bob的故事/); assert.doesNotMatch(prompts[3] + prompts[4], /alice的故事/);
  });

  await t.test('known candidate, post, note, project and art identifiers cannot cross account boundaries', async () => {
    const calls = prompts.length;
    for (const [user, other] of [['alice', 'bob'], ['bob', 'alice']] as const) {
      assert.deepEqual((await request(user, '/api/liukan/inbox')).data.posts.map((post: any) => post.id), [posts[user].id]);
      assert.deepEqual((await request(user, '/api/liukan/reading')).data.notes.map((note: any) => note.id), [notes[user].id]);
      assert.equal((await request(user, '/api/liukan/inbox', { candidateId: posts[other].id })).status, 404);
      assert.equal((await request(user, `/api/liukan/inbox/${posts[other].id}/chat`, { question: '读出另一人的原文' })).status, 404);
      assert.equal((await request(user, `/api/liukan/inbox/${posts[other].id}/generate`, {})).status, 404);
      assert.equal((await request(user, `/api/liukan/reading/${notes[other].id}`)).status, 404);
      assert.equal((await request(user, '/api/liukan/reading/run', { skill: 'recap', postIds: [posts[other].id], requestId: 'stolen-note' })).status, 404);
      assert.equal((await request(user, '/api/workshop/discovery/import', { candidateId: posts[other].id })).status, 404);
      for (const suffix of ['', '/source', '/world', '/art', '/simple-images', '/image-launch']) assert.equal((await request(user, `/api/workshop/projects/${projects[other].id}${suffix}`)).status, 404);
      for (const suffix of ['/generate', '/art', '/simple-images', '/image-launch']) assert.equal((await request(user, `/api/workshop/projects/${projects[other].id}${suffix}`, {})).status, 404);
      assert.equal((await request(user, '/api/liukan/chat', { storyId: projects[other].id, worldId: projects[other].id, history: [], question: '透露另一人的故事' })).status, 404);
    }
    const legacy = await workshop.import({ title: '本机旧故事', author: '作者', text: '本机未归属任何账号的旧故事。'.repeat(30) });
    assert.equal((await request('alice', `/api/workshop/projects/${legacy.id}/generate`, {})).status, 404);
    assert.equal((await request('alice', '/api/workshop/projects')).data.projects.length, 1);
    images.push({ id: 'alice-art', storyId: projects.alice.id, jobs: [{ asset: { url: '/generated-art/workshop/alice-image.png' } }] }, { id: 'bob-art', storyId: projects.bob.id, jobs: [] }, { id: 'shared-art', storyId: '123456789', jobs: [] });
    await mkdir(join(root, 'public/generated-art/workshop'), { recursive: true });
    await writeFile(join(root, 'public/generated-art/workshop/alice-image.png'), 'alice image fixture');
    assert.deepEqual((await request('alice', '/api/workshop/images')).data.batches.map((batch: any) => batch.id), ['alice-art']);
    assert.equal((await request('bob', '/api/workshop/images/alice-art')).status, 404);
    assert.equal((await request('bob', '/api/workshop/images/alice-art/run', {})).status, 404);
    assert.equal((await request('bob', '/generated-art/workshop/alice-image.png')).status, 404);
    assert.equal((await request('', '/generated-art/workshop/alice-image.png')).status, 401);
    const ownImage = await request('alice', '/generated-art/workshop/alice-image.png'); assert.equal(ownImage.status, 200); assert.equal(ownImage.cacheControl, 'private, no-store');
    assert.equal((await request('bob', `/generated-art/workshop-simple/workshop-${projects.alice.id.slice(7)}-r1/cover.svg`)).status, 404);
    assert.equal((await request('alice', '/api/art/batches', { storyId: '123456789' })).status, 403);
    assert.equal(prompts.length, calls);
  });

  await t.test('the same source imports independently for each user while retrying is idempotent within an account', async () => {
    const captured = await request('bob', '/api/workshop/discovery/page', selection('alice'));
    const own = await request('bob', '/api/workshop/discovery/import', { candidateId: captured.data.id });
    assert.equal(own.status, 201); assert.equal(own.data.ownerId, users.bob.id); assert.notEqual(own.data.id, projects.alice.id);
    const again = await request('alice', '/api/workshop/discovery/import', { candidateId: posts.alice.id }); assert.equal(again.data.id, projects.alice.id);
  });

  await t.test('completion memory and recall always use the authenticated account, including after restart', async () => {
    for (const user of ['alice', 'bob'] as const) {
      const project = await workshop.get(projects[user].id); project.publishedVersion = 'r1'; project.playable = true; await workshop.save(project);
      await mkdir(join(workshop.dir(project.id), 'r1'), { recursive: true }); await writeJson(join(workshop.dir(project.id), 'r1', 'world.json'), publishedWorld(project.id, selection(user).title));
      const other = user === 'alice' ? 'bob' : 'alice';
      const remember = await request(user, '/api/liukan/remember', { playerId: liukanAccountKey(users[other].id), storyId: project.id, worldId: project.id, history: [{ nodeId: 'start', choiceId: 'open' }] });
      assert.equal(remember.status, 200); assert.equal(remember.data.memories[0].storyId, project.id);
      const recall = await request(user, '/api/liukan/chat', { requestId: 'same-recall-id', playerId: users[other].id, storyId: project.id, worldId: project.id, history: [], question: '我们去过哪里？' });
      assert.equal(recall.status, 200); assert.equal(recall.data.source, 'relay'); assert.deepEqual(recall.data.context.completed.map((memory: any) => memory.storyId), [project.id]);
    }
    base = await start();
    for (const user of ['alice', 'bob'] as const) {
      const other = user === 'alice' ? 'bob' : 'alice';
      const memories = await request(user, `/api/liukan/memories?playerId=${liukanAccountKey(users[other].id)}`);
      assert.equal(memories.status, 200); assert.equal(memories.data.profile.playerId, liukanAccountKey(users[user].id)); assert.deepEqual(memories.data.memories.map((row: any) => row.storyId), [projects[user].id]);
      assert.deepEqual((await request(user, '/api/liukan/inbox')).data.posts.map((post: any) => post.id), [posts[user].id]);
      assert.equal((await request(user, `/api/liukan/reading/${notes[user].id}`)).status, 200);
    }
  });

  await t.test('visitors cannot replace server credentials or run personal queries against the shared CLI', async () => {
    const config = await request('alice', '/api/liukan/config'); assert.equal(config.status, 200); assert.equal(config.data.transport, 'relay'); assert.equal(config.data.model, environment.OPENAI_MODEL); assert.equal(config.data.relay, undefined);
    for (const path of ['/api/liukan/config', '/api/workshop/creative-config', '/api/workshop/creative-config/models', '/api/workshop/creative-config/check']) {
      const response = await request('alice', path, { transport: 'relay', endpoint: 'https://attacker.invalid', apiKey: 'attacker-key', clear: true }); assert.equal(response.status, 403); assert.equal(response.data.error.code, 'SERVER_CONFIG_READ_ONLY');
    }
    const capabilities = await request('alice', '/api/liukan/capabilities'); assert.ok(capabilities.data.abilities.every((ability: any) => !ability.private));
    for (const ability of ['my-contents', 'my-followees', 'favorites-recent', 'favorites-lists', 'favorites-items', 'knowledge-bases', 'knowledge-items', 'knowledge-search', 'quota']) {
      const response = await request('alice', '/api/liukan/capabilities/run', { ability, confirmPrivateAccess: true }); assert.equal(response.status, 409); assert.equal(response.data.error.code, 'OAUTH_CAPABILITY_UNAVAILABLE');
    }
    await assert.rejects(readFile(environment.LIUKAN_CONFIG_PATH), { code: 'ENOENT' });
    await assert.rejects(readFile(environment.WORKSHOP_CONFIG_PATH), { code: 'ENOENT' });
    assert.equal((await request('bob', '/api/liukan/general-chat', { question: '配置没有被其他人改掉吧？', requestId: 'after-attack' })).status, 200);
  });
});
