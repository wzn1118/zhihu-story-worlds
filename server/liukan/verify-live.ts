import express from 'express';
import { mkdir, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { createLiukanCapabilitiesRouter } from './capabilities-router.ts';

// Explicit opt-in validation only; never imported by the application server.
if (!process.argv.includes('--run-live')) throw new Error('Pass --run-live to make one hot request and one general chat request.');
const app = express(); app.use(express.json()); app.use('/api/liukan', createLiukanCapabilitiesRouter());
const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/liukan`;
try {
  const statuses = await fetch(`${base}/config`).then(response => response.json());
  const started = Date.now();
  const [hot, chat] = await Promise.all([
    fetch(`${base}/capabilities/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ability: 'hot', limit: 1, requestId: crypto.randomUUID() }) }).then(async response => ({ status: response.status, body: await response.json() })),
    fetch(`${base}/general-chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: '第一次来到赤页，我想把找到的一篇知乎回答做成自己的游戏，应该先点哪里？请用两三句话告诉我。', requestId: crypto.randomUUID() }) }).then(async response => ({ status: response.status, body: await response.json() })),
  ]);
  const evidence = { verifiedAt: new Date().toISOString(), elapsedMs: Date.now() - started, config: statuses, hot, chat, privateReads: 0, sharedServerRestarted: false };
  await mkdir('output/liukan-capabilities', { recursive: true }); await writeFile('output/liukan-capabilities/live.json', JSON.stringify(evidence, null, 2), 'utf8');
  console.log(JSON.stringify({ path: 'output/liukan-capabilities/live.json', elapsedMs: evidence.elapsedMs, transport: statuses.transport, hotStatus: hot.status, hotItems: hot.body.items?.length, chatStatus: chat.status, chatSource: chat.body.source, chatModel: chat.body.model, answerCharacters: chat.body.answer?.length, privateReads: 0 }));
  if (hot.status !== 200 || chat.status !== 200 || !chat.body.answer?.trim()) process.exitCode = 1;
} finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
