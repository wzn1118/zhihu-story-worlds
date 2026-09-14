import assert from 'node:assert/strict';
import test from 'node:test';
import { hasSceneArtHold } from '../src/scene-art-holds.ts';

test('a different approved replacement releases a location-specific scene hold', () => {
  const old = '/generated-art/scene_086b9e5b34a5b16237dac27aaaf8.png';
  assert.equal(hasSceneArtHold('ming-whisper', 'escort_muster', old), true);
  assert.equal(hasSceneArtHold('ming-whisper', 'escort_muster', '/generated-art/scene_abcdef.png'), false);
  assert.equal(hasSceneArtHold('ming-whisper', 'other-node', old), false);
  assert.equal(hasSceneArtHold('other-world', 'escort_muster', old), false);
  assert.equal(hasSceneArtHold('ming-whisper', 'escort_muster'), false);
});
