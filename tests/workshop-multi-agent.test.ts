import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAgentRunner, type AgentRole } from '../server/workshop-agent-runner.ts';
import { fullAgentProtocol, generateMultiAgentDraft, usesFullMultiAgent } from '../server/workshop-multi-agent.ts';
import { saveMultiAgentDraft } from '../server/workshop-agent-draft.ts';
import { hashSource, StoryWorkshop, type LockOwner } from '../server/story-workshop.ts';
import { agentContentHash, stylePatchInput, type StylePatchInput } from '../server/workshop-agent-patches.ts';
import { buildGeneratedWorld } from '../server/workshop-compiler.ts';
import { routeGraphOf } from '../server/workshop-route-generation.ts';
import type { RelayConfig } from '../server/workshop-relay-config.ts';
import type { RelayResponse, requestRelay } from '../server/workshop-relay.ts';
import type { Schema } from '../server/workshop-schema.ts';
import type { RouteDraft } from '../shared/workshop.ts';
import { workshopAgentFixture } from './helpers/workshop-agent-fixture.ts';

const relay: RelayConfig = { endpoint: 'https://synthetic-agent-test.invalid/v1', apiKey: 'synthetic-test-only', model: 'synthetic-model', protocol: 'responses' };
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
function response(value: unknown): RelayResponse { const content = JSON.stringify(value); return { content, diagnostics: { protocol: 'responses', characters: content.length, wireBytes: content.length, eventCount: 1, completed: true } }; }
function data<T>(prompt: string, name: string): T {
  const line = prompt.split('\n').find(line => line.startsWith(`${name}_DATA=`));
  if (!line) throw new Error(`Missing test input ${name}`);
  return JSON.parse(line.slice(name.length + '_DATA='.length)) as T;
}
interface ProviderTask { role: AgentRole; key: string; output: unknown }
function providerTask(fixture: ReturnType<typeof workshopAgentFixture>, schema: Schema, prompt: string): ProviderTask {
  const fields = schema.properties!;
  if (fields.canon) return { role: 'plot', key: 'story-contract', output: fixture.plot };
  if (fields.characters) return { role: 'character', key: 'cast-voices', output: fixture.notes };
  if (fields.graph) {
    const route = data<{ id: string }>(prompt, 'ROUTE');
    return { role: 'gameplay', key: route.id, output: fixture.plans.find(plan => plan.routeId === route.id)! };
  }
  if (fields.text) return { role: 'scene', key: 'common-opening', output: { text: fixture.plot.outline.opening.text } };
  const group = fields.scenes ? (() => {
    const route = data<{ id: string }>(prompt, 'ROUTE');
    const ids = data<{ graph: { id: string } }[]>(prompt, 'SELECTED_SCENES').map(value => value.graph.id);
    const draft = fixture.routes.find(value => value.routeId === route.id)!;
    return { routeId: draft.routeId, entry: draft.entry, scenes: ids.map(id => draft.scenes.find(scene => scene.id === id)!) };
  })() : data<RouteDraft>(prompt, 'DRAFT');
  const firstIndex = fixture.routes.find(route => route.routeId === group.routeId)!.scenes.findIndex(scene => scene.id === group.scenes[0].id);
  const key = `${group.routeId}-group-${Math.floor(firstIndex / 3) + 1}`;
  return fields.scenes ? { role: 'scene', key, output: group } : { role: 'style', key, output: { baseHash: stylePatchInput(group).baseHash, patches: [] } };
}
async function files(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)]))).flat();
}
async function sandbox(run: (directory: string, make: (attempt: number, request: typeof requestRelay, options?: Partial<Parameters<typeof createAgentRunner>[0]>) => ReturnType<typeof createAgentRunner>) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'workshop-multi-agent-')), directory = join(root, 'project');
  const runners: ReturnType<typeof createAgentRunner>[] = [];
  await mkdir(directory);
  const make = (attempt: number, request: typeof requestRelay, options: Partial<Parameters<typeof createAgentRunner>[0]> = {}) => {
    const runner = createAgentRunner({ directory, attempt, relay, leaseRoot: join(root, 'leases'), request, deadlineAt: Date.now() + 15000, ...options });
    runners.push(runner); return runner;
  };
  try { await run(directory, make); }
  finally { for (const runner of runners) runner.close(); await rm(root, { recursive: true, force: true }); }
}

