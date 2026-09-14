import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { LIUKAN_ABILITIES, type LiukanAbilityRequest, type LiukanAbilityResult, type LiukanAbilityItem } from '../../shared/liukan-capabilities.ts';
import { LiukanError, parseZhidaResponse } from './zhida.ts';

const object = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const scalar = (value: unknown, max = 4000): string => typeof value === 'string' ? value.slice(0, max) : typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : '';
const safeUrl = (value: unknown): string | undefined => { try { const url = new URL(scalar(value, 2000)); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined; } catch { return undefined; } };
export function capabilityArguments(input: unknown): { request: LiukanAbilityRequest; args: string[] } {
  const body = object(input), definition = LIUKAN_ABILITIES.find(row => row.id === body.ability);
  if (!definition || Object.keys(body).some(key => !['ability', 'query', 'limit', 'offset', 'cursor', 'baseId', 'collectionId', 'scope', 'confirmPrivateAccess', 'requestId'].includes(key))) throw new LiukanError('INVALID_ABILITY', '请选择看山已有的能力按钮。');
  if (definition.private && body.confirmPrivateAccess !== true) throw new LiukanError('ACCOUNT_ACCESS_REQUIRED', '点击确认后，读取本机已配置知乎账号的这一页资料。', 400);
  if (body.query !== undefined && (typeof body.query !== 'string' || !body.query.trim() || body.query.length > 1000 || /\u0000/.test(body.query))) throw new LiukanError('INVALID_QUERY', '请输入 1–1000 字的问题。');
  if (['query', 'knowledge'].includes(definition.input) && !body.query) throw new LiukanError('INVALID_QUERY', '先写下想找的内容。');
  if (body.requestId !== undefined && (typeof body.requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(body.requestId))) throw new LiukanError('INVALID_REQUEST_ID', '这次查询标识有误。');
  const limit = body.limit ?? 5, offset = body.offset ?? 0;
  const max = ['search-zhihu', 'knowledge-search'].includes(definition.id) ? 30 : definition.id === 'hot' ? 50 : 20;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > max || !Number.isSafeInteger(offset) || offset < 0 || offset > 100000) throw new LiukanError('INVALID_PAGE', `每次请选择 1–${max} 条内容。`);
  for (const field of ['baseId', 'collectionId']) if (body[field] !== undefined && (typeof body[field] !== 'string' || !/^\d{1,24}$/.test(body[field]))) throw new LiukanError('INVALID_RESOURCE_ID', '请使用列表返回的完整编号。');
  if (body.cursor !== undefined && (typeof body.cursor !== 'string' || body.cursor.length > 1500 || /[\u0000\r\n]/.test(body.cursor))) throw new LiukanError('INVALID_CURSOR', '翻页位置有误。');
  if (body.scope !== undefined && !['personal', 'subscription', 'public'].includes(body.scope)) throw new LiukanError('INVALID_SCOPE', '知识库范围有误。');
  const page = ['--offset', String(offset), '--limit', String(limit)]; let args: string[];
  switch (definition.id) {
    case 'search-zhihu': args = ['search', 'zhihu', '--query', body.query, '--count', String(limit), ...page]; break;
    case 'search-global': args = ['search', 'global', '--query', body.query, '--count', String(limit), ...page]; break;
    case 'hot': args = ['hot', '--limit', String(limit), ...page]; break;
    case 'answer': args = ['answer', '--query', body.query, '--model', 'zhida-fast-1p5', '--output', 'json']; break;
    case 'my-contents': args = ['me', 'contents', '--type', 'all', ...page]; break;
    case 'my-followees': args = ['me', 'followees', ...page]; break;
    case 'favorites-recent': args = ['me', 'favorites', 'recent', '--limit', String(limit)]; break;
    case 'favorites-lists': args = ['me', 'favorites', 'lists', '--limit', String(limit)]; break;
    case 'favorites-items': if (!body.collectionId) throw new LiukanError('INVALID_RESOURCE_ID', '先选一个收藏夹。'); args = ['me', 'favorites', 'items', '--url-token', body.collectionId, ...page]; break;
    case 'knowledge-bases': args = ['knowledge', 'bases', '--scope', 'all']; break;
    case 'knowledge-items': if (!body.baseId) throw new LiukanError('INVALID_RESOURCE_ID', '先选一个知识库。'); args = ['knowledge', 'items', '--base-id', body.baseId, '--limit', String(limit), ...(body.cursor ? ['--cursor', body.cursor] : [])]; break;
    case 'knowledge-search': args = ['knowledge', 'search', '--query', body.query, '--limit', String(limit), ...(body.baseId ? ['--base-id', body.baseId] : ['--scope', body.scope ?? 'personal'])]; break;
    case 'quota': args = ['quota']; break;
  }
  return { request: { ...body, limit } as LiukanAbilityRequest, args: [...args, '--timeout', definition.id === 'answer' ? '55s' : '15s'] };
}

