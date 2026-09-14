import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { createHash } from 'node:crypto';
import type { GameWorld } from '../shared/types.ts';
import { artBindingSource } from '../shared/art-binding-source.ts';
import { withPublishedArt } from '../src/published-art.ts';
import type { CharacterCutout, CutoutSource } from '../src/character-cutouts.ts';
import { sceneCharacterPresentation } from '../src/scene-character-art.ts';

const source = (nodeId: string, assetKind: string, digit = '1'): CutoutSource => ({
  nodeId, assetKind, jobId: `scene_${digit.repeat(28)}`, sourceHash: 'a'.repeat(64),
  review: 'approved', bindingReady: true, gameReady: assetKind === 'scene',
  asset: { url: `/generated-art/scene_${digit.repeat(28)}.png`, sha256: digit.repeat(64),
    width: assetKind === 'scene' ? 4096 : 1024, height: assetKind === 'scene' ? 2304 : 1536, native4k: assetKind === 'scene' },
});
const digest = (world: GameWorld) => createHash('sha256').update(artBindingSource(world)).digest('hex');
function fixture(t: TestContext) {
  const original: GameWorld = {
    id: 'placement-world', storyId: 'placement-story', version: 'r1', title: 'Placement fixture', subtitle: '',
    player: { name: 'Player', role: 'player' }, introduction: [], objective: '', startNodeId: 'arrival',
    characters: [{ id: 'player', name: 'Player', role: 'player', description: 'Player',
      portrait: '/assets/old-player.webp', portraits: { main: '/assets/old-player.webp' } }],
    nodes: Object.fromEntries(['arrival', 'return', 'illustrated'].map(id => [id, {
      id, chapter: '', title: id, location: 'Boat workshop', time: '', background: '/assets/room.webp',
      text: ['Guide opens the door.'], choices: [],
    }])),
    source: { title: 'Original source', author: '', url: '' }, cover: '/source-cover.png', background: '/assets/room.webp',
    summary: '', ink: {}, clueVariables: {}, adaptation: { scope: 'original-seed', adultCast: true, note: '' },
  };
  const environment = source('__art_environment_boat-workshop', 'environment');
  const entry = {
    worldId: original.id, storyId: original.storyId, version: original.version, bindingSourceHash: digest(original),
    assets: [environment], supportingCharacters: [{ id: 'guide', name: 'Guide', role: 'guide', description: 'Source-book guide' }],
    sceneCharacters: { arrival: ['guide'], return: ['guide'], illustrated: ['guide'] },
    environmentPlacements: {
      [environment.nodeId]: { sourceHash: environment.sourceHash!, nodeIds: ['arrival'] },
    } as Record<string, { sourceHash: string; nodeIds: string[] }>,
  };
  const manifest = { bindingPolicy: 'style-first-approved-current-v1', worlds: [entry] };
  const cutouts = { schemaVersion: 1, entries: [] as CharacterCutout[] };
  t.mock.method(globalThis, 'fetch', async (url: string | URL | Request) =>
    new Response(JSON.stringify(String(url).endsWith('/character-cutouts.json') ? cutouts : manifest)));
  return { original, environment, entry, manifest, cutouts };
}
function reaction(f: ReturnType<typeof fixture>) {
  const row = source('__art_reaction_guide', 'character-reaction', '2');
  f.entry.assets.push(row);
  const proof: CharacterCutout = {
    worldId: f.original.id, nodeId: row.nodeId, jobId: row.jobId!, sourceHash: row.sourceHash!,
    sourceUrl: row.asset.url, sourceSha256: row.asset.sha256,
    url: `/generated-art/cutouts/${row.jobId}-${row.asset.sha256.slice(0, 12)}.png`,
    sha256: 'b'.repeat(64), width: row.asset.width!, height: row.asset.height!, review: 'approved',
  };
  f.cutouts.entries.push(proof);
  return { row, proof };
}

