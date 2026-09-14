import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VHD_REFERENCE_FILES } from '../server/art-production-references.ts';
import { publishedArtSources } from '../server/art-production-published.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const record = path.join(root, 'output/imagegen/scene-production/catalog-sync.json');
const watch = process.argv.includes('--watch');
let prior = '';
if (watch) {
  try {
    const existing = JSON.parse(await readFile(record, 'utf8'));
    if (existing.watching && existing.pid !== process.pid) {
      process.kill(existing.pid, 0);
      process.exit(0); // A live owner already watches this catalog; no duplicate daemon.
    }
  } catch { /* no prior watcher, or prior process has ended */ }
}
async function fingerprint() {
  const hash = createHash('sha256');
  const files = (await readdir(path.join(root, 'content'))).filter(f => /\.(ts|json)$/.test(f)).sort().map(f => `content/${f}`);
  files.push('docs/art-direction.md', 'docs/character-bible.md', 'server/art-production-prompts.ts', 'server/art-production-delegates.ts',
    'server/art-production-references.ts');
  const studies = await readdir(path.join(root, 'server/art-production-studies')).catch(() => []);
  files.push(...studies.filter(file => file.endsWith('.ts')).sort().map(file => `server/art-production-studies/${file}`));
  const artTeam = 'output/imagegen/scene-production/art-team';
  const optional = [`${artTeam}/cel-drawing/cohort-direction.json`, `${artTeam}/painted-background/cohort/identities.json`];
  const painted = `${artTeam}/painted-background/batch-vhd`;
  for (const directory of await readdir(path.join(root, painted), { withFileTypes: true }).catch(() => [])) {
    if (directory.isDirectory()) optional.push(`${painted}/${directory.name}/directions.json`, `${painted}/${directory.name}/source-nodes.json`);
  }
  const composed = `${artTeam}/scene-composition/cohort-vhd-20260906`;
  for (const file of await readdir(path.join(root, composed)).catch(() => [])) {
    if (file.endsWith('-direction.json')) optional.push(`${composed}/${file}`);
  }
  for (const file of [...optional, ...VHD_REFERENCE_FILES].sort()) {
    try { hash.update(file); hash.update(await readFile(path.join(root, file))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; hash.update('missing'); }
  }
  for (const file of files) { hash.update(file); hash.update(await readFile(path.join(root, file))); }
  hash.update(JSON.stringify(await publishedArtSources(root)));
  return hash.digest('hex');
}
async function sync() {
  const digest = await fingerprint(); if (digest === prior) return;
  // Fresh process avoids cached authored modules as other conversations revise stories.
  const child = spawn(process.execPath, ['--import', 'tsx', path.join(root, 'scripts/art-production.ts'), 'prepare', 'all'], {
    cwd: root, stdio: 'ignore', windowsHide: true,
  });
  let code = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  const published = await publishedArtSources(root);
  if (code === 0) for (const source of published) {
    const imported = spawn(process.execPath, ['--import', 'tsx', path.join(root, 'scripts/art-production-published-refresh.ts'),
      source.projectId, 'refresh'], { cwd: root, stdio: 'ignore', windowsHide: true });
    const importedCode = await new Promise<number | null>((resolve, reject) => {
      imported.once('error', reject); imported.once('exit', resolve);
    });
    if (importedCode !== 0) { code = importedCode; break; }
  }
  await mkdir(path.dirname(record), { recursive: true });
  await writeFile(`${record}.tmp`, JSON.stringify({ schemaVersion: 1, at: new Date().toISOString(), pid: process.pid,
    watching: watch, sourceFingerprint: digest, status: code === 0 ? 'prepared-without-paid-requests' : 'source-import-incomplete-last-queue-retained',
    paidRequests: 0, intervalSeconds: 30, publishedWorlds: published }, null, 2));
  await rename(`${record}.tmp`, record);
  if (code === 0) prior = digest;
}
do { try { await sync(); } catch { /* concurrent source edit: retain last queue and retry next poll */ }
  if (watch) await new Promise(resolve => setTimeout(resolve, 30_000));
} while (watch);
