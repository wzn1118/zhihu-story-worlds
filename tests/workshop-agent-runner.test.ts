import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAgentRunner, type AgentTask } from '../server/workshop-agent-runner.ts';
import type { RelayConfig } from '../server/workshop-relay-config.ts';
import type { RelayResponse, requestRelay } from '../server/workshop-relay.ts';

const relay: RelayConfig = { endpoint: 'https://private-relay.example/v1', apiKey: 'private-runner-secret', model: 'fixture-model', protocol: 'responses', reasoning: 'low' };
const task: AgentTask = { role: 'scene', key: 'route-one', prompt: 'Write a scene.', schema: { type: 'object', properties: { text: { type: 'string', minLength: 2 } }, required: ['text'], additionalProperties: false } };
const response = (content = '{"text":"A scene."}'): RelayResponse => ({ content, diagnostics: { protocol: 'responses', characters: content.length, wireBytes: content.length, eventCount: 1, completed: true } });
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(done => resolve = done);
  return { promise, resolve };
}
async function files(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(join(root, entry.name)) : [join(root, entry.name)]))).flat();
}
async function sandbox(run: (root: string, make: (options?: Partial<Parameters<typeof createAgentRunner>[0]>) => ReturnType<typeof createAgentRunner>) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'workshop-agent-runner-'));
  const runners: ReturnType<typeof createAgentRunner>[] = [];
  let project = 0;
  const make = (options: Partial<Parameters<typeof createAgentRunner>[0]> = {}) => {
    const runner = createAgentRunner({ directory: join(root, `project-${project++}`), leaseRoot: join(root, 'leases'), relay, attempt: 1, ...options });
    runners.push(runner); return runner;
  };
  try { await run(root, make); }
  finally { for (const runner of runners) runner.close(); await rm(root, { recursive: true, force: true }); }
}

test('multiple projects share exactly three relay leases and retain a fixed configuration snapshot', async () => {
  await sandbox(async (root, make) => {
    let active = 0, maximum = 0, calls = 0;
    const firstBatch = deferred();
    const seen: RelayConfig[] = [];
    const request: typeof requestRelay = async config => {
      seen.push(config); calls++; active++; maximum = Math.max(maximum, active);
      if (active === 3) firstBatch.resolve();
      await firstBatch.promise;
      await delay(40); active--; return { ...response(), usage: { input_tokens: 23, output_tokens: 34, completion_tokens: relay.apiKey, private: relay.endpoint } };
    };
    const mutable = { ...relay };
    const first = make({ request, relay: mutable, deadlineAt: Date.now() + 5000 });
    mutable.apiKey = 'CHANGED-KEY'; mutable.model = 'CHANGED-MODEL';
    await Promise.all([first, ...Array.from({ length: 6 }, () => make({ request, deadlineAt: Date.now() + 5000 }))].map(runner => runner.run(task)));
    assert.equal(calls, 7); assert.equal(maximum, 3);
    assert.ok(seen.every(config => config.apiKey === relay.apiKey && config.model === relay.model && config.reasoning === 'low'));
    const scopes = await readdir(join(root, 'leases'));
    assert.equal(scopes.length, 1); assert.match(scopes[0], /^scope-[a-f0-9]{64}$/);
    for (const file of await files(root)) assert.doesNotMatch(await readFile(file, 'utf8'), /private-runner-secret|private-relay\.example|CHANGED-KEY/);
    const rawFile = (await files(root)).find(file => file.endsWith('.raw.json'))!;
    assert.deepEqual(JSON.parse(await readFile(rawFile, 'utf8')).usage, { input_tokens: 23, output_tokens: 34 });
  });
});

test('relay keys have independent provider concurrency scopes', async () => {
  await sandbox(async (_root, make) => {
    let active = 0, maximum = 0;
    const allStarted = deferred();
    const request: typeof requestRelay = async () => {
      active++; maximum = Math.max(active, maximum); if (active === 6) allStarted.resolve();
      await allStarted.promise; active--; return response();
    };
    await Promise.all(Array.from({ length: 6 }, (_, index) => make({ request, relay: { ...relay, apiKey: index < 3 ? 'key-one' : 'key-two' }, deadlineAt: Date.now() + 5000 }).run(task)));
    assert.equal(maximum, 6);
  });
});

