import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { canonicalZhihuSource } from '../shared/zhihu-discovery.ts';
import type { ZhihuHotQuestion, ZhihuHotQuestionsResult, ZhihuQuestionAnswersResult } from '../shared/zhihu-questions.ts';
import { zhihuImage } from '../shared/zhihu-source.ts';
import { WorkshopError } from './story-workshop.ts';
import type { ZhihuDiscoveryService } from './zhihu-discovery.ts';

type JsonObject = Record<string, unknown>;
type CachedResponse = { raw: JsonObject; fetchedAt: string; expiresAt: number; bytes: number };
type RequestResult = { raw: JsonObject; fetchedAt: string; cached: boolean };
export type ZhihuQuestionsOptions = {
  accessSecret?: string;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  cacheRoot?: string | null;
};
const MAX_BODY = 2 * 1024 * 1024;
const MAX_CACHE_BYTES = 16 * 1024 * 1024;
const MAX_CACHE_ENTRIES = 128;
const PAGE_SIZE = 20;

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
}
function parseJson(raw: string): unknown {
  return JSON.parse(raw.replace(/"(?:\\[\s\S]|[^"\\])*"|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/g,
    value => /^-?[0-9]{16,}$/.test(value) ? JSON.stringify(value) : value));
}
function integer(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && /^(0|[1-9][0-9]{0,15})$/.test(value) && Number.isSafeInteger(Number(value))) return Number(value);
}
export function canonicalZhihuQuestion(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048) throw new WorkshopError('INVALID_QUESTION_URL', '请选择知乎问题链接。');
  let url: URL;
  try { url = new URL(value); } catch { throw new WorkshopError('INVALID_QUESTION_URL', '请选择知乎问题链接。'); }
  if (url.protocol !== 'https:' || url.hostname !== 'www.zhihu.com' || url.username || url.password || url.port || !/^\/question\/[0-9]{5,24}\/?$/.test(url.pathname)) throw new WorkshopError('INVALID_QUESTION_URL', '请选择知乎问题链接。');
  return `${url.origin}${url.pathname.replace(/\/$/, '')}`;
}
function upstreamFailure(code: unknown): WorkshopError {
  if (code === 20001) return new WorkshopError('ZHIHU_QUESTIONS_AUTH_FAILED', '知乎回答读取凭据已失效，请联系管理员更新。', 503);
  if (code === 30001 || code === 30002) return new WorkshopError('ZHIHU_QUESTIONS_RATE_LIMITED', '知乎回答读取达到频率或额度限制，请稍后再试。', 429);
  if (code === 30003) return new WorkshopError('ZHIHU_QUESTIONS_RESTRICTED', '知乎暂时限制了该问题的接口读取，请稍后重试或打开原网页。', 403);
  if (code === 10001) return new WorkshopError('ZHIHU_QUESTION_UNAVAILABLE', '该知乎问题不存在或暂时无法读取。', 404);
  return new WorkshopError('ZHIHU_QUESTIONS_FAILED', '知乎回答列表暂时无法读取，请稍后重试。', 502);
}

/** Public official responses may be shared in memory, but selections are saved only
 * to the authenticated caller's discovery store. No OAuth token or website cookie
 * is sent to this endpoint, and its Summary field remains an excerpt throughout. */