test('five real runner roles respect dependencies and overlap scene writing with editing, then compile and reuse all 36 scenes', async () => {
  await sandbox(async (directory, make) => {
    const f = workshopAgentFixture(), original = JSON.stringify(f), calls: string[] = [], finished: string[] = [], routesSaved: string[] = [];
    const characterStarted = deferred(), gameplayStarted = deferred(), firstGroupsStarted = deferred(), styleStarted = deferred();
    let active = 0, maximum = 0, activeScenes = 0, initialGroups = 0, styleOverlapped = false, specialistsOverlapped = false;
    const request: typeof requestRelay = async (_relay, schema, prompt) => {
      const task = providerTask(f, schema, prompt), label = `${task.role}/${task.key}`;
      calls.push(label); active++; maximum = Math.max(maximum, active);
      try {
        if (task.role !== 'plot') assert.ok(finished.includes('plot/story-contract'), 'plot must finish before every other role');
        if (task.role === 'character') {
          characterStarted.resolve(); await gameplayStarted.promise; specialistsOverlapped = true;
        } else if (task.role === 'gameplay') {
          gameplayStarted.resolve(); await characterStarted.promise;
        } else if (task.role === 'scene') {
          assert.ok(finished.includes('character/cast-voices'));
          for (const route of f.plot.outline.routes) assert.ok(finished.includes(`gameplay/${route.id}`));
          if (task.key !== 'common-opening') {
            activeScenes++;
            try {
              if (['route_a-group-1', 'route_a-group-2', 'route_a-group-3'].includes(task.key)) {
                initialGroups++; if (initialGroups === 3) firstGroupsStarted.resolve();
                if (task.key === 'route_a-group-1') await firstGroupsStarted.promise;
                else await styleStarted.promise;
              }
            } finally { activeScenes--; }
          }
        } else if (task.role === 'style') {
          assert.ok(finished.includes(`scene/${task.key}`), 'a style request must have its own accepted prose first');
          if (!styleOverlapped && activeScenes > 0) styleOverlapped = true;
          styleStarted.resolve();
        }
        finished.push(label); return response(task.output);
      } finally { active--; }
    };
    const result = await generateMultiAgentDraft({ source: f.source, directory, attempt: 1, runner: make(1, request), onRoute: async route => { routesSaved.push(route.routeId); } });
    assert.equal(specialistsOverlapped, true); assert.equal(styleOverlapped, true); assert.equal(maximum, 3);
    assert.equal(calls.length, 30); assert.equal(new Set(calls).size, calls.length);
    assert.deepEqual(Object.fromEntries(['plot', 'character', 'gameplay', 'scene', 'style'].map(role => [role, calls.filter(call => call.startsWith(role + '/')).length])), { plot: 1, character: 1, gameplay: 3, scene: 13, style: 12 });
    assert.deepEqual(routesSaved.sort(), ['route_a', 'route_b', 'route_c']);
    assert.deepEqual(result.report.roles, ['plot', 'character', 'gameplay', 'scene', 'style']);
    assert.equal(result.report.editorialReview, 'required');
    assert.equal(result.report.style.length, 12); assert.ok(result.report.style.every(style => style.status === 'unchanged'));
    assert.equal(result.report.draftHash, agentContentHash(result.draft));
    assert.equal(result.report.contractHash, agentContentHash({ protocol: fullAgentProtocol, sourceHash: agentContentHash(f.source), plot: f.plot, notes: f.notes, plans: f.plans }));
    assert.equal(result.draft.routes.flatMap(route => route.scenes).length, 36);
    const { world, validation } = buildGeneratedWorld('import-00000000-0000-4000-8000-000000000001', 1, f.source, result.draft);
    assert.equal(validation.scenes, 37); assert.equal(validation.routes, 3); assert.equal(validation.decisions, 31); assert.equal(validation.endings, 6); assert.equal(validation.badEnds, 3);
    assert.equal(validation.states, 64); assert.ok(Object.keys(world.ink).length > 0);
    assert.deepEqual(JSON.parse(await readFile(join(directory, 'draft.json'), 'utf8')), result.draft);
    assert.deepEqual(JSON.parse(await readFile(join(directory, 'agent-generation-report.json'), 'utf8')), result.report);
    assert.equal(JSON.parse(await readFile(join(directory, 'agent-contract.json'), 'utf8')).contractHash, result.report.contractHash);
    for (const route of result.draft.routes) assert.deepEqual(JSON.parse(await readFile(join(directory, `route-${route.routeId}.json`), 'utf8')), route);
    const reusedCalls: string[] = [];
    const reused = await generateMultiAgentDraft({ source: f.source, directory, attempt: 1, runner: make(1, async (_relay, schema, prompt) => {
      reusedCalls.push(providerTask(f, schema, prompt).key); throw new Error('Unexpected provider call for a cached input');
    }) });
    assert.deepEqual(reusedCalls, []); assert.deepEqual(reused.draft, result.draft);
    assert.equal(reused.report.draftHash, result.report.draftHash); assert.equal(JSON.stringify(f), original);
    const contractFile = join(directory, 'agent-contract.json');
    const contract = JSON.parse(await readFile(contractFile, 'utf8'));
    contract.notes.characters[0].voice += ' Tampered contract without updated hash.';
    await writeFile(contractFile, JSON.stringify(contract));
    let tamperCalls = 0;
    await assert.rejects(generateMultiAgentDraft({ source: f.source, directory, attempt: 2, runner: make(2, async () => { tamperCalls++; throw new Error('A broken contract must fail before requests'); }) }), /合同记录不一致/);
    assert.equal(tamperCalls, 0);
  });
});