test('independent Node worker processes obey the shared provider cap', async () => {
  await sandbox(async root => {
    let active = 0, maximum = 0, calls = 0;
    const firstBatch = deferred();
    const server = createServer((request, result) => {
      request.resume(); request.on('end', () => {
        active++; calls++; maximum = Math.max(active, maximum);
        if (active === 3) firstBatch.resolve();
        void firstBatch.promise.then(() => setTimeout(() => {
          active--;
          result.writeHead(200, { 'content-type': 'application/json' });
          result.end(JSON.stringify({ status: 'completed', output_text: '{"text":"A scene."}' }));
        }, 80));
      });
    });
    await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
    const address = server.address(); assert.ok(address && typeof address === 'object');
    const config = { ...relay, endpoint: `http://127.0.0.1:${address.port}/v1` };
    try {
      await Promise.all(Array.from({ length: 4 }, (_, index) => new Promise<void>((done, reject) => {
        const source = `import { createAgentRunner } from ${JSON.stringify(new URL('../server/workshop-agent-runner.ts', import.meta.url).href)};
          const runner = createAgentRunner(${JSON.stringify({ directory: join(root, `child-${index}`), leaseRoot: join(root, 'leases'), relay: config, attempt: 1, deadlineAt: Date.now() + 15000 })});
          try { await Promise.all([runner.run(${JSON.stringify(task)}), runner.run(${JSON.stringify({ ...task, key: 'second-scene' })})]); } finally { runner.close(); }`;
        const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', source], { stdio: ['ignore', 'ignore', 'pipe'] });
        let stderr = ''; child.stderr.on('data', chunk => stderr += chunk.toString());
        child.on('error', reject); child.on('close', code => code === 0 ? done() : reject(new Error(`child exit ${code}: ${stderr}`)));
      })));
      assert.equal(calls, 8); assert.equal(maximum, 3);
    } finally { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); }
  });
});

test('close cancels the in-flight request and every local queue waiter without dispatching queued work', async () => {
  await sandbox(async (root, make) => {
    const started = deferred(), cancelled = deferred(); let calls = 0;
    const request: typeof requestRelay = async (_config, _schema, _prompt, _progress, options) => {
      calls++; started.resolve();
      return new Promise((_resolve, reject) => options!.signal!.addEventListener('abort', () => { cancelled.resolve(); reject(new DOMException('aborted', 'AbortError')); }, { once: true }));
    };
    const runner = make({ request, concurrency: 1 });
    const jobs = [task, { ...task, key: 'two' }, { ...task, key: 'three' }].map(value => runner.run(value));
    const results = Promise.allSettled(jobs);
    await started.promise; runner.close(); await cancelled.promise;
    for (const result of await results) { assert.equal(result.status, 'rejected'); if (result.status === 'rejected') assert.equal(result.reason.name, 'AbortError'); }
    assert.equal(calls, 1);
    assert.ok(!(await files(root)).some(file => file.endsWith('.lease.json')));
    await assert.rejects(runner.run(task), { name: 'AbortError' });
  });
});

test('global lease waiting counts against the overall deadline', async () => {
  await sandbox(async (_root, make) => {
    const held = deferred(), release = deferred(); let calls = 0;
    const holder = make({ request: async () => { calls++; if (calls === 3) held.resolve(); await release.promise; return response(); } });
    const holding = Promise.all(['one', 'two', 'three'].map(key => holder.run({ ...task, key })));
    await held.promise;
    let waitingCalls = 0;
    const waiting = make({ deadlineAt: Date.now() + 70, request: async () => { waitingCalls++; return response(); } });
    try { await assert.rejects(waiting.run(task), { name: 'TimeoutError' }); assert.equal(waitingCalls, 0); }
    finally { release.resolve(); await holding; }
  });
});

