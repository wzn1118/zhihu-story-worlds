import express from 'express';
import { resolve } from 'node:path';
import { createApp } from '../server/app.ts';
import { artPrivateFileGuard } from '../server/art-production.ts';

// Keep batch-written artwork live without a development file watcher.
const compiled = resolve('output/coordination/cutout-followup-20260910/compiled-game');
if (process.argv.includes('--build')) {
  const { build } = await import('vite');
  await build({ build: { outDir: compiled, emptyOutDir: false, copyPublicDir: false } });
}
const app = createApp();
app.use(artPrivateFileGuard);
app.use(express.static(resolve('public')));
app.use(express.static(compiled));
app.get('/{*path}', (_request, response) => response.sendFile(resolve(compiled, 'index.html')));
const server = app.listen(4173, '127.0.0.1', () => console.log('Cutout acceptance preview: http://127.0.0.1:4173'));
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
