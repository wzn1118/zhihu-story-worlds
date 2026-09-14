import express from 'express';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import { createApp } from './app.ts';
import { artPrivateFileGuard } from './art-production.ts';
import { liveGeneratedArt } from './live-generated-art.ts';
import { redrainStatic } from './redrain-static.ts';
import { currentUser } from './auth.ts';

const production = process.argv.includes('--production') || process.env.NODE_ENV === 'production';
if (production && process.env.PUBLIC_MODE === '1' && (process.env.SESSION_SECRET?.length ?? 0) < 48) {
  throw new Error('Public production requires a persistent SESSION_SECRET of at least 48 characters.');
}
const app = createApp();
if (process.env.PUBLIC_MODE === '1') app.use('/games/redrain', async (request, response, next) => {
  if (request.path !== '/' && !/\.html$/i.test(request.path)) return next();
  response.setHeader('Cache-Control', 'no-store');
  if (request.query.embedded !== '1' || !await currentUser(request)) return response.redirect(302, '/');
  next();
});
app.get('/healthz', (_request, response) => response.set('Cache-Control', 'no-store').json({ status: 'ok', service: 'zhihu-story-worlds' }));
app.use(artPrivateFileGuard);
app.use('/generated-art', liveGeneratedArt());
app.use('/product-book', express.static(resolve(process.cwd(), 'output', 'pdf', 'redleaf-product-plan-20260913'), { index: 'index.html' }));
const server = createServer(app);
let closeVite: (() => Promise<void>) | undefined;

if (production) {
  app.use('/games/redrain', redrainStatic());
  app.use(express.static(resolve(process.cwd(), 'dist'), { dotfiles: 'deny' }));
  app.use(express.static(resolve(process.cwd(), 'public'), { dotfiles: 'deny', index: false }));
  app.get('/{*path}', (_request, response) => response.sendFile(resolve(process.cwd(), 'dist/index.html')));
} else {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({ server: { middlewareMode: true, hmr: { server } }, appType: 'spa' });
  closeVite = () => vite.close();
  app.use(vite.middlewares);
}

const initialPort = Number(process.env.PORT ?? 4173);
if (!Number.isInteger(initialPort) || initialPort < 1024 || initialPort > 65525) throw new Error('PORT must be an integer between 1024 and 65525.');

function listen(port: number): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const handleError = (error: NodeJS.ErrnoException) => {
      if (!production && error.code === 'EADDRINUSE' && port < initialPort + 10) {
        server.removeListener('listening', handleListening);
        listen(port + 1).then(resolvePort, reject);
      } else reject(error);
    };
    const handleListening = () => {
      server.removeListener('error', handleError);
      resolvePort(port);
    };
    server.once('error', handleError);
    server.once('listening', handleListening);
    server.listen(port, process.env.HOST ?? (process.env.PUBLIC_MODE === '1' ? '0.0.0.0' : '127.0.0.1'));
  });
}

const port = await listen(initialPort);
console.log(`余页 is running at http://127.0.0.1:${port}`);

async function shutdown() {
  await app.locals.closeAccountBrowsers?.();
  await closeVite?.();
  server.close(() => process.exit(0));
}
process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
