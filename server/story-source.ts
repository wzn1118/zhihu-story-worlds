import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { StoryDetail, StoryListResponse, StorySummary } from '../shared/types.ts';
import { authoredWorlds } from '../content/worlds.ts';
import { originalWorkUrl, sourceReadingUrl, zhihuImage } from '../shared/zhihu-source.ts';

const API_BASE = 'https://api.zhihu.com/km-indep-home/hackathon/v2/story/';
const MAX_BYTES = 4 * 1024 * 1024;
const CACHE_TTL = 5 * 60 * 1000;

export const PLAYABLE_STORIES: Record<string, string> = Object.fromEntries(authoredWorlds.map(world => [world.storyId, world.id]));
const CURATED_METADATA = Object.fromEntries(authoredWorlds.map(world => [world.storyId, { author: world.source.author, cover: world.cover }]));

export class StorySourceError extends Error {
  constructor(public code: string, message: string, public status = 502) {
    super(message);
    this.name = 'StorySourceError';
  }
}

type RawRecord = Record<string, unknown>;
interface CacheEnvelope { version: 1; fetchedAt: string; data: unknown }
interface FetchResult { data: unknown; source: 'live' | 'cache'; fetchedAt: string; warning?: string }
interface SourceOptions { cacheDir?: string; fetcher?: typeof fetch; timeoutMs?: number; now?: () => number }

const stringValue = (value: unknown): string => typeof value === 'string' ? value : '';
const isRecord = (value: unknown): value is RawRecord => !!value && typeof value === 'object' && !Array.isArray(value);
const labelsValue = (value: unknown): string[] => Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

export function validateStoryId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || !/^\d{8,24}$/.test(id)) {
    throw new StorySourceError('INVALID_STORY_ID', '故事编号格式不正确。', 400);
  }
}

export function storySourceUrl(id: string): string {
  validateStoryId(id);
  return `${API_BASE}${encodeURIComponent(id)}`;
}

function validRawList(data: unknown): data is RawRecord[] {
  return Array.isArray(data) && data.every((item) => isRecord(item)
    && typeof item.work_id === 'string' && /^\d{8,24}$/.test(item.work_id)
    && typeof item.title === 'string' && item.title.length > 0);
}

function validRawDetail(data: unknown, id: string): data is RawRecord {
  return isRecord(data) && data.work_id === id && typeof data.content === 'string';
}

function summaryFromRaw(raw: RawRecord): StorySummary {
  const id = stringValue(raw.work_id);
  const worldSlug = PLAYABLE_STORIES[id];
  return {
    id,
    title: stringValue(raw.title),
    description: stringValue(raw.description),
    labels: labelsValue(raw.labels),
    author: stringValue(raw.author_name) || CURATED_METADATA[id]?.author,
    ...(zhihuImage(raw.author_avatar) ? { authorAvatar: zhihuImage(raw.author_avatar) } : {}),
    ...(zhihuImage(raw.artwork) ? { sourceCover: zhihuImage(raw.artwork) } : {}),
    sourceUrl: storySourceUrl(id),
    originalUrl: originalWorkUrl(raw.original_url) ?? originalWorkUrl(raw.source_url) ?? originalWorkUrl(raw.url) ?? sourceReadingUrl({ id, title: stringValue(raw.title) }),
    cover: worldSlug ? CURATED_METADATA[id].cover : stringValue(raw.artwork) || undefined,
    playable: !!worldSlug,
  };
}

export class StorySourceService {
  private readonly cacheDir: string;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;
  private readonly now: () => number;
  private readonly inFlight = new Map<string, Promise<FetchResult>>();

  constructor(options: SourceOptions = {}) {
    this.cacheDir = options.cacheDir ?? resolve(process.cwd(), '.local/zhihu-cache');
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 12000;
    this.now = options.now ?? Date.now;
  }

  private async readCache(key: string): Promise<CacheEnvelope | undefined> {
    try {
      const text = await readFile(resolve(this.cacheDir, `${key}.json`), 'utf8');
      if (Buffer.byteLength(text) > MAX_BYTES * 2) return undefined;
      const value: unknown = JSON.parse(text);
      if (!isRecord(value) || value.version !== 1 || typeof value.fetchedAt !== 'string'
        || !Number.isFinite(Date.parse(value.fetchedAt))) return undefined;
      return value as unknown as CacheEnvelope;
    } catch { return undefined; }
  }

  private async writeCache(key: string, envelope: CacheEnvelope): Promise<void> {
    await mkdir(this.cacheDir, { recursive: true });
    const temporary = resolve(this.cacheDir, `${key}.${process.pid}.${Date.now()}.tmp`);
    await writeFile(temporary, JSON.stringify(envelope, null, 2), 'utf8');
    await rename(temporary, resolve(this.cacheDir, `${key}.json`));
  }

