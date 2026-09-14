import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type RequestListener, type ServerResponse } from 'node:http';
import test from 'node:test';
import { checkRelayConnection, discoverRelayModels, RelayDiscoveryError } from '../server/workshop-relay-discovery.ts';

const apiKey = 'discovery-private-key';
const json = (res: ServerResponse, value: unknown, status = 200) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); };
const successfulResponse = { status: 'completed', output_text: '{"ok":true}' };
const successfulChat = { choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }] };

async function requestJson(req: IncomingMessage) {
  let body = '';
  for await (const chunk of req) body += chunk;
  return JSON.parse(body);
}

async function withServer(handler: RequestListener, run: (endpoint: string) => Promise<void>) {
  const server = createServer(handler);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address === 'object');
  try { await run(`http://127.0.0.1:${address.port}`); }
  finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}

function safeFailure(code: string, status?: number) {
  return (cause: unknown) => {
    assert.ok(cause instanceof RelayDiscoveryError);
    assert.equal(cause.code, code);
    if (status !== undefined) assert.equal(cause.status, status);
    assert.doesNotMatch(cause.message + JSON.stringify(cause), /discovery-private-key|private-upstream|Bearer|apiKey/);
    return true;
  };
}

test('model discovery normalizes copied addresses and only sends the key upstream', async () => {
  const seen: { url: string | undefined; method: string | undefined; authorization: string | undefined }[] = [];
  await withServer((req, res) => {
    seen.push({ url: req.url, method: req.method, authorization: req.headers.authorization });
    json(res, { data: [{ id: 'z-model' }, { id: 'a-model' }] });
  }, async endpoint => {
    for (const suffix of ['', '/', '/v1', '/v1/', '/v1/responses', '/v1/chat/completions/', '/v1/models']) {
      const result = await discoverRelayModels({ endpoint: ` ${endpoint}${suffix} `, apiKey: ` ${apiKey} ` });
      assert.deepEqual(result, { endpoint: `${endpoint}/v1`, models: ['a-model', 'z-model'] });
      assert.doesNotMatch(JSON.stringify(result), new RegExp(apiKey));
    }
    assert.equal(seen.length, 7);
    assert.ok(seen.every(request => request.url === '/v1/models' && request.method === 'GET' && request.authorization === `Bearer ${apiKey}`));
  });
});

test('model catalogs deduplicate IDs, support common envelopes and discard secret-bearing or invalid entries', async () => {
  const entries = ['vendor/model-v2:latest', { id: 'z-model' }, { name: 'a-model' }, { id: 'z-model' }, { id: `echo-${apiKey}` }, { id: '<script>secret</script>' }, { id: 'has space' }, { id: '' }, {}, null, 123];
  for (const payload of [entries, { data: entries }, { models: entries }, { data: { models: entries } }]) {
    await withServer((_req, res) => json(res, payload), async endpoint => {
      const result = await discoverRelayModels({ endpoint, apiKey });
      assert.deepEqual(result.models, ['a-model', 'vendor/model-v2:latest', 'z-model']);
      assert.doesNotMatch(JSON.stringify(result), new RegExp(apiKey));
    });
  }
});

test('advertised catalogs are returned without claiming a generation connection or making a paid probe', async () => {
  const paths: string[] = [];
  await withServer((req, res) => { paths.push(req.url!); json(res, { data: [{ id: 'advertised-only' }] }); }, async endpoint => {
    const result = await discoverRelayModels({ endpoint, apiKey });
    assert.deepEqual(result.models, ['advertised-only']);
    assert.equal('connected' in result, false);
    assert.deepEqual(paths, ['/v1/models']);
  });
});

test('model discovery reports safe auth, quota, limits and unsupported catalog failures', async () => {
  for (const [status, code] of [[401, 'authentication'], [403, 'authentication'], [402, 'quota'], [429, 'rate_limit'], [404, 'models_unavailable'], [405, 'models_unavailable'], [500, 'upstream']] as const) {
    await withServer((_req, res) => json(res, { error: { message: `private-upstream Bearer ${apiKey}`, code: apiKey } }, status), async endpoint => {
      await assert.rejects(discoverRelayModels({ endpoint, apiKey }), safeFailure(code, status < 404 || status === 429 ? status : 502));
    });
  }
  await withServer((_req, res) => json(res, { error: { code: 'invalid_api_key', message: apiKey } }), async endpoint => {
    await assert.rejects(discoverRelayModels({ endpoint, apiKey }), safeFailure('authentication', 401));
  });
});