export async function runLiukanCli(args: string[]): Promise<unknown> {
  const binary = process.env.ZHIHU_CLI_BIN || join(process.env.LOCALAPPDATA || '', 'ZhihuCLI', 'current', 'zhihu-cli.exe');
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks: Buffer[] = []; let bytes = 0, done = false;
    const finish = (error?: Error, value?: unknown) => { if (done) return; done = true; clearTimeout(timer); error ? reject(error) : resolve(value); };
    const timer = setTimeout(() => { child.kill(); finish(new LiukanError('ABILITY_TIMEOUT', '知乎查询等候超时，这次没有自动重发。', 504)); }, args[0] === 'answer' ? 60_000 : 20_000);
    child.stdout.on('data', (data: Buffer) => { bytes += data.byteLength; if (bytes > 2 * 1024 * 1024) { child.kill(); finish(new LiukanError('ABILITY_OVERSIZED', '知乎返回内容超过本次读取上限。', 502)); } else chunks.push(data); });
    child.stderr.resume();
    child.once('error', () => finish(new LiukanError('ABILITY_UNAVAILABLE', '本机知乎 CLI 暂时没有启动成功。', 503)));
    child.once('close', code => {
      if (done) return;
      if (code !== 0) return finish(new LiukanError('ABILITY_REQUEST_FAILED', '知乎查询失败，请检查本机认证、额度或稍后再点一次。', 502));
      try { finish(undefined, JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { finish(new LiukanError('ABILITY_INVALID_RESPONSE', '知乎查询返回格式不完整。', 502)); }
    });
  });
}

