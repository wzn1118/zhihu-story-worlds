import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
const [file] = process.argv.slice(2);
const request = JSON.parse(await readFile(file, 'utf8'));
if (!/^[a-f0-9-]{36}$/.test(request.threadId) || !request.prompt?.trim()) throw new Error('INVALID_HANDOFF');
const cli = 'C:/Users/10847/AppData/Local/OpenAI/Codex/bin/994e8469124a0d31/codex.exe';
const child = spawn(cli, ['queue', '--thread', request.threadId, '--message', request.prompt,
  '--sandbox', 'danger-full-access', '--config', 'approval_policy="never"'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let output = ''; child.stdout.on('data', chunk => output += chunk); child.stderr.on('data', chunk => output += chunk);
child.once('close', async code => {
  await writeFile(file + '.receipt.json', JSON.stringify({ at: new Date().toISOString(), code, output, threadId: request.threadId }, null, 2));
  console.log(JSON.stringify({ code, threadId: request.threadId, output: output.slice(-700) })); process.exitCode = code ?? 1;
});
