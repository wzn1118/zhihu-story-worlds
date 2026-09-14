import { build } from 'vite';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const outDir = 'output/coordination/cutout-followup-20260910/compiled-game';
await build({ build: { outDir, emptyOutDir: false, copyPublicDir: false } });
const html = await readFile(`${outDir}/index.html`, 'utf8');
const report = { at: new Date().toISOString(), script: html.match(/src="([^"]+\.js)"/)?.[1],
  css: html.match(/href="([^"]+\.css)"/)?.[1], outDir };
await mkdir('output/coordination/black-pages-20260910', { recursive: true });
await writeFile('output/coordination/black-pages-20260910/build.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
