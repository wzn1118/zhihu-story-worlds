import { createServer } from 'node:http';
import { createApp } from '../server/app.ts';
import { createServer as createViteServer } from 'vite';
import { artPrivateFileGuard } from '../server/art-production.ts';
import { liveGeneratedArt } from '../server/live-generated-art.ts';

const app = createApp();
app.use(artPrivateFileGuard);
app.use('/generated-art', liveGeneratedArt());
const server = createServer(app);
const vite = await createViteServer({ server: { middlewareMode: true, hmr: { server } }, appType: 'spa' });
app.use(vite.middlewares);
server.listen(4178, '127.0.0.1', () => console.log(JSON.stringify({ port: 4178, pid: process.pid, mode: 'direct-selection-dev' })));
server.on('error', error => { console.error(error.message); process.exit(1); });
