import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { createHash } from 'node:crypto';
import type { GameWorld, StagePortrait } from '../shared/types.ts';
import { artBindingSource } from '../shared/art-binding-source.ts';
import { bindCharacterCutouts, loadCharacterCutouts, type CharacterCutout, type CutoutSource } from '../src/character-cutouts.ts';
import { withPublishedArt } from '../src/published-art.ts';
import { sceneCharacterPresentation, scenePortraitSources } from '../src/scene-character-art.ts';

const world = (): GameWorld => ({ id: 'cutout-world', storyId: '123456789', version: 'r1', title: 'Fixture', subtitle: '',
  player: { name: 'Player', role: 'player' }, introduction: [], objective: '', startNodeId: 'arrival',
  characters: [{ id: 'actor', name: 'Actor', role: 'counterpart', description: 'Fixture character' },
    { id: 'player', name: 'Player', role: 'player', description: 'Fixture player' }],
  nodes: { arrival: { id: 'arrival', chapter: '', title: 'Arrival', time: '', location: '',
    background: '/assets/room.webp', text: ['Fixture scene'], choices: [] } },
  source: { title: '', author: '', url: '' }, cover: '', background: '', summary: '', ink: {}, clueVariables: {},
  adaptation: { scope: 'original-seed', adultCast: true, note: '' } });
function source(kind = 'character-anchor', digit = '1'): CutoutSource {
  return { nodeId: kind === 'character-anchor' ? '__art_character_actor' : '__art_reaction_actor',
    jobId: `scene_${digit.repeat(28)}`, sourceHash: 'a'.repeat(64), assetKind: kind, review: 'approved', bindingReady: true, gameReady: false,
    asset: { url: `/generated-art/scene_${digit.repeat(28)}.png`, sha256: digit.repeat(64), width: 1024, height: 1536 } };
}
function derivative(row = source(), digit = 'b'): CharacterCutout {
  return { worldId: 'cutout-world', nodeId: row.nodeId, jobId: row.jobId!, sourceHash: row.sourceHash!,
    sourceUrl: row.asset.url, sourceSha256: row.asset.sha256,
    url: `/generated-art/cutouts/${row.jobId}-${row.asset.sha256.slice(0, 12)}.png`,
    sha256: digit.repeat(64), width: 1024, height: 1536, review: 'approved' };
}
function published(t: TestContext) {
  const original = world(), main = source(), reaction = source('character-reaction', '2');
  const entry = { worldId: original.id, storyId: original.storyId, version: original.version,
    bindingSourceHash: createHash('sha256').update(artBindingSource(original)).digest('hex'),
    assets: [reaction, main], sceneCharacters: { arrival: ['actor'] },
    characterPresence: { arrival: { id: 'player' } } };
  const manifest = { bindingPolicy: 'style-first-approved-current-v1', worlds: [entry] };
  const cutouts = { schemaVersion: 1 as const, entries: [derivative(reaction, 'c'), derivative(main)] };
  const requests: string[] = [];
  let cutoutStatus = 200;
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = String(input); requests.push(url);
    return url.endsWith('/character-cutouts.json') ? new Response(JSON.stringify(cutouts), { status: cutoutStatus })
      : new Response(JSON.stringify(manifest));
  });
  return { original, entry, manifest, cutouts, requests, cutoutStatus: (status: number) => { cutoutStatus = status; } };
}

test('current source and derivative approvals load independent stage fields while mothers remain references', async t => {
  const f = published(t), before = structuredClone(f.original);
  const bound = await withPublishedArt(f.original), actor = bound.characters[0];
  assert.equal(actor.portraits?.main, f.entry.assets[1].asset.url);
  assert.equal(actor.stagePortraits?.main?.url, f.cutouts.entries[1].url);
  assert.equal(actor.stagePortraits?.reaction?.url, f.cutouts.entries[0].url);
  assert.deepEqual(bound.nodes.arrival.stageCharacter, { id: 'actor', expression: 'main', position: 'left' });
  assert.equal(bound.nodes.arrival.character, undefined);
  assert.deepEqual(scenePortraitSources(actor, 'reaction', bound.nodes.arrival.background),
    [f.cutouts.entries[0].url, f.cutouts.entries[1].url]);
  assert.deepEqual(f.original, before);
  assert.deepEqual(f.requests, ['/generated-art/production-manifest.json', '/generated-art/character-cutouts.json']);
  assert.equal(artBindingSource(bound), artBindingSource(f.original));
});

