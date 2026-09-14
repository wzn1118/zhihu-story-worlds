import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import express, { type Request, type RequestHandler, type Response } from 'express';
import { createZhihuOAuthSessionStore, type ZhihuOAuthSessionStoreOptions } from './zhihu-oauth-session-store.ts';
import { canonicalZhihuSource } from '../shared/zhihu-discovery.ts';
import type { ImportedSource } from '../shared/workshop.ts';
import type { ZhihuFavoriteItem, ZhihuFavoriteItemsResult, ZhihuFavoriteList, ZhihuFavoriteListsResult } from '../shared/zhihu-favorites.ts';

const COOKIE = 'zhihu_oauth_session';
const STATE_TTL = 10 * 60_000;
const TOKEN_TTL_CAP = 60 * 60_000;
const MAX_SESSIONS = 2_048;
const MAX_FAVORITE_ITEMS = 100;
const MAX_FAVORITE_CHARACTERS = 250_000;
type CookieRequest = { headers: { cookie?: string } };
type JsonObject = Record<string, unknown>;
export type ZhihuOAuthUser = { id: string; email: ''; name: string; createdAt: string; provider: 'zhihu'; avatarUrl?: string };
export type ZhihuOAuthError = { code: string; message: string };
export type ZhihuOAuthConfig = { enabled: boolean; appId: string; appKey: string; redirectUri: string; accessSecret: string };
type OAuthEvent = { event: 'started' | 'callback_received' | 'state_verified' | 'token_received' | 'login_succeeded' | 'login_failed'; code?: string };
export type ZhihuOAuthOptions = { config?: Partial<ZhihuOAuthConfig>; fetch?: typeof globalThis.fetch; now?: () => number; report?: (event: OAuthEvent) => void; sessionStore?: ZhihuOAuthSessionStoreOptions | null };
type Profile = { name: string | null; avatarUrl: string | null };
type CachedFavorite = { item: ZhihuFavoriteItem; fetchedAt: string };
type Session = {
  id: string; state: string | null; pendingUntil: number; retainUntil: number;
  token: string | null; expiresAt: number | null; stateVerified: boolean;
  profile: Profile | null; user: ZhihuOAuthUser | null; error: ZhihuOAuthError | null;
  favorites: Map<string, CachedFavorite>; favoriteLists: Set<string>; favoriteCharacters: number;
};

export const zhihuUserInterfaces = [
  { id: 'contents', name: '我的创作', endpoint: '/api/v1/user/contents' },
  { id: 'followees', name: '我的关注', endpoint: '/api/v1/user/followees' },
  { id: 'favlists', name: '收藏夹', endpoint: '/api/v1/user/favlists' },
  { id: 'favlist_contents', name: '收藏内容', endpoint: '/api/v1/user/favlist_contents' },
  { id: 'collections', name: '近期收藏', endpoint: '/api/v1/user/collections' },
] as const;

