import { appendFile, mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { createReviewSyncState, runReviewSync } from './art-production-review-sync-state.mjs';

const root = process.cwd();
const folder = path.join(root, 'output/imagegen/scene-production/formal-production-20260907');
const reviews = path.join(folder, 'reviews');
const logFile = path.join(folder, 'review-sync-watch.log');
const intervalMs = 30_000;

async function marker() {
  const files = (await readdir(reviews, { withFileTypes: true })).filter(file => /^scene_[a-f0-9]+\.json$/.test(file.name));
  const rows = [];
  for (const file of files) {
    const info = await stat(path.join(reviews, file.name));
    rows.push(`${file.name}:${info.mtimeMs}:${info.size}`);
  }
  return rows.sort().join('|');
}

async function log(event, extra = {}) {
  const row = { at: new Date().toISOString(), event, ...extra };
  await appendFile(logFile, JSON.stringify(row) + '\n');
  console.log(JSON.stringify(row));
}

const state = createReviewSyncState({ sync: async () => {
  let started;
  const result = await runReviewSync(process.execPath,
    ['--import', 'tsx', 'scripts/art-production-formal.ts', 'status'], { cwd: root },
    pid => { started = log('SYNC_STARTED', { pid }); });
  await started;
  return result;
} });

await mkdir(reviews, { recursive: true });
await mkdir(folder, { recursive: true });
do {
  const next = await marker();
  const result = await state.tick(next);
  if (result.event !== 'SYNC_SKIPPED') await log(result.event, result);
  await new Promise(resolve => setTimeout(resolve, intervalMs));
} while (true);
