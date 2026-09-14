import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { createHash } from 'node:crypto';
import { getWorld } from '../server/worlds.ts';
import { artBindingSource } from '../shared/art-binding-source.ts';
import { withPublishedArt } from '../src/published-art.ts';
import { sceneCharacterPresentation } from '../src/scene-character-art.ts';
import type { CutoutSource } from '../src/character-cutouts.ts';
import { authoredWorlds } from '../content/worlds.ts';

const digest = (world: ReturnType<typeof getWorld>) => createHash('sha256').update(artBindingSource(world!)).digest('hex');
const evidence = [
  ['arrival', 'scene_35af2d5bdf4c27d6a5e92b47b02d', 'e4f75be5f3fa939a6c9aae96021b1734fa669a0554f5647fe36610c21b70731f', 'ceda84b21b285975b6d0883232a451ed60e025a57f17b03115b5b439cc3a12c6', ['arrival', 'field_0', 'puzzle_0', 'aftermath_0']],
  ['field_1', 'scene_792e64c43741af9f7d05a29a506a', 'e4b5622fdeceb7f0fcef5aa448aebcfe0354fb1cfd9aaebd0c3348d4045a2a0a', '147a117a5fa5c6401b68f75aa3396d4c30580509ca17fb9834db8a99d58f460c', ['field_1', 'puzzle_1', 'aftermath_1']],
  ['field_2', 'scene_6c3f44a1993aa4cb1de3de4248ba', '2670a4c73eb8ba03f0b1e52565d63602d0246ed0ed15eca908ba85f724bd409f', '8e935b4a3a456dad1c029438f58b60704a14c6e443f85f38226dadee90030e97', ['field_2', 'puzzle_2']],
] as const;

function fixture(t: TestContext) {
  const original = structuredClone(getWorld('1930445234262750503')!);
  const assets: CutoutSource[] = evidence.map(([nodeId, jobId, sourceHash, sha256]) => ({
    nodeId: `__art_environment_red-plum-${nodeId}-environment`, jobId, sourceHash,
    assetKind: 'environment', review: 'approved', bindingReady: true, gameReady: false,
    asset: { url: `/generated-art/${jobId}.png`, sha256 },
  }));
  const placements = Object.fromEntries(assets.map((row, i) => [row.nodeId,
    { sourceHash: row.sourceHash!, nodeIds: [...evidence[i][4]] as string[] }]));
  const entry = { worldId: original.id, storyId: original.storyId, version: original.version,
    bindingSourceHash: digest(original), assets, environmentPlacements: placements };
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => new Response(JSON.stringify(
    String(input).endsWith('character-cutouts.json') ? { schemaVersion: 1, entries: [] }
      : { bindingPolicy: 'style-first-approved-current-v1', worlds: [entry] })));
  return { original, assets, entry, placements };
}

test('three exact legacy environments retain their original nodes and only six individually reviewed destinations', async t => {
  const f = fixture(t), before = structuredClone(f.original);
  // Valid but unreviewed candidates in publication must not become implicit approval.
  for (const placement of Object.values(f.placements)) placement.nodeIds.push('aftermath_2', 'b_cart_plum');
  const bound = await withPublishedArt(f.original);
  const expected = evidence.flatMap((item, index) => item[4].map(nodeId => [nodeId, f.assets[index].asset.url]));
  assert.equal(Object.values(bound.nodes).filter(node => node.background).length, 9);
  for (const [nodeId, url] of expected) {
    assert.equal(bound.nodes[nodeId].background, url, nodeId);
    assert.equal(bound.nodes[nodeId].backgroundArtKind, 'environment', nodeId);
  }
  assert.equal(bound.nodes.aftermath_2.background, '');
  assert.equal(bound.nodes.b_cart_plum.background, '');
  assert.equal(bound.background, '');
  assert.equal(digest(bound), digest(before));
  assert.deepEqual(f.original, before);
});

