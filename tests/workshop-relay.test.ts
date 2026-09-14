import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer, type RequestListener } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configuredRelay, environmentRelay, normalizeRelayConfig, publicRelay, relayConfigStatus, setRelayConfig } from '../server/workshop-relay-config.ts';
import { RelayRequestError, requestRelay } from '../server/workshop-relay.ts';
import { runCreative } from '../server/workshop-creative.ts';

async function withConfigPath(run: () => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'workshop-relay-'));
  const previous = process.env.WORKSHOP_CONFIG_PATH;
  process.env.WORKSHOP_CONFIG_PATH = join(dir, 'relay.json');
  try { await run(); } finally { if (previous === undefined) delete process.env.WORKSHOP_CONFIG_PATH; else process.env.WORKSHOP_CONFIG_PATH = previous; await rm(dir, { recursive: true, force: true }); }
}

test('relay config persists without exposing the key and can explicitly use environment settings', async () => {
  await withConfigPath(async () => {
    const config = normalizeRelayConfig({ endpoint: 'https://relay.example/v1/', apiKey: 'secret-test-key', model: 'story-model', protocol: 'responses', reasoning: 'high' });
    await setRelayConfig(config);
    assert.deepEqual(relayConfigStatus(), { configured: true, endpoint: 'https://relay.example/v1', model: 'story-model', protocol: 'responses', reasoning: 'high' });
    assert.equal('apiKey' in publicRelay(config), false);
    const saved = await readFile(process.env.WORKSHOP_CONFIG_PATH!, 'utf8');
    assert.match(saved, /secret-test-key/);
    await setRelayConfig(null);
    assert.equal(configuredRelay(), null);
    process.env.OPENAI_BASE_URL = 'https://env.example/v1'; process.env.OPENAI_API_KEY = 'env-key'; process.env.OPENAI_MODEL = 'env-model'; process.env.OPENAI_TRANSPORT = 'responses'; process.env.OPENAI_REASONING_EFFORT = 'minimal';
    try { await setRelayConfig({ useEnvironment: true }); assert.deepEqual(relayConfigStatus(), { configured: true, endpoint: 'https://env.example/v1', model: 'env-model', protocol: 'responses', reasoning: 'minimal' }); assert.equal(environmentRelay()!.apiKey, 'env-key'); }
    finally { delete process.env.OPENAI_BASE_URL; delete process.env.OPENAI_API_KEY; delete process.env.OPENAI_MODEL; delete process.env.OPENAI_TRANSPORT; delete process.env.OPENAI_REASONING_EFFORT; }
  });
});