test('empty or malformed model catalogs do not become successful lists or fallback model names', async () => {
  for (const [payload, code] of [[{ data: [] }, 'empty_models'], [{ data: [{ id: apiKey }] }, 'empty_models'], [{ data: 'private-upstream' }, 'invalid_models'], [{ unrelated: [] }, 'invalid_models']] as const) {
    await withServer((_req, res) => json(res, payload), async endpoint => {
      await assert.rejects(discoverRelayModels({ endpoint, apiKey }), safeFailure(code));
    });
  }
  await withServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(`<html>private-upstream ${apiKey}</html>`); }, async endpoint => {
    await assert.rejects(discoverRelayModels({ endpoint, apiKey }), safeFailure('invalid_models'));
  });
});

test('model lists are bounded by wire size and entry count', async () => {
  for (const payload of [{ data: [], padding: 'x'.repeat(2 * 1024 * 1024) }, { data: Array.from({ length: 10_001 }, (_, index) => ({ id: `model-${index}` })) }]) {
    await withServer((_req, res) => json(res, payload), async endpoint => {
      await assert.rejects(discoverRelayModels({ endpoint, apiKey }), safeFailure('oversized'));
    });
  }
});

test('discovery never follows redirects with the supplied credential', async () => {
  let requests = 0;
  await withServer((_req, res) => { requests++; res.writeHead(307, { location: '/credential-destination' }); res.end(); }, async endpoint => {
    await assert.rejects(discoverRelayModels({ endpoint, apiKey }), safeFailure('connection'));
    assert.equal(requests, 1);
  });
});

test('invalid inputs are rejected without reflecting credentials or invalid URLs', async () => {
  const badInputs: unknown[] = [null, [], {}, { endpoint: 1, apiKey }, { endpoint: 'not a URL private-upstream', apiKey },
    { endpoint: 'ftp://relay.invalid', apiKey }, { endpoint: `https://user:${apiKey}@relay.invalid`, apiKey },
    { endpoint: `https://relay.invalid/${apiKey}`, apiKey }, { endpoint: `https://relay.invalid?key=${apiKey}`, apiKey },
    { endpoint: 'https://relay.invalid', apiKey, protocol: 'invalid' }, { endpoint: 'https://relay.invalid', apiKey: `${apiKey}\r\nprivate-upstream` }];
  for (const input of badInputs) await assert.rejects(discoverRelayModels(input), safeFailure('invalid_config', 400));
  for (const model of ['', apiKey, `echo-${apiKey}`, '<script>']) {
    await assert.rejects(checkRelayConnection({ endpoint: 'https://relay.invalid', apiKey, model }), safeFailure('invalid_model', 400));
  }
});

test('model discovery supports deadline, pre-abort and cancellation while receiving a body', async () => {
  let requests = 0;
  const cancelled = new AbortController(); cancelled.abort();
  await withServer((_req, res) => { requests++; res.writeHead(200, { 'content-type': 'application/json' }); res.write('{"data":['); }, async endpoint => {
    await assert.rejects(discoverRelayModels({ endpoint, apiKey }, { signal: cancelled.signal }), safeFailure('aborted', 499));
    assert.equal(requests, 0);
    await assert.rejects(discoverRelayModels({ endpoint, apiKey }, { timeoutMs: 40 }), safeFailure('timeout', 504));
    const controller = new AbortController();
    const pending = discoverRelayModels({ endpoint, apiKey }, { signal: controller.signal });
    const timer = setTimeout(() => controller.abort(), 30);
    try { await assert.rejects(pending, safeFailure('aborted', 499)); } finally { clearTimeout(timer); }
  });
});

test('connection probes verify completed JSON with the advertised model and default reasoning', async () => {
  for (const protocol of ['responses', 'chat-completions'] as const) {
    let seen: { url?: string; auth?: string; body?: any } = {};
    await withServer(async (req, res) => {
      seen = { url: req.url, auth: req.headers.authorization, body: await requestJson(req) };
      json(res, protocol === 'responses' ? successfulResponse : successfulChat);
    }, async endpoint => {
      const result = await checkRelayConnection({ endpoint: `${endpoint}/v1/${protocol === 'responses' ? 'responses' : 'chat/completions'}`, apiKey, model: 'vendor/story-v2', protocol, reasoning: 'xhigh' });
      assert.equal(result.connected, true); assert.equal(result.protocol, protocol); assert.equal(result.model, 'vendor/story-v2');
      assert.equal(result.endpoint, `${endpoint}/v1`); assert.ok(result.latencyMs >= 0);
      assert.doesNotMatch(JSON.stringify(result), new RegExp(apiKey));
      assert.equal(seen.url, `/v1/${protocol === 'responses' ? 'responses' : 'chat/completions'}`);
      assert.equal(seen.auth, `Bearer ${apiKey}`); assert.equal(seen.body.model, 'vendor/story-v2');
      assert.equal(seen.body.stream, false); assert.equal(seen.body.reasoning, undefined); assert.equal(seen.body.reasoning_effort, undefined);
      const format = protocol === 'responses' ? seen.body.text.format : seen.body.response_format.json_schema;
      assert.equal(format.strict, true); assert.deepEqual(format.schema.required, ['ok']);
      assert.ok((seen.body.max_output_tokens ?? seen.body.max_completion_tokens) <= 1024);
    });
  }
});