  private async request(key: string, path: string, validator: (value: unknown) => boolean, refresh = false): Promise<FetchResult> {
    const existing = this.inFlight.get(key);
    if (existing) return existing;
    const pending = this.performRequest(key, path, validator, refresh);
    this.inFlight.set(key, pending);
    try { return await pending; }
    finally { this.inFlight.delete(key); }
  }

  private async performRequest(key: string, path: string, validator: (value: unknown) => boolean, refresh: boolean): Promise<FetchResult> {
    const candidate = await this.readCache(key);
    const cached = candidate && validator(candidate.data) ? candidate : undefined;
    if (!refresh && cached && this.now() - Date.parse(cached.fetchedAt) < CACHE_TTL) {
      return { data: cached.data, source: 'cache', fetchedAt: cached.fetchedAt };
    }
    try {
      const response = await this.fetcher(`${API_BASE}${path}`, {
        headers: { Accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) throw new StorySourceError('UPSTREAM_HTTP_ERROR', `知乎内容接口返回 HTTP ${response.status}。`);
      const contentLength = Number(response.headers.get('content-length') ?? 0);
      if (contentLength > MAX_BYTES) throw new StorySourceError('UPSTREAM_TOO_LARGE', '知乎内容接口响应超过读取上限。');
      const reader = response.body?.getReader();
      if (!reader) throw new StorySourceError('UPSTREAM_INVALID_RESPONSE', '知乎内容接口未返回内容。');
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > MAX_BYTES) {
          await reader.cancel();
          throw new StorySourceError('UPSTREAM_TOO_LARGE', '知乎内容接口响应超过读取上限。');
        }
        chunks.push(part.value);
      }
      let data: unknown;
      try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { throw new StorySourceError('UPSTREAM_INVALID_RESPONSE', '知乎内容接口返回了无法解析的 JSON。'); }
      if (!validator(data)) throw new StorySourceError('UPSTREAM_INVALID_RESPONSE', '知乎内容接口字段不完整或故事编号不匹配。');
      const fetchedAt = new Date(this.now()).toISOString();
      let warning: string | undefined;
      try { await this.writeCache(key, { version: 1, fetchedAt, data }); }
      catch { warning = '内容已实时取得，但本地缓存暂时无法写入。'; }
      return { data, source: 'live', fetchedAt, warning };
    } catch (error) {
      const safe = error instanceof StorySourceError ? error
        : new StorySourceError('UPSTREAM_UNAVAILABLE', '暂时无法连接知乎内容接口，或请求已超时。');
      if (cached) return { data: cached.data, source: 'cache', fetchedAt: cached.fetchedAt, warning: `${safe.message} 正在显示本地缓存。` };
      throw safe;
    }
  }

  async list(refresh = false): Promise<StoryListResponse> {
    const result = await this.request('story-list', 'list', validRawList, refresh);
    const stories = (result.data as RawRecord[]).map(summaryFromRaw);
    const priority = Object.keys(PLAYABLE_STORIES);
    stories.sort((a, b) => (priority.includes(a.id) ? priority.indexOf(a.id) : 99) - (priority.includes(b.id) ? priority.indexOf(b.id) : 99));
    return { stories, source: result.source, fetchedAt: result.fetchedAt, warning: result.warning };
  }

  async detail(id: string, refresh = false): Promise<StoryDetail> {
    validateStoryId(id);
    const list = await this.list();
    const summary = list.stories.find((story) => story.id === id);
    if (!summary) throw new StorySourceError('STORY_NOT_FOUND', '该编号不在知乎故事列表中。', 404);
    const result = await this.request(`story-${id}`, encodeURIComponent(id), (data) => validRawDetail(data, id), refresh);
    const raw = result.data as RawRecord;
    return {
      ...summary,
      title: stringValue(raw.chapter_name) || summary.title,
      labels: labelsValue(raw.labels).length ? labelsValue(raw.labels) : summary.labels,
      author: stringValue(raw.author_name) || '作者信息未提供',
      ...(zhihuImage(raw.author_avatar) ? { authorAvatar: zhihuImage(raw.author_avatar) } : {}),
      introduction: stringValue(raw.introduction),
      originalUrl: originalWorkUrl(raw.original_url) ?? originalWorkUrl(raw.source_url) ?? originalWorkUrl(raw.url) ?? summary.originalUrl,
      content: stringValue(raw.content),
      contentScope: 'api-excerpt',
      source: result.source,
      fetchedAt: result.fetchedAt,
      warning: result.warning ?? list.warning,
    };
  }
}
