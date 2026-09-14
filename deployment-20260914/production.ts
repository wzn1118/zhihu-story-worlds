import express from 'express';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/app.ts';
import { artPrivateFileGuard } from '../server/art-production.ts';
import { liveGeneratedArt } from '../server/live-generated-art.ts';

if (process.env.PUBLIC_MODE !== '1' || (process.env.SESSION_SECRET?.length ?? 0) < 48) throw new Error('PUBLIC_MODE=1 and a persistent SESSION_SECRET of at least 48 characters are required');
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
process.chdir(root);
const app = express();
app.disable('x-powered-by');
app.get('/healthz', (_req, res) => res.json({status:'ok',service:'zhihu-story-worlds',mode:'production'}));
app.use(artPrivateFileGuard);
app.use(createApp());
app.use('/generated-art', liveGeneratedArt());
app.use('/product-book', express.static(resolve('output/pdf/redleaf-product-plan-20260913')));
app.use(express.static(resolve('public'), {dotfiles:'deny',index:false}));
app.use(express.static(resolve('dist')));
app.get('/{*path}', (_req,res) => res.sendFile(resolve('dist/index.html')));
const server = createServer(app);
const port=Number(process.env.PORT ?? 18080);
if(!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid PORT');
server.listen(port, '127.0.0.1', () => console.log(`Production listening on 127.0.0.1:${port}; cwd=${process.cwd()}`));
for(const signal of ['SIGTERM','SIGINT'] as const) process.once(signal, () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1),10000).unref();
});