test('exact reviewed expansion revokes on changed image, identity, source, review, publication or current story', async t => {
  const f = fixture(t), originalAssets = structuredClone(f.assets);
  for (const kind of ['sha', 'job', 'source', 'review', 'ready', 'url', 'valid-other-url', 'unknown-node', 'withdrawn-node']) {
    f.entry.assets = structuredClone(originalAssets);
    for (const [index, row] of f.entry.assets.entries()) {
      const placement = f.placements[row.nodeId];
      placement.sourceHash = row.sourceHash!;
      placement.nodeIds = [...evidence[index][4]];
      if (kind === 'sha') row.asset.sha256 = 'f'.repeat(64);
      if (kind === 'job') row.jobId = `scene_${'e'.repeat(28)}`;
      if (kind === 'source') row.sourceHash = placement.sourceHash = 'd'.repeat(64);
      if (kind === 'review') row.review = 'rejected';
      if (kind === 'ready') row.bindingReady = false;
      if (kind === 'url') row.asset.url = '/assets/old-scenery.webp';
      if (kind === 'valid-other-url') row.asset.url = `/generated-art/scene_${'e'.repeat(28)}.png`;
      if (kind === 'unknown-node') placement.nodeIds.push('not-a-node');
      if (kind === 'withdrawn-node') placement.nodeIds = [];
    }
    const bound = await withPublishedArt(f.original);
    assert(Object.values(bound.nodes).every(node => node.background === ''), kind);
  }
  f.entry.assets = originalAssets;
  for (const [index, row] of f.entry.assets.entries()) f.placements[row.nodeId] = { sourceHash: row.sourceHash!, nodeIds: [...evidence[index][4]] };
  f.original.nodes.arrival.text.push('Current story has a newly changed scene.');
  f.entry.bindingSourceHash = digest(f.original);
  const changedStory = await withPublishedArt(f.original);
  assert(Object.values(changedStory.nodes).every(node => node.background === ''));
});

test('approved CG remains default with no actor overlay when reviewed environments reach the same node', async t => {
  const f = fixture(t);
  const cg: CutoutSource = { nodeId: 'arrival', jobId: `scene_${'9'.repeat(28)}`, sourceHash: '8'.repeat(64),
    assetKind: 'scene', review: 'approved', bindingReady: true, gameReady: true,
    asset: { url: `/generated-art/scene_${'9'.repeat(28)}.png`, sha256: '9'.repeat(64) } };
  f.entry.assets.push(cg);
  const bound = await withPublishedArt(f.original);
  assert.equal(bound.nodes.arrival.background, cg.asset.url);
  assert.equal(bound.nodes.arrival.backgroundArtKind, 'scene');
  assert.equal(bound.nodes.arrival.artSceneVariants?.length, 2);
  assert(bound.nodes.arrival.artSceneVariants?.some(row => row.url === f.assets[0].asset.url && row.kind === 'environment'));
  for (const text of bound.nodes.arrival.text) assert.equal(sceneCharacterPresentation(bound, bound.nodes.arrival, text), null);
});

