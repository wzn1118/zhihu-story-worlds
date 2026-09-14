import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import type { GameWorld } from '../shared/types.ts';
import type { RelayConfig } from '../server/workshop-relay-config.ts';
import type { requestRelay } from '../server/workshop-relay.ts';
import { generateSimpleImages, getSimpleImageStatus, renderSimpleScene, simpleImageFingerprint, withSimpleImages } from '../server/workshop-simple-images.ts';

const relay: RelayConfig = { endpoint: 'https://fixture.invalid/v1', apiKey: 'fixture-credential-must-not-persist', model: 'gpt6-fixture', protocol: 'responses', reasoning: 'max' };
function world(): GameWorld {
  const ids = ['first', 'left', 'right', 'bridge', 'left_end', 'right_end'];
  const targets: Record<string, string[]> = { first: ['left', 'right'], left: ['bridge', 'left_end'], right: ['right_end'], bridge: ['left_end'], left_end: [], right_end: [] };
  return { id: 'svg-world', storyId: 'import-svg-fixture', title: '风暴渡口', subtitle: '', summary: '渡口失去信号，旅人必须选择山路或渡船。', version: 'r1', startNodeId: 'first',
    introduction: ['傍晚，渡口停航。'], player: { name: '旅人', role: '寻找归途' }, objective: '在风暴抵达前找到归途。',
    source: { title: '山路和渡船', author: '测试', url: 'https://www.zhihu.com/question/1/answer/2' }, characters: [], background: '', cover: '', ink: {}, clueVariables: {},
    adaptation: { scope: 'based-on-imported-source', adultCast: true, note: 'Inspired by the provided answer.' },
    generated: { projectId: 'svg-project', revision: 1, artReady: false, mode: 'fast', illustrationMode: 'gpt6' },
    nodes: Object.fromEntries(ids.map(id => [id, { id, title: id, chapter: '一', location: id === 'first' ? '渡口' : '山路', time: '黄昏', text: [`风暴正在靠近${id}。`],
      choices: targets[id].map((nextNodeId, index) => ({ id: `${id}_${index}`, text: `走向${nextNodeId}`, nextNodeId })), background: '',
      ...(id.endsWith('_end') ? { ending: { title: '归途', text: '你终于看到了家门口的灯。', tone: 'hopeful' as const } } : {}) }])) };
}
function drawing(nodeId: string, color = '#193045') {
  return { nodeId, title: `${nodeId}渡口`, description: '远山下的孤舟和木栈桥', background: color, shapes: [
    { kind: 'rect', x: 0, y: 500, width: 1600, height: 400, radius: 0, fill: '#234657', stroke: 'none', strokeWidth: 0, opacity: 100 },
    { kind: 'ellipse', x: 1200, y: 150, radiusX: 80, radiusY: 80, fill: '#e0c27a', stroke: 'none', strokeWidth: 0, opacity: 90 },
    { kind: 'polygon', points: [{ x: 50, y: 500 }, { x: 420, y: 120 }, { x: 800, y: 500 }], fill: '#465b67', stroke: 'none', strokeWidth: 0, opacity: 100 },
    { kind: 'line', x: 0, y: 610, endX: 1600, endY: 610, stroke: '#e4ce9a', strokeWidth: 8, opacity: 80 },
  ] };
}
function response(value: unknown) {
  return { content: JSON.stringify(value), usage: undefined, responseId: undefined, diagnostics: { protocol: 'responses' as const, characters: 10, wireBytes: 10, eventCount: 1, completed: true } };
}
function requestReturning(value: unknown): typeof requestRelay { return async () => response(value); }
const selected = ['first', 'left', 'right', 'left_end', 'right_end'];
const validBatch = () => ({ scenes: selected.map((id, index) => drawing(id, `#19304${index}`)) });
async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const root = await mkdtemp(resolve(tmpdir(), 'workshop-svg-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, directory: resolve(root, 'project'), publicDirectory: resolve(root, 'public') };
}

test('SVG rendering escapes model text and rejects executable or external content', () => {
  const scene = { ...drawing('first'), title: '</title><script>alert("test")</script>', description: '" & <image href="https://example.invalid/steal" />' };
  const svg = renderSimpleScene(scene);
  assert.ok(svg.includes('&lt;/title&gt;&lt;script&gt;'));
  assert.ok(svg.includes('&amp; &lt;image href=&quot;'));
  assert.equal(svg.includes('<script>'), false);
  assert.equal(svg.includes('<image '), false);
  assert.equal(svg.includes('foreignObject'), false);
  for (const malicious of [
    { ...drawing('first'), shapes: [{ kind: 'foreignObject', value: '<script />' }] },
    { ...drawing('first'), background: 'url(https://example.invalid/tracker)' },
    { ...drawing('first'), shapes: drawing('first').shapes.map(shape => ({ ...shape, onload: 'alert(1)' })) },
    { ...drawing('first'), shapes: drawing('first').shapes.map(shape => ({ ...shape, href: 'file:///secret' })) },
    { ...drawing('first'), shapes: drawing('first').shapes.map(shape => ({ ...shape, fill: 'url(#remote)' })) },
  ]) assert.throws(() => renderSimpleScene(malicious));
  assert.throws(() => renderSimpleScene({ ...drawing('first'), description: 'bad\u0000text' }));
});

test('one bounded low-reasoning relay call produces independent SVG files and preserves unillustrated text scenes', async t => {
  const f = await fixture(t), base = world(), original = structuredClone(base); let calls = 0;
  const result = await generateSimpleImages(base, f.directory, { ...f, relay, request: async (config, _schema, prompt, _progress, options) => {
    calls++; assert.equal(config.reasoning, 'low'); assert.equal(config.apiKey, relay.apiKey);
    assert.equal(options?.timeoutMs, 180_000); assert.equal(options?.maxOutputTokens, 10_000); assert.ok(options?.signal);
    assert.ok(prompt.includes('风暴渡口')); assert.ok(prompt.includes('不调用 image2'));
    return response(validBatch());
  } });
  assert.equal(result.state, 'ready'); assert.equal(result.completed, 5); assert.equal(result.targetedScenes, 5); assert.equal(result.totalScenes, 6);
  assert.equal(result.provider, 'gpt6-svg'); assert.equal(calls, 1);
  const bound = await withSimpleImages(base, f.directory, f);
  assert.deepEqual(base, original); assert.equal(bound.nodes.bridge.background, ''); assert.equal(bound.generated?.artReady, false);
  assert.equal(bound.cover, bound.nodes.first.background); assert.equal(new Set(Object.values(bound.nodes).map(node => node.background).filter(Boolean)).size, 5);
  for (const id of selected) {
    const file = resolve(f.publicDirectory, `.${bound.nodes[id].background}`), svg = await readFile(file, 'utf8');
    assert.ok(svg.startsWith('<svg ')); assert.ok(svg.includes(`${id}渡口`)); assert.equal(svg.includes(relay.apiKey), false);
  }
  assert.equal(simpleImageFingerprint(bound), simpleImageFingerprint(base));
  await generateSimpleImages(base, f.directory, { ...f, relay, request: async () => { throw new Error('must not retry'); } });
  assert.equal((await getSimpleImageStatus(base, f.directory, f)).completed, 5);
});

test('malformed and missing scenes are isolated while valid scene images remain playable', async t => {
  const f = await fixture(t), base = world();
  const batch = { scenes: [drawing('first'), { ...drawing('left'), shapes: [{ kind: 'script', value: 'alert(1)' }] }, drawing('right', '#193046')] };
  const result = await generateSimpleImages(base, f.directory, { ...f, relay, request: requestReturning(batch) });
  assert.equal(result.state, 'partial'); assert.equal(result.completed, 2); assert.equal(result.failed, 3);
  assert.deepEqual(result.failedNodeIds, ['left', 'left_end', 'right_end']);
  const bound = await withSimpleImages(base, f.directory, f);
  assert.ok(bound.nodes.first.background.endsWith('.svg')); assert.equal(bound.nodes.left.background, ''); assert.deepEqual(bound.nodes.left.text, base.nodes.left.text);
  assert.equal(bound.generated?.artReady, false);
  const oldUrl = bound.nodes.first.background;
  const stillPartial = await generateSimpleImages(base, f.directory, { ...f, relay, retry: true, request: async () => { throw new Error('offline'); } });
  assert.equal(stillPartial.completed, 2); assert.equal((await withSimpleImages(base, f.directory, f)).nodes.first.background, oldUrl);
  const repaired = await generateSimpleImages(base, f.directory, { ...f, relay, retry: true, request: async (_config, _schema, prompt) => {
    const source = JSON.parse(prompt.split('STORY_DATA=')[1]);
    assert.deepEqual(source.scenes.map((scene: { nodeId: string }) => scene.nodeId), ['left', 'left_end', 'right_end']);
    return response({ scenes: ['left', 'left_end', 'right_end'].map((id, index) => drawing(id, `#65321${index}`)) });
  } });
  assert.equal(repaired.state, 'ready'); assert.equal(repaired.completed, 5);
  assert.equal((await withSimpleImages(base, f.directory, f)).nodes.first.background, oldUrl);
});

test('a repeated composition cannot masquerade as independently illustrated branches', async t => {
  const f = await fixture(t), base = world();
  const result = await generateSimpleImages(base, f.directory, { ...f, relay, request: requestReturning({ scenes: selected.map(id => drawing(id)) }) });
  assert.equal(result.state, 'partial'); assert.equal(result.completed, 1); assert.equal(result.failed, 4);
  assert.deepEqual(result.nodeIds, ['first']);
});

test('world/version/source changes never reuse old SVGs and tampered assets cannot bind', async t => {
  const f = await fixture(t), base = world();
  await generateSimpleImages(base, f.directory, { ...f, relay, request: requestReturning(validBatch()) });
  const bound = await withSimpleImages(base, f.directory, f);
  for (const revised of [
    { ...bound, id: 'different-world' }, { ...bound, version: 'r2' }, { ...bound, storyId: 'different-story' },
    { ...bound, source: { ...bound.source, url: 'https://www.zhihu.com/question/1/answer/3' } },
    { ...bound, nodes: { ...bound.nodes, first: { ...bound.nodes.first, text: ['Changed source scene.'] } } },
  ]) {
    assert.equal((await getSimpleImageStatus(revised, f.directory, f)).state, 'idle');
    const safe = await withSimpleImages(revised, f.directory, f);
    assert.equal(safe.cover, ''); assert.ok(Object.values(safe.nodes).every(node => node.background === ''));
  }
  await writeFile(resolve(f.publicDirectory, `.${bound.nodes.first.background}`), '<svg><script>unsafe()</script></svg>');
  const safe = await withSimpleImages(bound, f.directory, f), integrity = await getSimpleImageStatus(base, f.directory, f);
  assert.equal(safe.cover, ''); assert.equal(safe.nodes.first.background, ''); assert.equal(integrity.state, 'partial'); assert.equal(integrity.completed, 4);
});

test('provider failure is sanitized, persisted once and leaves the published game playable', async t => {
  const f = await fixture(t), base = world(); let calls = 0;
  const request: typeof requestRelay = async () => { calls++; throw new Error(`remote echoed ${relay.apiKey}`); };
  const failed = await generateSimpleImages(base, f.directory, { ...f, relay, request });
  assert.equal(failed.state, 'failed'); assert.equal(failed.errorCode, 'SIMPLE_IMAGES_GENERATION_FAILED'); assert.equal(failed.failed, 5);
  assert.equal(JSON.stringify(failed).includes(relay.apiKey), false);
  await generateSimpleImages(base, f.directory, { ...f, relay, request }); assert.equal(calls, 1);
  const safe = await withSimpleImages(base, f.directory, f);
  assert.deepEqual(safe.nodes.first.text, base.nodes.first.text); assert.deepEqual(safe.nodes.first.choices, base.nodes.first.choices);
  assert.equal((await generateSimpleImages({ ...base, version: 'r2' }, f.directory, { ...f, relay: null })).errorCode, 'SIMPLE_IMAGES_RELAY_UNCONFIGURED');
});

test('timeout is bounded independently of provider transport and late completion cannot publish', async t => {
  const f = await fixture(t), base = world();
  let deliverLate: ((value: Awaited<ReturnType<typeof requestRelay>>) => void) | undefined;
  // Keep AbortSignal.timeout alive without measuring unrelated shared-host filesystem scheduling.
  const keepAlive = setInterval(() => {}, 1000); t.after(() => clearInterval(keepAlive));
  const failed = await generateSimpleImages(base, f.directory, { ...f, relay, timeoutMs: 25,
    request: () => new Promise(resolve => { deliverLate = resolve; }) });
  assert.equal(failed.state, 'failed'); assert.equal(failed.errorCode, 'SIMPLE_IMAGES_TIMEOUT'); assert.ok(deliverLate);
  deliverLate(response(validBatch())); await delay(1);
  assert.equal((await getSimpleImageStatus(base, f.directory, f)).completed, 0);
});

test('simultaneous generation requests share the per-version lock and disabled modes make no requests', async t => {
  const f = await fixture(t), base = world(); let calls = 0;
  const request: typeof requestRelay = async () => { calls++; await delay(60); return response(validBatch()); };
  const results = await Promise.all([generateSimpleImages(base, f.directory, { ...f, relay, request }), generateSimpleImages(base, f.directory, { ...f, relay, request })]);
  assert.equal(calls, 1); assert.ok(results.some(result => result.completed === 5)); assert.equal((await getSimpleImageStatus(base, f.directory, f)).completed, 5);
  for (const illustrationMode of ['none', 'image2'] as const) {
    const disabled = { ...base, generated: { ...base.generated!, illustrationMode } };
    assert.equal((await generateSimpleImages(disabled, f.directory, { ...f, relay, request })).state, 'disabled');
    assert.equal(await withSimpleImages(disabled, f.directory, f), disabled);
  }
  assert.equal(calls, 1);
});