test('a required scene failure preserves completed sibling requests and resumes only missing tasks in a new attempt', async () => {
  await sandbox(async (directory, make) => {
    const f = workshopAgentFixture(), calls: string[] = [], succeeded = new Set<string>(), allInitialStarted = deferred();
    let started = 0;
    const request: typeof requestRelay = async (_relay, schema, prompt) => {
      const task = providerTask(f, schema, prompt), label = `${task.role}/${task.key}`; calls.push(label);
      if (task.role === 'scene' && ['route_a-group-1', 'route_a-group-2', 'route_a-group-3'].includes(task.key)) {
        started++; if (started === 3) allInitialStarted.resolve();
        await allInitialStarted.promise;
        if (task.key === 'route_a-group-2') throw new Error('Synthetic interrupted scene response');
        await delay(20);
      }
      succeeded.add(label); return response(task.output);
    };
    await assert.rejects(generateMultiAgentDraft({ source: f.source, directory, attempt: 1, runner: make(1, request) }), /Agent 执行失败/);
    assert.ok(succeeded.has('scene/route_a-group-1')); assert.ok(succeeded.has('scene/route_a-group-3'));
    assert.ok(succeeded.has('style/route_a-group-1')); assert.ok(succeeded.has('style/route_a-group-3'));
    assert.ok(!calls.includes('scene/route_a-group-4'));
    await assert.rejects(readFile(join(directory, 'draft.json')), { code: 'ENOENT' });
    const savedFiles = (await files(join(directory, 'agents'))).filter(file => /attempt-1\.(raw|accepted)\.json$/.test(file));
    const savedBytes = new Map(await Promise.all(savedFiles.map(async file => [file, await readFile(file, 'utf8')] as const)));
    assert.ok(savedFiles.length > 0);
    const sameAttemptCalls: string[] = [];
    await assert.rejects(generateMultiAgentDraft({ source: f.source, directory, attempt: 1, runner: make(1, async (_relay, schema, prompt) => {
      sameAttemptCalls.push(providerTask(f, schema, prompt).key); throw new Error('A duplicate request is forbidden in this attempt');
    }) }), /同一轮次不会重复请求/);
    assert.deepEqual(sameAttemptCalls, []);
    const resumedCalls: string[] = [];
    const result = await generateMultiAgentDraft({ source: f.source, directory, attempt: 2, runner: make(2, async (_relay, schema, prompt) => {
      const task = providerTask(f, schema, prompt), label = `${task.role}/${task.key}`;
      resumedCalls.push(label); assert.ok(!succeeded.has(label), `Accepted sibling was called again: ${label}`); return response(task.output);
    }) });
    assert.ok(resumedCalls.includes('scene/route_a-group-2'));
    assert.equal(resumedCalls.length, 30 - succeeded.size);
    assert.equal(result.draft.routes.flatMap(route => route.scenes).length, 36);
    buildGeneratedWorld('import-00000000-0000-4000-8000-000000000002', 1, f.source, result.draft);
    for (const [file, bytes] of savedBytes) assert.equal(await readFile(file, 'utf8'), bytes);
  });
});

