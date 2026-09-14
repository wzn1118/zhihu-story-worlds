import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { StoryWorkshop } from '../server/story-workshop.ts';

const ids = ['import-0b3ce5e1-1f96-474d-871d-5e2a2a541713', 'import-32bcca2e-c8e9-47bb-91b1-ee567f3cbe2f'];
const service = new StoryWorkshop(), execute = promisify(execFile);
const output = resolve('output/zhihu-expansion', `delivery-${new Date().toISOString().replace(/[:.]/g, '-')}`);
await mkdir(output, { recursive: true });
const pending = new Set(ids), results: Record<string, unknown>[] = [], previous = new Map<string, string>();
const deadline = Date.now() + 2 * 60 * 60_000;
async function check(script: string, args: string[], label: string) {
  try {
    const result = await execute(process.execPath, ['--import', 'tsx', script, ...args], { cwd: process.cwd(), windowsHide: true, timeout: 15 * 60_000, maxBuffer: 16 * 1024 * 1024 });
    await writeFile(join(output, `${label}.log`), result.stdout + result.stderr);
    return JSON.parse(result.stdout) as { output: string; status?: string };
  } catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string };
    await writeFile(join(output, `${label}.log`), (failure.stdout ?? '') + (failure.stderr ?? '') + '\n' + failure.message);
    throw error;
  }
}
console.log(JSON.stringify({ output, ids, action: 'observe-existing-jobs-and-verify-only' }));
try {
  while (pending.size) {
    for (const id of pending) {
      const project = await service.get(id);
      assert.equal(project.origin?.contentScope, 'search-excerpt');
      const state = JSON.stringify({ id, status: project.status, stage: project.stage, routes: project.completedRoutes, revision: project.revision, playable: project.playable });
      if (previous.get(id) !== state) { console.log(state); previous.set(id, state); }
      if (project.status === 'failed' || project.status === 'interrupted') throw new Error(`${id}: ${project.error?.message ?? project.status}`);
      if (project.status !== 'ready') continue;
      assert.ok(project.playable && project.editorial?.status === 'passed');
      const engine = await check('scripts/verify-generated-story.ts', [id, '--require-editorial'], `${id}-engine`);
      const acceptance = join(engine.output, 'acceptance.json');
      const browser = await check('scripts/verify-generated-browser.ts', [acceptance], `${id}-browser`);
      assert.equal(browser.status, 'passed');
      results.push({ id, version: project.publishedVersion, acceptance, browser: join(browser.output, 'verification.json') });
      pending.delete(id);
      await writeFile(join(output, 'progress.json'), JSON.stringify(results, null, 2));
      console.log(JSON.stringify({ id, status: 'engine-and-browser-passed', results: results.at(-1) }));
    }
    if (!pending.size) break;
    if (Date.now() >= deadline) throw new Error('Acceptance wait deadline reached; existing creative jobs were not stopped or replaced');
    await new Promise(r => setTimeout(r, 10000));
  }
  await writeFile(join(output, 'verification.json'), JSON.stringify({ status: 'passed', results }, null, 2));
  console.log(JSON.stringify({ output, status: 'passed', results }));
} catch (error) {
  await writeFile(join(output, 'failure.json'), JSON.stringify({ status: 'failed', results, pending: [...pending], message: String(error) }, null, 2));
  throw error;
}
