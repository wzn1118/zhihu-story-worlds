import assert from 'node:assert/strict';
import test from 'node:test';
import { authoredWorlds } from '../content/worlds.ts';
import { buildShortPlans, type ShortAssetPlan } from '../server/art-production-short.ts';
import { reviewedEnvironmentNodeIds, type ReviewedEnvironmentAsset } from '../server/art-production-reviewed-placements.ts';

const plans = new Map((await buildShortPlans(process.cwd(), authoredWorlds))
  .filter(plan => plan.worldId === 'red-plum' && plan.kind === 'scene').map(plan => [plan.nodeId, plan]));
const assets: ReviewedEnvironmentAsset[] = [
  { nodeId: '__art_environment_red-plum-arrival-environment', bindingReady: true,
    jobId: 'scene_35af2d5bdf4c27d6a5e92b47b02d',
    sourceHash: 'e4f75be5f3fa939a6c9aae96021b1734fa669a0554f5647fe36610c21b70731f',
    asset: { sha256: 'ceda84b21b285975b6d0883232a451ed60e025a57f17b03115b5b439cc3a12c6' } },
  { nodeId: '__art_environment_red-plum-field_1-environment', bindingReady: true,
    jobId: 'scene_792e64c43741af9f7d05a29a506a',
    sourceHash: 'e4b5622fdeceb7f0fcef5aa448aebcfe0354fb1cfd9aaebd0c3348d4045a2a0a',
    asset: { sha256: '147a117a5fa5c6401b68f75aa3396d4c30580509ca17fb9834db8a99d58f460c' } },
  { nodeId: '__art_environment_red-plum-field_2-environment', bindingReady: true,
    jobId: 'scene_6c3f44a1993aa4cb1de3de4248ba',
    sourceHash: '2670a4c73eb8ba03f0b1e52565d63602d0246ed0ed15eca908ba85f724bd409f',
    asset: { sha256: '8e935b4a3a456dad1c029438f58b60704a14c6e443f85f38226dadee90030e97' } },
];
const expected = [['field_0', 'puzzle_0', 'aftermath_0'], ['puzzle_1', 'aftermath_1'], ['puzzle_2']];
const resolve = (asset: ReviewedEnvironmentAsset, current = plans) => reviewedEnvironmentNodeIds('red-plum', asset, current);

test('the current story accepts exactly the six inspected scene mappings and excludes all three no decisions', () => {
  for (const [index, asset] of assets.entries()) assert.deepEqual(resolve(asset), expected[index]);
  const nodeIds = assets.flatMap(asset => resolve(asset));
  assert.equal(nodeIds.length, 6);
  for (const id of ['b_shed_return', 'b_cart_plum', 'aftermath_2']) {
    assert.ok(plans.has(id));
    assert.ok(!nodeIds.includes(id));
  }
});

test('a changed image job, PNG hash, environment source hash or asset identifier invalidates reuse', () => {
  for (const asset of assets) {
    for (const replacement of [
      { ...asset, jobId: 'scene_' + 'a'.repeat(28) },
      { ...asset, asset: { sha256: 'b'.repeat(64) } },
      { ...asset, sourceHash: 'c'.repeat(64) },
      { ...asset, nodeId: asset.nodeId + '-replacement' },
    ]) assert.deepEqual(resolve(replacement), []);
  }
});

test('unapproved and incomplete image binding evidence never authorizes placement', () => {
  for (const asset of assets) {
    assert.deepEqual(resolve({ ...asset, bindingReady: false }), []);
    assert.deepEqual(resolve({ ...asset, jobId: undefined }), []);
    assert.deepEqual(resolve({ ...asset, asset: undefined }), []);
  }
});

test('each changed scene source invalidates only that target and keeps unchanged sibling mappings', () => {
  for (const [index, asset] of assets.entries()) {
    for (const id of expected[index]) {
      const changed = new Map(plans);
      changed.set(id, { ...changed.get(id)!, sourceHash: 'd'.repeat(64) });
      assert.deepEqual(resolve(asset, changed), expected[index].filter(nodeId => nodeId !== id));
    }
  }
});

test('blocked, absent, non-scene or mis-keyed target plans cannot retain a reviewed mapping', () => {
  for (const [index, asset] of assets.entries()) {
    for (const id of expected[index]) {
      const original = plans.get(id)!;
      const invalid: (ShortAssetPlan | undefined)[] = [
        { ...original, blocked: 'SOURCE_CHANGED_REQUIRES_OWNER_REFRESH' },
        { ...original, kind: 'environment' },
        { ...original, nodeId: 'another_node' },
        undefined,
      ];
      for (const scene of invalid) {
        const changed = new Map(plans);
        if (scene) changed.set(id, scene); else changed.delete(id);
        assert.deepEqual(resolve(asset, changed), expected[index].filter(nodeId => nodeId !== id));
      }
    }
  }
});

test('world identity is checked on both the request and every target plan without mutating inputs', () => {
  const before = structuredClone({ assets, plans });
  for (const asset of assets) {
    assert.deepEqual(reviewedEnvironmentNodeIds('blue-blood', asset, plans), []);
    const otherWorld = new Map([...plans].map(([id, plan]) => [id, { ...plan, worldId: 'blue-blood' }]));
    assert.deepEqual(resolve(asset, otherWorld), []);
    resolve(asset);
  }
  assert.deepEqual({ assets, plans }, before);
});
