import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import * as current from '../src/game.ts';

function browserTimers(t: TestContext) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { setTimeout, clearTimeout } });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'window', previous); else Reflect.deleteProperty(globalThis, 'window'); });
}

for (const [name, client] of Object.entries({ current })) {
  for (const [status, body] of [[404, 'Not Found'], [502, '<html>private proxy diagnostics</html>']] as const) {
    test(`${name}: plain HTTP ${status} retains its status without exposing a JSON parser or proxy body`, async t => {
      browserTimers(t);
      t.mock.method(globalThis, 'fetch', async () => new Response(body, { status }));
      await assert.rejects(client.fetchJson('/api/workshop/projects/missing'), error => {
        assert.ok(error instanceof client.ApiError);
        assert.equal(error.status, status); assert.equal(error.code, `HTTP_${status}`);
        assert.match(error.message, new RegExp(String(status)));
        assert.doesNotMatch(error.message, /Unexpected token|Not Found|private proxy|<html>/);
        return true;
      });
    });
  }

  test(`${name}: JSON API failures retain the server's message and code and the actual HTTP status`, async t => {
    browserTimers(t);
    t.mock.method(globalThis, 'fetch', async () => Response.json({ error: { message: '此项目不存在。', code: 'PROJECT_NOT_FOUND', status: 200 } }, { status: 404 }));
    await assert.rejects(client.fetchJson('/api/workshop/projects/missing'), { name: 'ApiError', message: '此项目不存在。', status: 404, code: 'PROJECT_NOT_FOUND' });
  });

  test(`${name}: an HTTP failure with a null JSON body still has a useful HTTP error`, async t => {
    browserTimers(t);
    t.mock.method(globalThis, 'fetch', async () => Response.json(null, { status: 503 }));
    await assert.rejects(client.fetchJson('/api/workshop/projects'), { name: 'ApiError', status: 503, code: 'HTTP_503' });
  });

  test(`${name}: malformed successful responses get a safe response error`, async t => {
    browserTimers(t);
    t.mock.method(globalThis, 'fetch', async () => new Response('<html>proxy login page</html>'));
    await assert.rejects(client.fetchJson('/api/workshop/projects'), error => {
      assert.ok(error instanceof client.ApiError);
      assert.equal(error.status, 200); assert.equal(error.code, 'INVALID_RESPONSE');
      assert.doesNotMatch(error.message, /Unexpected token|proxy login/);
      return true;
    });
  });

  test(`${name}: successful JSON and recoverable connection errors preserve their existing behavior`, async t => {
    browserTimers(t);
    const request = t.mock.method(globalThis, 'fetch', async () => Response.json({ projects: [] }));
    assert.deepEqual(await client.fetchJson('/api/workshop/projects'), { projects: [] });
    request.mock.mockImplementation(async () => { throw new TypeError('Network failure'); });
    await assert.rejects(client.fetchJson('/api/workshop/projects'), /暂时无法连接/);
    request.mock.mockImplementation(async () => { throw new DOMException('Aborted', 'AbortError'); });
    await assert.rejects(client.fetchJson('/api/workshop/projects'), /请求超时/);
  });
}
