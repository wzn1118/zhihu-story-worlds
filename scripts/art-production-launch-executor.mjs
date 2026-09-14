import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createDirectLocalThread } from 'file:///E:/CodexHome/overrides/direct-thread-messaging/resources/plugins/openai-bundled/plugins/codex-app-tools/direct-thread-bridge.mjs';

const root = process.cwd();
const folder = path.join(root, 'output/imagegen/scene-production/formal-production-20260907');
await mkdir(folder, { recursive: true });
const receipt = path.join(folder, 'executor-thread.json');
if (await readFile(receipt).then(() => true).catch(error => { if (error.code === 'ENOENT') return false; throw error; }))
  throw new Error('EXECUTOR_ALREADY_CREATED_INSPECT_SAVED_ID');
const result = await createDirectLocalThread({
  argumentsValue: { prompt: await readFile(path.join(folder, 'executor-handoff.txt'), 'utf8'),
    target: { type: 'project', projectId: '790b811a-de33-4a7c-be1d-8eeb854a77a2', environment: { type: 'local' } } },
  cliPath: 'C:/Users/10847/AppData/Local/OpenAI/Codex/bin/994e8469124a0d31/codex.exe',
  resolveProject: async () => ({ path: root, hostId: 'local', projectKind: 'local', isGitRepository: true }),
  setThreadTitle: async () => {}, sourceThreadId: '01a07459-de72-7cc2-9c90-29dff8594e8e',
  signal: AbortSignal.timeout(180_000),
});
const created = JSON.parse(result.contentItems.find(item => item.type === 'inputText').text);
if (!result.success || !created.threadId) throw new Error('EXECUTOR_NOT_CREATED');
await writeFile(receipt, JSON.stringify({ at: new Date().toISOString(), ...created, concurrency: 8,
  transport: 'existing-direct-thread-bridge', scope: 'All 20 story art assets', launcherPid: process.pid }, null, 2));
console.log(JSON.stringify(created));
