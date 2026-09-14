import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createReviewSyncState, runReviewSync } from '../scripts/art-production-review-sync-state.mjs';

test('a real failing importer retries unchanged reviews and acknowledges only its successful exit', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'art-review-sync-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'importer.cjs'), `const fs = require('node:fs');
const n = fs.existsSync('attempts') ? Number(fs.readFileSync('attempts', 'utf8')) + 1 : 1;
fs.writeFileSync('attempts', String(n)); process.exit(n === 1 ? 1 : 0);`);
  let now = 1000;
  const state = createReviewSyncState({ now: () => now, retryMs: 30,
    sync: () => runReviewSync(process.execPath, ['importer.cjs'], { cwd: root }) });
  const failed = await state.tick('same-reviews');
  assert.equal(failed.event, 'SYNC_FAILED');
  assert.equal(failed.exitCode, 1);
  assert.equal(failed.retryAt, 1030);
  assert.equal((await state.tick('same-reviews')).event, 'SYNC_SKIPPED');
  now = 1030;
  assert.equal((await state.tick('same-reviews')).event, 'SYNC_FINISHED');
  assert.equal((await state.tick('same-reviews')).event, 'SYNC_SKIPPED');
  assert.equal(await readFile(path.join(root, 'attempts'), 'utf8'), '2');
  assert.equal((await state.tick('new-review')).event, 'SYNC_FINISHED');
  assert.equal(await readFile(path.join(root, 'attempts'), 'utf8'), '3');
});

test('concurrent ticks cannot overlap and edits during an import stay pending', async () => {
  let finish;
  let starts = 0;
  const state = createReviewSyncState({ sync: () => {
    starts++; return new Promise(resolve => { finish = resolve; });
  } });
  const first = state.tick('before');
  assert.equal((await state.tick('after')).event, 'SYNC_SKIPPED');
  assert.equal(starts, 1);
  finish({ ok: true }); await first;
  const second = state.tick('after');
  assert.equal(starts, 2);
  finish({ ok: true });
  assert.equal((await second).event, 'SYNC_FINISHED');
});

test('spawn failure exposes only a safe code and remains retryable', async () => {
  const result = await runReviewSync(path.join(os.tmpdir(), 'missing-art-sync-executable'), [], {});
  assert.deepEqual(result, { ok: false, code: 'SYNC_SPAWN_FAILED', systemCode: 'ENOENT' });
});
