import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createDirectLocalThread } from 'file:///E:/CodexHome/overrides/direct-thread-messaging/resources/plugins/openai-bundled/plugins/codex-app-tools/direct-thread-bridge.mjs';

const [promptName, title] = process.argv.slice(2);
if (!/^[a-z0-9-]+\.txt$/.test(promptName ?? '') || !title) throw new Error('INVALID_ART_THREAD_HANDOFF');
const root = process.cwd();
const folder = path.join(root, 'output/imagegen/scene-production/formal-production-20260907');
const receipt = path.join(folder, promptName.replace(/\.txt$/, '.new-thread.json'));
if (await readFile(receipt).then(() => true).catch(error => {
  if (error.code === 'ENOENT') return false; throw error;
})) throw new Error('ART_THREAD_ALREADY_CREATED');
const result = await createDirectLocalThread({
  argumentsValue: { title, prompt: await readFile(path.join(folder, promptName), 'utf8'),
    target: { type: 'project', projectId: 'art-production-local', environment: { type: 'local' } } },
  cliPath: 'C:/Users/10847/AppData/Local/OpenAI/Codex/bin/994e8469124a0d31/codex.exe',
  resolveProject: async () => ({ hostId: 'local', path: root, projectKind: 'local', isGitRepository: true }),
  setThreadTitle: async () => {},
  sourceThreadId: '01a07459-de72-7cc2-9c90-29dff8594e8e',
});
const identity = JSON.parse(result.contentItems.find(item => item.type === 'inputText').text);
await writeFile(receipt, JSON.stringify({ ...identity, title, promptName, at: new Date().toISOString() }, null, 2) + '\n');
console.log(JSON.stringify(identity));
