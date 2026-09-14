import assert from 'node:assert/strict';
import test from 'node:test';
import { assertReviewedPolicy, assertReviewedWorldSnapshot } from '../scripts/verify-generated-story.ts';
import { editorialHash } from '../server/workshop-editorial.ts';
import { workshopEditorialPolicy, type EditorialNotes } from '../server/workshop-editorial-job.ts';
import { playerChoiceStyle, wholeStoryStyle, completeOpeningStyle, repairChoiceStyle } from '../server/workshop-creative.ts';

function snapshot() {
  return { title: 'Reviewed title', source: { text: 'Exact source' }, resources: { oxygen: 5 }, nodes: {
    first: { id: 'first', text: ['First scene'], choices: [{ id: 'continue', next: 'end', needs: ['clue'] }], artBrief: 'First artwork' },
    end: { id: 'end', text: ['Resolved ending'], choices: [], artBrief: 'Ending artwork' },
  } };
}

test('new published art briefs match the exact reviewed snapshot without mutation', () => {
  const reviewed = snapshot(), published = structuredClone(reviewed), before = JSON.stringify(reviewed);
  assert.deepEqual(assertReviewedWorldSnapshot(published, reviewed), { legacyArtBriefsAbsent: false, publishedBriefs: 2, reviewedBriefs: 2 });
  assert.equal(JSON.stringify(reviewed), before);
});

test('complete absence of optional legacy briefs is explicitly recorded without rewriting the publication', () => {
  const reviewed = snapshot();
  const published = { ...reviewed, nodes: Object.fromEntries(Object.entries(reviewed.nodes).map(([id, { artBrief: _brief, ...node }]) => [id, node])) };
  const before = JSON.stringify(published);
  assert.deepEqual(assertReviewedWorldSnapshot(published, reviewed), { legacyArtBriefsAbsent: true, publishedBriefs: 0, reviewedBriefs: 2 });
  assert.equal(JSON.stringify(published), before);
});

test('partially missing or altered published briefs are not a legacy snapshot', () => {
  const reviewed = snapshot();
  const missing: { nodes: Record<string, { id: string; artBrief?: string }> } = structuredClone(reviewed);
  delete missing.nodes.first.artBrief;
  assert.throws(() => assertReviewedWorldSnapshot(missing, reviewed));
  const changed = structuredClone(reviewed);
  changed.nodes.first.artBrief = 'Unreviewed artwork';
  assert.throws(() => assertReviewedWorldSnapshot(changed, reviewed));
});

for (const field of ['text', 'choices', 'source', 'resources'] as const) {
  test(`legacy brief compatibility still rejects changed ${field}`, () => {
    const reviewed = snapshot();
    const published = { ...structuredClone(reviewed), nodes: Object.fromEntries(Object.entries(structuredClone(reviewed.nodes)).map(([id, { artBrief: _brief, ...node }]) => [id, node])) };
    if (field === 'text') published.nodes.first.text[0] = 'Changed prose';
    if (field === 'choices') published.nodes.first.choices[0].needs = [];
    if (field === 'source') published.source.text = 'Changed source';
    if (field === 'resources') published.resources.oxygen = 99;
    assert.throws(() => assertReviewedWorldSnapshot(published, reviewed));
  });
}

const notes: EditorialNotes = { sourceHash: 'a'.repeat(64), observedDraftHash: 'b'.repeat(64), notes: ['One exact observation'] };
const promptFor = (policy: string, observations?: EditorialNotes) =>
  `TRUSTED_ADAPTATION_EDITORIAL_REQUIREMENTS=${JSON.stringify(policy)}${observations ? `\nREVIEWER_OBSERVATIONS_DATA=${JSON.stringify(observations)}` : ''}`;

test('actual recorded policy verifies the unchanged source-bound requirements', () => {
  assert.equal(assertReviewedPolicy(promptFor(workshopEditorialPolicy, notes), editorialHash({ policy: workshopEditorialPolicy, notes }), notes).artDirectionChanged, false);
  assert.equal(assertReviewedPolicy(promptFor(workshopEditorialPolicy), editorialHash(workshopEditorialPolicy)).artDirectionChanged, false);
});

test('an older art direction stays historical without invalidating identical narrative requirements', () => {
  const policy = [playerChoiceStyle, wholeStoryStyle, completeOpeningStyle, 'Historical artwork direction', repairChoiceStyle].join('\n');
  const result = assertReviewedPolicy(promptFor(policy, notes), editorialHash({ policy, notes }), notes);
  assert.equal(result.artDirectionChanged, true);
  assert.equal(result.currentNarrativeRequirements, true);
});

test('changed narrative rules, observation data and ledger hashes still fail', () => {
  const changed = workshopEditorialPolicy.replace(playerChoiceStyle, 'Unreviewed narrative requirements');
  assert.throws(() => assertReviewedPolicy(promptFor(changed, notes), editorialHash({ policy: changed, notes }), notes));
  assert.throws(() => assertReviewedPolicy(promptFor(workshopEditorialPolicy, notes), '0'.repeat(64), notes));
  assert.throws(() => assertReviewedPolicy(promptFor(workshopEditorialPolicy, notes), editorialHash({ policy: workshopEditorialPolicy, notes }), { ...notes, notes: ['Changed observation'] }));
  assert.throws(() => assertReviewedPolicy(promptFor(workshopEditorialPolicy, notes) + '\n' + promptFor(workshopEditorialPolicy, notes), editorialHash({ policy: workshopEditorialPolicy, notes }), notes));
});
