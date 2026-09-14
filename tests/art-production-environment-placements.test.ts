import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import { authoredWorlds } from '../content/worlds.ts';
import type { ArtWorldInput } from '../shared/production.ts';
import { buildShortPlans, type ShortAssetPlan } from '../server/art-production-short.ts';
import { sourceEnvironmentPlacements } from '../server/art-production-environment-placements.ts';

const sourceHash = 'a'.repeat(64);

function fixture(nodeIds: string[], worldId = 'fixture-world') {
  const world: ArtWorldInput = {
    id: worldId, storyId: 'fixture-story', title: 'Fixture', version: 'r1', characters: [],
    source: { title: '', author: '', url: '' },
    nodes: Object.fromEntries(nodeIds.map(id => [id, {
      id, chapter: '', title: id, location: 'Same location', time: 'Now',
      background: '/assets/fixture.webp', text: ['Current source action'], choices: [],
    }])),
  };
  const plan = (nodeId: string, kind: ShortAssetPlan['kind'], sourceFacts: string[] = []): ShortAssetPlan => ({
    worldId, owner: 'painted-background', nodeId, kind, sourceHash, sourceFacts, prompt: '', dependencies: [],
  });
  const scenes = nodeIds.map(id => plan(id, 'scene'));
  return { world, plan, scenes };
}

const approved = (plan: ShortAssetPlan) => ({
  nodeId: plan.nodeId, assetKind: plan.kind, sourceHash: plan.sourceHash, bindingReady: true,
});
const fact = (nodeId: string) => `节点 ${nodeId}；Same location；Now。`;

test('only explicit node headers bind semantic environments; similar names and prose are not evidence', () => {
  const { world, plan, scenes } = fixture(['gate', 'gate_side', 'post_gate']);
  const environment = plan('__art_environment_post-gate', 'environment', [
    fact('gate'), fact('gate'), `旁白提到${fact('gate_side')}`, 'post_gate 与环境同名。', fact('missing'),
  ]);
  const plans = [...scenes, environment], assets = [approved(environment)];
  const before = structuredClone({ world, plans, assets });
  const result = sourceEnvironmentPlacements(world, plans, assets);
  assert.deepEqual(result.environmentPlacements, {
    [environment.nodeId]: { sourceHash, nodeIds: ['gate'] },
  });
  assert.deepEqual(result.environmentPlacementDecisions, []);
  assert.deepEqual({ world, plans, assets }, before);
});

test('source mismatches and unapproved assets are excluded; blocked scenes cannot receive an environment', () => {
  const { world, plan, scenes } = fixture(['current', 'changed']);
  const environment = plan('__art_environment_court', 'environment', [fact('current'), fact('changed')]);
  scenes.find(scene => scene.nodeId === 'changed')!.blocked = 'SOURCE_CHANGED_REQUIRES_OWNER_REFRESH';
  const plans = [...scenes, environment];
  assert.deepEqual(sourceEnvironmentPlacements(world, plans, [{
    ...approved(environment), sourceHash: 'b'.repeat(64),
  }]).environmentPlacements, {});
  assert.deepEqual(sourceEnvironmentPlacements(world, plans, [{
    ...approved(environment), bindingReady: false,
  }]).environmentPlacements, {});
  assert.deepEqual(sourceEnvironmentPlacements(world, plans, [approved(environment)]).environmentPlacements, {
    [environment.nodeId]: { sourceHash, nodeIds: ['current'] },
  });
  assert.deepEqual(sourceEnvironmentPlacements(world, [...scenes, {
    ...environment, blocked: 'SOURCE_CHANGED_REQUIRES_OWNER_REFRESH',
  }], [approved(environment)]).environmentPlacements, {});
});

test('standalone world/node source references require the exact current world and node', () => {
  const { world, plan, scenes } = fixture(['dinner', 'breakfast']);
  const environment = plan('__art_environment_dining', 'environment', [
    `${world.id}/dinner`, ` ${world.id}/breakfast `, 'other-world/dinner',
    `${world.id}/missing`, `旁白 ${world.id}/dinner`, `${world.id}/dinner and more`,
  ]);
  assert.deepEqual(sourceEnvironmentPlacements(world, [...scenes, environment], [approved(environment)])
    .environmentPlacements[environment.nodeId].nodeIds, ['breakfast', 'dinner']);
});

test('exact legacy environment IDs retain their node without relying on source-fact headers', () => {
  const { world, plan, scenes } = fixture(['station']);
  const legacy = plan(`__art_environment_${world.id}-station-environment`, 'environment');
  const similar = plan('__art_environment_other-world-station-environment', 'environment');
  const result = sourceEnvironmentPlacements(world, [...scenes, legacy, similar], [approved(legacy), approved(similar)]);
  assert.deepEqual(result.environmentPlacements[legacy.nodeId], { sourceHash, nodeIds: ['station'] });
  assert.deepEqual(result.environmentPlacements[similar.nodeId], { sourceHash, nodeIds: [] });
  assert.deepEqual(result.environmentPlacementDecisions, []);
});

