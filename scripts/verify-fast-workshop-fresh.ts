import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.env.FAST_WORKSHOP_URL ?? 'http://127.0.0.1:4179';
const query = process.env.FRESH_SOURCE_QUERY ?? '普通人适合北漂吗';
const expectedUrl = process.env.FRESH_SOURCE_URL ?? 'https://www.zhihu.com/question/1996339668275458558/answer/2076971652542480975';
const output = resolve(process.env.FRESH_WORKSHOP_OUTPUT ?? 'output/playwright/fresh-workshop-20260913');
const options = { mode: 'fast', adaptation: 'inspiration', images: 'gpt6' } as const;
await mkdir(output, { recursive: true });

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}${path}`, { ...init, signal: AbortSignal.timeout(35_000) });
  const data = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(data));
  return data as T;
}

const discovery = await request<{ candidates: Array<{ id: string; title: string; author: string; excerpt: string; origin: { sourceUrl: string; contentScope: string } }> }>('/api/workshop/discovery', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }),
});
const candidate = discovery.candidates.find(row => row.origin.sourceUrl === expectedUrl);
assert.ok(candidate, 'Fresh Zhihu candidate was not returned by the official search route.');

const before = await request<{ projects: Array<{ id: string; origin?: { sourceUrl?: string } }> }>('/api/workshop/projects');
assert.ok(!before.projects.some(project => project.origin?.sourceUrl === expectedUrl), 'The fresh source was already imported. Choose another source before rerunning this test.');

const imported = await request<{ id: string; status: string; revision: number; playable: boolean }>('/api/workshop/discovery/import', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ candidateId: candidate.id, generate: false, generationOptions: options }),
});
assert.equal(imported.status, 'idle');
assert.equal(imported.revision, 0);
assert.equal(imported.playable, false);

const started = Date.now();
let project = await request<{ id: string; status: string; stage: string; revision: number; playable: boolean; generation?: { model?: string; elapsedMs?: number }; validation?: unknown; error?: unknown }>(`/api/workshop/projects/${imported.id}/generate`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'resume', generationOptions: options }),
});
const progress: Array<Record<string, unknown>> = [];
while (project.status === 'running' && Date.now() - started < 330_000) {
  await new Promise(resolveWait => setTimeout(resolveWait, 5_000));
  project = await request(`/api/workshop/projects/${imported.id}`);
  progress.push({ at: new Date().toISOString(), elapsedMs: Date.now() - started, status: project.status, stage: project.stage });
}

const report: Record<string, unknown> = {
  base, query, candidate: { id: candidate.id, title: candidate.title, author: candidate.author, sourceUrl: candidate.origin.sourceUrl, characters: candidate.excerpt.length, contentScope: candidate.origin.contentScope },
  projectId: imported.id, initial: imported, options, elapsedMs: Date.now() - started, status: project.status, stage: project.stage, revision: project.revision,
  generation: project.generation, validation: project.validation, error: project.error, progress,
};
if (project.status === 'ready') {
  const [source, world] = await Promise.all([
    request<{ text: string; origin?: { sourceUrl?: string; contentScope?: string } }>(`/api/workshop/projects/${imported.id}/source`),
    request<{ title: string; generated?: { revision?: number; mode?: string; adaptationMode?: string }; source: { origin?: { sourceUrl?: string } }; nodes: Record<string, { ending?: { title: string } }> }>(`/api/workshop/projects/${imported.id}/world`),
  ]);
  assert.equal(source.text, candidate.excerpt, 'Saved source differs from the freshly discovered excerpt.');
  assert.equal(source.origin?.sourceUrl, expectedUrl, 'Published world lost the exact Zhihu source URL.');
  assert.equal(source.origin?.contentScope, 'search-excerpt');
  assert.equal(world.source.origin?.sourceUrl, expectedUrl, 'Playable world lost its source provenance.');
  assert.equal(world.generated?.mode, 'fast');
  assert.equal(world.generated?.adaptationMode, 'inspiration');
  report.title = world.title;
  report.endings = Object.values(world.nodes).flatMap(node => node.ending ? [node.ending.title] : []);
  await writeFile(resolve(output, 'fresh-world.json'), JSON.stringify(world, null, 2));
}
await writeFile(resolve(output, 'fresh-generation-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (project.status !== 'ready') process.exitCode = 1;
