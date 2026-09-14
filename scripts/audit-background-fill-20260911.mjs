import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { authoredWorlds } from '../content/worlds.ts';
import { compileWorld } from '../server/worlds.ts';
import { withPublishedArt } from '../src/published-art.ts';
import { hasSceneArtHold } from '../src/scene-art-holds.ts';

const folder = 'output/coordination/background-fill-20260911';
const base = 'http://127.0.0.1:4173';
const baseline = JSON.parse(await readFile(`${folder}/inventory.json`, 'utf8'));
const realFetch = globalThis.fetch;
const snapshots = await Promise.all(['/generated-art/production-manifest.json', '/generated-art/character-cutouts.json'].map(async path => {
  const response = await realFetch(base + path, { cache: 'no-store' });
  assert.ok(response.ok, `${path}: ${response.status}`);
  return [path, await response.text()];
}));
const files = new Map(snapshots), manifest = JSON.parse(snapshots[0][1]);
globalThis.fetch = async path => {
  assert.ok(files.has(String(path)), `Unexpected binding request: ${path}`);
  return new Response(files.get(String(path)));
};
const bound = new Map();
try {
  for (const authored of authoredWorlds) bound.set(authored.id, await withPublishedArt(compileWorld(authored)));
} finally { globalThis.fetch = realFetch; }
const newPlacements = [];
for (const before of baseline.nodes) {
  const world = bound.get(before.worldId), node = world?.nodes[before.nodeId];
  if (!node) continue;
  const url = node.background || world.background;
  if (hasSceneArtHold(world.id, node.id, url) || !url?.startsWith('/generated-art/scene_')) continue;
  const entry = manifest.worlds.find(row => row.worldId === world.id);
  const asset = entry?.assets.find(row => row.asset.url === url && row.review === 'approved' && row.bindingReady);
  if (!asset) continue;
  newPlacements.push({ worldId: world.id, nodeId: node.id, location: node.location, isOpening: before.isOpening,
    kind: node.backgroundArtKind, jobId: asset.jobId, sourceHash: asset.sourceHash, url, sha256: asset.asset.sha256 });
}
const verified = [];
for (const url of new Set(newPlacements.map(row => row.url))) {
  const row = newPlacements.find(item => item.url === url), response = await realFetch(base + url, { cache: 'no-store' });
  assert.ok(response.ok, `${url}: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(createHash('sha256').update(bytes).digest('hex'), row.sha256, `Served SHA ${url}`);
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `PNG ${url}`);
  verified.push({ url, sha256: row.sha256, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), bytes: bytes.length });
}
const report = { at: new Date().toISOString(), baselineAt: baseline.auditedAt, manifestAt: manifest.generatedAt,
  counts: { priorLocalNodes: baseline.counts.localBackdropNodes, replacedLocalNodes: newPlacements.length,
    newOpeningBackgrounds: newPlacements.filter(row => row.isOpening).length, verifiedImages: verified.length },
  browserVerified: false, note: 'Real binding and served PNG checks; independent visual/UI review is recorded separately.',
  newPlacements, verified };
await writeFile(`${folder}/integration-audit.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report.counts, report: `${folder}/integration-audit.json` }));