export class ZhihuQuestionsService {
  private readonly accessSecret: string;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly now: () => number;
  private readonly cacheRoot: string | null;
  private readonly cache = new Map<string, CachedResponse>();
  private readonly active = new Map<string, Promise<RequestResult>>();
  private cacheBytes = 0;
  private readonly cooldowns = new Map<string, { until: number; error: WorkshopError }>();
  constructor(options: ZhihuQuestionsOptions = {}) {
    this.accessSecret = options.accessSecret ?? process.env.ZHIHU_ACCESS_SECRET ?? '';
    this.fetcher = options.fetch ?? globalThis.fetch;
    this.now = options.now ?? Date.now;
    this.cacheRoot = options.cacheRoot === null ? null : resolve(options.cacheRoot ?? process.env.ZHIHU_QUESTIONS_CACHE_DIR ?? '.local/zhihu-question-cache');
  }
  private cacheFile(url: string) {
    return this.cacheRoot && join(this.cacheRoot, `${createHash('sha256').update(url).digest('hex')}.json`);
  }
  private async diskCache(url: string): Promise<CachedResponse | undefined> {
    const file = this.cacheFile(url); if (!file) return;
    try {
      if ((await stat(file)).size > MAX_BODY + 2048) return;
      const parsed = object(JSON.parse(await readFile(file, 'utf8')));
      if (!parsed || parsed.url !== url || typeof parsed.fetchedAt !== 'string' || typeof parsed.expiresAt !== 'number' || !Number.isFinite(parsed.expiresAt) || this.now() - Date.parse(parsed.fetchedAt) > 7 * 24 * 60 * 60_000 || !Number.isFinite(Date.parse(parsed.fetchedAt))) return;
      const raw = object(parsed.raw); if (!raw || raw.Code !== 0 || !object(raw.Data)) return;
      return { raw, fetchedAt: parsed.fetchedAt, expiresAt: parsed.expiresAt, bytes: Buffer.byteLength(JSON.stringify(raw)) };
    } catch { return; }
  }
  private async persistCache(url: string, entry: CachedResponse) {
    const file = this.cacheFile(url); if (!file || !this.cacheRoot) return;
    try {
      await mkdir(this.cacheRoot, { recursive: true });
      await writeFile(file, JSON.stringify({ url, raw: entry.raw, fetchedAt: entry.fetchedAt, expiresAt: entry.expiresAt }), { mode: 0o600 });
      const files = (await readdir(this.cacheRoot)).filter(name => /^[a-f0-9]{64}\.json$/.test(name));
      const rows = (await Promise.all(files.map(async name => { const path = join(this.cacheRoot!, name); return { path, ...await stat(path) }; }))).sort((a, b) => a.mtimeMs - b.mtimeMs);
      let total = rows.reduce((sum, row) => sum + row.size, 0), count = rows.length;
      for (const row of rows) {
        if (count <= MAX_CACHE_ENTRIES && total <= MAX_CACHE_BYTES) break;
        await rm(row.path, { force: true }); total -= row.size; count--;
      }
    } catch { /* A cache failure must not discard an otherwise readable answer. */ }
  }
  private async request(path: 'hot_list' | 'question_answers', query: Record<string, string>): Promise<RequestResult> {
    if (!this.accessSecret) throw new WorkshopError('ZHIHU_QUESTIONS_NOT_CONFIGURED', '知乎回答读取尚未配置，请联系站点管理员。', 503);
    const url = new URL(`https://developer.zhihu.com/api/v1/content/${path}`);
    url.search = new URLSearchParams(query).toString();
    const key = url.href;
    const active = this.active.get(key);
    if (active) return active;
    const task = this.cachedRequest(url, path);
    this.active.set(key, task);
    try { return await task; } finally { this.active.delete(key); }
  }
  private async cachedRequest(url: URL, path: 'hot_list' | 'question_answers'): Promise<RequestResult> {
    const key = url.href, cached = this.cache.get(key) ?? await this.diskCache(key);
    if (cached && cached.expiresAt > this.now()) {
      if (!this.cache.has(key)) this.cacheBytes += cached.bytes;
      this.cache.delete(key); this.cache.set(key, cached);
      return { raw: cached.raw, fetchedAt: cached.fetchedAt, cached: true };
    }
    if (this.cache.has(key)) { this.cache.delete(key); this.cacheBytes -= cached!.bytes; }
    const cooldown = this.cooldowns.get(path);
    if (cooldown && cooldown.until > this.now()) {
      if (cached) return { raw: cached.raw, fetchedAt: cached.fetchedAt, cached: true };
      throw cooldown.error;
    }
    if (this.active.size > 4) throw new WorkshopError('ZHIHU_QUESTIONS_BUSY', '正在读取其他知乎问题，请稍后再试。', 429);
    try {
      // With a low quota, repeatedly re-reading a public list can consume all
      // daily calls. Keep successful pages across users and service restarts.
      return await this.fetchResponse(url, 24 * 60 * 60_000);
    } catch (error) {
      if (error instanceof WorkshopError && ['ZHIHU_QUESTIONS_RATE_LIMITED', 'ZHIHU_QUESTIONS_FAILED', 'ZHIHU_QUESTIONS_TIMEOUT'].includes(error.code)) {
        this.cooldowns.set(path, { until: this.now() + 60_000, error });
        if (cached) return { raw: cached.raw, fetchedAt: cached.fetchedAt, cached: true };
      }
      throw error;
    }
  }
  private async fetchResponse(url: URL, ttl: number): Promise<RequestResult> {
    const abort = new AbortController(), timeout = setTimeout(() => abort.abort(), 30_000);
    try {
      const response = await this.fetcher(url, {
        method: 'GET', redirect: 'error', signal: abort.signal,
        headers: { Authorization: `Bearer ${this.accessSecret}`, 'X-Request-Timestamp': String(Math.floor(this.now() / 1000)), 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 401 || response.status === 403) throw upstreamFailure(20001);
        if (response.status === 429) throw upstreamFailure(30001);
        throw upstreamFailure(undefined);
      }
      if (Number(response.headers.get('content-length')) > MAX_BODY) {
        await response.body?.cancel();
        throw new WorkshopError('ZHIHU_QUESTIONS_TOO_LARGE', '知乎回答列表超过读取上限。', 502);
      }
      const reader = response.body?.getReader();
      if (!reader) throw upstreamFailure(undefined);
      const chunks: Uint8Array[] = []; let bytes = 0;
      try {
        while (true) {
          const next = await reader.read(); if (next.done) break;
          bytes += next.value.byteLength;
          if (bytes > MAX_BODY) { await reader.cancel(); throw new WorkshopError('ZHIHU_QUESTIONS_TOO_LARGE', '知乎回答列表超过读取上限。', 502); }
          chunks.push(next.value);
        }
      } finally { reader.releaseLock(); }
      let raw: JsonObject | null;
      try { raw = object(parseJson(Buffer.concat(chunks).toString('utf8'))); } catch { throw upstreamFailure(undefined); }
      if (!raw || raw.Code !== 0 || !object(raw.Data)) throw upstreamFailure(raw?.Code);
      const fetchedAt = new Date(this.now()).toISOString();
      while (this.cache.size >= MAX_CACHE_ENTRIES || this.cacheBytes + bytes > MAX_CACHE_BYTES) {
        const oldest = this.cache.keys().next().value;
        if (oldest === undefined) break;
        this.cacheBytes -= this.cache.get(oldest)!.bytes; this.cache.delete(oldest);
      }
      const entry = { raw, fetchedAt, expiresAt: this.now() + ttl, bytes };
      this.cache.set(url.href, entry); this.cacheBytes += bytes;
      await this.persistCache(url.href, entry);
      return { raw, fetchedAt, cached: false };
    } catch (error) {
      if (error instanceof WorkshopError) throw error;
      if (abort.signal.aborted) throw new WorkshopError('ZHIHU_QUESTIONS_TIMEOUT', '读取知乎回答超时，请稍后重试。', 504);
      throw upstreamFailure(undefined);
    } finally { clearTimeout(timeout); }
  }
  async hotlist(): Promise<ZhihuHotQuestionsResult> {
    const result = await this.request('hot_list', { Limit: '30' });
    const data = object(result.raw.Data)!;
    if (!Array.isArray(data.Items)) throw upstreamFailure(undefined);
    const items: ZhihuHotQuestion[] = [], seen = new Set<string>();
    for (const raw of data.Items.slice(0, 30)) {
      const row = object(raw);
      if (!row || typeof row.Title !== 'string' || !row.Title.trim() || row.Title.length > 500) continue;
      let url: string;
      try { url = canonicalZhihuQuestion(row.Url); }
      catch {
        try { const source = canonicalZhihuSource(row.Url); if (source.kind !== 'zhihu-article') continue; url = source.sourceUrl; } catch { continue; }
      }
      if (seen.has(url)) continue; seen.add(url);
      const thumbnailUrl = zhihuImage(row.ThumbnailUrl);
      items.push({ title: row.Title, url, summary: typeof row.Summary === 'string' ? row.Summary.slice(0, 5000) : '', ...(thumbnailUrl ? { thumbnailUrl } : {}) });
    }
    return { items, fetchedAt: result.fetchedAt, cached: result.cached };
  }
  async questionAnswers(value: unknown, offsetValue: unknown, discovery: ZhihuDiscoveryService): Promise<ZhihuQuestionAnswersResult> {
    const questionUrl = canonicalZhihuQuestion(value);
    const offset = offsetValue === undefined ? 0 : integer(offsetValue);
    if (offset === undefined) throw new WorkshopError('INVALID_QUESTION_OFFSET', '回答翻页参数无效，请重新打开问题。');
    const [result, hotlist] = await Promise.all([
      this.request('question_answers', { QuestionUrl: questionUrl, Offset: String(offset), Limit: String(PAGE_SIZE) }),
      this.hotlist().catch(() => null),
    ]);
    const data = object(result.raw.Data)!;
    if (!Array.isArray(data.Items) || data.Items.length > 50) throw upstreamFailure(undefined);
    const title = hotlist?.items.find(item => item.url === questionUrl)?.title ?? `知乎问题 ${questionUrl.split('/').pop()}`;
    const pagingData = object(data.Paging);
    const paging: ZhihuQuestionAnswersResult['paging'] = { isEnd: pagingData?.IsEnd === true };
    let warning: string | undefined;
    const nextOffset = integer(pagingData?.NextOffset), totals = integer(pagingData?.Totals);
    if (totals !== undefined) paging.totals = totals;
    if (!paging.isEnd) {
      if (pagingData?.IsEnd === false && nextOffset !== undefined && nextOffset > offset) paging.nextOffset = nextOffset;
      else warning = '知乎未返回有效的下一页位置，已暂停翻页；当前回答仍可拖给刘看山。';
    }
    const seen = new Set<string>();
    const candidates: ZhihuQuestionAnswersResult['candidates'] = [];
    for (const raw of data.Items) {
      const row = object(raw);
      if (!row || row.ContentType !== 'answer' || typeof row.ContentToken !== 'string' || !/^[0-9]{5,24}$/.test(row.ContentToken) || typeof row.Summary !== 'string' || !row.Summary.trim() || row.Summary.length > 120000 || row.Summary.includes('\u0000')) continue;
      let identity: ReturnType<typeof canonicalZhihuSource>;
      try { identity = canonicalZhihuSource(row.Url); } catch { continue; }
      if (identity.kind !== 'zhihu-answer' || identity.workId !== row.ContentToken || identity.sourceUrl !== `${questionUrl}/answer/${row.ContentToken}` || seen.has(identity.sourceUrl)) continue;
      seen.add(identity.sourceUrl);
      candidates.push(await discovery.captureOfficialQuestionAnswer({ sourceUrl: identity.sourceUrl, title: title.slice(0, 120), text: row.Summary, fetchedAt: result.fetchedAt }));
    }
    return { title, questionUrl, candidates, paging, ...(warning ? { warning } : {}), fetchedAt: result.fetchedAt, cached: result.cached };
  }
}
