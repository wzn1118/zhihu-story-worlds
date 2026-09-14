import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { readArtSourceBook } from '../server/art-production-books.ts';

test('a clean checkout uses packaged books while local authoring revisions take precedence', async t => {
  const root = await mkdtemp(join(tmpdir(), 'art-books-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const packaged = join(root, 'content/art-books/cel-drawing.json');
  const local = join(root, 'output/imagegen/scene-production/art-team/cel-drawing/short-production-20260907/book.json');
  await mkdir(dirname(packaged), { recursive: true });
  await writeFile(packaged, JSON.stringify({ revision: 'packaged' }));
  assert.deepEqual(await readArtSourceBook(root, 'cel-drawing'), { revision: 'packaged' });
  await mkdir(dirname(local), { recursive: true });
  await writeFile(local, JSON.stringify({ revision: 'local' }));
  assert.deepEqual(await readArtSourceBook(root, 'cel-drawing'), { revision: 'local' });
  await writeFile(local, '{');
  await assert.rejects(readArtSourceBook(root, 'cel-drawing'), SyntaxError);
  await assert.rejects(readArtSourceBook(root, 'missing-owner'), { code: 'ENOENT' });
});