test('dead process leases are reclaimed while live owners are never expired by age', async () => {
  await sandbox(async (root, make) => {
    await make({ request: async () => response() }).run(task);
    const [scope] = await readdir(join(root, 'leases'));
    const scopeRoot = join(root, 'leases', scope);
    for (let index = 0; index < 3; index++) await writeFile(join(scopeRoot, `${index}.lease.json`), JSON.stringify({ pid: 2147483647, processStart: null, bootId: null, token: randomUUID(), createdAt: 0 }));
    let calls = 0;
    await Promise.all(Array.from({ length: 4 }, (_, index) => make({ request: async () => { calls++; await delay(15); return response(); }, deadlineAt: Date.now() + 3000 }).run({ ...task, key: `dead-${index}` })));
    assert.equal(calls, 4);
    for (let index = 0; index < 3; index++) await writeFile(join(scopeRoot, `${index}.lease.json`), JSON.stringify({ pid: process.pid, processStart: null, bootId: null, token: randomUUID(), createdAt: 0 }));
    let liveCalls = 0;
    const blocked = make({ request: async () => { liveCalls++; return response(); }, deadlineAt: Date.now() + 60 });
    await assert.rejects(blocked.run(task), { name: 'TimeoutError' });
    assert.equal(liveCalls, 0);
  });
});

test('same attempt races dispatch once, recover completed raw, and revalidate every cache read', async () => {
  await sandbox(async (root, make) => {
    const directory = join(root, 'same-project'); let calls = 0, validations = 0;
    const request: typeof requestRelay = async () => { calls++; await delay(30); return response(); };
    const validate = (value: { text: string }) => { validations++; assert.equal(value.text, 'A scene.'); };
    await Promise.all([make({ directory, request }).run(task, validate), make({ directory, request }).run(task, validate)]);
    assert.equal(calls, 1); assert.equal(validations, 2);
    const accepted = (await files(directory)).find(file => file.endsWith('.accepted.json'))!;
    await rm(accepted);
    await make({ directory, request }).run(task, validate);
    assert.equal(calls, 1); assert.equal(validations, 3); assert.ok(await readFile(accepted));
    await assert.rejects(make({ directory, request }).run(task, () => { throw new Error('new canonical fact is missing'); }), /内容约束.*new canonical fact/);
    assert.equal(calls, 1);
  });
});

test('input, schema and relay changes produce separate immutable caches', async () => {
  await sandbox(async (root, make) => {
    const directory = join(root, 'input-project'); let calls = 0;
    const request: typeof requestRelay = async () => { calls++; return response(); };
    const runner = make({ directory, request });
    await runner.run(task); await runner.run(task);
    await runner.run({ ...task, prompt: 'A different scene.' });
    await runner.run({ ...task, schema: { ...task.schema, properties: { text: { type: 'string', minLength: 4 } } } });
    await make({ directory, request, relay: { ...relay, model: 'new-model' } }).run(task);
    await make({ directory, request, relay: { ...relay, reasoning: 'medium' } }).run(task);
    assert.equal(calls, 5);
    assert.equal((await files(directory)).filter(file => file.endsWith('.accepted.json')).length, 5);
  });
});

test('output hashes bind accepted receipts and detect damaged raw without another request', async () => {
  await sandbox(async (root, make) => {
    const directory = join(root, 'hash-project'); let calls = 0;
    const runner = make({ directory, request: async () => { calls++; return response(); } });
    await runner.run(task);
    const rawFile = (await files(directory)).find(file => file.endsWith('.raw.json'))!;
    const raw = JSON.parse(await readFile(rawFile, 'utf8'));
    await writeFile(rawFile, JSON.stringify({ ...raw, content: '{"text":"changed"}' }));
    await assert.rejects(runner.run(task), /校验和不匹配/); assert.equal(calls, 1);
    await writeFile(rawFile, JSON.stringify(raw));
    const accepted = (await files(directory)).find(file => file.endsWith('.accepted.json'))!;
    const receipt = JSON.parse(await readFile(accepted, 'utf8'));
    await writeFile(accepted, JSON.stringify({ ...receipt, outputHash: 'wrong' }));
    await assert.rejects(runner.run(task), /成功记录与原稿不匹配/); assert.equal(calls, 1);
  });
});