test('every derivative identity, original hash, geometry, approval and public cutout path must match', () => {
  const row = source(), proof = derivative(row);
  for (const change of [{ worldId: 'another-world' }, { nodeId: '__art_character_player' }, { jobId: 'scene_bad' },
    { sourceHash: 'd'.repeat(64) }, { sourceSha256: 'e'.repeat(64) }, { sourceUrl: '/generated-art/other.png' },
    { review: 'pending' }, { review: 'rejected' }, { width: 2048 }, { height: 3072 },
    { sha256: 'invalid' }, { url: row.asset.url }, { url: '/generated-art/cutouts/../secret.png' }]) {
    const target = world();
    bindCharacterCutouts(target, [row], { schemaVersion: 1, entries: [{ ...proof, ...change } as CharacterCutout] }, { arrival: ['actor'] });
    assert.equal(target.characters[0].stagePortraits, undefined, JSON.stringify(change));
    assert.equal(target.nodes.arrival.stageCharacter, undefined);
  }
  for (const change of [{ review: 'rejected' }, { bindingReady: false }, { sourceHash: 'f'.repeat(64) }]) {
    const target = world();
    bindCharacterCutouts(target, [{ ...row, ...change }], { schemaVersion: 1, entries: [proof] }, { arrival: ['actor'] });
    assert.equal(target.characters[0].stagePortraits, undefined);
  }
});

test('a currently approved transparent reaction can stand alone and duplicate proof records fail closed', () => {
  const reaction = source('character-reaction', '2'), target = world();
  bindCharacterCutouts(target, [reaction], { schemaVersion: 1, entries: [derivative(reaction)] }, { arrival: ['actor'] });
  assert.equal(target.characters[0].stagePortraits?.main, undefined);
  assert.equal(target.characters[0].stagePortraits?.reaction?.url, derivative(reaction).url);
  assert.deepEqual(scenePortraitSources(target.characters[0], 'main', target.nodes.arrival.background), [derivative(reaction).url]);
  const main = source(), proof = derivative(main);
  bindCharacterCutouts(target, [main], { schemaVersion: 1, entries: [proof, { ...proof, review: 'rejected' }] }, { arrival: ['actor'] });
  assert.equal(target.characters[0].stagePortraits, undefined);
});

test('authored cast stays intact while unavailable authored art permits a verified counterpart, and CG never receives an overlay', async t => {
  const f = published(t);
  f.original.nodes.arrival.character = { id: 'player', expression: 'main', position: 'right' };
  f.entry.bindingSourceHash = createHash('sha256').update(artBindingSource(f.original)).digest('hex');
  let bound = await withPublishedArt(f.original);
  assert.equal(bound.nodes.arrival.character?.id, 'player');
  assert.equal(bound.nodes.arrival.stageCharacter?.id, 'actor');
  assert.equal(sceneCharacterPresentation(bound, bound.nodes.arrival)?.character.id, 'actor');
  delete f.original.nodes.arrival.character;
  f.entry.bindingSourceHash = createHash('sha256').update(artBindingSource(f.original)).digest('hex');
  f.entry.sceneCharacters.arrival = ['unknown'];
  bound = await withPublishedArt(f.original);
  assert.equal(bound.nodes.arrival.stageCharacter, undefined);
  assert.equal(sceneCharacterPresentation(bound, bound.nodes.arrival), null);
  f.entry.sceneCharacters.arrival = ['actor'];
  f.entry.assets.push({ ...source('scene', '3'), nodeId: 'arrival', assetKind: 'scene', gameReady: true });
  bound = await withPublishedArt(f.original);
  assert.equal(bound.nodes.arrival.backgroundArtKind, 'scene');
  assert.equal(bound.nodes.arrival.stageCharacter, undefined);
  assert.equal(sceneCharacterPresentation(bound, bound.nodes.arrival), null);
  assert.deepEqual(scenePortraitSources(bound.characters[0], 'main', bound.nodes.arrival.background, bound.nodes.arrival.backgroundArtKind), []);
});

test('approved transparent actors may stand over explicit empty environments while unknown generated images remain protected', async t => {
  const f = published(t);
  f.entry.assets.push({ ...source('environment', '4'), nodeId: '__art_environment_cutout-world-arrival-environment', assetKind: 'environment' });
  const bound = await withPublishedArt(f.original), node = bound.nodes.arrival;
  assert.equal(node.backgroundArtKind, 'environment');
  assert.equal(node.stageCharacter?.id, 'actor');
  assert.deepEqual(scenePortraitSources(bound.characters[0], 'main', node.background, node.backgroundArtKind), [f.cutouts.entries[1].url, f.cutouts.entries[0].url]);
  assert.deepEqual(scenePortraitSources(bound.characters[0], 'main', node.background), []);
});

