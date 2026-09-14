import express from 'express';
import { resolve } from 'node:path';
import { createApp } from '../server/app.ts';
import { artPrivateFileGuard } from '../server/art-production.ts';
import { liveGeneratedArt } from '../server/live-generated-art.ts';

const output = resolve(process.argv.find(value => value.startsWith('--output='))?.slice(9) ?? 'output/liukan-intelligence/build');
if (process.argv.includes('--build')) {
  const { build } = await import('vite');
  await build({ build: { outDir: output, emptyOutDir: false, copyPublicDir: false } });
  if (process.argv.includes('--build-only')) process.exit(0);
}
const app = express();
// Reuse the existing authenticated browser owner during integration QA.
// The game/service code is local; only browser operations pass to that live owner.
const browserOwner = process.argv.find(value => value.startsWith('--browser-owner='))?.slice(16) ?? (process.argv.includes('--reuse-browser-4178') ? '4178' : undefined);
if (browserOwner && !/^\d{4,5}$/.test(browserOwner)) throw new Error('Invalid browser owner port');
if (browserOwner) {
  app.use('/api/zhihu-browser', express.json({ limit: '1mb' }), async (request, response) => {
    if (request.path === '/close') { response.status(409).json({ error: { message: '保留正在使用的知乎浏览窗口。' } }); return; }
    try {
      const upstream = await fetch(`http://127.0.0.1:${browserOwner}/api/zhihu-browser` + request.url, {
        method: request.method, headers: { 'content-type': 'application/json' },
        ...(request.method === 'GET' ? {} : { body: JSON.stringify(request.body ?? {}) }), signal: AbortSignal.timeout(45000),
      });
      response.status(upstream.status).type('application/json').send(await upstream.text());
    } catch { response.status(502).json({ error: { message: '已打开的知乎窗口暂时没有回复。' } }); }
  });
}
app.use(createApp());
app.use(artPrivateFileGuard);
app.use('/generated-art', liveGeneratedArt());
app.use(express.static(resolve('public')));
app.use(express.static(output));
app.get('/{*path}', (_request, response) => response.sendFile(resolve(output, 'index.html')));
const port = Number(process.argv.find(value => value.startsWith('--port='))?.slice(7) ?? process.env.PORT ?? 4180);
const server = app.listen(port, '127.0.0.1', () => console.log(JSON.stringify({ port, pid: process.pid })));
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => server.close());
