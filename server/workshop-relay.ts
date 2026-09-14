import type { RelayConfig } from './workshop-relay-config.ts';
import type { Schema } from './workshop-schema.ts';

const failureLabels = {
  authentication: '认证或访问被上游拒绝', quota: '上游计费或额度状态未就绪', rate_limit: '上游限流',
  upstream: '上游服务暂不可用', timeout: '中转站响应超时', connection: '连接或流式响应中断',
  output_limit: '中转站输出达到上限', content_filter: '上游未返回本阶段正文',
  invalid_request: '上游请求或配置校验失败', invalid_response: '中转站响应格式错误',
  incomplete: '中转站响应未完整结束', oversized: '中转站响应超过大小上限',
  empty: '中转站没有返回故事 JSON', provider_error: '中转站流式创作返回错误',
} as const;
type FailureCategory = keyof typeof failureLabels;

export interface RelayDiagnostics {
  protocol: RelayConfig['protocol']; characters: number; wireBytes: number; eventCount: number;
  completed: boolean; httpStatus?: number; lastEventType?: string; responseId?: string;
  category?: FailureCategory; providerCode?: string; retryable?: boolean;
}
export class RelayRequestError extends Error {
  constructor(public diagnostics: RelayDiagnostics) {
    const category = diagnostics.category ?? 'provider_error';
    const detail = [diagnostics.providerCode, diagnostics.httpStatus && diagnostics.httpStatus >= 400 ? `HTTP ${diagnostics.httpStatus}` : undefined].filter(Boolean).join(' / ');
    super(`${failureLabels[category]}${detail ? `（${detail}）` : ''}；本次收到 ${diagnostics.characters} 字符，未形成完整阶段稿。`);
    this.name = 'RelayRequestError';
  }
}

const object = (value: unknown): Record<string, any> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
const knownCodes = new Set(['server_error', 'internal_error', 'internal_server_error', 'rate_limit_exceeded', 'insufficient_quota', 'insufficient_balance', 'invalid_api_key', 'authentication_error', 'permission_denied', 'invalid_request_error', 'model_not_found', 'context_length_exceeded', 'max_output_tokens', 'max_tokens', 'content_filter', 'timeout', 'request_timeout', 'upstream_timeout', 'stream_error']);
const knownEvents = new Set(['error', 'response.created', 'response.in_progress', 'response.output_item.added', 'response.content_part.added', 'response.output_text.delta', 'response.output_text.done', 'response.output_item.done', 'response.content_part.done', 'response.completed', 'response.failed', 'response.incomplete', 'response.refusal.delta', 'response.refusal.done']);

// Classify provider text in memory. Never persist its message, URL, headers, or arbitrary codes.
function classify(error: unknown, status?: number): FailureCategory {
  const data = object(error);
  const text = [data.code, data.type, data.message, data.reason].filter(value => typeof value === 'string').join(' ');
  if (status === 402 || /insufficient[_ -]*(quota|balance|credit)|余额不足|额度不足/i.test(text)) return 'quota';
  if (status === 429 || /rate[_ -]*limit/i.test(text)) return 'rate_limit';
  if (status === 401 || status === 403 || /invalid_api_key|authentication|unauthoriz|permission_denied/i.test(text)) return 'authentication';
  if (/max_output_tokens|max_tokens|context_length_exceeded/i.test(text)) return 'output_limit';
  if (/content_filter/i.test(text)) return 'content_filter';
  if (status === 408 || status === 504 || /timeout|timed out/i.test(text)) return 'timeout';
  if ((status && status >= 500) || /server_error|internal_error|service_unavailable|bad_gateway/i.test(text)) return 'upstream';
  if ((status && status >= 400) || /invalid_request|model_not_found|schema/i.test(text)) return 'invalid_request';
  if (/stream|connect|network|socket|terminated/i.test(text)) return 'connection';
  return 'provider_error';
}

export interface RelayRequestOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  maxOutputTokens?: number;
  stream?: boolean;
}

export interface RelayResponse {
  content: string;
  usage?: any;
  responseId?: string;
  diagnostics: RelayDiagnostics;
}

