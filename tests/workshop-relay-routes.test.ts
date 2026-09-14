import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('relay discovery routes validate connections without saving and only reuse keys at the saved endpoint', async t => {
  const root = await mkdtemp(join(tmpdir(), 'relay-routes-'));
  const environment = { PUBLIC_MODE: '', WORKSHOP_CONFIG_PATH: join(root, 'relay.json'), LIUKAN_CONFIG_PATH: join(root, 'liukan.json'), ALLOWED_HOSTS: '127.0.0.1', WORKSHOP_RELAY_URL: '', WORKSHOP_RELAY_API_KEY: '', WORKSHOP_RELAY_MODEL: '' };
  const previous = Object.fromEntries(Object.keys(environment).map(key => [key, process.env[key]]));
  Object.assign(process.env, environment);
  t.after(async () => {
    for (const key of Object.keys(environment)) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
    await rm(root, { recursive: true, force: true });
  });
  const { createApp } = await import('../server/app.ts');
  const { StoryWorkshop } = await import('../server/story-workshop.ts');
  const { StorySourceService } = await import('../server/story-source.ts');
  const { ZhihuDiscoveryService } = await import('../server/zhihu-discovery.ts');
  const requests: Array<{ path: string; auth?: string; body?: any }> = [];
  const key = 'route-test-secret-12345';
  const upstream = createServer(async (request, response) => {
    let raw = ''; for await (const chunk of request) raw += chunk;
    requests.push({ path: request.url!, auth: request.headers.authorization, ...(raw ? { body: JSON.parse(raw) } : {}) });
    response.setHeader('Content-Type', 'application/json');
    if (request.headers.authorization !== `Bearer ${key}`) { response.statusCode = 401; response.end(JSON.stringify({ error: { message: `PRIVATE ${key}` } })); return; }
    response.end(JSON.stringify(request.url === '/v1/models' ? { data: [{ id: 'test-chat' }] } : { status: 'completed', output_text: '{"ok":true}' }));
  });
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  const upstreamAddress = upstream.address(); assert.ok(upstreamAddress && typeof upstreamAddress === 'object');
  const endpoint = `http://127.0.0.1:${upstreamAddress.port}`;
  const app = createApp(new StorySourceService({ cacheDir: join(root, 'sources') }), new StoryWorkshop(join(root, 'workshop')), new ZhihuDiscoveryService(join(root, 'discovery')));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { for (const listener of [server, upstream]) { listener.closeAllConnections(); await new Promise<void>(resolve => listener.close(() => resolve())); } });
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}/api/workshop/creative-config`;
  const post = async (suffix: string, body: unknown, headers: Record<string, string> = {}) => {
    const response = await fetch(base + suffix, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    const text = await response.text(); assert.doesNotMatch(text, /route-test-secret|PRIVATE/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return { status: response.status, data: JSON.parse(text) };
  };
  await t.test('address and key alone discover models, then a real probe selects a protocol without persisting', async () => {
    const found = await post('/models', { endpoint, apiKey: key });
    assert.equal(found.status, 200); assert.deepEqual(found.data, { endpoint: endpoint + '/v1', models: ['test-chat'] });
    const checked = await post('/check', { endpoint, apiKey: key, model: found.data.models[0], protocol: 'auto' });
    assert.equal(checked.status, 200); assert.equal(checked.data.connected, true); assert.equal(checked.data.protocol, 'responses');
    assert.equal(requests[1].body.reasoning, undefined);
    await assert.rejects(readFile(environment.WORKSHOP_CONFIG_PATH), { code: 'ENOENT' });
  });
  await t.test('saved key can detect and switch models at an equivalent endpoint without returning the key', async () => {
    const saved = await post('', { endpoint, apiKey: key, model: 'test-chat', protocol: 'responses' });
    assert.equal(saved.status, 200);
    const before = await readFile(environment.WORKSHOP_CONFIG_PATH, 'utf8');
    assert.equal((await post('/models', { endpoint: endpoint + '/v1/responses', apiKey: '' })).status, 200);
    assert.equal((await post('/check', { endpoint: endpoint + '/v1', model: 'test-chat', protocol: 'auto' })).status, 200);
    assert.equal(await readFile(environment.WORKSHOP_CONFIG_PATH, 'utf8'), before);
    const changed = await post('', { endpoint: endpoint + '/v1', model: 'test-chat-2', protocol: 'chat-completions' });
    assert.equal(changed.status, 200); assert.equal(changed.data.relay.model, 'test-chat-2');
    assert.equal(JSON.parse(await readFile(environment.WORKSHOP_CONFIG_PATH, 'utf8')).apiKey, key);
  });
  await t.test('new endpoints, cross-origin requests and bad credentials cannot reuse the stored key', async () => {
    const count = requests.length;
    for (const suffix of ['/models', '/check', '']) {
      assert.equal((await post(suffix, { endpoint: endpoint + '/another', model: 'test-chat' })).status, 400);
      assert.equal((await post(suffix, { endpoint, apiKey: key, model: 'test-chat' }, { Origin: 'https://unrelated.invalid' })).status, 403);
    }
    assert.equal(requests.length, count);
    const invalid = await post('/models', { endpoint, apiKey: 'invalid-fixture-key' });
    assert.equal(invalid.status, 401); assert.equal(invalid.data.error.code, 'authentication');
    assert.equal((await post('/models', { endpoint: 'not-an-address', apiKey: key })).status, 400);
  });
});
