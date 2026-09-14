import assert from 'node:assert/strict';
import test from 'node:test';
import { buildWorkshopArtDirection } from '../server/workshop-art-brief.ts';
import type { ArtDirectionContext } from '../server/art-production-delegates.ts';

const prompt = '短发维修员穿着旧工作外套，在潮湿的中继站里扶住歪斜的检修灯，照向阀门旁刚出现的水痕，吸血鬼猎人D画风';
function context(artBrief: string | undefined = prompt): ArtDirectionContext {
  const node = { id: 'station', title: '检修站', chapter: '夜班', location: '中继站', time: '夜里', background: '', text: ['灯光落在阀门旁。'], choices: [], artBrief };
  return { root: '.', node, world: { id: 'workshop-v1-test', storyId: 'import-6febc2f6-3a12-41ac-bae5-6d05ebc68c10', title: 'TEST ONLY', version: 'r1', nodes: { station: node }, characters: [], source: { title: 'TEST ONLY', author: 'fixture', url: '' } } };
}
test('V1 delegate returns the exact scene prompt and zero references with no wrapper', () => {
  const input = context(), original = structuredClone(input);
  assert.deepEqual(buildWorkshopArtDirection(input), { prompt, references: [] });
  assert.deepEqual(input, original);
});
test('missing and legacy technical briefs stop instead of falling back to old art direction', () => {
  const missing = context(); delete missing.node.artBrief;
  assert.throws(() => buildWorkshopArtDirection(missing), /WORKSHOP_V1_BRIEF_REQUIRED/);
  for (const text of ['', '晚1990年代日式赛璐珞，原生3840x2160。', `${prompt}\n负面：去纹理`, `人物不透明平涂，${prompt}`, `2001年电影，${prompt}`, `${'细节'.repeat(130)}${prompt}`]) {
    assert.throws(() => buildWorkshopArtDirection(context(text)), /WORKSHOP_V1_BRIEF_REQUIRED/);
  }
});
test('actual story dates are not confused with a film-year drawing instruction', () => {
  const dated = prompt.replace('潮湿的中继站', '1998年的中继站');
  assert.equal(buildWorkshopArtDirection(context(dated))?.prompt, dated);
});
test('authored namespaces stay with their existing artists', () => {
  const input = context(); input.world.storyId = '2025684191967294692';
  assert.equal(buildWorkshopArtDirection(input), undefined);
});