export async function requestRelay(config: RelayConfig, schema: Schema, prompt: string, onProgress: (characters: number, diagnostics: RelayDiagnostics) => void = () => {}, options: RelayRequestOptions = {}): Promise<RelayResponse> {
  const diagnostics: RelayDiagnostics = { protocol: config.protocol, characters: 0, wireBytes: 0, eventCount: 0, completed: false };
  const report = () => onProgress(diagnostics.characters, { ...diagnostics });
  const fail = (category: FailureCategory, source?: unknown): never => {
    const error = object(source);
    const providerCode = [error.code, error.reason].find(value => typeof value === 'string' && knownCodes.has(value) && !value.includes(config.apiKey));
    diagnostics.category = category;
    diagnostics.retryable = ['upstream', 'timeout', 'connection', 'rate_limit', 'incomplete'].includes(category);
    if (providerCode) diagnostics.providerCode = providerCode;
    report();
    throw new RelayRequestError({ ...diagnostics });
  };
  const parse = (raw: string) => { try { return object(JSON.parse(raw)); } catch { return fail('invalid_response'); } };
  const remember = (value: unknown) => {
    const id = object(value).id;
    if (typeof id === 'string' && /^resp_[a-zA-Z0-9_-]{1,160}$/.test(id) && !id.includes(config.apiKey)) diagnostics.responseId = id;
  };
  const format = { type: 'json_schema', name: 'story_stage', strict: true, schema };
  const structuredPrompt = `${prompt}\nOUTPUT_SCHEMA_DATA=${JSON.stringify(schema)}\n仅返回符合 OUTPUT_SCHEMA_DATA 的 JSON；字段完整，结尾闭合。`;
  const isResponses = config.protocol === 'responses';
  const stream = options.stream ?? true;
  const outputLimit = options.maxOutputTokens === undefined ? {} : isResponses ? { max_output_tokens: options.maxOutputTokens } : { max_completion_tokens: options.maxOutputTokens };
  const body = isResponses ? { model: config.model, input: [{ role: 'user', content: structuredPrompt }], text: { format }, stream, store: false, ...outputLimit,
    ...(config.reasoning ? { reasoning: { effort: config.reasoning } } : {}) }
    : { model: config.model, messages: [{ role: 'user', content: structuredPrompt }], response_format: { type: 'json_schema', json_schema: { name: 'story_stage', strict: true, schema } }, stream, ...outputLimit,
      ...(config.reasoning ? { reasoning_effort: config.reasoning } : {}) };
  const extract = (value: unknown): string => {
    const data = object(value);
    if (!isResponses) return typeof data.choices?.[0]?.message?.content === 'string' ? data.choices[0].message.content : '';
    if (typeof data.output_text === 'string') return data.output_text;
    return Array.isArray(data.output) ? data.output.flatMap(item => Array.isArray(item?.content) ? item.content : []).filter(part => part?.type === 'output_text' && typeof part.text === 'string').map(part => part.text).join('') : '';
  };
  let content = '', final: Record<string, any> | undefined, activeSignal: AbortSignal | undefined;
  const updateContent = (next: string) => {
    content = next; diagnostics.characters = content.length;
    if (content.length > 2_000_000) fail('oversized');
  };
  const checkResponse = (data: Record<string, any>) => {
    remember(data);
    if (data.error || data.status === 'failed') fail(classify(data.error, diagnostics.httpStatus), data.error);
    if (data.status === 'incomplete') {
      const category = classify(data.incomplete_details);
      fail(category === 'provider_error' ? 'incomplete' : category, data.incomplete_details);
    }
  };
  try {
    const timeoutMs = options.timeoutMs ?? 45 * 60_000;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) return fail('timeout');
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
    activeSignal = signal;
    signal.throwIfAborted();
    const response = await fetch(`${config.endpoint}/${isResponses ? 'responses' : 'chat/completions'}`, { method: 'POST', redirect: 'error',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` }, body: JSON.stringify(body), signal });
    diagnostics.httpStatus = response.status;
    if (!response.ok) { await response.body?.cancel(); fail(classify({}, response.status)); }
    if (!response.body) return fail('empty');
    const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
    // Fetch's request signal alone can leave an already acquired response reader
    // alive on some Node/Undici versions. Explicitly close its stream on abort.
    // Keep this listener installed until all parsing and final checks finish.
    const cancelReader = () => { void reader.cancel(signal.reason).catch(() => {}); };
    signal.addEventListener('abort', cancelReader, { once: true });
    if (signal.aborted) cancelReader();
    const readNext = (): Promise<ReadableStreamReadResult<Uint8Array>> => {
      signal.throwIfAborted();
      return new Promise((resolveRead, reject) => {
        const abortRead = () => { signal.removeEventListener('abort', abortRead); reject(signal.reason); };
        signal.addEventListener('abort', abortRead, { once: true });
        reader.read().then(value => { signal.removeEventListener('abort', abortRead); resolveRead(value); }, error => { signal.removeEventListener('abort', abortRead); reject(error); });
      });
    };
    const streaming = response.headers.get('content-type')?.toLowerCase().includes('text/event-stream');
    let pending = '', eventName = '', dataLines: string[] = [], chatStopped = false;
    const consume = (raw: string, namedEvent = '') => {
      signal.throwIfAborted();
      if (!raw.trim()) return;
      if (raw.trim() === '[DONE]') {
        if (isResponses || !chatStopped) fail('incomplete');
        diagnostics.completed = true; report(); return;
      }
      const event = parse(raw), type = typeof event.type === 'string' ? event.type : namedEvent;
      diagnostics.eventCount++;
      diagnostics.lastEventType = knownEvents.has(type) ? type : isResponses ? 'other' : 'chat.completion.chunk';
      remember(event.response);
      if (type === 'error' || type === 'response.failed' || event.error) {
        const error = event.response?.error ?? event.error ?? event;
        fail(classify(error), error);
      }
      if (type === 'response.incomplete') checkResponse({ ...object(event.response), status: 'incomplete' });
      if (type === 'response.refusal.delta' || type === 'response.refusal.done') fail('content_filter');
      if (type === 'response.output_text.delta') {
        if (typeof event.delta !== 'string') fail('invalid_response');
        updateContent(content + event.delta);
      }
      if (!isResponses) {
        const choice = event.choices?.[0], delta = choice?.delta?.content;
        if (delta !== undefined && delta !== null && typeof delta !== 'string') fail('invalid_response');
        if (typeof delta === 'string') updateContent(content + delta);
        if (choice?.finish_reason === 'length') fail('output_limit', { code: 'max_tokens' });
        if (choice?.finish_reason === 'content_filter' || choice?.delta?.refusal) fail('content_filter');
        if (choice?.finish_reason === 'stop') chatStopped = true;
        else if (choice?.finish_reason) fail('invalid_response');
        if (event.usage) final = event;
      }
      if (type === 'response.completed') {
        final = object(event.response); checkResponse(final);
        if (final.status !== undefined && final.status !== 'completed') fail('incomplete');
        updateContent(extract(final) || content); diagnostics.completed = true;
      }
      report();
    };
    const dispatch = () => { if (dataLines.length) consume(dataLines.join('\n'), eventName); dataLines = []; eventName = ''; };
    const line = (value: string) => {
      if (!value) return dispatch();
      if (value.startsWith(':')) return;
      const colon = value.indexOf(':'), field = colon < 0 ? value : value.slice(0, colon);
      const rest = colon < 0 ? '' : value.slice(colon + 1).replace(/^ /, '');
      if (field === 'event') eventName = rest;
      if (field === 'data') dataLines.push(rest);
    };
    try {
      for (;;) {
        const { done, value } = await readNext();
        signal.throwIfAborted();
        if (done) break;
        diagnostics.wireBytes += value.length;
        if (diagnostics.wireBytes > 24 * 1024 * 1024) fail('oversized');
        pending += decoder.decode(value, { stream: true });
        if (streaming) {
          let end: number;
          while (!diagnostics.completed && (end = pending.indexOf('\n')) >= 0) { line(pending.slice(0, end).replace(/\r$/, '')); pending = pending.slice(end + 1); }
          if (diagnostics.completed) break;
        }
      }
      signal.throwIfAborted();
      pending += decoder.decode();
      if (streaming) {
        if (!diagnostics.completed) { if (pending) line(pending.replace(/\r$/, '')); dispatch(); }
        if (!diagnostics.completed) fail('incomplete');
      } else {
        final = parse(pending); checkResponse(final);
        if (isResponses && final.status !== 'completed') fail('incomplete');
        if (!isResponses && final.choices?.[0]?.finish_reason !== 'stop') fail('incomplete');
        updateContent(extract(final)); diagnostics.completed = true; report();
      }
      signal.throwIfAborted();
    } finally {
      signal.removeEventListener('abort', cancelReader);
      // Cancellation already initiated stream shutdown; do not let a stalled
      // underlying cancel promise keep an aborted request running indefinitely.
      if (signal.aborted) cancelReader();
      else await reader.cancel().catch(() => {});
    }
    signal.throwIfAborted();
    if (!content.trim()) fail('empty');
    return { content, usage: final?.usage, responseId: diagnostics.responseId, diagnostics: { ...diagnostics } };
  } catch (error) {
    if (error instanceof RelayRequestError) throw error;
    if (activeSignal?.aborted) return fail('timeout');
    const data = object(error);
    if (data.name === 'TimeoutError' || data.name === 'AbortError') fail('timeout');
    return fail('connection');
  }
}