test('tiger environments bind only three reviewed destinations and retain the rejected scene through list changes', async t => {
  const original = structuredClone(getWorld('1962166083206242442')!);
  const before = structuredClone(original);
  const assets: CutoutSource[] = [
    { nodeId: '__art_environment_north-new-den', jobId: 'scene_d49bebf79ac731606fdd2308e8bf',
      sourceHash: 'd152bef39b8ae2ef86d874506a4c6d95622c9710e7e57aab078a097bd5a87b64', assetKind: 'environment',
      review: 'approved', bindingReady: true, gameReady: false,
      asset: { url: '/generated-art/scene_d49bebf79ac731606fdd2308e8bf.png', sha256: '3101c9f9fc5c1706da0dbc974f1d1e33fa73b8f49c3e983533d5c86aae3b2f35' } },
    { nodeId: '__art_environment_ridge-signal', jobId: 'scene_56f77de0b3addfc2362968423d0c',
      sourceHash: '7887437e3a46f86814a27e7ec5fa032b90a02ccda9e13798aa25427d3dffec5c', assetKind: 'environment',
      review: 'approved', bindingReady: true, gameReady: false,
      asset: { url: '/generated-art/scene_56f77de0b3addfc2362968423d0c.png', sha256: 'aea06439c891f02cf2506a6c5db8060c218ef740efdfb1e045401abefa8d7683' } },
  ];
  const placements = { [assets[0].nodeId]: { sourceHash: assets[0].sourceHash!, nodeIds: ['b_mountain_good', 'b_mountain_small'] },
    [assets[1].nodeId]: { sourceHash: assets[1].sourceHash!, nodeIds: ['b_border_dawn', 'b_signal'] } };
  const entry = { worldId: original.id, storyId: original.storyId, version: original.version,
    bindingSourceHash: digest(original), assets, environmentPlacements: placements };
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => new Response(JSON.stringify(
    String(input).endsWith('character-cutouts.json') ? { schemaVersion: 1, entries: [] }
      : { bindingPolicy: 'style-first-approved-current-v1', worlds: [entry] })));
  const bound = await withPublishedArt(original);
  assert.equal(Object.values(bound.nodes).filter(node => node.background).length, 3);
  for (const id of placements[assets[0].nodeId].nodeIds) assert.equal(bound.nodes[id].background, assets[0].asset.url);
  assert.equal(bound.nodes.b_border_dawn.background, assets[1].asset.url);
  assert.equal(bound.nodes.b_signal.background, '');
  assert.equal(bound.nodes.b_signal.artSceneVariants, undefined);
  assert.deepEqual(original, before);
  assert.equal(digest(bound), digest(before));
  placements[assets[1].nodeId].nodeIds = ['b_signal'];
  const singleton = await withPublishedArt(original);
  assert.equal(singleton.nodes.b_signal.background, '');
  assert.equal(singleton.nodes.b_signal.artSceneVariants, undefined);
  placements[assets[1].nodeId].nodeIds = ['b_border_dawn'];
  assert.equal((await withPublishedArt(original)).nodes.b_border_dawn.background, assets[1].asset.url);
  const cg: CutoutSource = { nodeId: 'b_border_dawn', jobId: `scene_${'7'.repeat(28)}`, sourceHash: '7'.repeat(64),
    assetKind: 'scene', review: 'approved', bindingReady: true, gameReady: true,
    asset: { url: `/generated-art/scene_${'7'.repeat(28)}.png`, sha256: '7'.repeat(64) } };
  assets.push(cg);
  const withCg = await withPublishedArt(original);
  assert.equal(withCg.nodes.b_border_dawn.background, cg.asset.url);
  assert.equal(withCg.nodes.b_border_dawn.backgroundArtKind, 'scene');
  assert.equal(withCg.nodes.b_border_dawn.artSceneVariants?.length, 2);
  for (const text of withCg.nodes.b_border_dawn.text) assert.equal(sceneCharacterPresentation(withCg, withCg.nodes.b_border_dawn, text), null);
  assets.pop();
  const goodSha = assets[1].asset.sha256;
  assets[1].asset.sha256 = 'f'.repeat(64);
  assert.equal((await withPublishedArt(original)).nodes.b_border_dawn.background, '');
  assets[1].asset.sha256 = goodSha;
  original.nodes.b_border_dawn.text.push('Changed current scene.');
  entry.bindingSourceHash = digest(original);
  assert.equal(Object.values((await withPublishedArt(original)).nodes).filter(node => node.background).length, 0);
});

