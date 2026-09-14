import { spawn } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { taskState } from '../.local/project-threads/status.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const team = path.join(root, 'output/imagegen/scene-production/art-team');
const tasks = ['cel-drawing', 'painted-background', 'scene-composition'];
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
const json = file => readFile(file, 'utf8').then(JSON.parse);
const events = text => text.split(/\r?\n/).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
const atomic = async (file, value) => {
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2));
  await rename(temporary, file);
};
const lockFile = path.join(team, 'supervisor.lock');
let lock;
try { lock = await open(lockFile, 'wx'); }
catch (error) {
  if (error.code !== 'EEXIST') throw error;
  const owner = await json(lockFile);
  if (alive(owner.pid)) throw new Error('ART_TEAM_SUPERVISOR_ALREADY_ACTIVE');
  await unlink(lockFile);
  lock = await open(lockFile, 'wx');
}
await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
await lock.close();

async function tick() {
  const statuses = [];
  for (const task of tasks) {
    const directory = path.join(team, task);
    const conversation = await json(path.join(directory, 'conversation.json'));
    const followupFile = path.join(directory, 'all-stories-run.json');
    let previous = await json(followupFile).catch(error => { if (error.code === 'ENOENT') return undefined; throw error; });
    const rollout = events(await readFile(conversation.rolloutPath, 'utf8'));
    const live = taskState(rollout);
    // Opening an exec thread in Desktop can start a second turn. Retire only
    // our CLI writer and let the user's visible Desktop turn keep ownership.
    const activePid = previous?.state === 'dispatched' ? previous.processId : conversation.processId;
    const cliStartedAt = previous?.state === 'dispatched' ? previous.dispatchedAt : conversation.startedAt;
    const cliTurn = rollout.find(event => event.type === 'event_msg' && event.payload?.type === 'task_started'
      && Date.parse(event.timestamp) >= Date.parse(cliStartedAt))?.payload.turn_id;
    const ignored = new Set(conversation.retiredCliTurnIds ?? []);
    const active = live.activeTurns.filter(turn => !ignored.has(turn.id));
    if (active.length > 1 && active.some(turn => turn.id === cliTurn) && alive(activePid)) {
      process.kill(activePid);
      conversation.retiredCliTurnIds = [...ignored, cliTurn];
      conversation.cliRetiredForDesktop = true;
      conversation.retiredAt = new Date().toISOString();
      await atomic(path.join(directory, 'conversation.json'), conversation);
      if (previous?.state === 'dispatched') {
        previous = { ...previous, state: 'desktop_took_over', retiredAt: conversation.retiredAt };
        await atomic(followupFile, previous);
      }
      ignored.add(cliTurn);
    }
    const activeTurns = live.activeTurns.filter(turn => !ignored.has(turn.id));
    const initialEvents = events(await readFile(path.join(directory, 'events.jsonl'), 'utf8'));
    const initialCompleted = initialEvents.some(event => event.type === 'turn.completed');
    let state = previous?.state ?? 'waiting_for_pilot';
    if (!previous && (initialCompleted || conversation.cliRetiredForDesktop) && !alive(conversation.processId) && !activeTurns.length) {
      const runDirectory = path.join(directory, 'all-stories');
      await mkdir(runDirectory, { recursive: true });
      const prompt = await readFile(path.join(team, 'all-stories-continuation.txt'), 'utf8');
      const output = openSync(path.join(runDirectory, 'events.jsonl'), 'wx');
      const errors = openSync(path.join(runDirectory, 'stderr.log'), 'wx');
      let child;
      try {
        child = spawn('C:/Users/10847/AppData/Local/Programs/OpenAI/Codex/bin/codex.exe', [
          'exec', '-C', root, '-s', 'danger-full-access', '-c', 'approval_policy="never"',
          '-c', `model_catalog_json="${path.join(root, '.local/project-threads/models-compatible.json').replaceAll('\\', '/')}"`,
          '--model', conversation.model, '-c', `model_reasoning_effort="${conversation.effort}"`,
          'resume', '--json', conversation.threadId, '-'],
        { cwd: root, detached: process.platform !== 'win32', windowsHide: true, stdio: ['pipe', output, errors] });
        await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
      } finally { closeSync(output); closeSync(errors); }
      const record = { state: 'dispatched', task, threadId: conversation.threadId,
        processId: child.pid, dispatchedAt: new Date().toISOString() };
      await atomic(followupFile, record);
      child.stdin.on('error', () => {});
      child.stdin.end(prompt);
      child.unref();
      state = 'dispatched';
    } else if (previous?.state === 'dispatched' && !alive(previous.processId)) {
      const followupEvents = events(await readFile(path.join(directory, 'all-stories/events.jsonl'), 'utf8'));
      state = followupEvents.some(event => event.type === 'turn.completed') ? 'awaiting_review' : 'inspect_before_resume';
      await atomic(followupFile, { ...previous, state, finishedAt: new Date().toISOString() });
    }
    statuses.push({ task, threadId: conversation.threadId, url: conversation.url,
      activeTurns: activeTurns.length, overlapping: activeTurns.length > 1,
      retiredCliTurns: conversation.retiredCliTurnIds ?? [],
      pilotProcessAlive: alive(conversation.processId), allStoriesState: state });
  }
  await atomic(path.join(team, 'supervisor-status.json'), { checkedAt: new Date().toISOString(),
    pid: process.pid, scope: 'All 20 stories', conversations: statuses });
}
try {
  while (true) {
    if (await readFile(path.join(team, 'supervisor.stop')).then(() => true).catch(() => false)) break;
    await tick();
    if (!process.argv.includes('--watch')) break;
    await new Promise(resolve => setTimeout(resolve, 15_000));
  }
} finally {
  if ((await json(lockFile)).pid === process.pid) await unlink(lockFile);
}
