import assert from 'node:assert/strict';
import test from 'node:test';
import { scenePortraitSources } from '../src/scene-character-art.ts';
import type { Character } from '../shared/types.ts';

const character: Character = { id: 'trainer', name: '培训师', role: '', description: '',
  portrait: '/generated-art/scene_123.png',
  portraits: { main: '/generated-art/scene_123.png', reaction: '/generated-art/scene_456.png' } };

test('reference mothers and reactions cannot appear as stage cutouts, including old saved worlds', () => {
  assert.deepEqual(scenePortraitSources(character, 'main', '/assets/classroom.webp'), []);
  assert.deepEqual(scenePortraitSources(character, 'reaction', '/assets/classroom.webp'), []);
  assert.deepEqual(scenePortraitSources({ ...character, portraits: undefined }, 'main'), []);
  assert.deepEqual(scenePortraitSources({ ...character, portrait: '/uploads/portrait.png', portraits: undefined }, 'main'), []);
});

test('the verified authored transparent cutouts retain reaction and fallback order', () => {
  const cutout = { ...character, portrait: '/assets/fang-nuo-main.webp',
    portraits: { main: '/assets/fang-nuo-main.webp', reaction: '/assets/fang-nuo-reaction.webp' } };
  assert.deepEqual(scenePortraitSources(cutout, 'reaction', '/assets/classroom.webp'),
    ['/assets/fang-nuo-reaction.webp', '/assets/fang-nuo-main.webp']);
});

test('complete generated scene compositions never receive an extra character overlay', () => {
  assert.deepEqual(scenePortraitSources({ ...character, portraits: undefined, portrait: '/assets/fang-nuo-main.webp' },
    'main', '/generated-art/scene_789.png'), []);
});