test('requestRelay sends structured Responses JSON and consumes split SSE deltas', async () => {
  let seen: any;
  const server = createServer((req, res) => {
    seen = { url: req.url, auth: req.headers.authorization, body: '' };
    req.setEncoding('utf8'); req.on('data', chunk => seen.body += chunk); req.on('end', () => {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(`data: ${JSON.stringify({ type: 'response.output_text.delta', delta: '{"ok":' })}\n\n`);
      setTimeout(() => { res.end(`data: ${JSON.stringify({ type: 'response.output_text.delta', delta: 'true}' })}\n\ndata: ${JSON.stringify({ type: 'response.completed', response: { id: 'resp_test', status: 'completed', output_text: '{"ok":true}' } })}\n\n`); }, 2);
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address(); assert.ok(address && typeof address === 'object');
    const result = await requestRelay({ endpoint: `http://127.0.0.1:${address.port}/v1`, apiKey: 'relay-secret', model: 'story-model', protocol: 'responses', reasoning: 'xhigh' }, { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false } as any, 'make a story');
    assert.equal(result.content, '{"ok":true}'); assert.equal(seen.url, '/v1/responses'); assert.equal(seen.auth, 'Bearer relay-secret');
    const body = JSON.parse(seen.body); assert.equal(body.model, 'story-model'); assert.equal(body.stream, true); assert.equal(body.store, false); assert.equal(body.text.format.name, 'story_stage');
    assert.equal(body.reasoning.effort, 'xhigh'); assert.equal(result.responseId, 'resp_test'); assert.equal(result.diagnostics.completed, true);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('requestRelay records nested provider failure categories without copying private messages', async () => {
  const server = createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.end('data: {"type":"response.failed","response":{"id":"resp_failed","error":{"code":"server_error","message":"Bearer secret; private prompt; https://private.invalid/?token=secret"}}}\n\n'); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address(); assert.ok(address && typeof address === 'object');
    await assert.rejects(() => requestRelay({ endpoint: `http://127.0.0.1:${address.port}`, apiKey: 'secret', model: 'm', protocol: 'responses' }, {}, 'x'), error => {
      assert.ok(error instanceof RelayRequestError);
      assert.equal(error.diagnostics.category, 'upstream'); assert.equal(error.diagnostics.providerCode, 'server_error');
      assert.equal(error.diagnostics.lastEventType, 'response.failed'); assert.equal(error.diagnostics.responseId, 'resp_failed');
      assert.equal(error.diagnostics.retryable, true); assert.doesNotMatch(JSON.stringify(error) + error.message, /secret|Bearer|private/);
      return true;
    });
  }
  finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

const mockConfig = (endpoint: string) => ({ endpoint, apiKey: 'mock-secret-key', model: 'gpt-6-astra', protocol: 'responses' as const, reasoning: 'xhigh' });
async function withRelayServer(handler: RequestListener, run: (endpoint: string) => Promise<void>) {
  const server = createServer(handler);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address === 'object');
  try { await run(`http://127.0.0.1:${address.port}/v1`); }
  finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}
const event = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
const delta = (text: string) => event({ type: 'response.output_text.delta', delta: text });

test('SSE supports multiline data, named events, CRLF and split UTF-8 codepoints', async () => {
  const text = '{"title":"潮汐站"}';
  await withRelayServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const payload = Buffer.from(`: ping\r\nevent: response.output_text.delta\r\ndata: {"delta":\r\ndata: ${JSON.stringify(text)}}\r\n\r\n` + event({ type: 'response.completed', response: { status: 'completed', output_text: text } }));
    const split = payload.indexOf(Buffer.from('潮')) + 1;
    res.write(payload.subarray(0, split)); setTimeout(() => res.end(payload.subarray(split)), 2);
  }, async endpoint => { assert.equal((await requestRelay(mockConfig(endpoint), {}, 'x')).content, text); });
});

test('an explicit completed event finishes without waiting for the HTTP connection to close', async () => {
  await withRelayServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(event({ type: 'response.completed', response: { status: 'completed', output_text: '{"ok":true}', usage: { output_tokens: 5 } } }));
  }, async endpoint => {
    const result = await requestRelay(mockConfig(endpoint), {}, 'x');
    assert.equal(result.content, '{"ok":true}'); assert.equal(result.usage.output_tokens, 5);
  });
});

test('a parseable JSON prefix without a Responses completion is still interrupted', async () => {
  for (const tail of ['', 'data: [DONE]\n\n']) await withRelayServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' }); res.end(delta('{"ok":true}') + tail);
  }, async endpoint => {
    await assert.rejects(requestRelay(mockConfig(endpoint), {}, 'x'), error => {
      assert.ok(error instanceof RelayRequestError); assert.equal(error.diagnostics.category, 'incomplete');
      assert.equal(error.diagnostics.characters, 11); assert.equal(error.diagnostics.completed, false); return true;
    });
  });
});

test('truncation is distinguished from generic upstream errors and never promoted to success', async () => {
  await withRelayServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end(delta('{') + event({ type: 'response.incomplete', response: { id: 'resp_limit', incomplete_details: { reason: 'max_output_tokens' } } }));
  }, async endpoint => {
    await assert.rejects(requestRelay(mockConfig(endpoint), {}, 'x'), error => {
      assert.ok(error instanceof RelayRequestError); assert.equal(error.diagnostics.category, 'output_limit');
      assert.equal(error.diagnostics.providerCode, 'max_output_tokens'); assert.equal(error.diagnostics.characters, 1); return true;
    });
  });
});

