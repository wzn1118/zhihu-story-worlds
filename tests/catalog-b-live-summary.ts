import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { catalogWorldsB } from '../content/catalog-b.ts';
import { getWorld } from '../server/worlds.ts';
import { auditBGraph } from './catalog-b-graph.ts';
import { catalogBExpansions } from '../content/catalog-b-expansions.ts';
import { pressureWitness } from './catalog-b-live-pressure.ts';

const root = 'output/playwright/catalog-b-live';
const output = process.env.B_LIVE_SUMMARY_OUTPUT ?? root;
const read = (path: string) => JSON.parse(readFileSync(`${root}/${path}/report.json`, 'utf8'));
const baseline = read('baseline'), late = read('late-cases');
const correctedReports = [read('corrected-late-cases'), read('corrected-wrong-departure')];
const correctedResults = new Map<string, any>();
for (const r of correctedReports) for (const c of r.results.filter((c: any) => c.pass)) correctedResults.set(`${c.worldId}/${c.route}/${c.endingId}/${c.viewport.width}`, c);
assert.equal(baseline.pass, true);
assert.equal(late.pass, true);
assert.equal(correctedResults.size, 10);
const pressureReports = ['pressure', 'pressure-island-mobile-chrome', 'pressure-wrong-departure', 'corrected-shore-pressure'].map(read);
if (existsSync(`${root}/corrected-judgment-pressure/report.json`)) pressureReports.push(read('corrected-judgment-pressure'));
if (process.env.B_LIVE_PRESSURE_REPORT) pressureReports.push(read(process.env.B_LIVE_PRESSURE_REPORT));
const pressure = new Map<string, any>();
for (const report of pressureReports) for (const result of report.results) if (result.pass && result.naturalDepletion) {
  pressure.set(`${result.worldId}/${result.route}/${result.viewport.width}`, result);
}
const visited = new Set<string>();
for (const report of [baseline, late, ...pressureReports]) for (const result of report.results.filter((r: any) => r.pass)) {
  for (const s of result.scenes) visited.add(`${result.worldId}/${s.nodeId}`);
  visited.add(`${result.worldId}/${result.endingId}`);
}
const versions = [], localPressureProofs = [];
for (const authored of catalogWorldsB) {
  // The server exports the final authored registry, including shared prose edits.
  const world = getWorld(authored.storyId);
  const response = await fetch(`http://127.0.0.1:4173/api/worlds/${world.storyId}`, { signal: AbortSignal.timeout(15_000) });
  assert.equal(response.status, 200);
  const raw = await response.text(), served = JSON.parse(raw);
  const changedNodes = Object.values(world.nodes).filter(n => JSON.stringify(n) !== JSON.stringify(served.nodes[n.id])).map(n => n.id);
  const changedNodeFields = Object.fromEntries(changedNodes.map(id => {
    const source = world.nodes[id] as unknown as Record<string, unknown>;
    const live = (served.nodes[id] ?? {}) as Record<string, unknown>;
    return [id, Object.keys({ ...source, ...live }).filter(key => JSON.stringify(source[key]) !== JSON.stringify(live[key]))];
  }));
  const prior = JSON.parse(readFileSync(`${root}/baseline/${world.id}.live-world.json`, 'utf8'));
  const contentRevisionChangedNodes = Object.values(world.nodes).filter(n => JSON.stringify(n) !== JSON.stringify(prior.nodes[n.id])).map(n => n.id);
  const art = await fetch(`http://127.0.0.1:4173${served.background}`, { signal: AbortSignal.timeout(15_000) });
  const graph = auditBGraph(authored);
  for (const route of catalogBExpansions[authored.id].routes) localPressureProofs.push({ worldId: world.id, version: world.version, route: route.id, ...pressureWitness(world, route.entry) });
  versions.push({ worldId: world.id, sourceVersion: world.version, servedVersion: served.version, servedSha256: createHash('sha256').update(raw).digest('hex'), sourceMatchesServedNodes: !changedNodes.length, changedNodes, changedNodeFields, contentRevisionChangedNodes, currentNodes: Object.keys(world.nodes).length, currentEdges: graph.atEdge.size, currentRoutingStates: graph.states, artStatus: art.status, artContentType: art.headers.get('content-type'), uiBackgroundState: baseline.results.find((r: any) => r.worldId === world.id).ending.visuals.backgroundState });
}
const summary = {
  checkedAt: new Date().toISOString(),
  base: baseline.base,
  baseline: { pass: baseline.pass, runs: baseline.results.length, pathsClicked: baseline.results.reduce((n: number, r: any) => n + r.path.length, 0), routeViewportReaderSaveRewindChecks: baseline.results.filter((r: any) => r.reader && r.persistence).length, darkEndingRuns: baseline.results.filter((r: any) => r.ending.tone === 'dark').length },
  lateCases: { pass: late.pass, runs: late.results.length },
  correctedLateCases: { pass: true, runs: correctedResults.size, results: [...correctedResults.values()].map((r: any) => ({ worldId: r.worldId, version: r.version, endingId: r.endingId, viewport: r.viewport, screenshot: r.screenshot })) },
  additionalPressureReport: process.env.B_LIVE_PRESSURE_REPORT ?? null,
  naturallyDepletedRouteViewports: [...pressure.values()].map(r => ({ worldId: r.worldId, version: r.version, route: r.route, width: r.viewport.width, nodeId: r.naturalDepletion.nodeId, resources: r.naturalDepletion.resources, blocked: r.naturalDepletion.blocked, screenshot: r.naturalDepletion.screenshot })),
  originalPressureGaps: ['island-broadcast/shore', 'wrong-realm/judgment'],
  remainingPressureGaps: catalogWorldsB.flatMap(world => catalogBExpansions[world.id].routes.map(route => `${world.id}/${route.id}`)).filter(route => !pressure.has(`${route}/1440`) || !pressure.has(`${route}/320`)).map(route => ({ route, result: 'Real UI recheck still pending. Check served version in variants before replay.' })),
  localPressureProofs,
  uniqueLiveNodesRead: visited.size,
  variants: versions,
  sourceRegistry: 'Final getWorld export, including shared prose revisions',
  sourceMatchesAllServedNodes: versions.every(world => world.sourceMatchesServedNodes),
  artAcceptance: 'Not accepted by this summary: current HTTP status/content type is in variants; uiBackgroundState is historical baseline evidence, not a fresh pixel review. No paid requests or generated images.',
};
mkdirSync(output, { recursive: true });
writeFileSync(`${output}/summary.json`, JSON.stringify(summary, null, 2));
writeFileSync(`${output}/publication-check.json`, JSON.stringify(versions, null, 2));
console.log(JSON.stringify(summary, null, 2));