test('uncertain requests reserve the attempt, resume only on a new attempt, and redact provider errors', async () => {
  await sandbox(async (root, make) => {
    const directory = join(root, 'reservation-project'); let calls = 0;
    const request: typeof requestRelay = async (_config, _schema, _prompt, _progress, options) => {
      calls++; assert.equal(options!.timeoutMs, 180000); assert.ok(options!.signal);
      if (calls === 1) throw new Error(`Bearer ${relay.apiKey} at ${relay.endpoint}`);
      return response();
    };
    const runner = make({ directory, request });
    await assert.rejects(runner.run(task), error => { assert.doesNotMatch(String(error), /private-runner-secret|private-relay\.example/); return true; });
    await assert.rejects(runner.run(task), /同一轮次不会重复请求/); assert.equal(calls, 1);
    await make({ directory, request, attempt: 2 }).run(task); assert.equal(calls, 2);
    for (const file of await files(directory)) assert.doesNotMatch(await readFile(file, 'utf8'), /private-runner-secret|private-relay\.example/);
  });
});

test('rejected raw is preserved and its validation feedback repairs only the same input on a new attempt', async () => {
  await sandbox(async (root, make) => {
    const directory = join(root, 'repair-project'); const prompts: string[] = [];
    const invalid = '{"text":"x"}';
    const request: typeof requestRelay = async (_config, _schema, prompt) => { prompts.push(prompt); return response(prompts.length === 1 ? invalid : '{"text":"Repaired scene."}'); };
    const first = make({ directory, request });
    await assert.rejects(first.run(task), /JSON Schema.*\$\.text/);
    await assert.rejects(first.run(task), /JSON Schema/); assert.equal(prompts.length, 1);
    const raw = (await files(directory)).find(file => file.endsWith('.raw.json'))!;
    assert.equal(JSON.parse(await readFile(raw, 'utf8')).content, invalid);
    await make({ directory, request, attempt: 2 }).run(task);
    assert.equal(prompts.length, 2); assert.match(prompts[1], /VALIDATOR_FEEDBACK_JSON=/); assert.ok(prompts[1].includes(JSON.stringify(invalid)));
    await make({ directory, request, attempt: 3 }).run({ ...task, prompt: 'Entirely new input.' });
    assert.equal(prompts.length, 3); assert.equal(prompts[2], 'Entirely new input.');
  });
});

test('malformed JSON and unexpected provider fields produce safe explicit validation failures', async () => {
  await sandbox(async (_root, make) => {
    await assert.rejects(make({ request: async () => response('{"text":') }).run(task), /完整响应不是有效 JSON/);
    await assert.rejects(make({ request: async () => response(JSON.stringify({ text: 'hello', [`PRIVATE_BODY ${relay.apiKey}`]: true })) }).run(task), error => {
      assert.match(String(error), /JSON Schema.*包含未约定字段/);
      assert.doesNotMatch(String(error), /PRIVATE_BODY|private-runner-secret/); return true;
    });
  });
});

test('a per-request timeout cancels even an adapter that never settles and remains reserved', async () => {
  await sandbox(async (_root, make) => {
    let calls = 0;
    const runner = make({ request: async () => { calls++; return new Promise(() => {}); } });
    await assert.rejects(runner.run({ ...task, timeoutMs: 35 }), { name: 'TimeoutError' });
    assert.doesNotThrow(() => runner.assertActive(), 'an optional task timeout does not cancel the shared generation');
    await assert.rejects(runner.run({ ...task, timeoutMs: 35 }), /同一轮次不会重复请求/);
    assert.equal(calls, 1);
  });
});

test('assertActive distinguishes the shared deadline and explicit cancellation from an optional task timeout', async () => {
  await sandbox(async (_root, make) => {
    const stopped = make();
    stopped.assertActive(); stopped.close();
    assert.throws(() => stopped.assertActive(), { name: 'AbortError' });
    const controller = new AbortController();
    const externallyStopped = make({ signal: controller.signal });
    externallyStopped.assertActive(); controller.abort();
    assert.throws(() => externallyStopped.assertActive(), { name: 'AbortError' });
    const expired = make({ deadlineAt: Date.now() - 1 });
    assert.throws(() => expired.assertActive(), { name: 'TimeoutError' });
  });
});
