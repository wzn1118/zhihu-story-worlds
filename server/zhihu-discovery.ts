import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { ImportedSource } from '../shared/workshop.ts';
import { canonicalZhihuSource, type ZhihuCandidate, type ZhihuDiscoveryResult } from '../shared/zhihu-discovery.ts';
import { zhihuImage } from '../shared/zhihu-source.ts';
import { hashSource, jsonFile, writeJson, WorkshopError } from './story-workshop.ts';

function candidateSource(candidate: ZhihuCandidate): ImportedSource {
  return { title: candidate.title, author: candidate.author, text: candidate.excerpt, scope: 'zhihu-excerpt', origin: candidate.origin };
}
function withSourceHash(candidate: ZhihuCandidate): ZhihuCandidate { return { ...candidate, sourceHash: hashSource(candidateSource(candidate)) }; }

function searchFailure(raw: unknown): WorkshopError | undefined {
  const payload = raw as { Code?: unknown; ok?: unknown; error?: { code?: unknown } } | null;
  const code = payload?.Code ?? payload?.error?.code;
  if (['AUTH_REQUIRED', 'KEYCHAIN_UNAVAILABLE'].includes(String(code))) return new WorkshopError('ZHIHU_SEARCH_NOT_CONFIGURED', '知乎搜索服务尚未配置，请联系站点管理员开通。', 503);
  if (['AUTH_INVALID', 'ENV_SHADOWS_KEYCHAIN', '20001'].includes(String(code))) return new WorkshopError('ZHIHU_SEARCH_AUTH_FAILED', '知乎搜索服务认证失败，请联系站点管理员更新搜索凭据。', 503);
  if (String(code) === '30001') return new WorkshopError('ZHIHU_SEARCH_RATE_LIMITED', '知乎搜索请求过于频繁，请稍后再试。', 429);
  if (String(code) === '30002') return new WorkshopError('ZHIHU_SEARCH_QUOTA_EXCEEDED', '知乎搜索额度已用完，请等待额度恢复。', 429);
  if (code === 'TIMEOUT') return new WorkshopError('ZHIHU_SEARCH_TIMEOUT', '知乎搜索超时，请稍后再试。', 504);
  if (payload?.ok === false || (payload?.Code !== undefined && payload.Code !== 0)) return new WorkshopError('ZHIHU_SEARCH_FAILED', '知乎搜索暂时不可用，请稍后再试。', 502);
}

export function parseZhihuCandidates(raw: unknown, query: string, fetchedAt: string): ZhihuCandidate[] {
  const failure = searchFailure(raw); if (failure) throw failure;
  const envelope = raw as { Code?: number; Data?: { Items?: unknown[] } };
  if (envelope?.Code !== 0 || !Array.isArray(envelope.Data?.Items)) throw new WorkshopError('ZHIHU_SEARCH_FAILED', '知乎搜索未返回有效结果，请查看连接或额度状态。', 502);
  const seen = new Set<string>(), candidates: ZhihuCandidate[] = [];
  for (const item of envelope.Data.Items) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    if (typeof row.Title !== 'string' || !row.Title.trim() || row.Title.length > 120 || typeof row.AuthorName !== 'string' || !row.AuthorName.trim() || row.AuthorName.length > 120 || typeof row.ContentText !== 'string' || row.ContentText.trim().length < 80 || row.ContentText.length > 120000 || /\u0000/.test(row.ContentText)) continue;
    let identity: ReturnType<typeof canonicalZhihuSource>;
    try { identity = canonicalZhihuSource(row.Url); } catch { continue; }
    if (seen.has(identity.sourceUrl)) continue;
    seen.add(identity.sourceUrl);
    const avatar = zhihuImage(row.AuthorAvatar);
    const candidate = withSourceHash({ id: '', title: row.Title, author: row.AuthorName, excerpt: row.ContentText,
      origin: { ...identity, fetchedAt, contentScope: 'search-excerpt', ...(avatar ? { authorAvatar: avatar } : {}) }, query, characters: row.ContentText.length });
    candidate.id = candidate.sourceHash!.slice(0, 32);
    candidates.push(candidate);
  }
  return candidates;
}

