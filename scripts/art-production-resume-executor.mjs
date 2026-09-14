import { spawn } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const folder = path.join(root, 'output/imagegen/scene-production/formal-production-20260907');
const { threadId } = JSON.parse(await readFile(path.join(folder, 'executor-thread.json'), 'utf8'));
const promptName = process.argv[2];
if (!/^executor-resume-[a-z0-9-]+\.txt$/.test(promptName ?? '')) throw new Error('INVALID_RESUME_PROMPT');
const label = promptName.slice(0, -4);
const receipt = path.join(folder, `${label}.json`);
if (await readFile(receipt).then(() => true).catch(error => {
  if (error.code === 'ENOENT') return false; throw error;
})) throw new Error('RESUME_ALREADY_RECORDED_INSPECT_EXISTING_WORKER');
const prompt = await readFile(path.join(folder, promptName), 'utf8');
const stdout = openSync(path.join(folder, `${label}.events.jsonl`), 'wx');
const stderr = openSync(path.join(folder, `${label}.stderr.log`), 'wx');
const env = { ...process.env };
delete env.CODEX_APP_TOOLS_PIPE_PATH;
delete env.CODEX_MCP_NODE_PATH;
delete env.CODEX_BROWSER_USE_NODE_PATH;
const child = spawn('C:/Users/10847/AppData/Local/OpenAI/Codex/bin/994e8469124a0d31/codex.exe',
  ['exec', '--json', '--skip-git-repo-check', '--sandbox', 'danger-full-access',
    '--config', 'approval_policy="never"', '-C', root, 'resume', threadId, '-'],
  { cwd: root, env, windowsHide: true, stdio: ['pipe', stdout, stderr] });
closeSync(stdout); closeSync(stderr);
child.stdin.on('error', () => {});
child.stdin.end(prompt);
await writeFile(receipt, JSON.stringify({ at: new Date().toISOString(), threadId,
  launcherPid: process.pid, workerPid: child.pid, promptName }, null, 2));
console.log(JSON.stringify({ threadId, workerPid: child.pid }));
await new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('exit', async code => {
    await writeFile(path.join(folder, `${label}.exit.json`), JSON.stringify({ at: new Date().toISOString(), code }));
    resolve();
  });
});
