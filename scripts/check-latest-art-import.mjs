import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve(), base = 'http://127.0.0.1:4173';
const output = resolve('output/art-imports');
await mkdir(output, { recursive: true });
async function online() {
  return fetch(`${base}/api/health`, { signal: AbortSignal.timeout(2000) }).then(r => r.ok).catch(() => false);
}
if (!await online()) {
  const log = openSync(resolve(output, 'server.log'), 'a');
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    cwd: root, detached: true, windowsHide: true, env: { ...process.env, PORT: '4173' }, stdio: ['ignore', log, log],
  });
  child.unref();
  console.log(JSON.stringify({ startedPid: child.pid }));
}
for (let attempt = 0; !await online(); attempt++) {
  if (attempt > 90) throw new Error('Server not ready; see server.log');
  await new Promise(r => setTimeout(r, 1000));
}
const response = await fetch(`${base}/api/workshop/projects/import-0b3ce5e1-1f96-474d-871d-5e2a2a541713/world`);
if (!response.ok) throw new Error(`World HTTP ${response.status}`);
const world = await response.json();
const nodes = Object.values(world.nodes).filter(n => n.background.startsWith('/generated-art/workshop/'));
if (nodes.length !== 47) throw new Error(`API bound ${nodes.length}/47`);
const sample = nodes[0];
const image = await fetch(`${base}${sample.background}`);
if (!image.ok) throw new Error(`Image HTTP ${image.status}`);
const bytes = Buffer.from(await image.arrayBuffer());
const result = { base, world: world.title, bound: nodes.length, total: Object.keys(world.nodes).length,
  sample: { nodeId: sample.id, url: sample.background, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
    width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) } };
await writeFile(resolve(output, 'runtime-check.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