test('a current single-node environment binds only its explicit scene and clears old artwork fallbacks', async t => {
  const f = fixture(t), before = structuredClone(f.original);
  const bound = await withPublishedArt(f.original);
  assert.equal(bound.nodes.arrival.background, f.environment.asset.url);
  assert.equal(bound.nodes.arrival.backgroundArtKind, 'environment');
  assert.deepEqual(bound.nodes.arrival.artSceneVariants, [{ ...f.environment.asset, kind: 'environment' }]);
  for (const id of ['return', 'illustrated']) {
    assert.equal(bound.nodes[id].background, '');
    assert.equal(bound.nodes[id].backgroundArtKind, undefined);
    assert.equal(bound.nodes[id].artSceneVariants, undefined);
  }
  assert.equal(bound.background, '');
  assert.equal(bound.cover, '');
  assert.equal(bound.characters[0].portrait, undefined);
  assert.equal(bound.characters[0].portraits, undefined);
  assert.deepEqual(bound.source, before.source);
  assert.equal(digest(bound), digest(before));
  assert.deepEqual(f.original, before);
});

test('both explicit scene holds stay empty until an approved single-node environment or replacement arrives', async t => {
  const f = fixture(t);
  f.original.id = f.entry.worldId = 'ming-whisper';
  const held = [
    { id: 'escort_muster', digit: '3', url: '/generated-art/scene_086b9e5b34a5b16237dac27aaaf8.png' },
    { id: 'escort_sickcamp', digit: '4', url: '/generated-art/scene_77a0a48958feec2683d35c5faa67.png' },
  ];
  for (const { id } of held) f.original.nodes[id] = { ...f.original.nodes.illustrated, id };
  f.entry.bindingSourceHash = digest(f.original);
  for (const { id, digit, url } of held) {
    f.entry.environmentPlacements[f.environment.nodeId].nodeIds = [id];
    const cg = source(id, 'scene', digit), replacementUrl = cg.asset.url;
    cg.asset.url = url;
    f.entry.assets = [f.environment, cg];
    f.environment.review = 'rejected';
    const blocked = await withPublishedArt(f.original);
    assert.equal(blocked.nodes[id].background, '', id);
    assert.equal(blocked.nodes[id].artSceneVariants, undefined, id);
    f.environment.review = 'approved';
    const environmentOnly = await withPublishedArt(f.original);
    assert.equal(environmentOnly.nodes[id].background, f.environment.asset.url, id);
    assert.equal(environmentOnly.nodes[id].backgroundArtKind, 'environment', id);
    assert.deepEqual(environmentOnly.nodes[id].artSceneVariants, [{ ...f.environment.asset, kind: 'environment' }], id);
    cg.asset.url = replacementUrl;
    const replaced = await withPublishedArt(f.original);
    assert.equal(replaced.nodes[id].background, replacementUrl, id);
    assert.equal(replaced.nodes[id].backgroundArtKind, 'scene', id);
    assert.deepEqual(replaced.nodes[id].artSceneVariants,
      [{ ...cg.asset, kind: 'scene' }, { ...f.environment.asset, kind: 'environment' }], id);
  }
});

test('semantic environment placement needs explicit current source proof and never guesses a location', async t => {
  const f = fixture(t), placement = f.entry.environmentPlacements[f.environment.nodeId];
  for (const sourceHash of ['c'.repeat(64), '', 'invalid']) {
    placement.sourceHash = sourceHash;
    const bound = await withPublishedArt(f.original);
    assert.equal(bound.nodes.arrival.background, '');
    assert.equal(bound.nodes.arrival.artSceneVariants, undefined);
  }
  delete f.entry.environmentPlacements[f.environment.nodeId];
  assert.equal((await withPublishedArt(f.original)).nodes.arrival.backgroundArtKind, undefined);
});

test('multi-node, empty and partly unknown environment mappings cannot stand in for exact scene artwork', async t => {
  const f = fixture(t), placement = f.entry.environmentPlacements[f.environment.nodeId];
  for (const nodeIds of [[], ['arrival', 'return'], ['absent'], ['__proto__'],
    ['arrival', 'absent'], ['arrival', '__proto__']]) {
    placement.nodeIds = nodeIds;
    const bound = await withPublishedArt(f.original);
    for (const node of Object.values(bound.nodes)) {
      assert.equal(node.background, '', JSON.stringify(nodeIds));
      assert.equal(node.backgroundArtKind, undefined, JSON.stringify(nodeIds));
      assert.equal(node.artSceneVariants, undefined, JSON.stringify(nodeIds));
    }
    assert.equal(bound.background, '');
  }
});

