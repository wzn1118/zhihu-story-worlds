import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const manifest = JSON.parse(await readFile('public/generated-art/character-cutouts.json', 'utf8'));
const actor = manifest.entries.find(entry => entry.worldId === 'blue-blood' && entry.nodeId === '__art_reaction_fangnuo');
const base = 'http://127.0.0.1:4173';
const report = { checkedAt: new Date().toISOString(), manifestAt: manifest.generatedAt, counts: manifest.counts };
report.completedBrowserChecks = await Promise.all([
  'output/playwright/live-art-refresh-20260910/verification.json',
  'output/coordination/ceo-cutout-integration-20260910/version-retry/report.json',
].map(async file => {
  const check = JSON.parse(await readFile(file, 'utf8'));
  return { file, status: check.status, compiled: check.compiled, views: check.views?.length };
}));
const previous = JSON.parse(await readFile('output/coordination/cutout-game-integration-20260910/ceo-final-coverage.json', 'utf8'));
const previousUrls = new Set(previous.worlds.flatMap(world => world.attached.map(portrait => portrait.url)));
report.addedSince134 = manifest.entries.filter(entry => !previousUrls.has(entry.url));
report.newPngChecks = await Promise.all(report.addedSince134.map(async entry => {
  try {
    const response = await fetch(base + entry.url, { signal: AbortSignal.timeout(8000), cache: 'no-store' });
    const bytes = Buffer.from(await response.arrayBuffer());
    return { jobId: entry.jobId, http: response.status, shaMatches: createHash('sha256').update(bytes).digest('hex') === entry.sha256,
      dimensionsMatch: bytes.length > 24 && bytes.readUInt32BE(16) === entry.width && bytes.readUInt32BE(20) === entry.height };
  } catch (error) { return { jobId: entry.jobId, error: error.message }; }
}));
for (const [name, path] of [['health', '/api/health'], ['manifest', '/generated-art/character-cutouts.json'], ['fangnuo', actor.url]]) {
  try {
    const response = await fetch(base + path, { signal: AbortSignal.timeout(5000), cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    if (name === 'fangnuo') report.fangnuo = { jobId: actor.jobId, shaMatches: createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex') === actor.sha256 };
    else {
      const data = await response.json();
      report[name] = name === 'manifest' ? { approved: data.entries.length, generatedAt: data.generatedAt } : { status: data.status };
    }
  } catch (error) { report[name] = { error: error.message }; }
}
await writeFile('output/coordination/ceo-cutout-integration-20260910/latest-handoff-check.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, addedSince134: report.addedSince134.map(({ worldId, nodeId, jobId }) => ({ worldId, nodeId, jobId })) }));
