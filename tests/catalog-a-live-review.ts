// Summarize actual UI evidence; this does not launch a game or seed its state.
// npx tsx tests/catalog-a-live-review.ts <acceptance-output-directory>
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { catalogWorldsA } from '../content/catalog-a.ts';

type Result = {
  name: string; worldId: string; viewport: string; variant: string; status: string;
  issue: string | null; expectedEnding: string; actualEnding: string;
  uiHash: string; expectedHash: string; layoutIssues: unknown[]; errorCount: number;
  path: string[]; dir: string;
};
type Step = { choiceId: string; visibleText: string; before: { nodeId: string; [key: string]: unknown }; after: { nodeId: string; [key: string]: unknown } };
const directory = resolve(process.argv[2] ?? '');
assert.ok(process.argv[2], 'Pass the output directory of a completed live run');
const json = async <T,>(file: string) => JSON.parse(await readFile(file, 'utf8')) as T;
const sha = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const run = await json<{ base: string; completed: number; planned: number; finished?: string; results: Result[]; retryFrom?: string; carriedPasses?: number; executedThisRun?: number }>(resolve(directory, 'results.json'));
assert.ok(run.finished, 'Live browser process must finish before final aggregation');
assert.equal(run.completed, 64);
assert.equal(run.planned, 64);
assert.equal(new Set(run.results.map(r => r.name)).size, 64);
const manifest = await json<{ worlds: { worldId: string; sha256: string; file: string }[] }>(resolve(directory, 'served-manifest.json'));
const checks: { worldId: string; viewport: string; failed: string; avoided: string; sameLastDecision: boolean }[] = [];
const sources = new Map<string, unknown>();
let stepsCount = 0;
let networkCount = 0;
let passed = 0;
let replayCases = 0;
const prose: string[] = [];
const failures: unknown[] = [];
const externalAssetFailures: unknown[] = [];
const fontStates: unknown[] = [];
const visualStates: unknown[] = [];
for (const result of run.results) {
  if (result.status !== 'passed' || result.layoutIssues.length || result.errorCount) {
    failures.push({ name: result.name, status: result.status, issue: result.issue, layoutIssues: result.layoutIssues, errorCount: result.errorCount });
    continue;
  }
  assert.equal(result.actualEnding, result.expectedEnding);
  assert.equal(result.uiHash, result.expectedHash);
  const raw = await readFile(resolve(result.dir, 'ui-world-response.json'));
  assert.equal(sha(raw), result.uiHash);
  const audited = manifest.worlds.find(w => w.worldId === result.worldId)!;
  assert.equal(sha(await readFile(audited.file)), result.uiHash);
  for (const file of ['06-last-decision.png', '09-ending.png', '10-ending-bottom.png', 'trace.zip', 'terminal-auto-save.json']) await access(resolve(result.dir, file));
  const terminal = await json<{ visuals: { backgroundState: { status: string; requestedSource: string } } }>(resolve(result.dir, '09-ending.state.json'));
  visualStates.push({ name: result.name, ...terminal.visuals.backgroundState });
  const source = await json<{ source: { contentSha256: string }; before: unknown; after: unknown }>(resolve(result.dir, '07-decision-return.json'));
  assert.deepEqual(source.before, source.after);
  const servedWorld = JSON.parse(raw.toString('utf8'));
  const cached = await json<{ data: { content: string } }>(resolve('.local/zhihu-cache', `story-${servedWorld.storyId}.json`));
  assert.equal(source.source.contentSha256, sha(cached.data.content));
  sources.set(result.worldId, source.source);
  const network = await json<{ method: string; status?: number; failed?: unknown; url: string }[]>(resolve(result.dir, 'network.json'));
  const api = network.filter(r => r.url.startsWith(`${run.base}/api/`));
  assert.ok(api.every(r => r.method === 'GET'), `${result.name}: non-read API call`);
  assert.ok(api.every(r => !r.failed && r.status === 200), `${result.name}: failed API request`);
  externalAssetFailures.push(...network.filter(r => r.failed && !r.url.startsWith(`${run.base}/api/`)).map(r => ({ case: result.name, ...r })));
  networkCount += api.length;
  const fontFile = resolve(result.dir, '09-ending.fonts.json');
  const fonts = await json<{ status: string; faces: { status: string }[] }>(fontFile).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (fonts) fontStates.push({ name: result.name, status: fonts.status, faceCount: fonts.faces.length, loading: fonts.faces.filter(face => face.status === 'loading').length, errors: fonts.faces.filter(face => face.status === 'error').length, file: fontFile });
  const steps = await json<Step[]>(resolve(result.dir, 'steps.json'));
  stepsCount += steps.length;
  assert.deepEqual(steps.slice(0, result.path.length).map(s => s.choiceId), result.path);
  if (result.variant === 'failed') {
    const prefix = result.path.slice(0, -1);
    const peer = run.results.find(r => r.worldId === result.worldId && r.viewport === result.viewport && r.variant === 'avoided' && r.path.slice(0, prefix.length).every((id, index) => id === prefix[index]));
    assert.ok(peer, `${result.name}: missing counterfactual case`);
    const alternate = await json<Step[]>(resolve(peer.dir, 'steps.json'));
    assert.deepEqual(steps[result.path.length - 1].before, alternate[result.path.length - 1].before, `${result.name}: counterfactual must start at exactly the same decision`);
    checks.push({ worldId: result.worldId, viewport: result.viewport, failed: result.actualEnding, avoided: peer.actualEnding, sameLastDecision: true });
  }
  if (result.expectedEnding === 'ending_erased' && result.variant === 'failed') {
    const replay = await json<Record<string, unknown>>(resolve(result.dir, 'replay-save-restore.json'));
    assert.equal(replay.manualRestoreAfterReload, true);
    assert.equal(replay.rewind, true);
    assert.equal(replay.replayFromOpening, true);
    await access(resolve(result.dir, 'decision-manual-save.json'));
    replayCases++;
  }
  if (result.viewport === 'desktop') {
    const read = await json<{ nodeId: string; text: string }[]>(resolve(result.dir, 'read-text.json'));
    const byNode = new Map<string, Set<string>>();
    for (const paragraph of read) {
      if (!byNode.has(paragraph.nodeId)) byNode.set(paragraph.nodeId, new Set());
      byNode.get(paragraph.nodeId)!.add(paragraph.text);
    }
    prose.push(`## ${result.name}\n${result.path.join(' > ')}\n`);
    const seen = new Set<string>();
    for (const step of steps.slice(0, result.path.length)) {
      if (!seen.has(step.before.nodeId)) prose.push(`### ${step.before.nodeId}\n${[...byNode.get(step.before.nodeId) ?? []].join('\n\n')}\n`);
      prose.push(`选择 ${step.choiceId}: ${step.visibleText}\n`);
      seen.add(step.before.nodeId);
    }
    prose.push(`### ${result.actualEnding}\n${[...byNode.get(result.actualEnding) ?? []].join('\n\n')}\n`);
  }
  passed++;
}
const servedScore = await json<{ nodes: Record<string, { text: string[] }> }>(manifest.worlds.find(w => w.worldId === 'score-room')!.file);
const localScore = catalogWorldsA.find(w => w.id === 'score-room')!;
const copyStatus = {
  worldId: 'score-room', nodeId: 'ending_broken_study',
  servedFirstParagraph: servedScore.nodes.ending_broken_study.text[0],
  localFirstParagraph: localScore.nodes.ending_broken_study.text[0],
  loadedByRoot: servedScore.nodes.ending_broken_study.text[0] === localScore.nodes.ending_broken_study.text[0],
};
const report = {
  directory, liveRunFinished: run.finished, summarizedAt: new Date().toISOString(),
  retryFrom: run.retryFrom ?? null, carriedPasses: run.carriedPasses ?? 0, executedThisRun: run.executedThisRun ?? run.completed,
  total: run.completed, passed, failures, sameDecisionPairs: checks,
  actualStoryChoiceClicks: stepsCount, readOnlyAPIResponses: networkCount,
  saveReloadRewindReplayCases: replayCases, sourceTexts: Object.fromEntries(sources),
  copyStatus, externalAssetFailures, recordedEndingFontStates: fontStates,
  endingBackgroundStates: visualStates,
  boundaries: 'Actual shared-server GETs and native UI progression. No seeded saves, intercepted responses, paid jobs, or server restart. One local ending-copy correction is reported separately in copyStatus. Screenshots are acceptance evidence, not new scene art.',
};
await writeFile(resolve(directory, 'acceptance-summary.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
await writeFile(resolve(directory, 'playthrough-review.md'), prose.join('\n'), 'utf8');

const escape = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1560, height: 1820 } });
  for (const { worldId } of manifest.worlds) {
    for (const viewport of ['mobile', 'desktop']) {
      const cases = run.results.filter(r => r.worldId === worldId && r.viewport === viewport && r.status === 'passed');
      const width = viewport === 'mobile' ? 390 : 720;
      const columns = viewport === 'mobile' ? 4 : 2;
      const panels = cases.flatMap(result => ['09-ending.png', '10-ending-bottom.png'].map(file =>
        `<figure><figcaption>${escape(result.actualEnding)} / ${file.startsWith('09') ? 'top' : 'bottom'}</figcaption><img src="${pathToFileURL(resolve(result.dir, file)).href}" width="${width}" alt="${escape(result.name)}"></figure>`));
      const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>${escape(worldId)} / ${viewport}</title><style>*{box-sizing:border-box}body{margin:0;background:#eee;color:#111;font:14px Arial,sans-serif}h1{font-size:18px;margin:12px}main{display:grid;grid-template-columns:repeat(${columns},${width}px)}figure{margin:0}figcaption{height:28px;padding:5px;background:#fff;white-space:nowrap;overflow:hidden}img{display:block;max-width:100%;height:auto}</style><h1>${escape(worldId)} / ${viewport} / actual UI screenshots</h1><main>${panels.join('')}</main></html>`;
      const file = resolve(directory, `review-${worldId}-${viewport}.html`);
      await writeFile(file, html, 'utf8');
      await page.setViewportSize({ width: width * columns, height: 960 });
      await page.goto(pathToFileURL(file).href);
      await page.waitForFunction(() => [...document.images].every(img => img.complete && img.naturalWidth > 0));
      await page.screenshot({ path: resolve(directory, `review-${worldId}-${viewport}.png`), fullPage: true });
    }
  }
} finally { await browser.close(); }
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
