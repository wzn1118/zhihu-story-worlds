import express from 'express';
import { resolve } from 'node:path';
import { createApp } from '../server/app.ts';
import { artPrivateFileGuard } from '../server/art-production.ts';
import { liveGeneratedArt } from '../server/live-generated-art.ts';

const output = resolve('output/zhihu-liukan/build');
if (process.argv.includes('--build')) {
  const { build } = await import('vite');
  await build({ build: { outDir: output, emptyOutDir: false, copyPublicDir: false } });
  if (process.argv.includes('--build-only')) process.exit(0);
}
const app = createApp();
app.use(artPrivateFileGuard);
app.use('/generated-art', liveGeneratedArt());
app.use(express.static(resolve('public')));
app.use(express.static(output));
app.get('/{*path}', (_request, response) => response.sendFile(resolve(output, 'index.html')));
const port = Number(process.env.PORT ?? 4178);
const server = app.listen(port, '127.0.0.1', () => console.log(JSON.stringify({ port, pid: process.pid })));
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => server.close());
