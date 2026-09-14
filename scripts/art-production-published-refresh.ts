import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { GameWorld } from '../shared/types.ts';
import { buildSceneBrief, sha256 } from '../server/art-production-prompts.ts';
import { getArtBatch, listArtBatches, prepareArtBatch } from '../server/art-production.ts';

const [projectId, mode = 'audit'] = process.argv.slice(2);
assert(/^import-[0-9a-f-]{36}$/.test(projectId ?? ''), 'EXACT_IMPORTED_PROJECT_REQUIRED');
assert(['audit', 'refresh'].includes(mode));
const root = process.cwd();
const directory = path.join(root, '.local/story-workshop/projects', projectId);
const metadataBytes = await readFile(path.join(directory, 'project.json'));
const project = JSON.parse(metadataBytes.toString('utf8'));
assert(/^r[1-9][0-9]*$/.test(project.publishedVersion ?? ''), 'PUBLISHED_VERSION_REQUIRED');
const version = project.publishedVersion as string;
const worldBytes = await readFile(path.join(directory, version, 'world.json'));
const world = JSON.parse(worldBytes.toString('utf8')) as GameWorld;
assert.equal(world.version, version);
assert.equal(world.id, `workshop-${projectId.slice('import-'.length)}-${version}`);
const before = (await listArtBatches()).find(batch => batch.worldId === world.id);
const materials = [];
for (const node of Object.values(world.nodes)) {
  const brief = await buildSceneBrief(root, world, node);
  const job = before?.jobs.find(job => !job.stale && job.nodeId === node.id);
  materials.push({ nodeId: node.id, sourceHash: brief.sourceHash, promptHash: sha256(brief.prompt),
    referenceHash: brief.referenceHash, expectedReferenceCount: brief.references.length,
    sourceMatches: job?.sourceHash === brief.sourceHash, promptMatches: job?.promptHash === sha256(brief.prompt),
    referenceMatches: job?.referenceHash === brief.referenceHash });
}
// Do not prepare a draft or race a publication. Recheck only publication identity,
// not unrelated editorial progress events on the still-unpublished next version.
const latest = JSON.parse(await readFile(path.join(directory, 'project.json'), 'utf8'));
assert.equal(latest.publishedVersion, version, 'PUBLICATION_CHANGED_REAUDIT');
assert.equal(sha256(await readFile(path.join(directory, version, 'world.json'))), sha256(worldBytes), 'PUBLISHED_WORLD_CHANGED_REAUDIT');
const updated = mode === 'refresh' ? await prepareArtBatch({ world, minimumImages: 30 }) : before;
const current = updated ? (await getArtBatch(updated.id))!.jobs.filter(job => !job.stale) : [];
const afterMatches = materials.filter(material => current.some(job => job.nodeId === material.nodeId
  && job.sourceHash === material.sourceHash && job.promptHash === material.promptHash && job.referenceHash === material.referenceHash)).length;
const record = { at: new Date().toISOString(), mode, projectId, publishedVersion: version,
  editorialRevision: latest.revision, editorialStatus: latest.status, publishedWorldId: world.id,
  publishedWorldSha256: sha256(worldBytes), batchId: updated?.id, sceneCount: materials.length,
  beforeMatching: materials.filter(material => material.sourceMatches && material.promptMatches && material.referenceMatches).length,
  afterMatching: afterMatches, paidCalls: 0, unpublishedDraftUsed: false, materials,
  productionHold: 'Do not pay for an obsolete published revision while the next source revision remains in editorial review.' };
const output = path.join(root, 'output/imagegen/scene-production/root-handoff-20260906');
await mkdir(output, { recursive: true });
await writeFile(path.join(output, `imported-${mode}.json`), JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify({ ...record, materials: undefined }));