test('legacy node IDs still work and an explicit stale placement cannot fall back around the source gate', async t => {
  const f = fixture(t);
  f.environment.nodeId = '__art_environment_placement-world-arrival-environment';
  let bound = await withPublishedArt(f.original);
  assert.equal(bound.nodes.arrival.backgroundArtKind, 'environment');
  f.entry.environmentPlacements[f.environment.nodeId] = { sourceHash: 'c'.repeat(64), nodeIds: ['arrival'] };
  bound = await withPublishedArt(f.original);
  assert.equal(bound.nodes.arrival.backgroundArtKind, undefined);
});

test('environment review, SHA, URL and publication gates remain required despite a valid placement', async t => {
  const f = fixture(t), valid = structuredClone(f.environment);
  for (const change of [{ review: 'pending' }, { review: 'rejected' }, { bindingReady: false },
    { asset: { ...valid.asset, sha256: 'invalid' } }, { asset: { ...valid.asset, url: '/generated-art/unreviewed.png' } }]) {
    Object.assign(f.environment, valid, change);
    const bound = await withPublishedArt(f.original);
    assert.equal(bound.nodes.arrival.background, '');
    assert.equal(bound.nodes.arrival.backgroundArtKind, undefined);
    assert.equal(bound.nodes.arrival.artSceneVariants, undefined);
  }
  Object.assign(f.environment, valid);
  for (const change of [{ worldId: 'another-world' }, { storyId: 'another-story' }, { version: 'r2' }, { bindingSourceHash: 'f'.repeat(64) }]) {
    const identity = { worldId: f.original.id, storyId: f.original.storyId, version: f.original.version, bindingSourceHash: digest(f.original) };
    Object.assign(f.entry, identity, change);
    const bound = await withPublishedArt(f.original);
    assert.equal(bound, f.original);
    Object.assign(f.entry, identity);
  }
  f.original.nodes.arrival.text.push('The story changed after publication.');
  const stale = await withPublishedArt(f.original);
  assert.equal(stale, f.original);
});

test('qualified CG keeps priority while its exact single-node environment remains a SHA-bound variant without actor overlay', async t => {
  const f = fixture(t), cg = source('illustrated', 'scene', '3');
  f.entry.environmentPlacements[f.environment.nodeId].nodeIds = ['illustrated'];
  reaction(f);
  f.entry.assets.push(cg);
  const bound = await withPublishedArt(f.original);
  assert.equal(bound.nodes.illustrated.background, cg.asset.url);
  assert.equal(bound.nodes.illustrated.backgroundArtKind, 'scene');
  assert.deepEqual(bound.nodes.illustrated.artSceneVariants,
    [{ ...cg.asset, kind: 'scene' }, { ...f.environment.asset, kind: 'environment' }]);
  assert.equal(bound.nodes.illustrated.stageCharacter, undefined);
  assert.equal(sceneCharacterPresentation(bound, bound.nodes.illustrated), null);
  assert.equal(bound.nodes.arrival.background, '');
  assert.equal(bound.nodes.arrival.artSceneVariants, undefined);
  cg.gameReady = false;
  const environmentOnly = await withPublishedArt(f.original);
  assert.equal(environmentOnly.nodes.illustrated.background, f.environment.asset.url);
  assert.deepEqual(environmentOnly.nodes.illustrated.artSceneVariants, [{ ...f.environment.asset, kind: 'environment' }]);
});

test('a qualified exact scene retains its own native resolution and default priority', async t => {
  const f = fixture(t), cg = source('illustrated', 'scene', '3');
  f.entry.environmentPlacements[f.environment.nodeId].nodeIds = ['illustrated'];
  cg.asset.native4k = false;
  cg.asset.width = 1672;
  cg.asset.height = 941;
  f.entry.assets.push(cg);
  const bound = await withPublishedArt(f.original);
  assert.equal(bound.nodes.illustrated.background, cg.asset.url);
  assert.equal(bound.nodes.illustrated.backgroundArtKind, 'scene');
  assert.deepEqual(bound.nodes.illustrated.artSceneVariants,
    [{ ...cg.asset, kind: 'scene' }, { ...f.environment.asset, kind: 'environment' }]);
});