for (const fixture of [
  { worldId: 'harvest-box', nodeId: '__art_environment_temporary-dike', jobId: 'scene_f22991d07ae557b842fd30b78b13',
    sourceHash: 'e67d7c50afa6afcb2fad2843fa95cf8ef19f81abc403d33b0053cbe040677b40',
    sha256: '98c1490fee1e2878e286a46cc99ba0029ed0fc9ffba1ea2c33dd3c5e78421418', accepted: 'sect_dike', rejected: ['sect_sword', 'sect_waterline'] },
  { worldId: 'ming-whisper', nodeId: '__art_environment_canal-lock', jobId: 'scene_d661f57a45e7ef2d6581bd638126',
    sourceHash: '0b4936fce448ef86e963f9fc32831cdbc51f282a6514c56e7262835b674aea50',
    sha256: 'ae711ac457633b38c1e49bb1fd50917306381ae65e47db185a9b35d9ffdf42f1', accepted: 'canal_checkpoint', rejected: ['canal_seal'] },
  { worldId: 'hollow-immortals', nodeId: '__art_environment_ravine-bridge', jobId: 'scene_fa9b4505a8780e3fbb64e9c612db',
    sourceHash: '0eee217d4c1a815a458b026aff070cbb802631757d8793a30c0484e0e6022d2a',
    sha256: '472f9bf7136cebce7c0353f9064bae9c4088c16d26df1a818d17dae1f1f92eb9', accepted: 'b_copper_stairs', rejected: ['b_copper_bridge'] },
  { worldId: 'wrong-realm', nodeId: '__art_environment_herbal-dispensary', jobId: 'scene_898fa562a5bd6bab8a4f3bc5e680',
    sourceHash: 'f05b5a028ee110cecbb5a9aa69b1d042b70f274370ce50db86630e01e75993f8',
    sha256: '2b8ef849aed1adeebd9bc0b3dfa5558e33721b88860e147afc59296318d2f201', accepted: 'b_herbalist', rejected: ['b_medicine_realm'] },
  { worldId: 'palace-ledger', nodeId: '__art_environment_old-courtyard', jobId: 'scene_a608fd150e1d908224d415bec451',
    sourceHash: '58c68c60b16d35b8a466e26f79566150e4c6ae9cbf965409c4b5c3655890661c',
    sha256: '408f140fb66cb13b065f7930fa0c41694af6fb4590e31ffd75b2b6feb057bbef', accepted: '', rejected: ['b_merchant_bad', 'b_merchant_signed', 'b_merchant_small'] },
  { worldId: 'ming-whisper', nodeId: '__art_environment_post-gate', jobId: 'scene_09928d307956d3941ec9b56bf1a0',
    sourceHash: 'ec8417cf259d32e0113be292b0d95d2301f72e6baecedaa3c602dc0f2b7c7eed',
    sha256: '4f86b25a5721d3571a0a75fa21723e7e522f49e0c412ab0f4eb9f42ba63282c7', accepted: 'cart_check', rejected: ['dispatch'] },
  { worldId: 'palace-ledger', nodeId: '__art_environment_city-shop', jobId: 'scene_9ba43cf6bef4f101394f0e10daa7',
    sourceHash: '95cd4f8afbbc6421649b0321e40e579da71f543b7dfb5de78d1942f25adb7c8f',
    sha256: '5e72dc309403c846901191ae37c66c37195bcc180b043e02e727c49bfc3ae46e', accepted: 'b_city_shop', rejected: ['b_return_letter', 'b_shop_morning'] },
  { worldId: 'harvest-box', nodeId: '__art_environment_farm-main-hall', jobId: 'scene_301f6e88ff63f171070052823fdd',
    sourceHash: '3af3332efbfb51b95dc2ce14c9004c9a817f671c8a4a93bea268d6dcb7abd033',
    sha256: 'd7649d29229c2f7558d5c8118c1beb774bf21174feeca20a6934c562b76093b8', accepted: 'separation', rejected: ['open_box', 'ending_washed_harvest'] },
  { worldId: 'palace-ledger', nodeId: '__art_environment_palace-gate', jobId: 'scene_e36652fe63ce6b42b87b2bf0f0f7',
    sourceHash: 'd76dd8d0c8c48b9fa46b6987a04ce7438494071216bd48ccb125dfcb3e8c5b05',
    sha256: 'ebfd9cf5d7077517f3eb1459702157de109e7c106eeb3c59399fa16ad27220b4', accepted: 'field_3', rejected: ['b_gate_pass', 'b_gate_reply'] },
  { worldId: 'palace-ledger', nodeId: '__art_environment_servant-office', jobId: 'scene_a40a2da1a3aaf1eafde673cd3e26',
    sourceHash: '15963a726780bb85896ce8693c5dfded90c93691be2073e329326863e0b77047',
    sha256: 'fb977b97de55c04f436324c9671a6d293239b4c5de9684566ab8d09b409d047c', accepted: 'ending_budget', rejected: ['b_toll'] },
  { worldId: 'tiger-shelter', nodeId: '__art_environment_relay-kitchen', jobId: 'scene_16f0a90f0d1631ad9b3644c1b93f',
    sourceHash: '8abe7e45b4af3df4d9984b9356cfef4aa4c4e0f5c8525aad3d6f9ceec412cc27',
    sha256: '7bc38ffc594b5aa4eb5e5cdc69dc7fcbf64cb39180bf9f7ead12a7a488044dd9', accepted: 'b_keeper', rejected: ['b_inn', 'b_court_small'] },
  { worldId: 'tiger-shelter', nodeId: '__art_environment_lee-stone-nest', jobId: 'scene_c2dd3159485a270507cea0e2b8d0',
    sourceHash: 'c3c5d7c620b7bd61bb27c79cde3be7751c0b17e48bd71b1f4259c47561615ef6',
    sha256: '290236543c2265dc38806ec9dddf5f6a07dcab716da0c35690d8190948f928b1', accepted: '', rejected: ['b_wind', 'b_wolf_parley'] },
  { worldId: 'rotten-pilgrimage', nodeId: '__art_environment_old-ferry', jobId: 'scene_723073dba00fd7f8c36686a76b9a',
    sourceHash: '3c0c1a1047555217b0e96198e69a3c5aca3b5154d3a35fb47c736cb801d2fdf2',
    sha256: 'ccc65e94b60790d62e796e6c2176c1b313a5087325cfa12010ef2c34d746674d', accepted: 'companion', rejected: ['old_road'] },
  { worldId: 'six-roots', nodeId: '__art_environment_ancestral-night-school', jobId: 'scene_c9d2981dd829ce87fe8fcc464359',
    sourceHash: '04189171908c6acc52bb79db8ef0004133adfd61674b2976a4c97feef3fb8a1b',
    sha256: '8fda549ecf4946e195804adab576a417b7ae607d93bd1652f110709a67e51a45', accepted: 'b_rain_class', rejected: ['b_grain_class', 'b_school_good'] },
]) test(`${fixture.worldId} accepts only its reviewed pre-choice environment and excludes conflicting action states`, async t => {
  const original = getWorld(authoredWorlds.find(world => world.id === fixture.worldId)!.storyId)!;
  const asset: CutoutSource = { nodeId: fixture.nodeId, jobId: fixture.jobId, sourceHash: fixture.sourceHash,
    assetKind: 'environment', review: 'approved', bindingReady: true, gameReady: false,
    asset: { url: `/generated-art/${fixture.jobId}.png`, sha256: fixture.sha256 } };
  const placement = { sourceHash: fixture.sourceHash, nodeIds: [fixture.accepted, ...fixture.rejected].filter(Boolean) };
  const entry = { worldId: original.id, storyId: original.storyId, version: original.version, bindingSourceHash: digest(original),
    assets: [asset], environmentPlacements: { [fixture.nodeId]: placement } };
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => new Response(JSON.stringify(
    String(input).endsWith('character-cutouts.json') ? { schemaVersion: 1, entries: [] }
      : { bindingPolicy: 'style-first-approved-current-v1', worlds: [entry] })));
  const bound = await withPublishedArt(original);
  assert.equal(Object.values(bound.nodes).filter(node => node.background).length, fixture.accepted ? 1 : 0);
  if (fixture.accepted) assert.equal(bound.nodes[fixture.accepted].background, asset.asset.url);
  assert.equal(digest(bound), digest(original));
  for (const rejected of fixture.rejected) {
    assert.equal(bound.nodes[rejected].background, '');
    assert.equal(bound.nodes[rejected].artSceneVariants, undefined);
    placement.nodeIds = [rejected];
    assert.equal(Object.values((await withPublishedArt(original)).nodes).filter(node => node.background).length, 0);
  }
});