test('unknown codes, malformed events and nonstream failure bodies never leak raw payloads', async () => {
  const payloads = [
    { type: 'error', code: 'mock-secret-key', message: 'private-source' },
    { type: 'error', error: { code: 'arbitrary_secret_code', message: 'private-source' } },
    { type: 'response.completed', response: { status: 'failed', error: { code: 'authentication_error', message: 'Bearer mock-secret-key' } } },
  ];
  for (const payload of payloads) await withRelayServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' }); res.end(event(payload));
  }, async endpoint => {
    await assert.rejects(requestRelay(mockConfig(endpoint), {}, 'x'), error => {
      assert.ok(error instanceof RelayRequestError);
      assert.doesNotMatch(error.message + JSON.stringify(error), /mock-secret-key|private-source|arbitrary_secret_code|Bearer/); return true;
    });
  });
  await withRelayServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' }); res.end('data: {"secret":"mock-secret-key" broken}\n\n');
  }, async endpoint => {
    await assert.rejects(requestRelay(mockConfig(endpoint), {}, 'x'), error => {
      assert.ok(error instanceof RelayRequestError); assert.equal(error.diagnostics.category, 'invalid_response');
      assert.doesNotMatch(error.message, /mock-secret-key/); return true;
    });
  });
  await withRelayServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ status: 'failed', output_text: '{"ok":true}', error: { code: 'server_error', message: 'mock-secret-key' } }));
  }, async endpoint => {
    await assert.rejects(requestRelay(mockConfig(endpoint), {}, 'x'), error => {
      assert.ok(error instanceof RelayRequestError); assert.equal(error.diagnostics.category, 'upstream'); return true;
    });
  });
});

test('HTTP status failures are categorized without reflecting their body', async () => {
  for (const [status, category] of [[401, 'authentication'], [402, 'quota'], [429, 'rate_limit'], [503, 'upstream'], [504, 'timeout']] as const) await withRelayServer((_req, res) => {
    res.writeHead(status, { 'content-type': 'application/json' }); res.end('{"private":"mock-secret-key"}');
  }, async endpoint => {
    await assert.rejects(requestRelay(mockConfig(endpoint), {}, 'x'), error => {
      assert.ok(error instanceof RelayRequestError); assert.equal(error.diagnostics.category, category); assert.equal(error.diagnostics.httpStatus, status);
      assert.doesNotMatch(error.message + JSON.stringify(error), /mock-secret-key/); return true;
    });
  });
});

test('Chat Completions preserves stop, usage and model settings while rejecting truncated output', async () => {
  let body: any;
  await withRelayServer((req, res) => {
    let raw = ''; req.on('data', chunk => raw += chunk); req.on('end', () => {
      body = JSON.parse(raw); res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end(event({ choices: [{ delta: { content: '{"ok":true}' }, finish_reason: 'stop' }] }) + event({ choices: [], usage: { completion_tokens: 4 } }) + 'data: [DONE]\n\n');
    });
  }, async endpoint => {
    const result = await requestRelay({ ...mockConfig(endpoint), protocol: 'chat-completions' }, {}, 'x');
    assert.equal(result.content, '{"ok":true}'); assert.equal(result.usage.completion_tokens, 4);
    assert.equal(body.model, 'gpt-6-astra'); assert.equal(body.reasoning_effort, 'xhigh');
  });
  await withRelayServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' }); res.end(event({ choices: [{ delta: { content: '{"ok":true}' }, finish_reason: 'length' }] }) + 'data: [DONE]\n\n');
  }, async endpoint => { await assert.rejects(requestRelay({ ...mockConfig(endpoint), protocol: 'chat-completions' }, {}, 'x'), error => error instanceof RelayRequestError && error.diagnostics.category === 'output_limit'); });
});