export function normalizeCapabilityResult(request: LiukanAbilityRequest, raw: unknown): LiukanAbilityResult {
  const root = object(raw);
  if (root.Code !== undefined && root.Code !== 0) throw new LiukanError('ABILITY_UPSTREAM_ERROR', `知乎返回业务错误 ${typeof root.Code === 'number' ? root.Code : 'unknown'}，本次查询已停止。`, root.Code === 30001 ? 429 : 502);
  const definition = LIUKAN_ABILITIES.find(item => item.id === request.ability)!;
  if (request.ability === 'answer') return { ability: request.ability, source: 'zhihu-cli', fetchedAt: new Date().toISOString(), scope: 'generated-answer', items: [{ title: '知乎直答', text: parseZhidaResponse(raw, 'zhida-fast-1p5').answer }], note: '知乎直答整理的回答，原始出处请继续使用搜索查看。' };
  if (root.Code !== 0 || root.Data === undefined) throw new LiukanError('ABILITY_INVALID_RESPONSE', '知乎查询没有返回完整数据。', 502);
  const data = object(root.Data);
  const rows = Array.isArray(root.Data) ? root.Data : Array.isArray(data.Items) ? data.Items : Array.isArray(data.Results) ? data.Results : [];
  const items: LiukanAbilityItem[] = rows.slice(0, request.ability === 'knowledge-bases' ? 50 : request.ability === 'quota' ? 7 : request.limit ?? 5).map((value: unknown) => {
    const row = object(value), content = Array.isArray(row.Content) ? row.Content.filter((part: unknown) => typeof part === 'string').join('\n\n') : row.ContentText ?? row.Summary ?? row.Description ?? row.Headline ?? row.Abstract ?? row.Content;
    const title = scalar(row.Title ?? row.Name ?? row.Fullname ?? row.Nickname ?? row.APIName, 300) || '未提供标题';
    const item: LiukanAbilityItem = { title, text: scalar(content, 10000) };
    const id = scalar(row.KnowledgeBaseID ?? row.UrlToken ?? row.URLToken ?? row.RecallContentID ?? row.ContentID ?? row.ID, 120);
    if (id) item.id = id;
    const url = safeUrl(row.Url ?? row.URL ?? row.OriginUrl ?? row.ProfileUrl);
    if (url) item.url = url;
    const author = scalar(row.AuthorName ?? object(row.Author).Name, 200); if (author) item.author = author;
    if (request.ability === 'knowledge-bases') item.kind = 'knowledge-base';
    if (request.ability === 'favorites-lists') item.kind = 'collection';
    if (request.ability === 'quota') item.text = `今日剩余 ${scalar(row.RemainingQuota)} / ${scalar(row.TotalQuota)}，已用 ${scalar(row.TotalUsed)}`;
    return item;
  });
  const result: LiukanAbilityResult = { ability: request.ability, source: 'zhihu-cli', fetchedAt: new Date().toISOString(), items,
    scope: request.ability === 'quota' ? 'quota' : request.ability === 'hot' ? 'current-hot-list' : request.ability.startsWith('knowledge-') ? 'knowledge-excerpt' : definition.private ? 'configured-account' : 'public-search-excerpt',
    note: request.ability === 'quota' ? '当前自然日额度，点击时查询。' : definition.private ? '来自本机已配置的知乎账号；标题和摘要按接口原样展示，本次结果没有写入看山阅读记忆。' : request.ability === 'hot' ? '当前热榜话题，不代表已核实的事实。' : '搜索返回的摘要与原始链接，摘要不等于完整原文。' };
  // Upstream CLI versions have emitted both PascalCase and camelCase paging keys.
  // Normalize them here so an infinite-scroll client can keep asking for the next page.
  const paging = object(data.Paging ?? data.paging);
  const read = (...keys: string[]) => keys.map(key => paging[key]).find(value => value !== undefined);
  const rawOffset = read('NextOffset', 'nextOffset', 'Next', 'next') ?? data.NextOffset ?? data.nextOffset;
  const nextOffset = typeof rawOffset === 'string' && /^\d{1,6}$/.test(rawOffset) ? Number(rawOffset) : rawOffset;
  const isEnd = read('IsEnd', 'isEnd', 'HasMore', 'hasMore');
  if ((isEnd === false || isEnd === 0 || (isEnd === undefined && items.length === (request.limit ?? 5))) && Number.isSafeInteger(nextOffset ?? (isEnd === undefined ? (request.offset ?? 0) + items.length : undefined))) {
    const candidate = Number.isSafeInteger(nextOffset) ? nextOffset : (request.offset ?? 0) + items.length;
    if (candidate >= 0 && candidate <= 100000 && candidate > (request.offset ?? 0)) result.nextOffset = candidate;
  }
  const hasMore = data.HasMore ?? data.hasMore ?? read('HasMore', 'hasMore');
  const cursor = data.NextCursor ?? data.nextCursor ?? read('NextCursor', 'nextCursor');
  if ((hasMore === true || (hasMore === undefined && cursor)) && typeof cursor === 'string' && cursor.length < 1500) result.nextCursor = cursor;
  return result;
}

export class LiukanCapabilitiesService {
  private active = new Map<string, { hash: string; task: Promise<LiukanAbilityResult> }>();
  constructor(private readonly runner = runLiukanCli) {}
  async run(input: unknown): Promise<LiukanAbilityResult> {
    const { request, args } = capabilityArguments(input);
    const hash = createHash('sha256').update(JSON.stringify(args)).digest('hex'), key = request.requestId ?? hash;
    const existing = this.active.get(key);
    if (existing) { if (existing.hash !== hash) throw new LiukanError('REQUEST_CHANGED', '同一次查询的内容已改变，请重新点击。', 409); return existing.task; }
    if (this.active.size >= 2) throw new LiukanError('ABILITY_BUSY', '看山正在查前两份资料，请等它们返回。', 429);
    const task = this.runner(args).then(raw => normalizeCapabilityResult(request, raw));
    this.active.set(key, { hash, task });
    try { return await task; } finally { this.active.delete(key); }
  }
}
