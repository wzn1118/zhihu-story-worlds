import { runImageLaunch } from './workshop-image-launch.ts';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const [id, token] = process.argv.slice(2);
if (/^[a-f0-9]{64}$/.test(id ?? '') && token) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const owner = JSON.parse(await readFile(resolve('output/workshop-images/.private/launches', id, 'owner.json'), 'utf8').catch(() => 'null'));
    if (!owner || owner.token !== token) break;
    if (owner.pid === process.pid) { await runImageLaunch(id, token); break; }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}