test('runCreative persists a safe failed-stage receipt and never writes a failed output checkpoint', async () => {
  await withConfigPath(async () => {
    await withRelayServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end(event({ type: 'response.created', response: { id: 'resp_tide_fixture' } }) + delta('{') + event({ type: 'response.failed', response: { id: 'resp_tide_fixture', error: { code: 'server_error', message: 'private-source Bearer mock-secret-key' } } }));
    }, async endpoint => {
      await setRelayConfig(mockConfig(endpoint));
      const directory = join(process.env.WORKSHOP_CONFIG_PATH!, '..', 'stage');
      await assert.rejects(runCreative(directory, 'route-fixture', { type: 'object' }, 'TEST ONLY', async () => { throw new Error('CLI must not run'); }), /server_error/);
      const receipt = JSON.parse(await readFile(join(directory, 'route-fixture.receipt.json'), 'utf8'));
      assert.equal(receipt.relay.category, 'upstream'); assert.equal(receipt.relay.characters, 1); assert.equal(receipt.relay.eventCount, 3);
      assert.equal(receipt.relay.responseId, 'resp_tide_fixture'); assert.equal(receipt.relay.completed, false);
      assert.equal(receipt.model, 'gpt-6-astra'); assert.equal(receipt.reasoning, 'xhigh');
      assert.doesNotMatch(JSON.stringify(receipt), /mock-secret-key|private-source|Bearer/);
      await assert.rejects(readFile(join(directory, 'route-fixture.output.json')), { code: 'ENOENT' });
    });
  });
});

test('completed relay outputs survive local schema and JSON rejection with usage and precise safe receipts', async () => {
  const schema = { type: 'object', properties: { text: { type: 'array', minItems: 2, items: { type: 'string' } } }, required: ['text'], additionalProperties: false };
  for (const [label, content, kind, expected] of [
    ['short-scene', '{"text":["Only one paragraph"]}', 'schema', /\$\.text: 数组长度不符合约定/],
    ['broken-json', '{"text":["PRIVATE_BODY"]', 'json', /完整响应不是有效 JSON/],
    ['unknown-field', '{"text":["one","two"],"PRIVATE_BODY mock-secret-key":true}', 'schema', /包含未约定字段/],
  ] as const) await withConfigPath(async () => {
    let requests = 0;
    await withRelayServer((_req, res) => {
      requests++;
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end(event({ type: 'response.completed', response: { id: `resp_${label}`, status: 'completed', output_text: content, usage: { input_tokens: 17, output_tokens: 23 } } }));
    }, async endpoint => {
      await setRelayConfig(mockConfig(endpoint));
      const directory = join(process.env.WORKSHOP_CONFIG_PATH!, '..', 'stage');
      await assert.rejects(runCreative(directory, label, schema, 'TEST ONLY', async () => { throw new Error('CLI must not run'); }), error => {
        assert.ok(error instanceof Error); assert.match(error.message, expected);
        assert.doesNotMatch(error.message, /PRIVATE_BODY|mock-secret-key|中转站创作失败|创作进程异常退出|连接或流式响应中断/);
        return true;
      });
      assert.equal(requests, 1);
      assert.equal(await readFile(join(directory, `${label}.output.json`), 'utf8'), content);
      const receipt = JSON.parse(await readFile(join(directory, `${label}.receipt.json`), 'utf8'));
      assert.equal(receipt.failure, 'output-validation-failed');
      assert.equal(receipt.outputValidation.accepted, false); assert.equal(receipt.outputValidation.kind, kind);
      assert.match(receipt.failureReason, expected);
      assert.equal(receipt.relay.completed, true); assert.equal(receipt.relay.httpStatus, 200);
      assert.equal(receipt.responseId, `resp_${label}`); assert.deepEqual(receipt.usage, { input_tokens: 17, output_tokens: 23 });
      assert.equal(receipt.model, 'gpt-6-astra'); assert.equal(receipt.reasoning, 'xhigh');
      assert.doesNotMatch(JSON.stringify(receipt), /PRIVATE_BODY|mock-secret-key/);
    });
  });
});
