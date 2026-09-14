import assert from 'node:assert/strict';
import { test } from 'node:test';
import { replaceArtFile } from '../server/art-production-files.ts';

test('atomic file replacement retries a transient Windows sharing violation without deleting either file', async () => {
  let calls = 0;
  const waits: number[] = [];
  await replaceArtFile('original.tmp', 'state.json', async (source, target) => {
    assert.equal(source, 'original.tmp'); assert.equal(target, 'state.json');
    if (++calls < 3) throw Object.assign(new Error('busy'), { code: 'EPERM' });
  }, async wait => { waits.push(wait); });
  assert.equal(calls, 3); assert.deepEqual(waits, [50, 100]);
});

test('file sharing retry is bounded and other filesystem errors fail immediately', async () => {
  let calls = 0;
  await assert.rejects(replaceArtFile('a', 'b', async () => {
    calls++; throw Object.assign(new Error('still busy'), { code: 'EBUSY' });
  }, async () => {}), /still busy/);
  assert.equal(calls, 10);
  calls = 0;
  await assert.rejects(replaceArtFile('a', 'b', async () => {
    calls++; throw Object.assign(new Error('missing'), { code: 'ENOENT' });
  }, async () => {}), /missing/);
  assert.equal(calls, 1);
});
