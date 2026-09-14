import { normalizeRelayConfig, type RelayConfig, type RelayProtocol } from './workshop-relay-config.ts';
import { RelayRequestError, requestRelay } from './workshop-relay.ts';
import type { Schema } from './workshop-schema.ts';

export class RelayDiscoveryError extends Error {
  constructor(message: string, public status: number, public code: string) {
    super(message);
    this.name = 'RelayDiscoveryError';
  }
}

interface DiscoveryOptions { signal?: AbortSignal; timeoutMs?: number }
const MAX_LIST_BYTES = 2 * 1024 * 1024;
const MAX_MODELS = 10_000;
const probeSchema: Schema = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false };
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const error = (code: string, message: string, status = 502) => new RelayDiscoveryError(message, status, code);

function containsSecret(value: string, apiKey: string): boolean {
  return [apiKey, encodeURIComponent(apiKey)].some(secret => value.includes(secret));
}

function modelId(value: unknown, apiKey: string): string | undefined {
  if (typeof value !== 'string') return;
  const id = value.trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/@+-]{0,255}$/.test(id) || containsSecret(id, apiKey)) return;
  return id;
}

function inputConfig(input: unknown, requireModel: boolean): { config: RelayConfig; automatic: boolean } {
  const data = object(input);
  if (typeof data.endpoint !== 'string' || typeof data.apiKey !== 'string' || !data.endpoint.trim() || !data.apiKey.trim()
    || data.endpoint.length > 2048 || data.apiKey.length > 16_384 || /[\r\n\u0000]/.test(data.apiKey)
    || (data.protocol !== undefined && !['auto', 'responses', 'chat-completions'].includes(data.protocol as string))) {
    throw error('invalid_config', '请填写有效的中转地址和 API 密钥。', 400);
  }
  const apiKey = data.apiKey.trim();
  const model = requireModel ? modelId(data.model, apiKey) : 'connection-check';
  if (!model) throw error('invalid_model', '请选择中转站返回的有效模型。', 400);
  try {
    // A copied /models URL is also usable as a base address, just like a full generation URL.
    const endpoint = data.endpoint.trim().replace(/\/+$/, '').replace(/\/models$/, '');
    const config = normalizeRelayConfig({ endpoint, apiKey, model, protocol: data.protocol === 'chat-completions' ? 'chat-completions' : 'responses' });
    if (containsSecret(config.endpoint, apiKey)) throw new Error('private endpoint');
    return { config, automatic: data.protocol === undefined || data.protocol === 'auto' };
  } catch {
    throw error('invalid_config', '请填写有效的中转地址和 API 密钥。', 400);
  }
}

function deadline(options: DiscoveryOptions, defaultTimeout: number) {
  const requested = options.timeoutMs ?? defaultTimeout;
  if (!Number.isSafeInteger(requested) || requested <= 0) throw error('invalid_config', '连接检测超时时间无效。', 400);
  const timeoutMs = Math.min(requested, 60_000);
  const controller = new AbortController();
  const started = Date.now();
  let timedOut = false;
  const abort = () => controller.abort();
  if (options.signal?.aborted) abort();
  else options.signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  return {
    signal: controller.signal,
    remaining: () => Math.max(1, timeoutMs - (Date.now() - started)),
    check() {
      if (controller.signal.aborted) throw timedOut
        ? error('timeout', '中转站检测超时，请检查地址或稍后重试。', 504)
        : error('aborted', '本次中转站检测已取消。', 499);
    },
    close() { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); },
  };
}

function failureForStatus(status: number): RelayDiscoveryError {
  if (status === 401 || status === 403) return error('authentication', '中转站认证失败，请检查 API 密钥及访问权限。', status);
  if (status === 402) return error('quota', '中转站余额或额度不足，请检查账户状态。', 402);
  if (status === 429) return error('rate_limit', '中转站请求过于频繁，请稍后重试。', 429);
  if (status === 408 || status === 504) return error('timeout', '中转站检测超时，请稍后重试。', 504);
  if ([404, 405, 501].includes(status)) return error('models_unavailable', '中转站未提供模型列表，请检查地址或联系中转站管理员。');
  if (status === 400 || status === 422) return error('invalid_request', '中转站拒绝了检测请求，请检查地址、密钥权限及模型支持情况。');
  return error('upstream', '中转站暂时无法完成检测，请稍后重试。');
}

async function readModelsJson(response: Response): Promise<unknown> {
  if (!response.body) throw error('empty_models', '中转站没有返回模型列表，请检查密钥权限或联系中转站管理员。');
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > MAX_LIST_BYTES) {
    await response.body.cancel();
    throw error('oversized', '中转站模型列表超过大小上限。');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0, body = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > MAX_LIST_BYTES) throw error('oversized', '中转站模型列表超过大小上限。');
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    try { return JSON.parse(body); }
    catch { throw error('invalid_models', '中转站模型列表格式无效，请检查地址。'); }
  } finally { await reader.cancel().catch(() => {}); }
}