async function searchCli(query: string): Promise<unknown> {
  const binary = process.env.ZHIHU_CLI_BIN || join(process.env.LOCALAPPDATA || '', 'ZhihuCLI', 'current', 'zhihu-cli.exe');
  return new Promise((yes, no) => {
    const child = spawn(binary, ['search', 'zhihu', '--query', query, '--count', '5', '--timeout', '35s'], { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];
    let bytes = 0, finished = false;
    const finish = (error?: Error, value?: unknown) => { if (finished) return; finished = true; clearTimeout(timer); error ? no(error) : yes(value); };
    const timer = setTimeout(() => { child.kill(); finish(new WorkshopError('ZHIHU_SEARCH_TIMEOUT', '知乎搜索超时；没有重复发送请求。', 504)); }, 45_000);
    child.stdout.on('data', (data: Buffer) => { bytes += data.length; if (bytes > 2 * 1024 * 1024) { child.kill(); finish(new WorkshopError('ZHIHU_SEARCH_TOO_LARGE', '搜索响应超过读取上限。', 502)); } else chunks.push(data); });
    child.stderr.resume();
    child.once('error', () => finish(new WorkshopError('ZHIHU_CLI_UNAVAILABLE', '知乎官方 CLI 未能启动，请检查本机安装状态。', 503)));
    child.once('close', code => {
      if (finished) return;
      let raw: unknown;
      try { raw = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { return finish(new WorkshopError(code === 0 ? 'ZHIHU_SEARCH_INVALID' : 'ZHIHU_SEARCH_FAILED', '知乎搜索返回异常，请稍后再试。', 502)); }
      // CLI authentication and quota failures also use JSON on stdout. Read
      // their codes before the exit status, and never expose upstream messages.
      const failure = searchFailure(raw);
      if (failure) return finish(failure);
      if (code !== 0) return finish(new WorkshopError('ZHIHU_SEARCH_FAILED', '知乎搜索暂时不可用，请稍后再试。', 502));
      finish(undefined, raw);
    });
  });
}

export class ZhihuDiscoveryService {
  readonly root: string;
  private readonly active = new Map<string, Promise<ZhihuDiscoveryResult>>();
  constructor(root = resolve('.local/zhihu-discovery'), private readonly searcher = searchCli) { this.root = resolve(root); }
  /** Keep captured/private selections and search history inside one account. */
  scoped(root: string) { return new ZhihuDiscoveryService(root, this.searcher); }
  async list(): Promise<ZhihuDiscoveryResult> {
    await mkdir(join(this.root, 'candidates'), { recursive: true });
    const files = (await readdir(join(this.root, 'candidates'))).filter(name => /^[a-f0-9]{32}\.json$/.test(name));
    const candidates = await Promise.all(files.map(file => jsonFile<ZhihuCandidate>(join(this.root, 'candidates', file))));
    const seen = new Set<string>();
    return { candidates: candidates.sort((a, b) => b.origin.fetchedAt.localeCompare(a.origin.fetchedAt)).filter(candidate => {
      if (seen.has(candidate.origin.sourceUrl)) return false; seen.add(candidate.origin.sourceUrl); return true;
    }).map(withSourceHash), cached: true };
  }
  async search(query: unknown): Promise<ZhihuDiscoveryResult> {
    if (typeof query !== 'string' || query.trim().length < 2 || query.length > 120 || /[\r\n\u0000]/.test(query)) throw new WorkshopError('INVALID_SEARCH', '搜索词应为2–120字。');
    const key = createHash('sha256').update(query.trim()).digest('hex');
    const running = this.active.get(key); if (running) return running;
    const task = this.performSearch(query.trim(), key); this.active.set(key, task);
    try { return await task; } finally { this.active.delete(key); }
  }
  private async performSearch(query: string, key: string): Promise<ZhihuDiscoveryResult> {
    const cached = await jsonFile<ZhihuDiscoveryResult>(join(this.root, `${key}.json`)).catch(() => null);
    if (cached?.fetchedAt && Date.now() - Date.parse(cached.fetchedAt) < 24 * 60 * 60_000) return { ...cached, candidates: cached.candidates.map(withSourceHash), cached: true };
    const raw = await this.searcher(query), fetchedAt = new Date().toISOString();
    const candidates = parseZhihuCandidates(raw, query, fetchedAt);
    await mkdir(join(this.root, 'candidates'), { recursive: true });
    await writeJson(join(this.root, `${key}.response.json`), { fetchedAt, query, raw });
    for (const candidate of candidates) await writeJson(join(this.root, 'candidates', `${candidate.id}.json`), candidate);
    const result = { candidates, query, fetchedAt, cached: false };
    await writeJson(join(this.root, `${key}.json`), result); return result;
  }
  async source(id: unknown): Promise<ImportedSource> {
    if (typeof id !== 'string' || !/^[a-f0-9]{32}$/.test(id)) throw new WorkshopError('INVALID_CANDIDATE', '请选择已取得的知乎故事。');
    const candidate = await jsonFile<ZhihuCandidate>(join(this.root, 'candidates', `${id}.json`)).catch(() => null);
    if (!candidate) throw new WorkshopError('CANDIDATE_NOT_FOUND', '这份知乎搜索记录尚未保存，请重新搜索。', 404);
    const origin = canonicalZhihuSource(candidate.origin.sourceUrl);
    const source = candidateSource(candidate), sourceHash = hashSource(source);
    const legacyId = !candidate.sourceHash && createHash('sha256').update(origin.sourceUrl).digest('hex').slice(0, 32) === id;
    if ((!legacyId && (candidate.sourceHash !== sourceHash || sourceHash.slice(0, 32) !== id)) || candidate.origin.workId !== origin.workId || candidate.origin.kind !== origin.kind || !['search-excerpt', 'webpage-selection', 'question-answer-excerpt'].includes(candidate.origin.contentScope ?? '')) throw new WorkshopError('CANDIDATE_INVALID', '本地来源记录校验失败。', 503);
    return source;
  }

  /** Resolve a canonical public Zhihu answer/article URL through the official search result,
   * preserving the exact URL and returned excerpt. The page itself may require a browser login,
   * so this keeps the public API as the source of truth instead of scraping HTML. */
  async resolveUrl(value: unknown): Promise<ZhihuCandidate> {
    let identity: ReturnType<typeof canonicalZhihuSource>;
    try { identity = canonicalZhihuSource(value); } catch { throw new WorkshopError('INVALID_ZHIHU_URL', '请填写知乎回答或文章的完整 HTTPS 链接。'); }
    const files = await readdir(join(this.root, 'candidates')).catch(() => [] as string[]);
    for (const file of files.filter(name => /^[a-f0-9]{32}\.json$/.test(name))) {
      const candidate = await jsonFile<ZhihuCandidate>(join(this.root, 'candidates', file)).catch(() => null);
      if (candidate && candidate.origin.sourceUrl === identity.sourceUrl) return withSourceHash(candidate);
    }
    const raw = await this.searcher(identity.workId);
    const [candidate] = parseZhihuCandidates(raw, identity.workId, new Date().toISOString()).filter(row => row.origin.sourceUrl === identity.sourceUrl);
    if (!candidate) throw new WorkshopError('ZHIHU_URL_NOT_FOUND', '知乎官方搜索没有返回这条链接的可读节选，请先用题材搜索或确认链接公开可读。', 404);
    await mkdir(join(this.root, 'candidates'), { recursive: true });
    await writeJson(join(this.root, 'candidates', `${candidate.id}.json`), candidate);
    return candidate;
  }

  /** Only the official question service calls this; clients cannot choose provenance. */
  async captureOfficialQuestionAnswer(data: { sourceUrl: string; title: string; text: string; fetchedAt: string }): Promise<ZhihuCandidate> {
    const identity = canonicalZhihuSource(data.sourceUrl);
    if (identity.kind !== 'zhihu-answer' || !data.title.trim() || data.title.length > 120 || !data.text.trim() || data.text.length > 120000 || data.text.includes('\u0000') || !Number.isFinite(Date.parse(data.fetchedAt))) throw new WorkshopError('INVALID_QUESTION_ANSWER', '知乎回答内容不完整。', 502);
    const candidate = withSourceHash({ id: '', title: data.title, author: '知乎回答（接口未提供作者）', excerpt: data.text,
      origin: { ...identity, contentScope: 'question-answer-excerpt', fetchedAt: data.fetchedAt }, query: '', characters: data.text.length });
    candidate.id = candidate.sourceHash!.slice(0, 32);
    await mkdir(join(this.root, 'candidates'), { recursive: true });
    await writeJson(join(this.root, 'candidates', `${candidate.id}.json`), candidate);
    return candidate;
  }

  async capturePage(value: unknown, observed: { visibleScope?: 'excerpt' | 'expanded' } = {}): Promise<ZhihuCandidate> {
    const data = value as Record<string, unknown> | null;
    let identity: ReturnType<typeof canonicalZhihuSource>;
    try { identity = canonicalZhihuSource(data?.sourceUrl); } catch { throw new WorkshopError('INVALID_ZHIHU_URL', '页面选择只支持知乎回答和文章链接。'); }
    const minimumTextLength = observed.visibleScope ? 1 : 80;
    if (!data || typeof data.title !== 'string' || !data.title.trim() || data.title.length > 120 || typeof data.author !== 'string' || !data.author.trim() || data.author.length > 120 || typeof data.text !== 'string' || data.text.trim().length < minimumTextLength || data.text.length > 120000 || data.text.includes('\u0000')) throw new WorkshopError('INVALID_PAGE_SELECTION', '网页选文需要标题、作者和80–120000字正文；请先展开原页面正文再选择。');
    const candidate = withSourceHash({ id: '', title: data.title, author: data.author, excerpt: data.text,
      origin: { ...identity, contentScope: 'webpage-selection', ...(observed.visibleScope === 'excerpt' || observed.visibleScope === 'expanded' ? { webpageScope: observed.visibleScope } : {}), fetchedAt: new Date().toISOString() }, query: '', characters: data.text.length });
    candidate.id = candidate.sourceHash!.slice(0, 32);
    await mkdir(join(this.root, 'candidates'), { recursive: true });
    await writeJson(join(this.root, 'candidates', `${candidate.id}.json`), candidate);
    return candidate;
  }
}
