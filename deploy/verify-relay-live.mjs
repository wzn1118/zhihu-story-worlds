import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = '/data/zhihu-project';
const directory = resolve(process.argv[3] ?? resolve(root, 'shared/relay-deployment-20260914'));
const manifest = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8'));
const base = process.argv[2] ?? manifest.target;
const checks = [];
const sha = value => createHash('sha256').update(value).digest('hex');
async function get(path, init) {
  const response = await fetch(new URL(path, base), { ...init, signal: AbortSignal.timeout(15_000) });
  const text = await response.text();
  checks.push({ path, status: response.status });
  return { response, text };
}
const health = await get('/healthz');
assert.equal(health.response.status, 200);
assert.equal(JSON.parse(health.text).release, manifest.release.split('/').at(-1));
const homepage = await get('/');
assert.equal(homepage.response.status, 200);
assert.equal(sha(homepage.text), manifest.indexSha256);
const assets = [...homepage.text.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map(match => match[1]);
const results = await Promise.all(assets.map(async path => {
  const asset = await get(path);
  assert.equal(asset.response.status, 200);
  assert.equal(sha(asset.text), sha(await readFile(resolve(manifest.release, 'dist', path.slice(1)))));
  return asset.text;
}));
const workshop = results.join('\n').match(/(?:\.\/|assets\/)(StoryWorkshop-[\w-]+\.js)/)?.[1];
assert.ok(workshop, 'Current entry bundle must reference the workshop chunk');
const chunk = await get(`/assets/${workshop}`);
assert.equal(chunk.response.status, 200);
assert.match(chunk.text, /自动检测（推荐）/);
assert.match(chunk.text, /可用模型/);
assert.doesNotMatch(chunk.text, /placeholder:"模型名称"/);
for (const path of ['/api/workshop/creative-config/models', '/api/workshop/creative-config/check']) {
  const denied = await get(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(denied.response.status, 401);
  assert.equal(JSON.parse(denied.text).error.code, 'AUTH_REQUIRED');
}
const crossOrigin = await get('/api/workshop/creative-config/models', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://unrelated.invalid' }, body: '{}' });
assert.equal(crossOrigin.response.status, 403);
const receipt = { checkedAt: new Date().toISOString(), base, release: manifest.release, checks, verified: true };
await writeFile(resolve(directory, ['127.0.0.1', '172.16.0.153', 'localhost'].includes(new URL(base).hostname) ? 'local-verification.json' : 'public-verification.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt, null, 2));
