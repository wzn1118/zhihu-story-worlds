import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { workshopProseFields } from '../shared/workshop-prose-fields.ts';
import type { GameWorld } from '../shared/types.ts';

const id = 'import-6febc2f6-3a12-41ac-bae5-6d05ebc68c10';
const world = JSON.parse(await readFile(resolve('.local/story-workshop/projects', id, 'r1/world.json'), 'utf8')) as GameWorld;
const dir = resolve('shared/generated-copy');
await mkdir(dir, { recursive: true });
if (process.argv.includes('--fixture')) {
  await writeFile(resolve('tests/fixtures/workshop-pre-copy.json.gz'), gzipSync(JSON.stringify(world)), { flag: 'wx' });
} else {
  await writeFile(resolve(dir, 'seventh-second.baseline.json'), JSON.stringify(workshopProseFields(world), null, 2), { encoding: 'utf8', flag: 'wx' });
}
console.log('Stored the original visible fields for exact-match editorial revisions; source and Ink excluded.');
