import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { readArtSourceBook } from '../server/art-production-books.ts';
import os from 'node:os';
import path from 'node:path';
import { authoredWorlds } from '../content/worlds.ts';
import { augmentedShortWorld, buildShortPlans, shortBrief, type ShortAssetPlan } from '../server/art-production-short.ts';
import { sha256 } from '../server/art-production-prompts.ts';
import type { ArtJob } from '../shared/production.ts';
import { formalStyleBrief } from '../scripts/art-production-formal-supervisor.ts';

test('targeted repair references retain order and changing either image changes the job reference hash', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'short-art-repair-'));
  await writeFile(path.join(root, 'style.png'), 'style-reference');
  await writeFile(path.join(root, 'identity.png'), 'identity-reference');
  const plan: ShortAssetPlan = { worldId: 'test', owner: 'test', nodeId: '__art_character_test', kind: 'character-anchor',
    prompt: 'test', sourceHash: 'source', sourceFacts: [], dependencies: [], referenceFiles: ['style.png', 'identity.png'] };
  const before = await formalStyleBrief(root, plan, []);
  assert.deepEqual(before?.references, [path.join(root, 'style.png'), path.join(root, 'identity.png')]);
  await writeFile(path.join(root, 'style.png'), 'changed-style');
  const changed = await formalStyleBrief(root, plan, []);
  assert.notEqual(changed?.referenceHash, before?.referenceHash);
  assert.equal(changed?.aspectRatio, '2:3');
});

test('formal plan covers every actual scene and keeps ancillary identities separate', async () => {
  const plans = await buildShortPlans(process.cwd(), authoredWorlds);
  const scenes = plans.filter(p => p.kind === 'scene');
  assert.equal(new Set(plans.map(p => p.worldId)).size, 20);
  assert.equal(scenes.length, authoredWorlds.reduce((n, w) => n + Object.keys(w.nodes).length, 0));
  assert.equal(new Set(plans.map(p => `${p.worldId}/${p.nodeId}`)).size, plans.length);
  for (const world of authoredWorlds) {
    assert(scenes.filter(p => p.worldId === world.id).length >= 30);
    const augmented = augmentedShortWorld(world, plans);
    for (const node of Object.values(world.nodes)) assert.equal(augmented.nodes[node.id], node);
    assert(Object.keys(augmented.nodes).length > Object.keys(world.nodes).length);
  }
  for (const plan of plans) assert(plan.prompt.length <= 90);
  for (const plan of plans.filter(p => p.kind === 'environment')) {
    assert(plan.prompt.length <= 65);
    assert(!plan.prompt.includes('保留门窗'));
    assert(plan.prompt.includes('单幅无人场景'));
  }
  assert(plans.find(p => p.worldId === 'blue-blood' && p.kind === 'environment')!.prompt.includes('当代中国'));
});

test('scoped scene and reaction repairs retain cast order and leave all unrelated plans unchanged', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'short-art-scoped-repair-'));
  const production = 'output/imagegen/scene-production';
  for (const owner of ['cel-drawing', 'painted-background', 'scene-composition']) {
    const relative = `${production}/art-team/${owner}/short-production-20260907/book.json`;
    await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
    await writeFile(path.join(root, relative), JSON.stringify(await readArtSourceBook(process.cwd(), owner)));
  }
  const relative = `${production}/formal-production-20260907/review-repairs.json`;
  const repairs: Record<string, { prompt: string; referenceFiles: string[] }> = {};
  await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
  await writeFile(path.join(root, relative), JSON.stringify(repairs));
  const before = await buildShortPlans(root, authoredWorlds);
  const selected = ['black-flood/__art_reaction_fang', 'six-roots/b_watch'];
  for (const key of selected) repairs[key] = {
    prompt: '吸血鬼猎人D画风，图1画法，其余图保持原角色，单幅动画平涂硬影。',
    referenceFiles: ['style-reference.jpg'],
  };
  await writeFile(path.join(root, relative), JSON.stringify(repairs));
  const after = await buildShortPlans(root, authoredWorlds);
  assert.equal(after.length, before.length);
  for (const original of before) {
    const key = `${original.worldId}/${original.nodeId}`;
    const changed = after.find(plan => `${plan.worldId}/${plan.nodeId}` === key)!;
    if (!selected.includes(key)) { assert.deepEqual(changed, original); continue; }
    assert.equal(changed.prompt, repairs[key].prompt);
    assert.deepEqual(changed.referenceFiles, ['style-reference.jpg']);
    assert.deepEqual(changed.dependencies, original.dependencies);
    assert.deepEqual(changed.sourceFacts, original.sourceFacts);
    assert.equal(changed.blocked, original.blocked);
    assert.notEqual(changed.sourceHash, original.sourceHash);
  }
});