test('fresh rejection, unavailable manifest and source changes clear saved stage approvals without losing valid CG', async t => {
  const f = published(t);
  const prior = await withPublishedArt(f.original);
  assert.ok(prior.characters[0].stagePortraits?.main);
  f.cutouts.entries[1].review = 'rejected';
  let bound = await withPublishedArt(prior);
  assert.equal(bound.characters[0].stagePortraits?.main, undefined);
  assert.equal(bound.characters[0].stagePortraits?.reaction?.url, f.cutouts.entries[0].url);
  f.cutouts.entries[0].review = 'rejected';
  bound = await withPublishedArt(prior);
  assert.equal(bound.characters[0].stagePortraits, undefined);
  assert.equal(bound.nodes.arrival.stageCharacter, undefined);
  f.cutoutStatus(503);
  bound = await withPublishedArt(prior);
  assert.equal(bound.characters[0].stagePortraits, undefined);
  const changed = structuredClone(prior); changed.nodes.arrival.text.push('Changed current source.');
  bound = await withPublishedArt(changed);
  assert.equal(bound.characters[0].stagePortraits, undefined);
  assert.deepEqual(bound.nodes.arrival.text, changed.nodes.arrival.text);
  assert.ok(prior.characters[0].stagePortraits?.main);
});

test('opaque mothers and unapproved reaction fields cannot pass the render helper', () => {
  const reference = { ...world().characters[0], portrait: source().asset.url, portraits: { main: source().asset.url } };
  assert.deepEqual(scenePortraitSources(reference, 'main', '/assets/room.webp'), []);
  const proof = derivative() as StagePortrait;
  assert.deepEqual(scenePortraitSources({ ...reference, stagePortraits: { reaction: { ...proof, review: 'pending' as StagePortrait['review'] } } }, 'reaction', '/assets/room.webp'), []);
});

test('runtime selection prefers an explicit speaker, then displayable authored art, preserving placement and reaction', () => {
  const target = world(), main = source(), reaction = source('character-reaction', '2');
  target.characters[1].portrait = '/assets/fang-nuo-main.webp';
  target.nodes.arrival.character = { id: 'player', position: 'right', expression: 'reaction' };
  bindCharacterCutouts(target, [main, reaction], { schemaVersion: 1, entries: [derivative(main), derivative(reaction, 'c')] }, { arrival: ['actor', 'player'] });
  const before = structuredClone(target.nodes.arrival.character);
  assert.equal(sceneCharacterPresentation(target, target.nodes.arrival)?.character.id, 'player');
  assert.equal(sceneCharacterPresentation(target, target.nodes.arrival)?.position, 'right');
  target.nodes.arrival.speaker = 'Actor';
  assert.equal(sceneCharacterPresentation(target, target.nodes.arrival)?.character.id, 'actor');
  target.nodes.arrival.character = { id: 'actor', expression: 'reaction', position: 'right' };
  const selected = sceneCharacterPresentation(target, target.nodes.arrival);
  assert.deepEqual(selected?.sources, [derivative(reaction, 'c').url, derivative(main).url]);
  assert.equal(selected?.position, 'right');
  assert.deepEqual(before, { id: 'player', position: 'right', expression: 'reaction' });
});

test('fallback follows paragraph names and uses stable scene order when several approved members are present', () => {
  const target = world(), main = source(), second = { ...source('character-anchor', '3'), nodeId: '__art_character_trainer' };
  target.characters.push({ id: 'trainer', name: '培训师', role: 'trainer', description: '' });
  target.nodes.arrival.character = { id: 'player', position: 'right' };
  const manifest = { schemaVersion: 1 as const, entries: [derivative(main), derivative(second, 'd')] };
  bindCharacterCutouts(target, [main, second], manifest, { arrival: ['actor', 'trainer', 'player'] });
  assert.equal(sceneCharacterPresentation(target, target.nodes.arrival, '培训师翻开了手册。')?.character.id, 'trainer');
  assert.equal(sceneCharacterPresentation(target, target.nodes.arrival, 'Actor walked to the desk.')?.character.id, 'actor');
  assert.equal(sceneCharacterPresentation(target, target.nodes.arrival, 'The room was silent.')?.character.id, 'actor');
  assert.equal(sceneCharacterPresentation(target, target.nodes.arrival, 'Actor 看向了培训师。')?.character.id, 'actor');
  assert.equal(target.nodes.arrival.character.id, 'player');
  bindCharacterCutouts(target, [main, second], manifest, { arrival: [] });
  assert.equal(sceneCharacterPresentation(target, target.nodes.arrival, '培训师翻开了手册。'), null);
});

