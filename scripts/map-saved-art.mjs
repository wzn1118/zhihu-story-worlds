import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = process.cwd();
const folder = path.join(root, 'output/coordination/art-remake-12h-20260912/full64-direct');
const jobs = path.join(root, 'output/imagegen/scene-production/.private/jobs');
const readJson = async file => JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
const source = await readJson(path.join(folder, 'missing-art-prompts-and-placements.json'));
const normalize = text => text.normalize('NFC').replace(/\r\n/g, '\n').trim();
const candidates = [];
for (const entry of await readdir(jobs, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const directory = path.join(jobs, entry.name);
  try {
    const imagePath = path.join(directory, 'native.png');
    const info = await stat(imagePath);
    const prompt = normalize(await readFile(path.join(directory, 'prompt.txt'), 'utf8'));
    const result = await readJson(path.join(directory, 'result.json')).catch(() => null);
    candidates.push({ directory, imagePath, name: entry.name, modified: info.mtimeMs, prompt, result });
  } catch { /* Only saved images with their generation prompt are candidates. */ }
}
const rows = [];
for (const row of source.rows) {
  const exact = candidates.filter(c => c.name === row.jobId || c.name.endsWith('_' + row.jobId));
  const prompt = candidates.filter(c => c.prompt === normalize(row.prompt));
  const pool = [...new Set([...exact, ...prompt])].sort((a, b) => b.modified - a.modified);
  let selected;
  for (const item of pool) {
    // Generic reaction prompts are shared by unrelated characters. Require an ID.
    if (!exact.includes(item) && source.rows.filter(r => normalize(r.prompt) === item.prompt).length !== 1) continue;
    const bytes = await readFile(item.imagePath);
    if (bytes.length < 33 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') continue;
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (item.result?.sha256 && item.result.sha256 !== sha256) continue;
    if (!item.result?.sha256 && exact.includes(item) && item.prompt !== normalize(row.prompt)) continue;
    selected = { imagePath: item.imagePath, generationDirectory: item.directory,
      match: exact.includes(item) ? 'original-job-id' : 'unique-exact-prompt',
      promptExact: item.prompt === normalize(row.prompt), sha256,
      width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), bytes: bytes.length,
      generationState: item.result?.state ?? 'saved-png', candidateCount: pool.length };
    break;
  }
  rows.push({ ...row, ...selected, ready: Boolean(selected) });
}
const report = { at: new Date().toISOString(), sourceCount: rows.length,
  readyCount: rows.filter(r => r.ready).length, missingCount: rows.filter(r => !r.ready).length,
  candidateImages: candidates.length, rows };
await writeFile(path.join(folder, 'saved-art-verified-map.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, rows: undefined,
  readyWorlds: [...new Set(rows.filter(r => r.ready).map(r => r.worldId))],
  readyKinds: rows.filter(r => r.ready).reduce((a, r) => (a[r.assetKind ?? 'scene'] = (a[r.assetKind ?? 'scene'] ?? 0) + 1, a), {}) }));
