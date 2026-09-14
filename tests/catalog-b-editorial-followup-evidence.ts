import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { catalogWorldsB } from '../content/catalog-b.ts';
import revisions from '../content/catalog-b-editorial-followup.json';
import { getWorld } from '../server/worlds.ts';
import { canonical, sha256 } from '../server/art-production-prompts.ts';
import type { GameWorld, SceneNode } from '../shared/types.ts';
import { readField } from './catalog-b-editorial-support.ts';

export const followupDir = 'output/editorial/catalog-b/20260907-followup';
export const followupFixture = 'tests/fixtures/catalog-b-editorial-20260907-before.json.gz';
const phase = process.argv[2];
assert.ok(phase === 'before' || phase === 'after', 'Use before or after');
mkdirSync(`${followupDir}/${phase}`, { recursive: true });
const worlds = catalogWorldsB.map(w => getWorld(w.storyId));
if (phase === 'before') {
  assert.ok(!existsSync(followupFixture), 'Do not overwrite the pre-edit fixture');
  for (const r of revisions) assert.equal(readField(worlds.find(w => w.id === r.worldId)!, r.path), r.before, r.path);
  writeFileSync(followupFixture, gzipSync(JSON.stringify(worlds)));
}
const old: GameWorld[] = JSON.parse(gunzipSync(readFileSync(followupFixture)).toString());
const withoutArtwork = (world: GameWorld) => ({ ...world, cover: undefined, background: undefined,
  nodes: Object.fromEntries(Object.entries(world.nodes).map(([id, node]) => [id, { ...node, background: undefined }])) });
