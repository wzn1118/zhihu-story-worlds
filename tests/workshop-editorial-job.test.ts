import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runWorkshopEditorial, workshopEditorialPolicyHash } from '../server/workshop-editorial-job.ts';
import { jsonFile, writeJson } from '../server/story-workshop.ts';
import { workshopArtDirection } from '../server/workshop-art-direction.ts';
import { originalSeed, type GeneratedDraft } from '../shared/workshop.ts';
import type { EditorialResult, reviewAndRepairStory } from '../server/workshop-editorial.ts';
import { editorialHash } from '../server/workshop-editorial.ts';
import { editorialPolicyHash, readEditorialNotes } from '../server/workshop-editorial-job.ts';

// Coordinator-only stubs: never passed to a creative model or a production registry.
const draft = { outline: { title: '仅测试作业恢复' }, routes: [] } as unknown as GeneratedDraft;
async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const directory = await mkdtemp(join(tmpdir(), 'redleaf-editorial-job-'));
  t.after(() => rm(directory, { recursive: true, force: true })); return directory;
}
function result(directory: string, status: 'passed' | 'blocked') {
  return { draft, directory, report: { status } } as EditorialResult;
}
test('an interrupted editorial stage resumes its prior checkpoint directory, not fresh model calls', async t => {
  const directory = await fixture(t), seen: string[] = [];
  const review: typeof reviewAndRepairStory = async (_source, _draft, options) => {
    seen.push(options.directory);
    if (seen.length === 1) throw new Error('simulated interrupted review');
    return result(options.directory, 'passed');
  };
  await assert.rejects(runWorkshopEditorial(originalSeed, draft, { directory, attempt: 1, review }));
  await runWorkshopEditorial(originalSeed, draft, { directory, attempt: 2, review });
  assert.equal(seen[0], seen[1]);
  assert.equal((await jsonFile<{ status: string }>(join(directory, 'editorial-run.json'))).status, 'passed');
});
test('an explicit retry after an exhausted blocking review receives a new bounded checkpoint series', async t => {
  const directory = await fixture(t), seen: string[] = [];
  const review: typeof reviewAndRepairStory = async (_source, _draft, options) => { seen.push(options.directory); return result(options.directory, 'blocked'); };
  await runWorkshopEditorial(originalSeed, draft, { directory, attempt: 1, review });
  await runWorkshopEditorial(originalSeed, draft, { directory, attempt: 2, review });
  assert.notEqual(seen[0], seen[1]);
  assert.equal((await jsonFile<{ status: string }>(join(directory, 'editorial-run.json'))).status, 'blocked');
});
test('invalid attempts are rejected before a model review is called', async t => {
  const directory = await fixture(t); let called = false;
  const review: typeof reviewAndRepairStory = async () => { called = true; return result(directory, 'passed'); };
  await assert.rejects(runWorkshopEditorial(originalSeed, draft, { directory, attempt: 0, review }));
  assert.equal(called, false);
});
test('changed editorial requirements invalidate old acceptance while retaining its immutable directory', async t => {
  const directory = await fixture(t);
  await writeJson(join(directory, 'editorial-run.json'), { series: 1, inputHash: 'old', status: 'working' });
  let actualDirectory = '', actualPrompt = '';
  const review: typeof reviewAndRepairStory = async (_source, _draft, options) => {
    actualDirectory = options.directory;
    await options.generate!(options.directory, 'review-test-only', { type: 'object' }, 'Full draft data', async () => {});
    return result(options.directory, 'passed');
  };
  await runWorkshopEditorial(originalSeed, draft, { directory, attempt: 2, review,
    generate: async <T>(_dir: string, _label: string, _schema: unknown, prompt: string) => { actualPrompt = prompt; return {} as T; },
  });
  assert.ok(actualDirectory.endsWith(`run-2-${workshopEditorialPolicyHash.slice(0, 12)}`));
  assert.ok(actualPrompt.startsWith('Full draft data'));
  assert.ok(actualPrompt.includes(JSON.stringify(workshopArtDirection).slice(1, -1)));
  assert.equal((await jsonFile<{ policyHash: string }>(join(directory, 'editorial-run.json'))).policyHash, workshopEditorialPolicyHash);
});
test('source-bound reviewer observations are rechecked by the model and scope acceptance identity', async t => {
  const directory = await fixture(t), notes = { sourceHash: editorialHash(originalSeed), observedDraftHash: editorialHash(draft), notes: ['自动化测试观察，仅核对当前稿是否仍有此项，不作为小说交付。'] };
  await writeJson(join(directory, 'editorial-notes.json'), notes);
  assert.deepEqual(await readEditorialNotes(directory, originalSeed), notes);
  assert.notEqual(editorialPolicyHash(notes), workshopEditorialPolicyHash);
  let prompt = '';
  const review: typeof reviewAndRepairStory = async (_s, _d, options) => { await options.generate!(options.directory, 'test', { type: 'object' }, 'draft'); return result(options.directory, 'passed'); };
  await runWorkshopEditorial(originalSeed, draft, { directory, attempt: 1, review, generate: async <T>(_d: string, _l: string, _s: unknown, p: string) => { prompt = p; return {} as T; } });
  assert.ok(prompt.includes('REVIEWER_OBSERVATIONS_DATA='));
  assert.equal((await jsonFile<{ policyHash: string }>(join(directory, 'editorial-run.json'))).policyHash, editorialPolicyHash(notes));
  await assert.rejects(readEditorialNotes(directory, { ...originalSeed, text: `${originalSeed.text}changed` }));
});
