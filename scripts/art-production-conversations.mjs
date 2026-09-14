import { spawn } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = path.join(root, 'output/imagegen/scene-production/art-team');
const tasks = ['cel-drawing', 'painted-background', 'scene-composition'];
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
const binary = 'C:/Users/10847/AppData/Local/Programs/OpenAI/Codex/bin/codex.exe';
const catalog = path.join(root, '.local/project-threads/models-compatible.json').replaceAll('\\', '/');

for (const task of tasks) {
  const target = path.join(directory, task);
  await mkdir(target, { recursive: true });
  const stateFile = path.join(target, 'conversation.json');
  const previous = await readFile(stateFile, 'utf8').then(JSON.parse).catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return undefined;
  });
  if (previous) {
    console.log(JSON.stringify({ task, ...previous, processAlive: alive(previous.processId), existing: true }));
    continue; // A completed or uncertain dispatch is never silently recreated.
  }
  const prompt = await readFile(path.join(directory, `${task}.prompt.txt`), 'utf8');
  const output = openSync(path.join(target, 'events.jsonl'), 'wx');
  const errors = openSync(path.join(target, 'stderr.log'), 'wx');
  let child;
  try {
    child = spawn(binary, ['exec', '--json', '--color', 'never', '-C', root,
      '-s', 'danger-full-access', '-c', 'approval_policy="never"',
      '-c', `model_catalog_json="${catalog}"`,
      '--model', 'gpt-6-astra', '-c', 'model_reasoning_effort="xhigh"', '-'],
    { cwd: root, detached: process.platform !== 'win32', windowsHide: true, stdio: ['pipe', output, errors] });
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
  } finally { closeSync(output); closeSync(errors); }
  const state = { task, processId: child.pid, startedAt: new Date().toISOString(),
    model: 'gpt-6-astra', effort: 'xhigh', project: root, title: prompt.split('\n')[0] };
  await writeFile(stateFile, JSON.stringify(state, null, 2));
  child.stdin.on('error', () => {});
  child.stdin.end(prompt);
  child.unref();
  console.log(JSON.stringify(state));
}
