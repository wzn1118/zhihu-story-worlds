import { mkdir, readFile, writeFile, copyFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.resolve(process.argv[2] || 'E:/知乎上下文/末日45度角躺平_双平台启动包_20260910/RedRain-Windows');
const target = path.join(root, 'public/games/redrain');
const integration = path.join(root, 'scripts/redrain-integration');
const files = new Map();
const moduleFiles = new Set();
const hash = data => createHash('sha256').update(data).digest('hex');

function add(relative, reason) {
  const safe = relative.replace(/^\.\//, '').replaceAll('\\', '/');
  if (safe.includes('..') || path.isAbsolute(safe) || /first-night|runtime\//i.test(safe)) throw new Error(`Disallowed dependency: ${safe}`);
  if (!files.has(safe)) files.set(safe, new Set());
  files.get(safe).add(reason);
}

async function visit(relative) {
  if (moduleFiles.has(relative)) return;
  moduleFiles.add(relative);
  add(relative, 'main module graph');
  const content = await readFile(path.join(source, relative), 'utf8');
  for (const match of content.matchAll(/(?:from\s*|import\s*)["'](\.\/[^"']+\.js)["']/g)) {
    await visit(path.posix.join(path.posix.dirname(relative), match[1]));
  }
}

await visit('src/game.js');
for (const name of ['index.html', 'style.css', 'retro.css', 'public/vendor/lucide.min.js']) add(name, 'main entry');
// Literal fallback URLs remain reachable even when a reviewed replacement is preferred.
for (const name of [...moduleFiles, 'index.html', 'style.css', 'retro.css']) {
  const content = await readFile(path.join(source, name), 'utf8');
  for (const match of content.matchAll(/\.\/public\/[A-Za-z0-9_./-]+\.(?:png|webp|jpg|jpeg|svg|ogg|mp3|woff2?)/g)) add(match[0], `literal in ${name}`);
}
// These modules construct some URLs, so inspect their evaluated public exports too.
for (const name of ['src/decision-art.js', 'src/retro-assets.js', 'src/audio-score.js', 'src/bad-end-art.js']) {
  const exports = await import(pathToFileURL(path.join(source, name)).href);
  const inspect = value => {
    if (typeof value === 'string' && value.startsWith('./public/')) add(value, `resolved export in ${name}`);
    else if (Array.isArray(value)) value.forEach(inspect);
    else if (value && typeof value === 'object') Object.values(value).forEach(inspect);
  };
  Object.values(exports).forEach(inspect);
}

const inventory = [];
const absentSourceReferences = [];
const queue = [...files].sort(([a], [b]) => a.localeCompare(b));
await Promise.all(Array.from({ length: 12 }, async () => {
 while (queue.length) {
  const [name, reasons] = queue.shift();
  let data;
  try { data = await readFile(path.join(source, name)); }
  catch (error) {
    if (error.code !== 'ENOENT' || !name.startsWith('public/assets/')) throw error;
    absentSourceReferences.push({ path: name, reasons: [...reasons] });
    continue;
  }
  await mkdir(path.dirname(path.join(target, name)), { recursive: true });
  await copyFile(path.join(source, name), path.join(target, name));
  inventory.push({ path: name, bytes: data.byteLength, sha256: hash(data), reasons: [...reasons] });
 }
}));
inventory.sort((a, b) => a.path.localeCompare(b.path));
absentSourceReferences.sort((a, b) => a.path.localeCompare(b.path));

const { integrateMain } = await import('./redrain-integration/integrate-main.mjs');
const mainPath = path.join(target, 'src/game.js');
await writeFile(mainPath, integrateMain(await readFile(mainPath, 'utf8')));
const htmlPath = path.join(target, 'index.html');
const html = (await readFile(htmlPath, 'utf8')).replace('    <link rel="stylesheet" href="./retro.css" />', '    <link rel="stylesheet" href="./retro.css" />\n    <link rel="stylesheet" href="./embedded.css" />');
await writeFile(htmlPath, html);
for (const [from, to] of [['platform-bridge.js', 'src/platform-bridge.js'], ['embedded.css', 'embedded.css']]) {
  await copyFile(path.join(integration, from), path.join(target, to));
}
await writeFile(path.join(target, 'package.json'), JSON.stringify({ private: true, type: 'module' }) + '\n');
await mkdir(path.join(root, 'docs'), { recursive: true });
const report = { contentVersion: '20260910', entry: '/games/redrain/index.html', generatedAt: new Date().toISOString(), sourceFiles: inventory.length, sourceBytes: inventory.reduce((n, item) => n + item.bytes, 0), excluded: ['alternate game', 'runtime binaries', 'release/provider metadata', 'unreferenced assets'], absentSourceReferences, files: inventory };
await writeFile(path.join(root, 'docs/redrain-package-inventory.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ entry: report.entry, sourceFiles: report.sourceFiles, sourceBytes: report.sourceBytes, report: 'docs/redrain-package-inventory.json' }));