test('an invalid optional style batch keeps the entire accepted scene while a valid edit changes only prose', async () => {
  await sandbox(async (directory, make) => {
    const f = workshopAgentFixture(), original = JSON.stringify(f), revisedProse = f.routes[1].scenes[0].text[0].replace('keeps the evidence', 'retains the evidence');
    const request: typeof requestRelay = async (_relay, schema, prompt) => {
      const task = providerTask(f, schema, prompt);
      if (task.role === 'style') {
        const input = data<StylePatchInput>(prompt, 'STYLE_PATCH_INPUT');
        const target = input.targets.find(target => target.field === 'text')!, { original: _original, ...patch } = target;
        if (task.key === 'route_a-group-1') return response({ baseHash: input.baseHash, patches: [
          { ...patch, replacement: revisedProse },
          { ...patch, index: 1, originalHash: '0'.repeat(64), replacement: revisedProse },
        ] });
        if (task.key === 'route_b-group-1') return response({ baseHash: input.baseHash, patches: [{ ...patch, replacement: revisedProse }] });
      }
      return response(task.output);
    };
    const result = await generateMultiAgentDraft({ source: f.source, directory, attempt: 1, runner: make(1, request) });
    assert.deepEqual(result.report.style.find(style => style.key === 'route_a-group-1'), { key: 'route_a-group-1', status: 'skipped', patches: 0 });
    assert.deepEqual(result.report.style.find(style => style.key === 'route_b-group-1'), { key: 'route_b-group-1', status: 'applied', patches: 1 });
    assert.deepEqual(result.draft.routes[0], f.routes[0], 'an invalid batch must not partially apply its valid first patch');
    assert.equal(result.draft.routes[1].scenes[0].text[0], revisedProse);
    assert.deepEqual(result.draft.routes.map(routeGraphOf), f.plans.map(plan => plan.graph));
    assert.equal(JSON.stringify(f), original);
    const reusedCalls: string[] = [];
    const reused = await generateMultiAgentDraft({ source: f.source, directory, attempt: 1, runner: make(1, async (_relay, schema, prompt) => {
      reusedCalls.push(providerTask(f, schema, prompt).key); throw new Error('Invalid optional style must not be called again in the same attempt');
    }) });
    assert.deepEqual(reusedCalls, []); assert.deepEqual(reused.draft, result.draft);
    assert.equal(reused.report.style.find(style => style.key === 'route_a-group-1')?.status, 'skipped');
  });
});

