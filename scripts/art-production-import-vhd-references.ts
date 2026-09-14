import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { VHD_REFERENCE_FILES, VHD_REFERENCE_REVISION } from '../server/art-production-references.ts';

const sources = [
  'E:/UserData/Temp/codex-clipboard-8c883491-bdba-4c58-9644-e77e8ac91675.jpg',
  'E:/UserData/Temp/codex-clipboard-203be394-1357-4205-a561-6c6aa5ed5bab.jpg',
  'C:/Users/10847/Downloads/微信图片_2026-09-06_120934_750.jpg',
];
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const records = [];
for (const [index, source] of sources.entries()) {
  const target = path.resolve(VHD_REFERENCE_FILES[index]);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(source, target);
  const bytes = await readFile(target);
  const sourceHash = digest(await readFile(source));
  if (sourceHash !== digest(bytes)) throw new Error('REFERENCE_COPY_HASH_MISMATCH');
  const dimensions = JSON.parse(execFileSync('python', ['-c',
    'import json,sys; from PIL import Image; im=Image.open(sys.argv[1]); im.load(); print(json.dumps({"width":im.width,"height":im.height,"format":im.format}))', target],
  { encoding: 'utf8', windowsHide: true }));
  records.push({ order: index + 1, role: index < 2 ? 'character-medium-only' : 'background-medium-only',
    source, path: target, sha256: sourceHash, bytes: bytes.length, ...dimensions,
    resized: false, visuallyInspected: true, inspection: 'Parent inspected the complete original user frame.' });
}
const manifest = { revision: VHD_REFERENCE_REVISION, importedAt: new Date().toISOString(),
  source: 'Three actual image attachments in the latest user request', records };
await writeFile(path.join(path.dirname(VHD_REFERENCE_FILES[0]), 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(manifest, null, 2));