const productionHash = (world: GameWorld, node: SceneNode) => {
  const { background: _b, ...scene } = node;
  const cast = world.characters.map(({ portrait: _p, portraits: _ps, ...c }) => c);
  return sha256(canonical({ worldId: world.id, storyId: world.storyId, title: world.title, source: world.source, summary: world.summary, adaptation: world.adaptation, cast, scene }));
};
const publication = [], changedNodes = [], coverage = [], cacheEnvelopeChanges = [];
for (const world of worlds) {
  const previous = old.find(w => w.id === world.id)!;
  const sourceFile = readFileSync(`.local/zhihu-cache/story-${world.storyId}.json`);
  const source = JSON.parse(sourceFile.toString()).data;
  assert.equal(source.chapter_name, previous.source.title);
  assert.equal(source.author_name, previous.source.author);
  const response = await fetch(`http://127.0.0.1:4173/api/worlds/${world.storyId}`, { signal: AbortSignal.timeout(15_000) });
  assert.equal(response.status, 200);
  const served = await response.json() as GameWorld;
  writeFileSync(`${followupDir}/${phase}/${world.id}.http.json.gz`, gzipSync(JSON.stringify(served)));
  const fields = revisions.filter(r => r.worldId === world.id).map(r => ({ path: r.path, source: readField(world, r.path), served: readField(served, r.path) }));
  publication.push({ worldId: world.id, sourceSha256: sha256(canonical(world)), servedSha256: sha256(canonical(served)), fullWorldMatches: canonical(world) === canonical(served), matchesExceptArtwork: canonical(withoutArtwork(world)) === canonical(withoutArtwork(served)), changedNodeIds: Object.values(world.nodes).filter(n => canonical(n) !== canonical(served.nodes[n.id])).map(n => n.id), nodeDifferences: Object.values(world.nodes).flatMap(n => Object.keys(n).filter(key => canonical(n[key as keyof SceneNode]) !== canonical(served.nodes[n.id][key as keyof SceneNode])).map(field => ({ nodeId: n.id, field }))), revisedFields: fields });
  const lines = [`# ${world.id} / ${world.storyId}`, `原作：${source.chapter_name} / ${source.author_name}`, ...world.sourcePassages!.map(p => `${p.id}: ${p.quote}`)];
  for (const n of Object.values(world.nodes)) {
    lines.push(`\n## ${n.id} / ${n.title}`, ...n.text, ...n.choices.map(c => `${c.id} -> ${c.nextNodeId}: ${c.text}`));
    if (canonical(n) !== canonical(previous.nodes[n.id])) changedNodes.push({ worldId: world.id, nodeId: n.id, beforeSourceHash: productionHash(previous, previous.nodes[n.id]), afterSourceHash: productionHash(world, n) });
  }
  writeFileSync(`${followupDir}/${phase}/${world.id}.md`, lines.join('\n'));
  coverage.push({ worldId: world.id, version: world.version, nodes: Object.keys(world.nodes).length, choices: Object.values(world.nodes).reduce((n, s) => n + s.choices.length, 0), endings: Object.values(world.nodes).filter(n => n.ending).map(n => n.id), sourceEnvelopeSha256: sha256(sourceFile), sourceTextSha256: sha256(source.content), draftSha256: sha256(canonical({ ...world, ink: undefined })) });
}
writeFileSync(`${followupDir}/${phase}/worlds.json.gz`, gzipSync(JSON.stringify(worlds)));
writeFileSync(`${followupDir}/${phase}/publication.json`, JSON.stringify(publication, null, 2));
writeFileSync(`${followupDir}/${phase}/coverage.json`, JSON.stringify(coverage, null, 2));
if (phase === 'after') {
  const baselineCoverage = JSON.parse(readFileSync(`${followupDir}/before/coverage.json`, 'utf8'));
  for (const c of coverage) {
    const baseline = baselineCoverage.find((b: typeof c) => b.worldId === c.worldId);
    assert.equal(c.sourceTextSha256, baseline.sourceTextSha256, 'Original excerpt text must remain unchanged');
    if (c.sourceEnvelopeSha256 !== baseline.sourceEnvelopeSha256) cacheEnvelopeChanges.push({ worldId: c.worldId,
      beforeEnvelopeSha256: baseline.sourceEnvelopeSha256, afterEnvelopeSha256: c.sourceEnvelopeSha256,
      sourceTextUnchanged: true, sourceTitleAndAuthorUnchanged: true });
  }
  for (const r of revisions) assert.equal(readField(worlds.find(w => w.id === r.worldId)!, r.path), r.after, r.path);
  writeFileSync(`${followupDir}/changes.json`, JSON.stringify(revisions, null, 2));
  writeFileSync(`${followupDir}/art-source-hashes.json`, JSON.stringify(changedNodes, null, 2));
  const lines = ['# 本轮准确新旧文', '', ...revisions.flatMap(r => [`## ${r.worldId} / ${r.path}`, `原：${r.before}`, `现：${r.after}`, `原因：${r.reason}`, `源锚：${r.anchors.join(' / ')}；续写与结局为游戏改编。`, ''])];
  writeFileSync(`${followupDir}/changes.md`, lines.join('\n'));
}
const baselineMatchesExceptArtwork = old.filter(w => {
  const served = JSON.parse(gunzipSync(readFileSync(`${followupDir}/before/${w.id}.http.json.gz`)).toString());
  return canonical(withoutArtwork(w)) === canonical(withoutArtwork(served));
}).length;
const summary = { checkedAt: new Date().toISOString(), phase, worlds: worlds.length, revisedFields: phase === 'after' ? revisions.length : 0, changedNodes: changedNodes.length, baselineMatchesExceptArtwork, sourceMatchesHttp: publication.filter(p => p.fullWorldMatches).length, sourceMatchesExceptArtwork: publication.filter(p => p.matchesExceptArtwork).length, missingPublication: publication.filter(p => !p.matchesExceptArtwork).map(p => ({ worldId: p.worldId, nodes: p.changedNodeIds })), cacheEnvelopeChanges, imagesGenerated: 0, serverRestarted: false };
writeFileSync(`${followupDir}/${phase}/summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