test('new full drafts opt in while legacy work and revisions keep their original path; a saved marker survives disabling new opt-ins', async () => {
  await sandbox(async (directory, make) => {
    assert.equal(await usesFullMultiAgent(directory, true), true);
    assert.equal(await usesFullMultiAgent(directory, false), false);
    for (const legacy of ['outline.json', 'draft.json', 'revision-origin.json', 'world.json', 'route-existing.json']) {
      const file = join(directory, legacy); await writeFile(file, '{}');
      assert.equal(await usesFullMultiAgent(directory, true), false, legacy); await rm(file);
    }
    for (const legacy of ['creative', 'route-parts', 'editorial']) {
      const folder = join(directory, legacy); await mkdir(folder);
      assert.equal(await usesFullMultiAgent(directory, true), false, legacy); await rm(folder, { recursive: true });
    }
    const marker = join(directory, 'multi-agent.json');
    const f = workshopAgentFixture();
    await writeFile(marker, JSON.stringify({ protocol: fullAgentProtocol, sourceHash: agentContentHash(f.source) }));
    await writeFile(join(directory, 'outline.json'), '{}');
    assert.equal(await usesFullMultiAgent(directory, true), true); assert.equal(await usesFullMultiAgent(directory, false), true);
    let calls = 0;
    await assert.rejects(generateMultiAgentDraft({ source: { ...f.source, text: f.source.text + '\nChanged original source.' }, directory, attempt: 2, runner: make(2, async () => { calls++; throw new Error('Source mismatch must stop before requests'); }) }), /本次原文不匹配/);
    assert.equal(calls, 0);
    await writeFile(marker, JSON.stringify({ protocol: 'unsupported-future-protocol' }));
    await assert.rejects(usesFullMultiAgent(directory, true), /版本不受支持/);
  });
});


test('an accepted editorial draft and applied recovery survive resume without regenerating or rolling back the prose', async () => {
  await sandbox(async (directory, make) => {
    const f = workshopAgentFixture();
    const generated = await generateMultiAgentDraft({ source: f.source, directory, attempt: 1, runner: make(1, async (_relay, schema, prompt) => response(providerTask(f, schema, prompt).output)) });
    const edited = structuredClone(generated.draft);
    edited.routes[0].scenes[0].text[0] += ' The editor preserves this accepted revision across resumed runs.';
    await saveMultiAgentDraft(f.source, directory, edited);
    let calls = 0;
    const resume = () => generateMultiAgentDraft({ source: f.source, directory, attempt: 2, runner: make(2, async () => { calls++; throw new Error('A complete accepted draft must not be regenerated'); }) });
    assert.deepEqual((await resume()).draft, edited); assert.equal(calls, 0);
    await rm(join(directory, 'draft.json'));
    assert.deepEqual((await resume()).draft, edited, 'the atomic current draft survives a missing compatibility mirror');
    await writeFile(join(directory, 'draft.json'), '{\"interrupted_mirror\":');
    assert.deepEqual((await resume()).draft, edited, 'an incomplete mirror cannot hide a valid atomic snapshot');
    await rm(join(directory, 'draft.json'));
    const snapshotFile = join(directory, 'agent-current-draft.json');
    const snapshot = JSON.parse(await readFile(snapshotFile, 'utf8'));
    snapshot.draft.routes[0].scenes[0].text[0] += ' Tampered snapshot without matching hash.';
    await writeFile(snapshotFile, JSON.stringify(snapshot));
    await assert.rejects(resume(), /校验和不匹配/); assert.equal(calls, 0);
    await saveMultiAgentDraft(f.source, directory, edited);

    const recovered = structuredClone(edited);
    recovered.routes[0].scenes[0].text[0] += ' Recovery fixes the final witness handoff without losing the editorial revision.';
    const recovery = { appliedAt: new Date().toISOString(), sourceHash: hashSource(f.source), draftHash: agentContentHash(recovered), draft: recovered, notes: { sourceHash: agentContentHash(f.source) } };
    await writeFile(join(directory, 'draft-recovery.json'), JSON.stringify(recovery));
    await writeFile(join(directory, 'draft.json'), JSON.stringify(recovered));
    assert.deepEqual((await resume()).draft, recovered, 'an ownership-bound applied recovery is newer than the generator snapshot');
    assert.deepEqual(JSON.parse(await readFile(snapshotFile, 'utf8')).draft, recovered);
    assert.equal(calls, 0);

    await saveMultiAgentDraft(f.source, directory, edited);
    // Simulate a crash after the new snapshot commits but before its mirror is
    // replaced: the mirror still matches an older, already consumed recovery.
    await writeFile(join(directory, 'draft.json'), JSON.stringify(recovered));
    assert.deepEqual((await resume()).draft, edited, 'an already consumed recovery must not roll back a newer accepted snapshot');
    await writeFile(join(directory, 'draft-recovery.json'), JSON.stringify({ ...recovery, appliedAt: undefined }));
    await writeFile(join(directory, 'draft.json'), JSON.stringify(recovered));
    assert.deepEqual((await resume()).draft, edited, 'an unapplied recovery proposal cannot replace the accepted draft');
    await writeFile(join(directory, 'draft-recovery.json'), JSON.stringify({ ...recovery, sourceHash: 'unrelated-original-source' }));
    assert.deepEqual((await resume()).draft, edited, 'a recovery from another source cannot replace the accepted draft');
    assert.equal(calls, 0);
  });
});


