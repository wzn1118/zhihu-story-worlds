import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Load persisted provider settings before importing any application modules.
const config = JSON.parse(await readFile(process.env.RUNTIME_CONFIG ?? '/data/zhihu-project/shared/config/runtime.json', 'utf8'));
for (const [key, value] of Object.entries(config)) {
  if (typeof value !== 'string') throw new Error(`Invalid runtime configuration: ${key}`);
  process.env[key] ??= value;
}
await import(pathToFileURL(resolve('server/index.ts')).href);