test('an environment variant cannot bypass its scene target, source hash or exact asset SHA gates', async t => {
  const f = fixture(t), cg = source('illustrated', 'scene', '3');
  f.entry.assets.push(cg);
  const placement = f.entry.environmentPlacements[f.environment.nodeId];
  const validAsset = structuredClone(f.environment.asset);
  for (const invalid of ['different-node', 'multiple-nodes', 'unknown-node', 'stale-source', 'invalid-sha', 'invalid-url']) {
    placement.nodeIds = ['illustrated'];
    placement.sourceHash = f.environment.sourceHash!;
    f.environment.asset = structuredClone(validAsset);
    if (invalid === 'different-node') placement.nodeIds = ['arrival'];
    if (invalid === 'multiple-nodes') placement.nodeIds = ['arrival', 'illustrated'];
    if (invalid === 'unknown-node') placement.nodeIds = ['illustrated', 'absent'];
    if (invalid === 'stale-source') placement.sourceHash = 'c'.repeat(64);
    if (invalid === 'invalid-sha') f.environment.asset.sha256 = 'invalid';
    if (invalid === 'invalid-url') f.environment.asset.url = '/assets/borrowed-room.webp';
    const bound = await withPublishedArt(f.original);
    assert.equal(bound.nodes.illustrated.background, cg.asset.url, invalid);
    assert.deepEqual(bound.nodes.illustrated.artSceneVariants, [{ ...cg.asset, kind: 'scene' }], invalid);
  }
});

test('an independent approved reaction cutout retains its supporting actor without inventing a main pose', async t => {
  const f = fixture(t), { proof } = reaction(f);
  const bound = await withPublishedArt(f.original), guide = bound.artCharacters?.find(actor => actor.id === 'guide');
  assert.ok(guide, 'supporting actor survives until the independent cutout proof is checked');
  assert.equal(guide.portraits?.main, undefined);
  assert.equal(guide.stagePortraits?.main, undefined);
  assert.equal(guide.stagePortraits?.reaction?.url, proof.url);
  assert.equal(sceneCharacterPresentation(bound, bound.nodes.arrival)?.sources[0], proof.url);
  assert.equal(digest(bound), digest(f.original));
});

test('a failed reaction derivative removes stage presence while its approved original keeps the actor introduction', async t => {
  const f = fixture(t), { proof, row } = reaction(f), valid = structuredClone(proof);
  for (const change of [{ review: 'pending' as const }, { review: 'rejected' as const },
    { sourceHash: 'd'.repeat(64) }, { sourceSha256: 'e'.repeat(64) }, { worldId: 'other' },
    { nodeId: '__art_reaction_someone_else' }, { sha256: 'invalid' }, { url: row.asset.url }]) {
    Object.assign(proof, valid, change);
    const bound = await withPublishedArt(f.original);
    assert.equal(bound.artCharacters?.length, 1, JSON.stringify(change));
    const guide = bound.artCharacters![0];
    assert.equal(guide.name, 'Guide');
    assert.equal(guide.description, 'Source-book guide');
    assert.equal(guide.portraits?.reaction, row.asset.url);
    assert.equal(guide.portraits?.main, undefined);
    assert.equal(guide.stagePortraits, undefined);
    assert.equal(bound.nodes.arrival.stageCharacter, undefined);
    assert.equal(sceneCharacterPresentation(bound, bound.nodes.arrival), null);
  }
});

test('reaction-only supporting cutouts remain off scene without explicit presence', async t => {
  const f = fixture(t);
  reaction(f);
  f.entry.sceneCharacters.arrival = [];
  const bound = await withPublishedArt(f.original);
  assert.equal(bound.artCharacters?.[0]?.stagePortraits?.reaction?.review, 'approved');
  assert.equal(sceneCharacterPresentation(bound, bound.nodes.arrival), null);
});
