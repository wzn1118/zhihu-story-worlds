import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.env.FAST_WORKSHOP_URL ?? 'http://127.0.0.1:4174';
const id = 'import-898699bf-b946-49ce-a474-0a73eb25e102';
const directory = resolve('output/playwright/fast-workshop-20260913');
await mkdir(directory, { recursive: true });
const started = Date.now();
const response = await fetch(`${base}/api/workshop/projects/${id}/generate`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ mode: 'regenerate', generationOptions: { mode: 'fast', adaptation: 'inspiration', images: 'gpt6' } }),
  signal: AbortSignal.timeout(30_000),
});
let project = await response.json();
if (!response.ok) throw new Error(JSON.stringify(project));
console.log(JSON.stringify({ started: true, id, revision: project.revision, options: project.generationOptions }));
let last = '';
while (project.status === 'running' && Date.now() - started < 330_000) {
  await new Promise(resolveWait => setTimeout(resolveWait, 5000));
  project = await fetch(`${base}/api/workshop/projects/${id}`, { signal: AbortSignal.timeout(20_000) }).then(r => r.json());
  const state = JSON.stringify({ elapsedSeconds: Math.round((Date.now() - started) / 1000), status: project.status, stage: project.stage, message: project.events?.at(-1)?.message });
  if (state !== last) { console.log(state); last = state; }
}
const textMs = Date.now() - started;
const result: Record<string, unknown> = { base, id, revision: project.revision, textMs, generation: project.generation, status: project.status, validation: project.validation, error: project.error };
if (project.status === 'ready') {
  const world = await fetch(`${base}/api/workshop/projects/${id}/world`).then(r => r.json());
  await writeFile(resolve(directory, 'live-world.json'), JSON.stringify(world, null, 2));
  result.title = world.title; result.mode = world.generated; result.provenance = world.source; result.endings = Object.values(world.nodes).filter((node: any) => node.ending).map((node: any) => node.ending.title);
}
await writeFile(resolve(directory, 'live-generation-report.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
if (project.status !== 'ready' || textMs > 300_000) process.exitCode = 1;