test('automatic protocol detection retries a missing Responses endpoint with Chat Completions', async () => {
  const paths: string[] = [];
  await withServer((req, res) => {
    paths.push(req.url!);
    if (req.url === '/v1/responses') json(res, { error: { message: `private-upstream ${apiKey}` } }, 404);
    else json(res, successfulChat);
  }, async endpoint => {
    const result = await checkRelayConnection({ endpoint, apiKey, model: 'chat-model', protocol: 'auto' });
    assert.equal(result.protocol, 'chat-completions'); assert.equal(result.connected, true);
    assert.deepEqual(paths, ['/v1/responses', '/v1/chat/completions']);
  });
});

test('automatic probes never retry authentication, quota, rate-limit, ambiguous 400 or server failures', async () => {
  for (const [status, code] of [[401, 'authentication'], [403, 'authentication'], [402, 'quota'], [429, 'rate_limit'], [400, 'unsupported_model'], [500, 'connection']] as const) {
    let requests = 0;
    await withServer((_req, res) => { requests++; json(res, { error: { message: `private-upstream ${apiKey}` } }, status); }, async endpoint => {
      await assert.rejects(checkRelayConnection({ endpoint, apiKey, model: 'story-model' }), safeFailure(code));
      assert.equal(requests, 1);
    });
  }
  for (const [providerCode, code] of [['invalid_api_key', 'authentication'], ['insufficient_quota', 'quota'], ['rate_limit_exceeded', 'rate_limit']] as const) {
    let requests = 0;
    await withServer((_req, res) => { requests++; json(res, { status: 'failed', error: { code: providerCode, message: `private-upstream ${apiKey}` } }); }, async endpoint => {
      await assert.rejects(checkRelayConnection({ endpoint, apiKey, model: 'story-model' }), safeFailure(code));
      assert.equal(requests, 1);
    });
  }
});

test('explicit protocol checks do not fallback and failed Chat checks remain failed', async () => {
  let requests = 0;
  await withServer((_req, res) => { requests++; json(res, { error: { message: apiKey } }, 404); }, async endpoint => {
    await assert.rejects(checkRelayConnection({ endpoint, apiKey, model: 'model', protocol: 'responses' }), safeFailure('unsupported_model'));
    assert.equal(requests, 1);
  });
  await withServer((req, res) => json(res, { error: { message: apiKey } }, req.url === '/v1/responses' ? 404 : 401), async endpoint => {
    await assert.rejects(checkRelayConnection({ endpoint, apiKey, model: 'model' }), safeFailure('authentication', 401));
  });
});

test('HTTP success alone never counts as a usable model connection', async () => {
  const payloads = [
    { output_text: '{"ok":true}' }, { status: 'completed', output_text: '' },
    { status: 'completed', output_text: `private-upstream ${apiKey}` },
    { status: 'completed', output_text: '{"ok":false}' },
    { status: 'completed', output_text: JSON.stringify({ ok: true, [apiKey]: 'private-upstream' }) },
    { status: 'incomplete', output_text: '{"ok":true}' },
  ];
  for (const payload of payloads) {
    let requests = 0;
    await withServer((_req, res) => { requests++; json(res, payload); }, async endpoint => {
      await assert.rejects(checkRelayConnection({ endpoint, apiKey, model: 'model' }), safeFailure('invalid_probe'));
      assert.equal(requests, 1);
    });
  }
});

test('connection deadline spans protocol attempts and explicit cancellation ends generation', async () => {
  let requests = 0;
  await withServer((req, res) => {
    requests++;
    if (req.url === '/v1/responses') setTimeout(() => json(res, {}, 404), 25);
  }, async endpoint => {
    await assert.rejects(checkRelayConnection({ endpoint, apiKey, model: 'model' }, { timeoutMs: 100 }), safeFailure('timeout', 504));
    assert.equal(requests, 2);
  });
  const controller = new AbortController();
  await withServer(() => controller.abort(), async endpoint => {
    await assert.rejects(checkRelayConnection({ endpoint, apiKey, model: 'model' }, { signal: controller.signal }), safeFailure('aborted', 499));
  });
});
