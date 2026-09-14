import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { authoredWorlds } from '../content/worlds.ts';
import { buildShortPlans } from '../server/art-production-short.ts';

const root = process.cwd();
const folder = 'output/imagegen/scene-production/formal-production-20260907/inspection-wave42-20260910';
const review = JSON.parse(await readFile(path.join(folder, 'review-report.json'), 'utf8'));
const manifest = JSON.parse(await readFile('public/generated-art/production-manifest.json', 'utf8'));
const browser = JSON.parse(await readFile('output/imagegen/scene-production/game-release-20260910/verification.json', 'utf8'));
const plans = await buildShortPlans(root, authoredWorlds);
const approved = [];
for (const row of review.results.filter((entry: any) => entry.decision === 'approved')) {
  const world = manifest.worlds.find((entry: any) => entry.worldId === row.worldId);
  const source = world?.assets.find((entry: any) => entry.jobId === row.jobId);
  assert.equal(source?.bindingReady, true, row.jobId);
  assert.equal(source.review, 'approved');
  const bytes = await readFile(path.join(root, 'public', source.asset.url.slice(1)));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), row.sha256);
  assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], row.dimensions);
  const characterId = row.nodeId.slice('__art_character_'.length);
  assert.equal(browser.inventory.find((entry: any) => entry.worldId === row.worldId)?.portraitBindings
    .find((entry: any) => entry.id === characterId)?.url, source.asset.url);
  approved.push({ worldId: row.worldId, characterId, nodeId: row.nodeId, jobId: row.jobId,
    sourceHash: source.sourceHash, sourceUrl: source.asset.url, sourceSha256: row.sha256,
    width: row.dimensions[0], height: row.dimensions[1], sourceReview: 'approved',
    confirmedSceneNodes: plans.filter(plan => plan.worldId === row.worldId && plan.kind === 'scene'
      && !plan.blocked && plan.dependencies.includes(row.nodeId)).map(plan => plan.nodeId),
    transparentDerivativeReview: 'separate-approval-required' });
}
const report = { at: new Date().toISOString(), wave: 42, style: '吸血鬼猎人D画风',
  generated: review.generated, reviewed: review.reviewed, approved, rejected: review.results
    .filter((entry: any) => entry.decision === 'rejected'), browserVerifiedAt: browser.at,
  browserBase: browser.base, worldsVerified: browser.inventory.length, boundSceneSlots: browser.boundSceneSlots,
  publishedCounts: manifest.counts, paidRequestsInThisVerification: 0, sharedServerRestarts: 0 };
await writeFile(path.join(folder, 'integration-handoff.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ approvedSources: approved.length, confirmedNodes: approved.reduce((n, row) => n + row.confirmedSceneNodes.length, 0),
  worldsVerified: report.worldsVerified, boundSceneSlots: report.boundSceneSlots, output: `${folder}/integration-handoff.json` }));