for (const interruption of ['cancel', 'deadline'] as const) test(`a final optional style request cannot swallow a global ${interruption} or commit a complete draft`, async () => {
  await sandbox(async (directory, make) => {
    const f = workshopAgentFixture(), controller = new AbortController();
    let styleCount = 0, sceneCount = 0;
    const request: typeof requestRelay = async (_relay, schema, prompt, _progress, options) => {
      const task = providerTask(f, schema, prompt);
      if (task.role === 'scene') sceneCount++;
      if (task.role === 'style' && ++styleCount === 12) {
        assert.equal(sceneCount, 13, 'interruption occurs after all scene provider responses complete');
        if (interruption === 'cancel') controller.abort();
        else await new Promise<void>((_resolve, reject) => {
          assert.ok(options?.signal);
          if (options.signal.aborted) reject(options.signal.reason);
          else options.signal.addEventListener('abort', () => reject(options.signal!.reason), { once: true });
        });
      }
      return response(task.output);
    };
    const runner = make(1, request, { signal: controller.signal, ...(interruption === 'deadline' ? { deadlineAt: Date.now() + 3000 } : {}) });
    await assert.rejects(generateMultiAgentDraft({ source: f.source, directory, attempt: 1, runner }), /取消|时间上限/);
    assert.equal(styleCount, 12);
    for (const file of ['draft.json', 'agent-current-draft.json', 'agent-generation-report.json']) await assert.rejects(readFile(join(directory, file)), { code: 'ENOENT' });
    const sceneInputs = (await files(join(directory, 'agents'))).filter(file => file.endsWith('/input.json') && file.includes('/scene-'));
    assert.equal(sceneInputs.length, 13);
    for (const input of sceneInputs) await readFile(input.replace('/input.json', '/attempt-1.accepted.json'));
  });
});