const errors = {
  NOT_CONFIGURED: '知乎登录尚未配置完整，请联系管理员配置公网回调与后端凭证。',
  USER_DATA_NOT_CONFIGURED: '当前未开通知乎创作、关注和收藏读取，账号登录不受影响。',
  STATE_MISSING: '知乎授权回调缺少安全校验参数，请重新发起登录。',
  STATE_INVALID: '授权请求已失效或校验失败，请重新发起知乎登录。',
  CODE_MISSING: '未收到知乎授权码，请重新发起登录。',
  TOKEN_EXCHANGE_FAILED: '暂时无法完成知乎授权，请稍后重新登录。',
  TOKEN_EXPIRED: '知乎授权已过期，请重新登录。',
  AUTH_FAILED: '知乎授权已失效，请重新登录。',
  LOGIN_REQUIRED: '请先完成知乎账号授权。',
  IDENTITY_UNAVAILABLE: '知乎授权已完成，但平台未返回可验证的账号标识，暂时无法登录工作台。',
  REQUEST_FAILED: '知乎接口暂时不可用，请稍后重试。',
  INVALID_RESPONSE: '知乎接口返回的数据格式无法验证。',
  OAUTH_BUSY: '登录请求较多，请稍后重试。',
  CROSS_ORIGIN: '请从本站发起请求。',
  RATE_LIMITED: '知乎收藏读取已达到频率或配额限制，请稍后重试。',
  INVALID_FAVORITES_QUERY: '收藏查询参数无效，请刷新后重试。',
  FAVORITE_LIST_NOT_FOUND: '请先从当前账号的收藏夹列表选择收藏夹。',
  FAVORITE_NOT_FOUND: '此收藏选择已失效，请重新读取当前账号的收藏。',
  FAVORITE_NOT_IMPORTABLE: '这条收藏暂不能直接生成，请查看原因并补充故事正文。',
  ACCOUNT_CHANGED: '登录账号已变化，请刷新页面后继续。',
} as const;
type ErrorCode = keyof typeof errors;
export class OAuthFailure extends Error {
  constructor(readonly code: ErrorCode, readonly status = 502) { super(errors[code]); }
}
function failure(code: ErrorCode): ZhihuOAuthError { return { code, message: errors[code] }; }
function object(value: unknown): JsonObject | null { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null; }
function layers(payload: JsonObject) { return [payload, object(payload.data), object(payload.Data)].filter((value): value is JsonObject => Boolean(value)); }
function businessCode(payload: JsonObject) { return payload.Code ?? payload.code; }
function successful(payload: JsonObject) { const code = businessCode(payload); return code === undefined || code === 0 || code === '0' || code === 20000 || code === '20000'; }
function authenticationFailure(payload: JsonObject) { return [20001, '20001', 401, '401', 403, '403'].includes(businessCode(payload) as string | number); }
function parseJsonLosslessly(raw: string): unknown {
  // Tokenize quoted strings as complete units so digit sequences inside user text are
  // untouched. Preserve long integer tokens before JSON.parse can round int64 identifiers.
  const normalized = raw.replace(/"(?:\\[\s\S]|[^"\\])*"|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/g,
    value => /^-?[0-9]{16,}$/.test(value) ? JSON.stringify(value) : value);
  return JSON.parse(normalized);
}
function int64Id(value: unknown): string | null {
  const text = typeof value === 'string' ? value : typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : '';
  return /^[1-9][0-9]{0,18}$/.test(text) && BigInt(text) <= 9_223_372_036_854_775_807n ? text : null;
}
function safeText(value: unknown, limit: number): string | null { return typeof value === 'string' && value.trim() && value.length <= limit && !/[\u0000-\u001f\u007f]/.test(value) ? value.trim() : null; }
function safeUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; }
}
function publicCallback(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.pathname === '/auth/callback' && !url.username && !url.password && !url.search && !url.hash &&
      url.hostname.includes('.') && !isIP(url.hostname) && !/(^|\.)(localhost|local|internal)$/.test(url.hostname);
  } catch { return false; }
}
function cookieId(request: CookieRequest): string | null {
  const cookie = request.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(`${COOKIE}=`));
  const value = cookie?.slice(COOKIE.length + 1);
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}
function equal(left: string, right: string) { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b); }
function queryString(request: Request, name: string): string | null { return typeof request.query[name] === 'string' ? request.query[name] as string : null; }

