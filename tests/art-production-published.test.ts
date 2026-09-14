import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { publishedArtSources } from '../server/art-production-published.ts';

const id = 'import-11111111-1111-1111-1111-111111111111';
async function removeTestRoot(root: string) {
  const resolved = path.resolve(root);
  assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
  assert.ok(path.basename(resolved).startsWith('art-published-test-'));
  await rm(resolved, { recursive: true, force: true });
}
test('published art discovery ignores drafts, observes only published world revisions', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'art-published-test-'));
  try {
    assert.deepEqual(await publishedArtSources(root), []);
    const project = path.join(root, '.local/story-workshop/projects', id);
    await mkdir(path.join(project, 'r1'), { recursive: true });
    await writeFile(path.join(project, 'project.json'), JSON.stringify({ revision: 2, publishedVersion: 'r1', status: 'running' }));
    const worldId = `workshop-${id.slice(7)}-r1`;
    await writeFile(path.join(project, 'r1/world.json'), JSON.stringify({ id: worldId, version: 'r1', nodes: { first: {} } }));
    const first = await publishedArtSources(root);
    assert.equal(first.length, 1);
    await writeFile(path.join(project, 'project.json'), JSON.stringify({ revision: 2, publishedVersion: 'r1', status: 'failed' }));
    await mkdir(path.join(project, 'r2'));
    await writeFile(path.join(project, 'r2/draft.json'), '{"unfinished":true}');
    assert.deepEqual(await publishedArtSources(root), first);
    await writeFile(path.join(project, 'r2/world.json'), JSON.stringify({ id: worldId.replace(/r1$/, 'r2'), version: 'r2', nodes: { revised: {} } }));
    assert.deepEqual(await publishedArtSources(root), first, 'unpublished world file alone must not trigger art');
    await writeFile(path.join(project, 'project.json'), JSON.stringify({ revision: 2, publishedVersion: 'r2' }));
    const second = await publishedArtSources(root);
    assert.equal(second[0].version, 'r2');
    assert.notEqual(second[0].sha256, first[0].sha256);
  } finally { await removeTestRoot(root); }
});

test('published art discovery rejects invalid versions and mismatched world identities', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'art-published-test-'));
  try {
    const project = path.join(root, '.local/story-workshop/projects', id);
    await mkdir(path.join(project, 'r1'), { recursive: true });
    await writeFile(path.join(project, 'project.json'), JSON.stringify({ publishedVersion: '../draft' }));
    await assert.rejects(publishedArtSources(root), /INVALID_ART_PUBLICATION_VERSION/);
    await writeFile(path.join(project, 'project.json'), JSON.stringify({ publishedVersion: 'r1' }));
    await writeFile(path.join(project, 'r1/world.json'), JSON.stringify({ id: 'wrong', version: 'r1', nodes: {} }));
    await assert.rejects(publishedArtSources(root), /ART_PUBLICATION_IDENTITY_MISMATCH/);
  } finally { await removeTestRoot(root); }
});
