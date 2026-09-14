import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { requestZhihuJson, ZhihuRequestError } from '../src/zhihu-request.ts';

function browserTimers(t: TestContext) {
  const old = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    setTimeout: (...args: Parameters<typeof setTimeout>) => setTimeout(...args),
    clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
  } });
  t.after(() => { if (old) Object.defineProperty(globalThis, 'window', old); else Reflect.deleteProperty(globalThis, 'window'); });
}

test('browser errors retain their machine-readable reason for reconnect without retrying actions', async t => {
  browserTimers(t);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return Response.json({ error: { code: 'BROWSER_CLOSED', message: '这个知乎窗口已经关闭，请重新连接。' } }, { status: 409 });
  });
  await assert.rejects(requestZhihuJson('/api/zhihu-browser/action', { kind: 'key', key: 'Enter' }), error =>
    error instanceof ZhihuRequestError && error.code === 'BROWSER_CLOSED' && error.status === 409);
  assert.equal(calls, 1);
});

test('an unresponsive renderer stops blocking the UI at its deadline and is not replayed', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  browserTimers(t);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_input, init) => {
    calls++;
    return new Promise<Response>((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    });
  });
  const pending = assert.rejects(requestZhihuJson('/api/zhihu-browser/frame'), error =>
    error instanceof ZhihuRequestError && error.code === 'REQUEST_TIMEOUT');
  t.mock.timers.tick(25_000);
  await pending;
  assert.equal(calls, 1);
});

test('a proxy outage never displays its HTML as a browser error or replays a submitted operation', async t => {
  browserTimers(t);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return new Response('<html>upstream diagnostic detail</html>', { status: 502 }); });
  await assert.rejects(requestZhihuJson('/api/zhihu-browser/action', { kind: 'text', text: 'test-input' }), /服务暂时不可用（502）/);
  assert.equal(calls, 1);
});