export function createZhihuOAuth(options: ZhihuOAuthOptions = {}) {
  const config: ZhihuOAuthConfig = {
    enabled: process.env.PUBLIC_MODE === '1' || Boolean(process.env.ZHIHU_OAUTH_APP_ID),
    appId: process.env.ZHIHU_OAUTH_APP_ID ?? '', appKey: process.env.ZHIHU_OAUTH_APP_KEY ?? '',
    redirectUri: process.env.ZHIHU_OAUTH_REDIRECT_URI ?? '', accessSecret: process.env.ZHIHU_ACCESS_SECRET ?? '',
    ...options.config,
  };
  const fetcher = options.fetch ?? globalThis.fetch;
  const now = options.now ?? Date.now;
  // Only fixed stage names and our own error codes enter operational logs.
  // Never log the callback URL, query, cookies, tokens, or upstream response.
  const report = options.report ?? ((event: OAuthEvent) => console.info(JSON.stringify({ service: 'zhihu_oauth', ...event })));
  const storeOptions = options.sessionStore === undefined && process.env.ZHIHU_OAUTH_SESSION_STORE
    ? { path: process.env.ZHIHU_OAUTH_SESSION_STORE, secret: process.env.SESSION_SECRET ?? '' } : options.sessionStore;
  const sessionStore = storeOptions ? createZhihuOAuthSessionStore(storeOptions) : null;
  const sessions = new Map<string, Session>();
  for (const value of sessionStore?.load() ?? []) {
    const session = object(value);
    if (!session || typeof session.id !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(session.id) ||
      typeof session.retainUntil !== 'number' || !Number.isFinite(session.retainUntil) || typeof session.pendingUntil !== 'number' ||
      (session.state !== null && (typeof session.state !== 'string' || !/^[A-Za-z0-9_-]{32}$/.test(session.state))) ||
      (session.token !== null && !safeText(session.token, 16_384)) || (session.expiresAt !== null && (typeof session.expiresAt !== 'number' || !Number.isFinite(session.expiresAt))) ||
      typeof session.stateVerified !== 'boolean' || (session.user !== null && (!object(session.user) || !/^zhihu:[a-f0-9]{64}$/.test(String(object(session.user)!.id))))) {
      throw new Error('OAuth session store contains an invalid session.');
    }
    if (session.retainUntil > now()) sessions.set(session.id, { ...(value as Session), favorites: new Map(), favoriteLists: new Set(), favoriteCharacters: 0 });
  }
  if (sessions.size > MAX_SESSIONS) throw new Error('OAuth session store exceeds its session limit.');
  const configured = config.enabled && publicCallback(config.redirectUri) &&
    [config.appId, config.appKey].every(value => Boolean(safeText(value, 16_384)));
  const userDataConfigured = configured && Boolean(safeText(config.accessSecret, 16_384));
  const cookieOptions = { httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/' };

  function persist() {
    sessionStore?.save([...sessions.values()].map(({ id, state, pendingUntil, retainUntil, token, expiresAt, stateVerified, profile, user, error }) =>
      ({ id, state, pendingUntil, retainUntil, token, expiresAt, stateVerified, profile, user, error })));
  }
  function clean() { let changed = false; for (const [id, session] of sessions) if (session.retainUntil <= now()) { sessions.delete(id); changed = true; } if (changed) persist(); }
  function invalidate(session: Session, code: ErrorCode) {
    session.token = null; session.expiresAt = null; session.profile = null; session.user = null;
    session.state = null; session.stateVerified = false; session.error = failure(code); session.retainUntil = now() + STATE_TTL;
    persist();
    session.favorites.clear(); session.favoriteLists.clear(); session.favoriteCharacters = 0;
  }
  function getSession(request: CookieRequest) {
    const id = cookieId(request);
    const session = id ? sessions.get(id) : undefined;
    if (!session) return null;
    if (session.token && session.expiresAt !== null && session.expiresAt <= now()) invalidate(session, 'TOKEN_EXPIRED');
    if (session.retainUntil <= now()) { sessions.delete(session.id); persist(); return null; }
    return session;
  }
  function newSession(response: Response): Session {
    clean();
    if (sessions.size >= MAX_SESSIONS) throw new OAuthFailure('OAUTH_BUSY', 503);
    const session: Session = { id: randomBytes(32).toString('base64url'), state: null, pendingUntil: 0,
      retainUntil: now() + STATE_TTL, token: null, expiresAt: null, stateVerified: false, profile: null, user: null, error: null,
      favorites: new Map(), favoriteLists: new Set(), favoriteCharacters: 0 };
    sessions.set(session.id, session);
    response.cookie(COOKIE, session.id, { ...cookieOptions, maxAge: TOKEN_TTL_CAP + STATE_TTL });
    return session;
  }
  function status(request: CookieRequest) {
    const session = getSession(request);
    return { enabled: config.enabled, configured, userDataConfigured, authorized: Boolean(session?.token), identityVerified: Boolean(session?.user),
      loginUrl: '/api/oauth/start', localBrowser: false, profile: session?.profile ?? null,
      expiresAt: session?.expiresAt ? new Date(session.expiresAt).toISOString() : null,
      stateVerified: session?.stateVerified ?? false, error: session?.error ?? (!configured ? failure('NOT_CONFIGURED') : null) };
  }
  function currentUser(request: CookieRequest) { const session = getSession(request); return session?.token ? session.user : null; }
  function logout(request: CookieRequest, response: Response) { const id = cookieId(request); if (id && sessions.delete(id)) persist(); response.clearCookie(COOKIE, cookieOptions); }
  function active(session: Session) {
    if (sessions.get(session.id) !== session || !session.token) throw new OAuthFailure('LOGIN_REQUIRED', 401);
    if (!session.expiresAt || session.expiresAt <= now()) { invalidate(session, 'TOKEN_EXPIRED'); throw new OAuthFailure('TOKEN_EXPIRED', 401); }
  }
  async function jsonRequest(url: string, init: RequestInit): Promise<JsonObject> {
    let response: globalThis.Response;
    let payload: JsonObject | null;
    try {
      response = await fetcher(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(12_000) });
      if (response.status === 401 || response.status === 403) throw new OAuthFailure('AUTH_FAILED', 401);
      if (response.status === 429) throw new OAuthFailure('RATE_LIMITED', 429);
      if (!response.ok) throw new OAuthFailure('REQUEST_FAILED');
      const raw = await response.text();
      if (raw.length > 1_048_576) throw new OAuthFailure('INVALID_RESPONSE');
      payload = object(parseJsonLosslessly(raw));
    } catch (error) { if (error instanceof OAuthFailure) throw error; throw new OAuthFailure('REQUEST_FAILED'); }
    if (!payload) throw new OAuthFailure('INVALID_RESPONSE');
    if (authenticationFailure(payload)) throw new OAuthFailure('AUTH_FAILED', 401);
    if ([30001, '30001', 30002, '30002'].includes(businessCode(payload) as string | number)) throw new OAuthFailure('RATE_LIMITED', 429);
    if (!successful(payload)) throw new OAuthFailure('REQUEST_FAILED');
    return payload;
  }
  async function userRequest(session: Session, url: string) {
    active(session);
    try {
      const payload = await jsonRequest(url, { method: 'GET', headers: {
        Authorization: `Bearer ${config.accessSecret}`, 'X-OAuth-Token': session.token!,
        'X-Request-Timestamp': String(Math.floor(now() / 1000)), 'Content-Type': 'application/json',
      } });
      active(session);
      return payload;
    } catch (error) { if (error instanceof OAuthFailure && error.code === 'AUTH_FAILED') invalidate(session, 'AUTH_FAILED'); throw error; }
  }
  function favoriteSession(request: CookieRequest, ownerId?: string) {
    if (!configured) throw new OAuthFailure('NOT_CONFIGURED', 503);
    const session = getSession(request);
    if (!session?.token) throw new OAuthFailure(session?.error?.code === 'TOKEN_EXPIRED' ? 'TOKEN_EXPIRED' : 'LOGIN_REQUIRED', 401);
    active(session);
    if (!session.user) throw new OAuthFailure('IDENTITY_UNAVAILABLE', 401);
    if (ownerId && session.user.id !== ownerId) throw new OAuthFailure('ACCOUNT_CHANGED', 409);
    if (!userDataConfigured) throw new OAuthFailure('USER_DATA_NOT_CONFIGURED', 503);
    return session;
  }
  function favoriteLimit(value: unknown): string {
    if (value === undefined) return '20';
    if (typeof value !== 'string' || !/^[1-9][0-9]?$/.test(value) || Number(value) > 50) throw new OAuthFailure('INVALID_FAVORITES_QUERY', 400);
    return value;
  }
  function favoriteOffset(value: unknown): string {
    if (value === undefined) return '0';
    if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,18})$/.test(value) || BigInt(value) > 9_223_372_036_854_775_807n) throw new OAuthFailure('INVALID_FAVORITES_QUERY', 400);
    return value;
  }
  function favoriteData(payload: JsonObject) {
    const data = layers(payload).find(layer => Array.isArray(layer.Items));
    if (!data) throw new OAuthFailure('INVALID_RESPONSE');
    return data as JsonObject & { Items: unknown[] };
  }
  function favoriteUrl(value: unknown): string {
    const safe = safeUrl(value);
    if (!safe) return '';
    const url = new URL(safe);
    return !url.port && ['www.zhihu.com', 'zhuanlan.zhihu.com'].includes(url.hostname) ? safe : '';
  }
  function favoriteText(value: unknown, fallback = '') { return typeof value === 'string' ? value : fallback; }
  function rememberFavorites(session: Session, values: unknown[], limit: number): ZhihuFavoriteItem[] {
    const fetchedAt = new Date(now()).toISOString();
    return values.slice(0, limit).map(value => {
      const raw = object(value);
      if (!raw) throw new OAuthFailure('INVALID_RESPONSE');
      const contentType = favoriteText(raw.ContentType, 'unknown');
      const summary = favoriteText(raw.Summary);
      const originalTitle = favoriteText(raw.Title), originalAuthor = favoriteText(object(raw.Author)?.Name);
      const title = originalTitle.trim() ? originalTitle : '未命名收藏';
      const author = originalAuthor.trim() ? originalAuthor : '作者未提供';
      let url = favoriteUrl(raw.Url), unavailableReason: string | undefined;
      if (!['answer', 'article'].includes(contentType)) unavailableReason = '目前可接入知乎回答和文章；其他类型可打开原文后手动补充文字。';
      try {
        const identity = canonicalZhihuSource(raw.Url);
        if (identity.kind !== `zhihu-${contentType}`) throw new Error('Content type does not match URL');
        url = identity.sourceUrl;
      } catch {
        unavailableReason ??= '未取得可核验的知乎回答或文章链接，暂不能接入。';
      }
      if (title.length > 120 || author.length > 120 || summary.length > 120_000 || /\u0000/.test(title + author + summary)) unavailableReason ??= '收藏摘要或作者标题不符合导入要求，请打开原文后手动补充文字。';
      if (summary.trim().length < 80) unavailableReason ??= '收藏摘要不足 80 字，请打开原文后补充故事正文。';
      // A selection identifies exactly the content the user saw. A later upstream
      // edit must not silently replace the text behind a still-open preview.
      const previous = url ? [...session.favorites.values()].find(saved => saved.item.url === url && saved.item.title === title &&
        saved.item.author === author && saved.item.summary === summary && saved.item.contentType === contentType)?.item : undefined;
      const item: ZhihuFavoriteItem = { id: previous?.id ?? randomBytes(24).toString('base64url'), title, author, summary, url, contentType,
        characters: summary.trim().length, importable: !unavailableReason, ...(unavailableReason ? { unavailableReason } : {}) };
      const old = session.favorites.get(item.id);
      if (old) { session.favoriteCharacters -= old.item.summary.length + old.item.title.length + old.item.author.length; session.favorites.delete(item.id); }
      session.favorites.set(item.id, { item, fetchedAt });
      session.favoriteCharacters += item.summary.length + item.title.length + item.author.length;
      while (session.favorites.size > MAX_FAVORITE_ITEMS || session.favoriteCharacters > MAX_FAVORITE_CHARACTERS) {
        const oldest = session.favorites.entries().next().value;
        if (!oldest) break;
        session.favorites.delete(oldest[0]);
        session.favoriteCharacters -= oldest[1].item.summary.length + oldest[1].item.title.length + oldest[1].item.author.length;
      }
      return item;
    });
  }
  async function favoritesRecent(request: CookieRequest, limit?: unknown, ownerId?: string): Promise<ZhihuFavoriteItemsResult> {
    const session = favoriteSession(request, ownerId), count = favoriteLimit(limit);
    const payload = await userRequest(session, `https://developer.zhihu.com/api/v1/user/collections?${new URLSearchParams({ Limit: count })}`);
    if (favoriteSession(request, ownerId) !== session) throw new OAuthFailure('ACCOUNT_CHANGED', 409);
    return { items: rememberFavorites(session, favoriteData(payload).Items, Number(count)) };
  }
  async function favoritesLists(request: CookieRequest, limit?: unknown, ownerId?: string): Promise<ZhihuFavoriteListsResult> {
    const session = favoriteSession(request, ownerId), count = favoriteLimit(limit);
    const payload = await userRequest(session, `https://developer.zhihu.com/api/v1/user/favlists?${new URLSearchParams({ Limit: count })}`);
    if (favoriteSession(request, ownerId) !== session) throw new OAuthFailure('ACCOUNT_CHANGED', 409);
    const lists: ZhihuFavoriteList[] = favoriteData(payload).Items.slice(0, Number(count)).map(value => {
      const raw = object(value), id = int64Id(raw?.UrlToken);
      if (!raw || !id) throw new OAuthFailure('INVALID_RESPONSE');
      return { id, title: favoriteText(raw.Title).trim() || '未命名收藏夹', description: favoriteText(raw.Description), url: `https://www.zhihu.com/collection/${id}` };
    });
    session.favoriteLists = new Set(lists.map(list => list.id));
    return { lists };
  }
  async function favoritesItems(request: CookieRequest, listId: unknown, offset?: unknown, limit?: unknown, ownerId?: string): Promise<ZhihuFavoriteItemsResult> {
    const session = favoriteSession(request, ownerId), count = favoriteLimit(limit), cursor = favoriteOffset(offset);
    if (typeof listId !== 'string' || !session.favoriteLists.has(listId)) throw new OAuthFailure('FAVORITE_LIST_NOT_FOUND', 404);
    const payload = await userRequest(session, `https://developer.zhihu.com/api/v1/user/favlist_contents?${new URLSearchParams({ FavlistUrlToken: listId, Offset: cursor, Limit: count })}`);
    if (favoriteSession(request, ownerId) !== session) throw new OAuthFailure('ACCOUNT_CHANGED', 409);
    if (!session.favoriteLists.has(listId)) throw new OAuthFailure('FAVORITE_LIST_NOT_FOUND', 404);
    const data = favoriteData(payload), paging = object(data.Paging);
    if (!paging || typeof paging.IsEnd !== 'boolean') throw new OAuthFailure('INVALID_RESPONSE');
    let nextOffset: string | undefined;
    if (!paging.IsEnd) {
      try { if (paging.NextOffset === undefined) throw new Error('Missing cursor'); nextOffset = favoriteOffset(paging.NextOffset); }
      catch { throw new OAuthFailure('INVALID_RESPONSE'); }
      if (nextOffset === cursor) throw new OAuthFailure('INVALID_RESPONSE');
    }
    return { items: rememberFavorites(session, data.Items, Number(count)), ...(nextOffset !== undefined ? { nextOffset } : {}) };
  }
  function favoriteSource(request: CookieRequest, itemId: unknown, ownerId?: string) {
    const session = favoriteSession(request, ownerId);
    const selected = typeof itemId === 'string' ? session.favorites.get(itemId) : undefined;
    if (!selected) throw new OAuthFailure('FAVORITE_NOT_FOUND', 404);
    if (!selected.item.importable) throw new OAuthFailure('FAVORITE_NOT_IMPORTABLE', 400);
    const identity = canonicalZhihuSource(selected.item.url);
    const source: ImportedSource = { title: selected.item.title, author: selected.item.author, text: selected.item.summary, scope: 'zhihu-excerpt',
      origin: { kind: identity.kind, workId: identity.workId, sourceUrl: identity.sourceUrl, originalUrl: identity.sourceUrl, fetchedAt: selected.fetchedAt, contentScope: 'favorite-summary' } };
    const authenticatedOwnerId = session.user!.id;
    return { source, ownerId: authenticatedOwnerId, assertActive: () => {
      if (favoriteSession(request, authenticatedOwnerId) !== session) throw new OAuthFailure('ACCOUNT_CHANGED', 409);
    } };
  }
  async function profileRequest(session: Session) {
    active(session);
    try {
      const payload = await jsonRequest('https://openapi.zhihu.com/user', { method: 'GET', headers: { Authorization: `Bearer ${session.token!}` } });
      active(session);
      return payload;
    } catch (error) { if (error instanceof OAuthFailure && error.code === 'AUTH_FAILED') invalidate(session, 'AUTH_FAILED'); throw error; }
  }
  function readProfile(payload: JsonObject, session: Session) {
    // Official hackathon profile schema: prefer hash_id, otherwise preserve the exact uid.
    // Display names, profile URLs, tokens and random session ids never identify accounts.
    const candidates = layers(payload).flatMap(layer => [object(layer.user), layer]).filter((value): value is JsonObject => Boolean(value));
    const source = candidates.find(value => safeText(value.hash_id, 256) || int64Id(value.uid)) ?? candidates.find(value => safeText(value.fullname, 120));
    if (!source) return;
    const name = safeText(source.fullname, 120);
    const avatarUrl = safeUrl(source.avatar_path);
    session.profile = name || avatarUrl ? { name, avatarUrl } : null;
    const hashId = safeText(source.hash_id, 256), uid = int64Id(source.uid);
    const id = hashId ? `hash_id:${hashId}` : uid ? `uid:${uid}` : null;
    if (id) session.user = { id: `zhihu:${createHash('sha256').update(id).digest('hex')}`, email: '', name: name ?? '知乎用户',
      createdAt: new Date(now()).toISOString(), provider: 'zhihu', ...(avatarUrl ? { avatarUrl } : {}) };
  }
  function sendFailure(response: Response, error: unknown) {
    const safe = error instanceof OAuthFailure ? error : new OAuthFailure('REQUEST_FAILED');
    response.status(safe.status).json({ error: failure(safe.code) });
  }
  const callback: RequestHandler = async (request, response) => {
    response.setHeader('Cache-Control', 'no-store'); response.setHeader('Referrer-Policy', 'no-referrer');
    report({ event: 'callback_received' });
    let session = getSession(request);
    try {
      if (!configured) throw new OAuthFailure('NOT_CONFIGURED', 503);
      const state = queryString(request, 'state');
      if (!state) throw new OAuthFailure('STATE_MISSING', 400);
      if (!session?.state || session.pendingUntil <= now() || !equal(state, session.state)) throw new OAuthFailure('STATE_INVALID', 400);
      session.state = null; // Consume before any await: a duplicate callback cannot exchange twice.
      persist();
      report({ event: 'state_verified' });
      const code = queryString(request, 'authorization_code') || queryString(request, 'code');
      if (!code || !safeText(code, 8_192)) throw new OAuthFailure('CODE_MISSING', 400);
      let tokenPayload: JsonObject;
      try {
        tokenPayload = await jsonRequest('https://openapi.zhihu.com/access_token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ app_id: config.appId, app_key: config.appKey, grant_type: 'authorization_code', redirect_uri: config.redirectUri, code }).toString() });
      } catch { throw new OAuthFailure('TOKEN_EXCHANGE_FAILED'); }
      if (sessions.get(session.id) !== session || session.retainUntil <= now() || session.error) throw new OAuthFailure('STATE_INVALID', 400);
      const tokenSource = layers(tokenPayload).find(layer => safeText(layer.access_token, 16_384));
      const token = safeText(tokenSource?.access_token, 16_384);
      const expires = Number(tokenSource?.expires_in);
      if (!token || !Number.isFinite(expires) || expires <= 0) throw new OAuthFailure('TOKEN_EXCHANGE_FAILED');
      report({ event: 'token_received' });
      session.token = token; session.expiresAt = now() + Math.min(expires * 1000, TOKEN_TTL_CAP);
      session.retainUntil = session.expiresAt + STATE_TTL; session.stateVerified = true;
      try { readProfile(await profileRequest(session), session); }
      catch (error) { if (error instanceof OAuthFailure && ['AUTH_FAILED', 'LOGIN_REQUIRED', 'TOKEN_EXPIRED'].includes(error.code)) throw error; }
      active(session);
      if (!session.user) session.error = failure('IDENTITY_UNAVAILABLE');
      report(session.user ? { event: 'login_succeeded' } : { event: 'login_failed', code: 'IDENTITY_UNAVAILABLE' });
      // Rotate the opaque identifier when the authorization succeeds.
      sessions.delete(session.id); session.id = randomBytes(32).toString('base64url'); sessions.set(session.id, session);
      persist();
      response.cookie(COOKIE, session.id, { ...cookieOptions, maxAge: session.retainUntil - now() });
      response.redirect(303, '/');
    } catch (error) {
      const safe = error instanceof OAuthFailure ? error : new OAuthFailure('TOKEN_EXCHANGE_FAILED');
      report({ event: 'login_failed', code: safe.code });
      if (!session || sessions.get(session.id) !== session) {
        try { session = newSession(response); } catch { return sendFailure(response, safe); }
      }
      invalidate(session, safe.code);
      response.redirect(303, '/');
    }
  };
  const router = express.Router();
  router.use((_request, response, next) => { response.setHeader('Cache-Control', 'no-store'); response.setHeader('Referrer-Policy', 'no-referrer'); next(); });
  router.use((request, response, next) => {
    if (request.method !== 'POST') return next();
    const origin = request.get('origin');
    const expected = publicCallback(config.redirectUri) ? new URL(config.redirectUri).origin : null;
    if (request.get('sec-fetch-site') === 'cross-site' || (origin && origin !== expected)) return sendFailure(response, new OAuthFailure('CROSS_ORIGIN', 403));
    next();
  });
  router.get('/status', (request, response) => { response.json(status(request)); });
  router.get('/start', (request, response) => {
    try {
      if (!configured) throw new OAuthFailure('NOT_CONFIGURED', 503);
      logout(request, response);
      const session = newSession(response);
      // Match the official hackathon generator's 32-character state format.
      // 24 random bytes still provide 192 bits of login request entropy.
      session.state = randomBytes(24).toString('base64url'); session.pendingUntil = now() + STATE_TTL;
      persist();
      const url = new URL('https://openapi.zhihu.com/authorize');
      url.search = new URLSearchParams({ redirect_uri: config.redirectUri, app_id: config.appId, response_type: 'code', state: session.state }).toString();
      report({ event: 'started' });
      response.redirect(302, url.href);
    } catch (error) { sendFailure(response, error); }
  });
  router.post('/logout', (request, response) => { logout(request, response); response.status(204).end(); });
  router.post('/run-all', async (request, response) => {
    const session = getSession(request);
    if (!configured) return sendFailure(response, new OAuthFailure('NOT_CONFIGURED', 503));
    if (!session?.token) return sendFailure(response, new OAuthFailure('LOGIN_REQUIRED', 401));
    if (!userDataConfigured) return sendFailure(response, new OAuthFailure('USER_DATA_NOT_CONFIGURED', 503));
    const results: Array<{ id: string; name: string; status: 'success' | 'empty' | 'error' | 'skipped'; message: string | null }> = [];
    let favlistToken: string | null = null;
    let favlistsSucceeded = false;
    let stopped = false;
    for (const definition of zhihuUserInterfaces) {
      const base = { id: definition.id, name: definition.name };
      if (stopped) { results.push({ ...base, status: 'skipped', message: '授权失效，已停止访问。' }); continue; }
      const query: Record<string, string> = { Limit: '1' };
      if (definition.id === 'contents') Object.assign(query, { ContentType: 'all', Offset: '0', SortField: 'ts', SortOrder: 'desc' });
      if (definition.id === 'followees') query.Offset = '0';
      if (definition.id === 'favlist_contents') {
        if (!favlistToken) { results.push({ ...base, status: favlistsSucceeded ? 'empty' : 'skipped', message: favlistsSucceeded ? '账号没有可用于检查的收藏夹。' : '尚未取得收藏夹标识。' }); continue; }
        Object.assign(query, { FavlistUrlToken: favlistToken, Offset: '0' });
      }
      try {
        const payload = await userRequest(session, `https://developer.zhihu.com${definition.endpoint}?${new URLSearchParams(query)}`);
        const data = layers(payload).find(layer => Array.isArray(layer.Items));
        if (!data) throw new OAuthFailure('INVALID_RESPONSE');
        const items = data.Items as unknown[];
        if (definition.id === 'favlists') {
          const value = object(items[0])?.UrlToken;
          favlistToken = int64Id(value);
          if (items.length && !favlistToken) throw new OAuthFailure('INVALID_RESPONSE');
          favlistsSucceeded = true;
        }
        results.push({ ...base, status: items.length ? 'success' : 'empty', message: items.length ? null : '接口成功，暂无数据。' });
      } catch (error) {
        const safe = error instanceof OAuthFailure ? error : new OAuthFailure('REQUEST_FAILED');
        stopped = !session.token || ['AUTH_FAILED', 'LOGIN_REQUIRED', 'TOKEN_EXPIRED'].includes(safe.code);
        results.push({ ...base, status: 'error', message: safe.message });
      }
    }
    response.json({ results });
  });
  return { router, callback, status, currentUser, logout, favoritesRecent, favoritesLists, favoritesItems, favoriteSource,
    enabled: config.enabled, configured, userDataConfigured };
}

export type ZhihuOAuth = ReturnType<typeof createZhihuOAuth>;

export function isPublicOAuthMode() { return process.env.PUBLIC_MODE === '1'; }
export const zhihuOAuth = createZhihuOAuth();