test('additional approvals preserve visibility, use whole-node evidence, and respect membership order and live revocation', () => {
  const target = world(), main = source(), second = { ...source('character-anchor', '3'), nodeId: '__art_character_trainer' };
  const player = { ...source('character-anchor', '4'), nodeId: '__art_character_player' };
  const offScene = { ...source('character-anchor', '5'), nodeId: '__art_character_absent' };
  target.characters.push({ id: 'trainer', name: '培训师', role: 'trainer', description: '' },
    { id: 'absent', name: '不在场者', role: '', description: '' });
  const rows = [main, second, player, offScene];
  const proofs = rows.map((row, index) => derivative(row, ['a', 'b', 'c', 'd'][index]));
  const membership = { arrival: ['player', 'trainer', 'actor', 'trainer', 'unknown'] };
  const bind = (entries: CharacterCutout[]) => bindCharacterCutouts(target, rows, { schemaVersion: 1, entries }, membership);
  bind([proofs[0]]);
  assert.equal(sceneCharacterPresentation(target, target.nodes.arrival)?.character.id, 'actor');
  bind(proofs);
  assert.equal(sceneCharacterPresentation(target, target.nodes.arrival)?.character.id, 'trainer', 'Membership order, not character catalogue order');
  assert.equal(target.nodes.arrival.stageCharacter?.id, 'trainer');
  assert.equal(sceneCharacterPresentation(target, target.nodes.arrival, 'Actor 看向培训师。')?.character.id, 'trainer', 'Multiple names retain membership order');
  target.nodes.arrival.text = ['门开了。', 'Actor walked to the desk.'];
  bind(proofs);
  assert.equal(target.nodes.arrival.stageCharacter?.id, 'actor');
  assert.equal(sceneCharacterPresentation(target, target.nodes.arrival)?.character.id, 'actor', 'Later text establishes the unnamed opening');
  assert.equal(sceneCharacterPresentation(target, target.nodes.arrival, '培训师翻开了手册。')?.character.id, 'trainer', 'Current paragraph has priority over other paragraphs');
  assert.equal(sceneCharacterPresentation(target, target.nodes.arrival, '不在场者来了。')?.character.id, 'actor', 'Text cannot admit off-scene art');
  bind(proofs.map(proof => proof === proofs[0] ? { ...proof, review: 'rejected' } : proof));
  assert.equal(sceneCharacterPresentation(target, target.nodes.arrival)?.character.id, 'trainer');
  bind([proofs[2], proofs[3], { ...proofs[1], sourceSha256: 'f'.repeat(64) }]);
  assert.equal(sceneCharacterPresentation(target, target.nodes.arrival), null, 'Player, off-scene actor and invalid proof cannot fill the stage');
  bind(proofs);
  target.nodes.arrival.backgroundArtKind = 'scene';
  assert.equal(sceneCharacterPresentation(target, target.nodes.arrival), null);
});

test('an authored actor without a current cutout permits the same-scene trainer over an empty environment', () => {
  const target = world(), main = { ...source(), nodeId: '__art_character_trainer' };
  target.characters[0] = { id: 'fangnuo', name: '方诺', role: '', description: '', portrait: '/generated-art/scene_old.png' };
  target.artCharacters = [{ id: 'trainer', name: '培训师', role: '', description: '' }];
  Object.assign(target.nodes.arrival, { character: { id: 'fangnuo', expression: 'reaction', position: 'right' },
    background: '/generated-art/scene_room.png', backgroundArtKind: 'environment', text: ['培训师翻开了手册。'] });
  const originalCharacter = structuredClone(target.nodes.arrival.character);
  bindCharacterCutouts(target, [main], { schemaVersion: 1, entries: [derivative(main)] }, { arrival: ['fangnuo', 'trainer'] });
  assert.equal(sceneCharacterPresentation(target, target.nodes.arrival)?.character.id, 'trainer');
  assert.deepEqual(target.nodes.arrival.character, originalCharacter);
  target.nodes.arrival.backgroundArtKind = 'scene';
  assert.equal(sceneCharacterPresentation(target, target.nodes.arrival), null);
  target.nodes.arrival.backgroundArtKind = 'environment';
  target.nodes.arrival.ending = { title: 'End', text: '', tone: 'uneasy' };
  assert.equal(sceneCharacterPresentation(target, target.nodes.arrival), null);
});

test('direct failed refresh clears both bound cutouts and membership-based presentation', async t => {
  const target = world(), main = source();
  bindCharacterCutouts(target, [main], { schemaVersion: 1, entries: [derivative(main)] }, { arrival: ['actor'] });
  assert.ok(sceneCharacterPresentation(target, target.nodes.arrival));
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 503 }));
  await loadCharacterCutouts(target, [main], { arrival: ['actor'] });
  assert.equal(target.characters[0].stagePortraits, undefined);
  assert.equal(target.nodes.arrival.stageCharacter, undefined);
  assert.equal(sceneCharacterPresentation(target, target.nodes.arrival), null);
});
