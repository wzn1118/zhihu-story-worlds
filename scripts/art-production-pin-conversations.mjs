import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const ids = ['01a07847-0075-7302-91b5-4fdd39c00cf1', '01a07499-86c5-70d3-a750-1e517c8021e6', '01a07499-8729-7d70-8ada-6723d0ad86e1'];
const pipe = process.env.CODEX_APP_TOOLS_PIPE_PATH || process.argv[2];
const sourceThread = process.env.CODEX_THREAD_ID || '01a07459-de72-7cc2-9c90-29dff8594e8e';
if (!pipe?.startsWith('\\\\.\\pipe\\codex-browser-use-')) throw new Error('CURRENT_APP_PIPE_REQUIRED');

function request(method, params) {
  return new Promise((resolve, reject) => {
    let data = Buffer.alloc(0);
    const socket = net.createConnection(pipe);
    const timer = setTimeout(() => finish(new Error('APP_RPC_TIMEOUT')), 15000);
    function finish(error, result) {
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(error);
      else resolve(result);
    }
    socket.on('error', error => finish(error));
    socket.on('connect', () => {
      const body = Buffer.from(JSON.stringify({ id: 1, jsonrpc: '2.0', method, params }));
      const frame = Buffer.alloc(body.length + 4);
      frame.writeUInt32LE(body.length);
      body.copy(frame, 4);
      socket.write(frame);
    });
    socket.on('data', chunk => {
      data = Buffer.concat([data, chunk]);
      if (data.length < 4) return;
      const length = data.readUInt32LE(0);
      if (length > 8 * 1024 * 1024) return finish(new Error('APP_RESPONSE_TOO_LARGE'));
      if (data.length < length + 4) return;
      try {
        const response = JSON.parse(data.subarray(4, length + 4));
        finish(response.error ? new Error(response.error.message) : null, response.result);
      } catch (error) {
        finish(error);
      }
    });
  });
}

const catalog = await request('tools/list', { threadStartKind: 'all' });
async function call(name, args) {
  const tool = catalog.tools.find(candidate => candidate.name === name);
  if (!tool) throw new Error(`APP_TOOL_MISSING:${name}`);
  const result = await request('tools/call', {
    arguments: args, callId: `art-sidebar-${randomUUID()}`, namespace: tool.namespace,
    threadId: sourceThread, tool: name, turnId: `art-sidebar-${randomUUID()}`,
  });
  if (!result.success) throw new Error(`APP_TOOL_FAILED:${name}`);
  return JSON.parse(result.contentItems.find(item => item.type === 'inputText').text);
}

const before = await call('list_threads', { limit: 1 });
for (const threadId of ids) await call('set_thread_pinned', { threadId, pinned: true });
const after = await call('list_threads', { limit: 1 });
const pins = after.pinnedThreads;
const pinned = pins.filter(thread => ids.includes(thread.id)).map(({ id, title, pinnedIndex, status, projectId }) => ({ id, title, pinnedIndex, status, projectId }));
const preserved = before.pinnedThreads.every(thread => pins.some(pin => pin.id === thread.id));
if (pinned.length !== ids.length || !preserved) throw new Error('APP_PIN_VERIFICATION_FAILED');
const result = {
  at: new Date().toISOString(), method: 'codex_app.set_thread_pinned',
  pinned, unrelatedPinsPreserved: preserved, duplicateThreadsCreated: 0,
  globalStateEdited: false, rendererRestarted: false,
};
await writeFile('output/imagegen/scene-production/art-team/sidebar-pins.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
