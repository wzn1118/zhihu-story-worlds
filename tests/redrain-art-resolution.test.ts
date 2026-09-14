import assert from 'node:assert/strict';
import test from 'node:test';
import { selectArtVariant } from '../public/games/redrain/src/art-resolution.js';

const variants = [
  { width: 512, height: 768, bytes: 20000, url: 'small.webp' },
  { width: 768, height: 1152, bytes: 40000, url: 'medium.webp' },
  { width: 1024, height: 1536, bytes: 74000, url: 'full.webp' },
];

test('pixel budgeting handles portrait cover, contained art, Retina and original-size limits', () => {
  assert.equal(selectArtVariant(variants, { width: 300, height: 600 }).url, 'small.webp');
  assert.equal(selectArtVariant(variants, { width: 600, height: 300, fit: 'contain', dpr: 2 }).url, 'small.webp');
  assert.equal(selectArtVariant(variants, { width: 600, height: 300, fit: 'cover', dpr: 2 }).url, 'full.webp');
  assert.equal(selectArtVariant(variants, { width: 350, height: 400, dpr: 2 }).url, 'medium.webp');
  assert.equal(selectArtVariant(variants, { width: 1440, height: 1000, dpr: 3 }).url, 'full.webp');
  assert.equal(selectArtVariant(variants, { width: 0, height: 0 }).url, 'full.webp');
  assert.equal(selectArtVariant([], { width: 300, height: 600 }), null);
});

test('the smallest adequate payload wins when a larger resolution compresses better', () => {
  const efficientFull = [...variants.slice(0, 2), { ...variants[2], bytes: 19000 }];
  assert.equal(selectArtVariant(efficientFull, { width: 300, height: 600 }).url, 'full.webp');
});
