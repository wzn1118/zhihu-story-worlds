import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { createHash } from 'node:crypto';
import { authoredWorlds } from '../content/worlds.ts';
import { getWorld } from '../server/worlds.ts';
import { artBindingSource } from '../shared/art-binding-source.ts';
import { withPublishedArt } from '../src/published-art.ts';

const world = () => structuredClone(getWorld(authoredWorlds.find(row => row.id === 'happy-home')!.storyId));
const asset = (nodeId: string, assetKind: string, digit: string) => ({ nodeId, assetKind,
  review: 'approved', bindingReady: true, gameReady: assetKind === 'scene',
  asset: { url: `/generated-art/scene_${digit.repeat(28)}.png`, sha256: digit.repeat(64), native4k: assetKind === 'scene' } });
function fixture(t: TestContext) {
  const original = world();
  const entry = { worldId: original.id, storyId: original.storyId, version: original.version,
    bindingSourceHash: createHash('sha256').update(artBindingSource(original)).digest('hex'),
    characterPresence: { arrival: { id: 'hong', expression: 'main', position: 'left' } },
    assets: [asset('__art_reaction_hong', 'character-reaction', '2'), asset('__art_character_hong', 'character-anchor', '1')] };
  const manifest = { bindingPolicy: 'native-4k-current-evidence-v1', worlds: [entry] };
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(manifest)));
  return { original, entry, manifest };
}

test('a legacy style-only manifest cannot remove or replace server-verified art', async t => {
  const f = fixture(t);
  f.original.characters.find(character => character.id === 'hong')!.portrait = '/generated-art/scene_abc.png';
  f.manifest.bindingPolicy = 'style-only';
  assert.equal(await withPublishedArt(f.original), f.original);
});

test('a transient manifest read failure keeps the last successfully verified art snapshot', async t => {
  const f = fixture(t), scene = asset('arrival', 'scene', '3');
  f.entry.assets.push(scene);
  const accepted = await withPublishedArt(f.original);
  assert.equal(accepted.nodes.arrival.background, scene.asset.url);
  t.mock.restoreAll();
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('SIMULATED_NETWORK_FAILURE'); });
  const retained = await withPublishedArt(accepted);
  assert.equal(retained, accepted);
  assert.equal(retained.nodes.arrival.background, scene.asset.url);
  assert.equal(retained.nodes.arrival.backgroundArtKind, 'scene');
});

test('a current release keeps mother and reaction references without applying legacy presence mappings', async t => {
  const f = fixture(t), before = structuredClone(f.original);
  const bound = await withPublishedArt(f.original);
  const hong = bound.characters.find(character => character.id === 'hong')!;
  assert.equal(hong.portraits?.main, f.entry.assets[1].asset.url);
  assert.equal(hong.portraits?.reaction, f.entry.assets[0].asset.url);
  assert.deepEqual(bound.nodes.arrival.character, before.nodes.arrival.character);
  assert.deepEqual(Object.fromEntries(Object.entries(bound.nodes).map(([id, node]) => [id, node.character])),
    Object.fromEntries(Object.entries(before.nodes).map(([id, node]) => [id, node.character])));
  assert.deepEqual(f.original, before);
});

test('the approved style-first release binds scene and cast by identity without changing pixels', async t => {
  const f = fixture(t);
  f.manifest.bindingPolicy = 'style-first-approved-current-v1';
  const scene = asset('arrival', 'scene', '3');
  f.entry.assets.push(scene);
  const bound = await withPublishedArt(f.original);
  assert.equal(bound.nodes.arrival.background, scene.asset.url);
  assert.equal(bound.characters.find(character => character.id === 'hong')!.portrait, f.entry.assets[1].asset.url);
  assert.deepEqual(bound.nodes.arrival.character, f.original.nodes.arrival.character);
  scene.review = 'rejected';
  assert.notEqual((await withPublishedArt(f.original)).nodes.arrival.background, scene.asset.url);
});

test('a legacy presence mapping cannot replace an authored actor with an opaque mother portrait', async t => {
  const f = fixture(t);
  f.original.nodes.arrival.character = { id: 'player', expression: 'reaction', position: 'right' };
  f.entry.bindingSourceHash = createHash('sha256').update(artBindingSource(f.original)).digest('hex');
  const before = structuredClone(f.original.nodes.arrival.character);
  const bound = await withPublishedArt(f.original);
  assert.equal(bound.characters.find(character => character.id === 'hong')!.portrait, f.entry.assets[1].asset.url);
  assert.deepEqual(bound.nodes.arrival.character, before);
});

test('an approved reaction without a mother stays in its character introduction and never creates stage presence', async t => {
  const f = fixture(t);
  f.entry.assets[1].bindingReady = false;
  const bound = await withPublishedArt(f.original);
  assert.equal(bound.characters.find(character => character.id === 'hong')!.portraits?.reaction, f.entry.assets[0].asset.url);
  assert.equal(bound.nodes.arrival.character, undefined);
});

test('revised story text ignores a stale release', async t => {
  const f = fixture(t);
  f.original.nodes.arrival.text.push('A source edit made after publication.');
  assert.equal(await withPublishedArt(f.original), f.original);
});

test('a scene illustration takes priority over environments and portrait staging', async t => {
  const f = fixture(t);
  const scene = asset('arrival', 'scene', '3');
  f.entry.assets.unshift(asset('__art_environment_happy-home-arrival-environment', 'environment', '4'), scene);
  const bound = await withPublishedArt(f.original);
  assert.equal(bound.nodes.arrival.background, scene.asset.url);
  assert.equal(bound.nodes.arrival.character, undefined);
});

test('an imported story keeps its own images even when an authored manifest claims its identity', async t => {
  const f = fixture(t);
  f.original.storyId = 'import-6febc2f6-3a12-41ac-bae5-6d05ebc68c10';
  f.original.id = 'workshop-6febc2f6-3a12-41ac-bae5-6d05ebc68c10-r1';
  f.original.nodes.arrival.background = '/generated-art/workshop/wscene_1234.png';
  f.entry.worldId = f.original.id;
  f.entry.storyId = f.original.storyId;
  f.entry.bindingSourceHash = createHash('sha256').update(artBindingSource(f.original)).digest('hex');
  f.entry.assets.unshift(asset('arrival', 'scene', '3'));
  const before = structuredClone(f.original);
  assert.equal(await withPublishedArt(f.original), f.original);
  assert.deepEqual(f.original, before);
});