function extractModels(value: unknown, apiKey: string): string[] {
  const data = object(value);
  if (data.error) {
    const detail = object(data.error);
    // Provider error text is used only for classification and never leaves this function.
    const hint = [detail.code, detail.type, detail.message].filter(item => typeof item === 'string').join(' ');
    if (/insufficient[_ -]*(quota|balance|credit)|余额不足|额度不足/i.test(hint)) throw failureForStatus(402);
    if (/rate[_ -]*limit/i.test(hint)) throw failureForStatus(429);
    if (/invalid_api_key|authentication|unauthoriz|permission_denied/i.test(hint)) throw failureForStatus(401);
    throw error('invalid_models', '中转站未能返回模型列表，请检查地址和密钥权限。');
  }
  const entries = Array.isArray(value) ? value : Array.isArray(data.data) ? data.data : Array.isArray(data.models) ? data.models
    : Array.isArray(object(data.data).models) ? object(data.data).models as unknown[] : undefined;
  if (!entries) throw error('invalid_models', '中转站模型列表格式无效，请检查地址。');
  if (entries.length > MAX_MODELS) throw error('oversized', '中转站返回的模型数量超过上限。');
  const ids = entries.map(item => modelId(typeof item === 'string' ? item : object(item).id ?? object(item).name, apiKey)).filter((id): id is string => Boolean(id));
  if (!ids.length) throw error('empty_models', '中转站没有返回可选择的模型，请检查密钥权限或联系中转站管理员。');
  return [...new Set(ids)].sort();
}

/** Returns models advertised for this key; generation is checked separately for the selected model. */
export async function discoverRelayModels(input: unknown, options: DiscoveryOptions = {}): Promise<{ endpoint: string; models: string[] }> {
  const { config } = inputConfig(input, false);
  const limit = deadline(options, 15_000);
  try {
    limit.check();
    const response = await fetch(`${config.endpoint}/models`, { method: 'GET', redirect: 'error', signal: limit.signal,
      headers: { Accept: 'application/json', Authorization: `Bearer ${config.apiKey}` } });
    if (!response.ok) { await response.body?.cancel(); throw failureForStatus(response.status); }
    const value = await readModelsJson(response);
    limit.check();
    return { endpoint: config.endpoint, models: extractModels(value, config.apiKey) };
  } catch (cause) {
    limit.check();
    if (cause instanceof RelayDiscoveryError) throw cause;
    throw error('connection', '无法读取中转站模型列表，请检查地址和网络连接。');
  } finally { limit.close(); }
}

function canTryChat(cause: unknown): boolean {
  if (!(cause instanceof RelayRequestError)) return false;
  const { category, httpStatus, providerCode } = cause.diagnostics;
  if (category === 'authentication' || category === 'quota' || category === 'rate_limit') return false;
  // Generic HTTP 400 bodies are unavailable in requestRelay. They can conceal quota/auth failures,
  // so only explicit endpoint/format failures or classified configuration errors allow a retry.
  return [404, 405, 415, 422, 501].includes(httpStatus ?? 0)
    || (httpStatus === 200 && category === 'invalid_request' && ['invalid_request_error', 'model_not_found'].includes(providerCode ?? ''));
}

function connectionFailure(cause: unknown): RelayDiscoveryError {
  if (cause instanceof RelayDiscoveryError) return cause;
  if (!(cause instanceof RelayRequestError)) return error('connection', '无法连接中转站，请检查地址和网络连接。');
  const { category, httpStatus } = cause.diagnostics;
  if (category === 'authentication') return failureForStatus(httpStatus === 403 ? 403 : 401);
  if (category === 'quota') return failureForStatus(402);
  if (category === 'rate_limit') return failureForStatus(429);
  if (category === 'timeout') return failureForStatus(504);
  if (category === 'invalid_request' || httpStatus === 501) return error('unsupported_model', '该模型未通过生成检测，请选择其他模型，或检查中转站的协议支持与密钥权限。');
  if (['empty', 'invalid_response', 'incomplete', 'output_limit', 'content_filter', 'oversized'].includes(category ?? '')) {
    return error('invalid_probe', '中转站未返回完整有效的检测结果，该模型暂不可用。');
  }
  return error('connection', '中转站生成连接失败，请稍后重试或选择其他模型。');
}

/** Makes a small real generation request without persisting credentials or forcing reasoning settings. */
export async function checkRelayConnection(input: unknown, options: DiscoveryOptions = {}): Promise<{
  endpoint: string; model: string; protocol: RelayProtocol; connected: true; latencyMs: number;
}> {
  const { config, automatic } = inputConfig(input, true);
  const protocols: RelayProtocol[] = automatic ? ['responses', 'chat-completions'] : [config.protocol];
  const limit = deadline(options, 30_000);
  const started = Date.now();
  try {
    for (const protocol of protocols) {
      limit.check();
      try {
        const result = await requestRelay({ ...config, protocol }, probeSchema, '连接检测。仅返回 {"ok":true}。', undefined,
          { signal: limit.signal, timeoutMs: limit.remaining(), maxOutputTokens: 512, stream: false });
        limit.check();
        let value: unknown;
        try { value = result.content.length <= 4096 ? JSON.parse(result.content) : null; } catch { value = null; }
        const payload = object(value);
        if (!result.diagnostics.completed || payload.ok !== true || Object.keys(payload).length !== 1) {
          throw error('invalid_probe', '中转站未返回有效的检测 JSON，该模型暂不可用。');
        }
        return { endpoint: config.endpoint, model: config.model, protocol, connected: true, latencyMs: Date.now() - started };
      } catch (cause) {
        limit.check();
        if (automatic && protocol === 'responses' && canTryChat(cause)) continue;
        throw connectionFailure(cause);
      }
    }
    throw error('unsupported_model', '该模型暂不支持可用的生成协议，请选择其他模型。');
  } finally { limit.close(); }
}