test('cart_check belongs only to post-gate regardless of plan or asset order', () => {
  const { world, plan, scenes } = fixture(['cart_check', 'granary', 'dispatch'], 'ming-whisper');
  const grain = plan('__art_environment_grain-store', 'environment', [fact('granary'), fact('cart_check')]);
  const gate = plan('__art_environment_post-gate', 'environment', [fact('dispatch'), fact('cart_check')]);
  const plans = [...scenes, grain, gate], assets = [approved(grain), approved(gate)];
  const result = sourceEnvironmentPlacements(world, plans, assets);
  assert.deepEqual(result, sourceEnvironmentPlacements(world, [...plans].reverse(), [...assets].reverse()));
  assert.deepEqual(result.environmentPlacements[grain.nodeId].nodeIds, ['granary']);
  assert.deepEqual(result.environmentPlacements[gate.nodeId].nodeIds, ['cart_check', 'dispatch']);
  assert.deepEqual(result.environmentPlacementDecisions, [{
    nodeId: 'cart_check', assetNodeIds: [grain.nodeId, gate.nodeId], selectedAssetNodeId: gate.nodeId,
    reason: 'explicit-cart-check-post-gate-selection',
  }]);
  const unavailableGate = sourceEnvironmentPlacements(world, plans, [approved(grain), {
    ...approved(gate), bindingReady: false,
  }]);
  assert.deepEqual(unavailableGate.environmentPlacements[grain.nodeId].nodeIds, ['granary']);
  assert.equal(unavailableGate.environmentPlacementDecisions[0].selectedAssetNodeId, null);
});

test('unknown approved overlaps remain unassigned while each environment keeps its exclusive nodes', () => {
  const { world, plan, scenes } = fixture(['shared', 'first', 'second']);
  const first = plan('__art_environment_first', 'environment', [fact('shared'), fact('first')]);
  const second = plan('__art_environment_second', 'environment', [fact('shared'), fact('second')]);
  const plans = [...scenes, first, second];
  const result = sourceEnvironmentPlacements(world, plans, [approved(first), approved(second)]);
  assert.deepEqual(result.environmentPlacements[first.nodeId].nodeIds, ['first']);
  assert.deepEqual(result.environmentPlacements[second.nodeId].nodeIds, ['second']);
  assert.deepEqual(result.environmentPlacementDecisions, [{
    nodeId: 'shared', assetNodeIds: [first.nodeId, second.nodeId], selectedAssetNodeId: null,
    reason: 'ambiguous-explicit-source-overlap',
  }]);
  const pendingSecond = sourceEnvironmentPlacements(world, plans, [approved(first), {
    ...approved(second), bindingReady: false,
  }]);
  assert.deepEqual(pendingSecond.environmentPlacements[first.nodeId].nodeIds, ['first', 'shared']);
  assert.deepEqual(pendingSecond.environmentPlacementDecisions, []);
});

test('current owner books supply semantic memberships and per-asset hashes without coordination snapshots', async () => {
  const plans = await buildShortPlans(resolve(), authoredWorlds);
  const ming = authoredWorlds.find(world => world.id === 'ming-whisper')!;
  const selected = plans.filter(plan => plan.worldId === ming.id
    && ['__art_environment_grain-store', '__art_environment_post-gate'].includes(plan.nodeId));
  assert.equal(selected.length, 2);
  const result = sourceEnvironmentPlacements(ming, plans, selected.map(approved));
  assert.deepEqual(result.environmentPlacements.__art_environment_grain_store, undefined);
  assert.deepEqual(result.environmentPlacements['__art_environment_grain-store'].nodeIds, ['granary']);
  assert.deepEqual(result.environmentPlacements['__art_environment_post-gate'].nodeIds, ['cart_check', 'dispatch']);
  for (const plan of selected) assert.equal(result.environmentPlacements[plan.nodeId].sourceHash, plan.sourceHash);
  const pilgrimage = authoredWorlds.find(world => world.id === 'rotten-pilgrimage')!;
  const heaven = plans.find(plan => plan.worldId === pilgrimage.id && plan.nodeId === '__art_environment_heaven-gate')!;
  assert.ok(heaven);
  assert.deepEqual(sourceEnvironmentPlacements(pilgrimage, plans, [approved(heaven)])
    .environmentPlacements[heaven.nodeId].nodeIds, ['gate_refugees', 'heaven_gate']);
});
