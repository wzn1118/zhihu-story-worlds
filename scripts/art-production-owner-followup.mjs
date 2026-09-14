import { spawn } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { taskState } from '../.local/project-threads/status.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const [mode, task, runId, promptFile] = process.argv.slice(2);
if (!['launch', 'status', 'retire-ended'].includes(mode) || !['cel-drawing', 'painted-background', 'scene-composition'].includes(task)
  || !/^[a-z0-9-]+$/.test(runId ?? '')) throw new Error('EXACT_EXISTING_ART_OWNER_REQUIRED');
const directory = path.join(root, 'output/imagegen/scene-production/art-team', task);
const runDirectory = path.join(directory, 'followups', runId);
const conversation = JSON.parse(await readFile(path.join(directory, 'conversation.json'), 'utf8'));
const parseEvents = text => text.split(/\r?\n/).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
const rollout = parseEvents(await readFile(conversation.rolloutPath, 'utf8'));
const ignored = new Set(conversation.retiredCliTurnIds ?? []);
const active = taskState(rollout).activeTurns.filter(turn => !ignored.has(turn.id));
if (mode === 'retire-ended') {
  const receipt = JSON.parse(await readFile(path.join(runDirectory, 'run.json'), 'utf8'));
  if (alive(receipt.processId)) throw new Error('FOLLOWUP_PROCESS_STILL_LIVE');
  const starts = rollout.filter(event => event.type === 'event_msg' && event.payload?.type === 'task_started'
    && Date.parse(event.timestamp) >= Date.parse(receipt.at));
  const ownedTurn = starts[0]?.payload?.turn_id;
  if (ownedTurn && active.some(turn => turn.id === ownedTurn)) {
    conversation.retiredCliTurnIds = [...new Set([...(conversation.retiredCliTurnIds ?? []), ownedTurn])];
    await writeFile(path.join(directory, 'conversation.json'), JSON.stringify(conversation, null, 2) + '\n');
  }
  const result = { at: new Date().toISOString(), task, runId, threadId: conversation.threadId,
    processId: receipt.processId, processAlive: false, retiredCliTurnId: ownedTurn,
    status: 'shell-deadline-ended-partial-results-preserved', noImageRequestMade: true,
    nativeRolloutModified: false, notClaimedModelTurnComplete: true };
  await writeFile(path.join(runDirectory, 'exit-observed.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
} else if (mode === 'status') {
  const receipt = JSON.parse(await readFile(path.join(runDirectory, 'run.json'), 'utf8'));
  const events = parseEvents(await readFile(path.join(runDirectory, 'events.jsonl'), 'utf8'));
  const lastMessage = events.filter(event => event.type === 'item.completed' && event.item?.type === 'agent_message').at(-1)?.item.text;
  console.log(JSON.stringify({ task, runId, threadId: conversation.threadId, processId: receipt.processId,
    processAlive: alive(receipt.processId), activeTurns: active.length,
    completed: events.some(event => event.type === 'turn.completed'), failed: events.some(event => event.type === 'turn.failed'), lastMessage }));
} else {
  if (active.length) throw new Error('EXISTING_ART_TURN_STILL_ACTIVE');
  if (!promptFile) throw new Error('PROMPT_FILE_REQUIRED');
  const prompt = await readFile(path.resolve(root, promptFile), 'utf8');
  await mkdir(runDirectory, { recursive: true });
  await writeFile(path.join(runDirectory, 'intent.json'), JSON.stringify({ at: new Date().toISOString(), task, runId,
    threadId: conversation.threadId, sameExistingConversation: true, paidImageCallsAllowed: false }, null, 2), { flag: 'wx' });
  const stdout = openSync(path.join(runDirectory, 'events.jsonl'), 'wx');
  const stderr = openSync(path.join(runDirectory, 'stderr.log'), 'wx');
  let child;
  let completion;
  try {
    // Resume, never create a fourth art thread or change this owner's model/effort.
    child = spawn('C:/Users/10847/AppData/Local/Programs/OpenAI/Codex/bin/codex.exe', [
      'exec', '-C', root, '-s', 'danger-full-access', '-c', 'approval_policy="never"',
      '-c', `model_catalog_json="${path.join(root, '.local/project-threads/models-compatible.json').replaceAll('\\', '/')}"`,
      '--model', conversation.model, '-c', `model_reasoning_effort="${conversation.effort}"`,
      'resume', '--json', conversation.threadId, '-',
    ], { cwd: root, detached: process.platform !== 'win32', windowsHide: true, stdio: ['pipe', stdout, stderr] });
    completion = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
  } finally { closeSync(stdout); closeSync(stderr); }
  const receipt = { at: new Date().toISOString(), task, runId, threadId: conversation.threadId, processId: child.pid,
    modelUnchanged: conversation.model, effortUnchanged: conversation.effort, paidImageCallsAllowed: false };
  await writeFile(path.join(runDirectory, 'run.json'), JSON.stringify(receipt, null, 2));
  child.stdin.on('error', () => {});
  child.stdin.end(prompt);
  console.log(JSON.stringify(receipt));
  // Keep this explicit command alive until the resumed turn exits. Some shell
  // hosts retire orphaned children when their launching command finishes.
  const result = await completion;
  await writeFile(path.join(runDirectory, 'exit.json'), JSON.stringify({ at: new Date().toISOString(), ...result }));
  console.log(JSON.stringify({ task, runId, ...result }));
}
