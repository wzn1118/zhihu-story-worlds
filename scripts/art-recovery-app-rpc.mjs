import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const pipe = process.env.CODEX_APP_TOOLS_PIPE_PATH;
if (!pipe?.startsWith('\\\\.\\pipe\\codex-browser-use-')) throw new Error('CURRENT_APP_PIPE_REQUIRED');
const directory = resolve('output/coordination/art-payload-413-20260910');
await mkdir(directory, { recursive: true });
async function request(method, params) {
  return new Promise((resolve, reject) => {
    let data = Buffer.alloc(0);
    const socket = net.createConnection(pipe);
    const timer = setTimeout(() => finish(new Error('APP_RPC_TIMEOUT')), 55000);
    function finish(error, result) { clearTimeout(timer); socket.destroy(); error ? reject(error) : resolve(result); }
    socket.on('error', error => finish(error));
    socket.on('connect', () => {
      const body = Buffer.from(JSON.stringify({ id: 1, jsonrpc: '2.0', method, params }));
      const frame = Buffer.alloc(body.length + 4); frame.writeUInt32LE(body.length); body.copy(frame, 4); socket.write(frame);
    });
    socket.on('data', chunk => {
      data = Buffer.concat([data, chunk]);
      if (data.length < 4) return;
      const length = data.readUInt32LE(0);
      if (length > 16 * 1024 * 1024) return finish(new Error('APP_RESPONSE_TOO_LARGE'));
      if (data.length < length + 4) return;
      try { const response = JSON.parse(data.subarray(4, length + 4)); finish(response.error ? new Error(response.error.message) : null, response.result); }
      catch (error) { finish(error); }
    });
  });
}
const catalog = await request('tools/list', { threadStartKind: 'all' });
const [operation, inputFile, outputName = 'rpc-result.json'] = process.argv.slice(2);
if (operation === 'catalog') {
  const selected = catalog.tools.filter(tool => /thread|project/.test(tool.name));
  await writeFile(resolve(directory, 'app-tools.json'), JSON.stringify(selected, null, 2));
  console.log(JSON.stringify(selected));
} else {
  const tool = catalog.tools.find(tool => tool.name === operation);
  if (!tool) throw new Error(`APP_TOOL_MISSING:${operation}`);
  const args = JSON.parse(await readFile(inputFile, 'utf8'));
  const result = await request('tools/call', { arguments: args, callId: `art-recovery-${randomUUID()}`, namespace: tool.namespace,
    threadId: process.env.CODEX_THREAD_ID, tool: operation, turnId: `art-recovery-${randomUUID()}` });
  await writeFile(resolve(directory, outputName), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}
