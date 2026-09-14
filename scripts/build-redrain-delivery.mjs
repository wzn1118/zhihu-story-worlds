import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { brotliCompressSync, gzipSync, constants } from 'node:zlib';
import { build, transform } from 'esbuild';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const argument = process.argv.indexOf('--game-dir');
if (argument < 0 || !process.argv[argument + 1]) throw new Error('Usage: node scripts/build-redrain-delivery.mjs --game-dir <staged game directory>');
const gameRoot = resolve(process.argv[argument + 1]);
const buildRoot = join(gameRoot, 'build');
await mkdir(buildRoot, { recursive: true });
const indexPath = join(gameRoot, 'index.html');
let html = await readFile(indexPath, 'utf8');
const sourceNames = (await readdir(join(gameRoot, 'src'))).filter(name => name.endsWith('.js'));
const sourceFiles = await Promise.all(sourceNames.map(name => readFile(join(gameRoot, 'src', name), 'utf8')));
const vendorPath = join(gameRoot, 'public/vendor/lucide.min.js');
const vendor = await readFile(vendorPath, 'utf8');
if (!vendor.includes('@license lucide v0.468.0 - ISC')) throw new Error('Review icon extraction before changing the trusted Lucide version.');
const context = createContext({});
runInContext(vendor, context, { timeout: 5000, filename: 'trusted-local-lucide.min.js' });
const iconNames = new Set([...html.matchAll(/data-lucide=["']([\w-]+)["']/g)].map(match => match[1]));
for (const source of sourceFiles) {
  for (const match of source.matchAll(/data-lucide=["']([\w-]+)["']/g)) iconNames.add(match[1]);
  for (const assignment of source.matchAll(/dataset\.lucide\s*=\s*([^;]+);/g)) {
    for (const literal of assignment[1].matchAll(/["']([\w-]+)["']/g)) iconNames.add(literal[1]);
  }
}
const icons = {};
for (const name of [...iconNames].sort()) {
  const exported = name.replace(/(^|-)(\w)/g, (_match, _separator, letter) => letter.toUpperCase());
  if (!Array.isArray(context.lucide.icons[exported])) throw new Error(`Unknown Lucide icon ${name}`);
  icons[exported] = context.lucide.icons[exported];
}
// Retain the exact upstream DOM/attribute/createIcons behavior; drop unused icon data.
const helpers = vendor.match(/"use strict";([\s\S]*?),h=\{xmlns:/)?.[1];
if (!helpers?.includes('E0=') || !helpers.includes('I0=')) throw new Error('Unexpected Lucide helper layout.');
const license = await readFile(join(projectRoot, 'node_modules/lucide-react/LICENSE'), 'utf8');
const iconModule = `/*! lucide v0.468.0 — ISC\n${license} */\n${helpers};\nconst W$=${JSON.stringify(icons)};\nglobalThis.lucide={icons:W$,createElement:I0,createIcons:${context.lucide.createIcons.toString()}};`;
const minifiedIcons = await transform(iconModule, { loader: 'js', minify: true, legalComments: 'inline', charset: 'utf8', target: ['es2020'] });
const result = await build({
  stdin: { contents: 'import "redrain:icons"; import "./src/game.js";', resolveDir: gameRoot, sourcefile: 'redrain-entry.js' },
  bundle: true, minify: true, format: 'esm', platform: 'browser', target: ['es2020'],
  legalComments: 'inline', charset: 'utf8', write: false, metafile: true,
  plugins: [{ name: 'lucide-subset', setup(builder) {
    builder.onResolve({ filter: /^redrain:icons$/ }, () => ({ path: 'icons', namespace: 'redrain-icons' }));
    builder.onLoad({ filter: /.*/, namespace: 'redrain-icons' }, () => ({ contents: iconModule, loader: 'js' }));
  } }],
});
const styles = await Promise.all(['style.css', 'retro.css', 'embedded.css'].map(name => readFile(join(gameRoot, name), 'utf8')));
// CSS moves one directory deeper; all existing asset URLs remain game-root-relative.
const cssSource = styles.join('\n').replace(/url\((['"]?)\.\/public\//g, 'url($1../public/');
const css = await transform(cssSource, { loader: 'css', minify: true, legalComments: 'inline', charset: 'utf8', target: ['es2020'] });
const artifacts = {};
for (const [name, extension, contents] of [['game', 'js', result.outputFiles[0].contents], ['game', 'css', Buffer.from(css.code)]]) {
  const data = Buffer.from(contents);
  const digest = createHash('sha256').update(data).digest('hex').slice(0, 16);
  const filename = `${name}.${digest}.${extension}`;
  const compressed = brotliCompressSync(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT } });
  const gzip = gzipSync(data, { level: 9 });
  await Promise.all([writeFile(join(buildRoot, filename), data), writeFile(join(buildRoot, `${filename}.br`), compressed), writeFile(join(buildRoot, `${filename}.gz`), gzip)]);
  artifacts[extension] = { path: `./build/${filename}`, bytes: data.length, brotliBytes: compressed.length, gzipBytes: gzip.length };
}
html = html.replace(/\s*<link\b[^>]*data-redrain-build[^>]*>/g, '')
  .replace(/\s*<link\b[^>]*rel="stylesheet"[^>]*href="\.\/(?:style|retro|embedded)\.css"[^>]*>/g, '')
  .replace(/\s*<script\b[^>]*(?:data-redrain-build|src="\.\/(?:public\/vendor\/lucide\.min\.js|src\/game\.js)(?:\?[^"\s]*)?")[^>]*><\/script>/g, '')
  .replace('</head>', `  <link data-redrain-build rel="stylesheet" href="${artifacts.css.path}" />\n    <link data-redrain-build rel="modulepreload" href="${artifacts.js.path}" />\n  </head>`)
  .replace('</body>', `  <script data-redrain-build type="module" src="${artifacts.js.path}"></script>\n  </body>`);
await writeFile(indexPath, html);
const before = { javascriptBytes: (await stat(vendorPath)).size + (await Promise.all(sourceNames.map(name => stat(join(gameRoot, 'src', name))))).reduce((sum, metadata) => sum + metadata.size, 0), cssBytes: styles.reduce((sum, source) => sum + Buffer.byteLength(source), 0), javascriptRequests: sourceNames.length + 1, cssRequests: styles.length };
const report = { gameRoot: relative(projectRoot, gameRoot), iconCount: iconNames.size, icons: [...iconNames].sort(), lucide: { originalBytes: Buffer.byteLength(vendor), subsetBytes: Buffer.byteLength(minifiedIcons.code) }, before, artifacts, sourceModules: Object.keys(result.metafile.inputs).length };
await writeFile(join(buildRoot, 'delivery-manifest.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