test('the real workshop worker publishes a full game through five relay roles and independent editorial review without a CLI', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workshop-agent-worker-')), f = workshopAgentFixture();
  const service = new StoryWorkshop(root), calls: string[] = [], serverErrors: unknown[] = [];
  let ownerPid: number | undefined, projectId: string | undefined;
  const server = createServer((request, result) => {
    const chunks: Buffer[] = [];
    request.on('data', chunk => chunks.push(Buffer.from(chunk)));
    request.on('end', () => {
      try {
        assert.equal(request.url, '/v1/responses');
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { input: { content: string }[]; text: { format: { schema: Schema } }; model: string; reasoning: { effort: string } };
        assert.equal(body.model, relay.model); assert.equal(body.reasoning.effort, 'low');
        const schema = body.text.format.schema, prompt = body.input[0].content;
        let output: unknown;
        if (schema.properties?.coverage) {
          calls.push('editorial/full-review');
          const draft = data<{ routes: RouteDraft[] }>(prompt, 'DRAFT');
          assert.equal(draft.routes.flatMap(route => route.scenes).length, 36);
          output = { summary: 'Synthetic independent review fixture: complete coverage and no blocking findings.', coverage: { opening: 'reviewed', outline: 'reviewed', routes: draft.routes.map(route => ({ routeId: route.routeId, sceneIds: route.scenes.map(scene => scene.id) })) }, findings: [] };
        } else {
          const task = providerTask(f, schema, prompt); calls.push(`${task.role}/${task.key}`); output = task.output;
        }
        result.writeHead(200, { 'content-type': 'application/json' });
        result.end(JSON.stringify({ status: 'completed', output_text: JSON.stringify(output) }));
      } catch (error) {
        serverErrors.push(error); result.writeHead(500, { 'content-type': 'application/json' }); result.end(JSON.stringify({ error: { code: 'server_error' } }));
      }
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const configFile = join(root, 'synthetic-relay.json');
  await writeFile(configFile, JSON.stringify({ ...relay, endpoint: `http://127.0.0.1:${address.port}/v1` }));
  const env = { WORKSHOP_CONFIG_PATH: configFile, WORKSHOP_FULL_MULTI_AGENT: '1', WORKSHOP_FULL_AGENT_BUDGET_MS: '60000', WORKSHOP_CODEX_BIN: join(root, 'no-cli-may-run') };
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(env)) process.env[key] = value;
    const project = await service.import({ ...f.source, generationOptions: { mode: 'full', adaptation: 'faithful', images: 'none' } });
    projectId = project.id;
    const started = await service.generate(project.id);
    assert.equal(started.status, 'running');
    const owner = JSON.parse(await readFile(join(service.dir(project.id), 'job.lock/owner.json'), 'utf8')) as LockOwner;
    ownerPid = owner.pid; assert.notEqual(ownerPid, process.pid, 'generation runs in a real child worker');
    const deadline = Date.now() + 20000;
    let final = await service.get(project.id);
    while (final.status === 'running' && Date.now() < deadline) { await delay(30); final = await service.get(project.id); }
    assert.deepEqual(serverErrors, []);
    assert.equal(final.status, 'ready', JSON.stringify(final.error));
    assert.equal(final.generationOptions?.mode, 'full'); assert.equal(final.publishedVersion, 'r1');
    assert.equal(final.playable, true); assert.equal(final.completedRoutes, 3); assert.equal(final.editorial?.status, 'passed');
    assert.equal(final.generation?.model, relay.model); assert.ok(final.generation?.finishedAt); assert.ok((final.generation?.elapsedMs ?? 0) > 0);
    assert.equal(final.art.status, 'disabled'); assert.equal(calls.length, 31);
    assert.equal(calls.at(-1), 'editorial/full-review');
    for (const role of ['plot', 'character', 'gameplay', 'scene', 'style']) assert.ok(calls.some(call => call.startsWith(role + '/')));
    const revision = join(service.dir(project.id), 'r1');
    const world = await service.world(project.id);
    assert.equal(Object.keys(world.nodes).length, 37); assert.ok(Object.keys(world.ink).length); assert.ok(world.generated?.editorial?.draftHash);
    assert.deepEqual(JSON.parse(await readFile(join(revision, 'world.json'), 'utf8')), world);
    const editorial = JSON.parse(await readFile(join(revision, 'editorial-report.json'), 'utf8'));
    const current = JSON.parse(await readFile(join(revision, 'agent-current-draft.json'), 'utf8'));
    assert.equal(editorial.status, 'passed'); assert.equal(editorial.blockingCount, 0);
    assert.equal(current.draftHash, editorial.draftHash); assert.equal(world.generated?.editorial?.draftHash, editorial.draftHash);
    assert.deepEqual(JSON.parse(await readFile(join(service.dir(project.id), 'source.json'), 'utf8')), f.source);
    await assert.rejects(readFile(env.WORKSHOP_CODEX_BIN), { code: 'ENOENT' });
    for (let attempt = 0; attempt < 100; attempt++) {
      try { await readFile(join(service.dir(project.id), 'job.lock/owner.json')); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') break; throw error; }
      await delay(20);
    }
    await assert.rejects(readFile(join(service.dir(project.id), 'job.lock/owner.json')), { code: 'ENOENT' });
    ownerPid = undefined;
  } finally {
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    if (ownerPid) { try { process.kill(ownerPid, 'SIGTERM'); } catch { /* worker already exited */ } }
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    if (ownerPid && projectId) await delay(30);
    await rm(root, { recursive: true, force: true });
  }
});
