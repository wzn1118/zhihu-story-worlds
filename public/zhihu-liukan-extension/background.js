const localPorts = [4179, 4173, 4178];
let preferredPort = 0;
const pending = new Map();
const recent = new Map();
const keyOf = payload => `${payload.sourceUrl}|${payload.text.length}|${payload.text.slice(0, 80)}`;
const CACHE_TTL = 30_000;
const CACHE_LIMIT = 64;
function pruneRecent() {
  const now = Date.now();
  for (const [key, value] of recent) if (now - value.at >= CACHE_TTL) recent.delete(key);
  while (recent.size > CACHE_LIMIT) recent.delete(recent.keys().next().value);
}

async function submit(payload) {
  const key = keyOf(payload);
  const cached = recent.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.value;
  pruneRecent();
  const prior = pending.get(key);
  if (prior) return prior;
  const task = submitOnce(payload, key);
  pending.set(key, task);
  try { return await task; } finally { pending.delete(key); }
}

async function submitOnce(payload, key) {
  const ports = [...new Set([preferredPort, ...localPorts].filter(Boolean))];
  for (const port of ports) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 4500);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/liukan/inbox/extension`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal });
        if (response.ok) { preferredPort = port; const value = { ok: true, port, post: await response.json() }; recent.set(key, { at: Date.now(), value }); return value; }
      if (response.status >= 400 && response.status < 500) return { ok: false, reason: 'selection-invalid' };
    } catch { /* Move past a stopped local service without delaying the drop. */ }
    finally { clearTimeout(timer); }
  }
  return { ok: false, reason: 'workbench-unavailable' };
}

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message?.type !== 'redleaf:learn-zhihu-selection') return;
  void submit(message.payload).then(respond);
  return true;
});
