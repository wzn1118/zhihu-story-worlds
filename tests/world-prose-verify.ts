import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { authoredWorlds } from '../content/worlds.ts';
import { compileWorld } from '../server/worlds.ts';
import { restoreSession } from '../src/game.ts';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const directory = process.env.WORLD_PROSE_OUTPUT ?? 'output/world-prose';
const browserDirectory = process.env.WORLD_PROSE_BROWSER_OUTPUT ?? 'output/playwright/world-prose';
const testLogPath = process.env.WORLD_PROSE_TEST_LOG ?? 'output/world-prose-full-test.log';
const buildLogPath = process.env.WORLD_PROSE_BUILD_LOG ?? 'output/world-prose-build.log';
const manifestText = readFileSync(`${directory}/scene-manifest.json`, 'utf8');
const manifest = JSON.parse(manifestText);
const report = JSON.parse(readFileSync(`${browserDirectory}/report.json`, 'utf8'));
assert.equal(report.manifestSha256, sha(manifestText));
assert.equal(report.completedCases, process.env.WORLD_PROSE_ENDINGS === '1' ? manifest.worlds.reduce((n: number, w: { endingCases: unknown[] }) => n + 2 + w.endingCases.length * 2, 0) : 40);
assert.equal(report.completedCases, report.expectedCases);
if (report.carriedEvidence) {
  const evidence = report.carriedEvidence;
  const oldManifestText = readFileSync(evidence.manifest, 'utf8');
  const oldReportText = readFileSync(evidence.report, 'utf8');
  assert.equal(sha(oldManifestText), evidence.manifestSha256);
  assert.equal(sha(oldReportText), evidence.reportSha256);
  const oldManifest = JSON.parse(oldManifestText), oldReport = JSON.parse(oldReportText);
  assert.equal(oldReport.manifestSha256, evidence.manifestSha256);
  for (const id of evidence.worldIds) {
    const old = oldManifest.worlds.find((w: { id: string }) => w.id === id);
    const current = manifest.worlds.find((w: { id: string }) => w.id === id);
    assert.equal(old.worldSha256, current.worldSha256, `${id}: reused world changed`);
    assert.deepEqual(old.browserCase, current.browserCase);
    assert.deepEqual(old.endingCases, current.endingCases);
    assert.deepEqual(report.results.filter((r: { worldId: string }) => r.worldId === id), oldReport.results.filter((r: { worldId: string }) => r.worldId === id));
  }
}
const reader = readFileSync(`${directory}/read-through.md`, 'utf8');
let scenes = 0, sourceAnchors = 0;
const sources: unknown[] = [];
for (const entry of manifest.worlds) {
  const authored = authoredWorlds.find(w => w.id === entry.id)!;
  const world = compileWorld(authored);
  const exported = JSON.parse(readFileSync(entry.worldFile, 'utf8'));
  assert.deepEqual(exported, JSON.parse(JSON.stringify(world)), `${entry.id}: stale export`);
  assert.equal(entry.worldSha256, sha(JSON.stringify(world)));
  assert.equal(entry.unchangedSourceSha256, entry.prePassSourceSha256);
  for (const change of entry.changes.filter((f: { path: string }) => /\.text\.\d+$/.test(f.path))) assert.ok(reader.includes(change.after));
  const cases = [entry.browserCase, ...(process.env.WORLD_PROSE_ENDINGS === '1' ? entry.endingCases : [])];
  for (const target of cases) for (const width of [1440, 320]) {
    assert.equal(report.results.filter((r: { worldId: string; nodeId: string; viewport: { width: number } }) => r.worldId === entry.id && r.nodeId === target.nodeId && r.viewport.width === width).length, 1);
  }
  const source = JSON.parse(readFileSync(`.local/zhihu-cache/story-${world.storyId}.json`, 'utf8')).data;
  assert.equal(typeof source.content, 'string');
  assert.equal(new URL(world.source.url).protocol, 'https:');
  for (const anchor of world.sourcePassages ?? []) {
    assert.ok(source.content.includes(anchor.quote), `${entry.id}/${anchor.id}: quote differs from cache`);
    sourceAnchors++;
  }
  sources.push({ worldId: world.id, url: world.source.url, sourceTextSha256: sha(source.content), anchors: world.sourcePassages?.length ?? 0 });
  for (const scene of entry.scenes) {
    assert.equal(scene.sceneSha256, sha(JSON.stringify(world.nodes[scene.id])), `${entry.id}/${scene.id}`);
    scenes++;
  }
  const saved = JSON.parse(readFileSync(entry.browserCase.saveFile, 'utf8'));
  const restored = restoreSession(world, saved);
  assert.equal(restored.node.id, entry.browserCase.nodeId);
  assert.equal(restored.paragraphs[restored.paragraphIndex], entry.browserCase.text);
}
for (const result of report.results) {
  assert.deepEqual(result.pageErrors, []);
  assert.ok(result.layout.scrollWidth <= result.viewport.width);
  const png = readFileSync(result.screenshot);
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), result.viewport.width);
  assert.ok(png.readUInt32BE(20) >= result.viewport.height);
}
const testLog = readFileSync(testLogPath, 'utf8');
const passedTests = Number(testLog.match(/^# pass (\d+)$/m)?.[1]);
const totalTests = Number(testLog.match(/^# tests (\d+)$/m)?.[1]);
assert.equal(passedTests, totalTests);
assert.match(testLog, /^# fail 0$/m);
const buildLog = readFileSync(buildLogPath, 'utf8');
assert.match(buildLog, /built in/);
let repositoryTests: { total: number; passed: number; failed: number; log: string } | undefined;
if (process.env.WORLD_PROSE_REPOSITORY_TEST_LOG) {
  const log = process.env.WORLD_PROSE_REPOSITORY_TEST_LOG;
  const text = readFileSync(log, 'utf8');
  repositoryTests = { total: Number(text.match(/^# tests (\d+)$/m)?.[1]), passed: Number(text.match(/^# pass (\d+)$/m)?.[1]), failed: Number(text.match(/^# fail (\d+)$/m)?.[1]), log };
  assert.equal(repositoryTests.total, repositoryTests.passed + repositoryTests.failed);
}
const skillState = JSON.parse(readFileSync(`${browserDirectory}/skill-client/state-0.json`, 'utf8'));
assert.equal(skillState.mode, 'playing');
assert.equal(skillState.world, authoredWorlds.find(w => w.id === 'hollow-immortals')!.title);
const verification = {
  verifiedAt: new Date().toISOString(), ...manifest.summary,
  currentSceneHashesChecked: scenes, sourceAnchorsChecked: sourceAnchors, sources,
  readThrough: { file: `${directory}/read-through.md`, sha256: sha(reader) },
  tests: { scope: process.env.WORLD_PROSE_TEST_SCOPE ?? 'Repository', total: totalTests, passed: passedTests, log: testLogPath },
  repositoryTests,
  build: buildLogPath,
  browser: { cases: report.completedCases, report: `${browserDirectory}/report.json`, manifestSha256: report.manifestSha256, delivery: report.delivery },
  skillClient: { state: `${browserDirectory}/skill-client/state-0.json`, screenshot: `${browserDirectory}/skill-client/shot-0.png` },
};
writeFileSync(`${directory}/verification.json`, JSON.stringify(verification, null, 2));
console.log(JSON.stringify({ scenes, sourceAnchors, tests: passedTests, browserCases: report.completedCases }, null, 2));
