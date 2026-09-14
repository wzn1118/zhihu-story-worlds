import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { authoredWorlds } from '../content/worlds.ts';
import { ART_WORLD_OWNERS, delegatedArtDirection } from '../server/art-production-delegates.ts';
import { buildSceneBrief, sha256 } from '../server/art-production-prompts.ts';
import { VHD_REFERENCE_FILES, VHD_REFERENCE_REVISION } from '../server/art-production-references.ts';
import { listArtBatches } from '../server/art-production.ts';

const root = process.cwd();
const directory = path.join(root, 'output/imagegen/scene-production/batch-vhd-20260906');
const references = await Promise.all(VHD_REFERENCE_FILES.map(async file => ({
  file, sha256: sha256(await readFile(path.join(root, file))),
})));
const batches = await listArtBatches();
const identities = new Set<string>();
const prompts = new Set<string>();
const worlds = [];
const issues: { worldId: string; nodeId: string; issue: string }[] = [];
assert.equal(authoredWorlds.length, 20);
for (const world of authoredWorlds) {
  const materials = (await readFile(path.join(directory, world.id, 'scene-materials.jsonl'), 'utf8'))
    .trim().split('\n').map(line => JSON.parse(line));
  const byNode = new Map(materials.map(material => [material.nodeId, material]));
  const batch = batches.find(batch => batch.worldId === world.id);
  const nodes = Object.values(world.nodes);
  assert.ok(nodes.length >= 30);
  assert.equal(materials.length, nodes.length);
  assert.equal(byNode.size, nodes.length);
  let verified = 0;
  for (const node of nodes) {
    const identity = `${world.id}/${node.id}`;
    assert.ok(!identities.has(identity));
    identities.add(identity);
    const material = byNode.get(node.id);
    const direction = await delegatedArtDirection({ root, world, node });
    const brief = await buildSceneBrief(root, world, node);
    const current = batch?.jobs.filter(job => !job.stale && job.nodeId === node.id) ?? [];
    const promptHash = sha256(brief.prompt);
    const checks: [boolean, string][] = [
      [Boolean(direction), 'missing_individual_artist_direction'],
      [!prompts.has(promptHash), 'duplicate_prompt'],
      [brief.quality === 'high' && !brief.pixelSize, 'wrong_request_tier'],
      [VHD_REFERENCE_FILES.every((file, index) => path.resolve(root, file) === brief.references[index]), 'reference_order'],
      [material?.sourceHash === brief.sourceHash && material?.promptHash === promptHash
        && material?.referenceHash === brief.referenceHash, 'material_snapshot_stale'],
      [current.length === 1 && current[0]?.sourceHash === brief.sourceHash
        && current[0]?.promptHash === promptHash && current[0]?.referenceHash === brief.referenceHash, 'current_job_stale_or_missing'],
    ];
    prompts.add(promptHash);
    for (const [ok, issue] of checks) if (!ok) issues.push({ worldId: world.id, nodeId: node.id, issue });
    if (checks.every(([ok]) => ok)) verified++;
  }
  worlds.push({ worldId: world.id, owner: ART_WORLD_OWNERS[world.id], required: nodes.length, verified });
}
const report = { at: new Date().toISOString(), referenceRevision: VHD_REFERENCE_REVISION,
  paidRequests: 0, storyCount: worlds.length, required: identities.size, distinctPromptHashes: prompts.size,
  verified: worlds.reduce((sum, world) => sum + world.verified, 0), references, worlds, issues,
  passed: issues.length === 0, claim: 'Source and preparation audit only; no generated or approved image count is inferred.' };
await writeFile(path.join(directory, 'material-audit.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, references: undefined, worlds: undefined }));
if (!report.passed) process.exitCode = 1;