test('a changed narrative source stays blocked rather than silently reusing an old image brief', async () => {
  const original = authoredWorlds[0];
  const [id, node] = Object.entries(original.nodes)[0];
  const changed = { ...original, nodes: { ...original.nodes, [id]: { ...node, text: ['Changed source fixture'] } } };
  const plans = await buildShortPlans(process.cwd(), [changed]);
  assert.equal(plans.find(p => p.nodeId === id)?.blocked, 'SOURCE_CHANGED_REQUIRES_OWNER_REFRESH');
});

test('reviewed framing corrections stay short and contemporary settings retain their era', async () => {
  const plans = await buildShortPlans(process.cwd(), authoredWorlds);
  for (const [worldId, nodeId] of [['online-heir', '__art_character_jiran'],
    ['radish-court', '__art_character_xiao'], ['palace-ledger', '__art_character_dowager']]) {
    const plan = plans.find(p => p.worldId === worldId && p.nodeId === nodeId)!;
    assert(plan.prompt.startsWith('吸血鬼猎人D画风，'));
    assert(plan.prompt.includes('留白'));
    assert(plan.prompt.length <= 120);
    assert.deepEqual(plan.dependencies, []);
  }
  for (const worldId of ['happy-home', 'score-room']) {
    const environments = plans.filter(p => p.worldId === worldId && p.kind === 'environment');
    assert(environments.length > 0);
    assert(environments.every(p => p.prompt.startsWith('吸血鬼猎人D画风，当代中国')));
  }
});

test('style-first scenes accept reviewed fixed anchors at their actual size and verify the bytes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'short-art-'));
  const directory = path.join(root, 'public/generated-art');
  await mkdir(directory, { recursive: true });
  const bytes = Buffer.from('test identity reference bytes, never a production image');
  await writeFile(path.join(directory, 'anchor.png'), bytes);
  const plan: ShortAssetPlan = { worldId: 'test', owner: 'test', nodeId: 'scene', kind: 'scene',
    prompt: 'short fixture', dependencies: ['__art_character_actor'], sourceHash: 'source', sourceFacts: [] };
  const job = { id: 'anchor', worldId: 'test', nodeId: '__art_character_actor', assetKind: 'character-anchor', stale: false,
    asset: { native4k: true, duplicate: false, sha256: sha256(bytes) }, review: { decision: 'approved' } } as ArtJob;
  assert.equal(await shortBrief(root, plan, []), undefined);
  assert.equal(await shortBrief(root, plan, [{ ...job, review: undefined }]), undefined);
  assert.equal(await shortBrief(root, plan, [{ ...job, stale: true }]), undefined);
  assert.deepEqual((await shortBrief(root, plan, [{ ...job, asset: { ...job.asset!, native4k: false } }]))?.references,
    [path.join(directory, 'anchor.png')]);
  const brief = await shortBrief(root, plan, [job]);
  assert.deepEqual(brief?.references, [path.join(directory, 'anchor.png')]);
  await writeFile(path.join(directory, 'anchor.png'), 'changed');
  await assert.rejects(shortBrief(root, plan, [job]), /SHORT_ANCHOR_HASH_CHANGED/);
});

test('style rejections receive bounded targeted corrections without changing other cast anchors', async () => {
  const plans = await buildShortPlans(process.cwd(), authoredWorlds);
  const corrected = [
    ['blue-blood', 'zhangwei', '当代中国'], ['online-heir', 'fuyan', '当代中国'],
    ['double-pursuit', 'elder', '平涂硬边'], ['velvet-alibi', 'friend', '平涂硬边'],
    ['rotten-pilgrimage', 'false_guanyin', '平涂硬边'], ['ming-whisper', 'father', '中国明代'],
    ['ming-whisper', 'wang', '平涂硬边'], ['six-roots', 'su', '平涂硬边'],
  ];
  for (const [world, actor, correction] of corrected) {
    const plan = plans.find(p => p.worldId === world && p.nodeId === `__art_character_${actor}`)!;
    assert(plan.prompt.startsWith('吸血鬼猎人D画风，'));
    assert(plan.prompt.includes(correction));
    assert(plan.prompt.includes('灰底半身像'));
    assert(plan.prompt.length <= 75);
    assert.equal(plan.kind, 'character-anchor');
    assert.deepEqual(plan.dependencies, []);
  }
  const fang = plans.find(p => p.worldId === 'blue-blood' && p.nodeId === '__art_character_fangnuo')!;
  assert(fang && !fang.prompt.includes('动画截图平涂硬边'));
});

test('new character anchors do not inherit film close-up pixels or arbitrary earlier scene references', async () => {
  const plan: ShortAssetPlan = { worldId: 'test', owner: 'test', nodeId: '__art_character_actor',
    kind: 'character-anchor', prompt: 'fixture', dependencies: [], sourceHash: 'source', sourceFacts: [] };
  assert.deepEqual((await shortBrief(process.cwd(), plan, []))?.references, []);
});
