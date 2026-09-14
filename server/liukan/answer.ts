import type { LiukanAnswerSource } from '../../shared/liukan-capabilities.ts';
import type { RelayConfig } from '../workshop-relay-config.ts';
import { callZhidaCli, LiukanError, parseZhidaResponse } from './zhida.ts';
import { liukanConfig, type LiukanConfigStore } from './config.ts';

export type LiukanAnswerer = (prompt: string, model: string) => Promise<{ answer: string; model: string; source?: LiukanAnswerSource }>;
export interface LiukanRequestOptions { timeoutMs?: number }
export async function requestLiukanRelay(config: RelayConfig, prompt: string, fetcher: typeof fetch = fetch, options: LiukanRequestOptions = {}) {
  const timeoutMs = options.timeoutMs ?? 60_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 180_000) throw new LiukanError('INVALID_LIUKAN_TIMEOUT', '这次请求的等待时长设置有误。');
  const responses = config.protocol === 'responses';
  const body = responses ? { model: config.model, input: [{ role: 'user', content: prompt }], stream: false, store: false, ...(config.reasoning ? { reasoning: { effort: config.reasoning } } : {}) }
    : { model: config.model, messages: [{ role: 'user', content: prompt }], stream: false, ...(config.reasoning ? { reasoning_effort: config.reasoning } : {}) };
  try {
    const response = await fetcher(`${config.endpoint}/${responses ? 'responses' : 'chat/completions'}`, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) { await response.body?.cancel(); throw new LiukanError('LIUKAN_RELAY_HTTP', `看山的中转请求返回 HTTP ${response.status}，这次没有自动重发。`, response.status === 429 ? 429 : 502); }
    if (!response.body) throw new LiukanError('LIUKAN_RELAY_EMPTY', '中转站没有返回正文。', 502);
    const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
    try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 512 * 1024) throw new LiukanError('LIUKAN_RELAY_OVERSIZED', '中转回复超过读取上限。', 502); chunks.push(value); } }
    finally { await reader.cancel().catch(() => {}); }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (data.error || (responses && data.status !== 'completed')) throw new LiukanError('LIUKAN_RELAY_INCOMPLETE', '中转回复没有完整结束。', 502);
    const result = responses ? { answer: typeof data.output_text === 'string' ? data.output_text : Array.isArray(data.output) ? data.output.flatMap((item: any) => item.content ?? []).filter((part: any) => part.type === 'output_text' && typeof part.text === 'string').map((part: any) => part.text).join('') : '', model: typeof data.model === 'string' ? data.model : config.model } : parseZhidaResponse(data, config.model);
    if (!result.answer.trim() || result.answer.length > 16000 || result.model.length > 120) throw new LiukanError('LIUKAN_RELAY_INCOMPLETE', '中转回复没有返回完整正文。', 502);
    return { answer: result.answer.trim(), model: result.model, source: 'relay' as const };
  } catch (error) {
    if (error instanceof LiukanError) throw error;
    throw new LiukanError('LIUKAN_RELAY_FAILED', '看山的中转连接或响应读取失败，这次没有自动重发。', 502);
  }
}
export async function callConfiguredLiukan(prompt: string, _requestedModel: string, store: LiukanConfigStore = liukanConfig, options: LiukanRequestOptions = {}) {
  const config = await store.read();
  if (config.transport === 'relay') return requestLiukanRelay(config.relay!, prompt, fetch, options);
  return { ...await callZhidaCli(prompt, config.model), source: 'zhihu-zhida' as const };
}
