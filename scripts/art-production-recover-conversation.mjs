import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createDirectLocalThread } from 'file:///E:/CodexHome/overrides/direct-thread-messaging/resources/plugins/openai-bundled/plugins/codex-app-tools/direct-thread-bridge.mjs';

const root = process.cwd();
const folder = path.join(root, 'output/imagegen/scene-production/art-team/thread-recovery-20260907');
await mkdir(folder, { recursive: true });
const existing = await readFile(path.join(folder, 'launch.json'), 'utf8').catch(error => {
  if (error.code === 'ENOENT') return null;
  throw error;
});
if (existing) throw new Error('REPAIR_ALREADY_CREATED_INSPECT_SAVED_THREAD');
const prompt = await readFile(path.join(folder, 'handoff.txt'), 'utf8');
const result = await createDirectLocalThread({
  argumentsValue: {
    prompt,
    target: { type: 'project', projectId: '790b811a-de33-4a7c-be1d-8eeb854a77a2', environment: { type: 'local' } },
  },
  cliPath: 'C:/Users/10847/AppData/Local/OpenAI/Codex/bin/994e8469124a0d31/codex.exe',
  resolveProject: async () => ({ path: root, hostId: 'local', projectKind: 'local', isGitRepository: true }),
  setThreadTitle: async () => {},
  sourceThreadId: '01a07459-de72-7cc2-9c90-29dff8594e8e',
  signal: AbortSignal.timeout(180_000),
});
const item = result.contentItems?.find(item => item.type === 'inputText');
const created = item && JSON.parse(item.text);
if (!result.success || !created?.threadId) throw new Error('REPAIR_THREAD_NOT_CREATED');
const receipt = {
  at: new Date().toISOString(), ...created,
  predecessor: '01a07499-86e6-75c1-bffd-eac72867faee',
  transport: 'existing-direct-thread-bridge',
  status: 'created-awaiting-tool-smoke-test',
  globalConfigurationChanged: false,
  sharedServerRestarted: false,
};
await writeFile(path.join(folder, 'launch.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt));
