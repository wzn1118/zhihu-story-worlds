import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { Router, type ErrorRequestHandler, type Request } from 'express';
import type { ZhihuBrowserAction, ZhihuBrowserCapture, ZhihuBrowserFrame, ZhihuBrowserOpen } from '../shared/zhihu-browser.ts';
import { ZhihuBrowserError, ZhihuBrowserService } from './zhihu-browser.ts';
import type { ZhihuDiscoveryService } from './zhihu-discovery.ts';

type BrowserOperations = Pick<ZhihuBrowserService, 'open' | 'frame' | 'action' | 'capture' | 'captureCandidate' | 'close'>;
interface AccountBrowser {
  service: BrowserOperations;
  lastUsed: number;
  pending: number;
  closing?: Promise<void>;
}
interface AccountBrowserOptions {
  root: string;
  maxActive?: number;
  idleMs?: number;
  now?: () => number;
  createService?: (discovery: ZhihuDiscoveryService, profile: string) => BrowserOperations;
}

function closedFrame(): ZhihuBrowserFrame {
  return { status: 'closed', frameId: '', url: '', title: '', width: 1100, height: 720, posts: [], capturedAt: new Date().toISOString() };
}
export function zhihuBrowserAccountKey(accountId: string): string {
  if (typeof accountId !== 'string' || !accountId.trim() || accountId.length > 1024) throw new ZhihuBrowserError('AUTH_REQUIRED', '请先登录。', 401);
  return createHash('sha256').update(accountId).digest('hex');
}

/** Each authenticated account owns its renderer, queue, cookies and captured posts. */
export class ZhihuBrowserAccounts {
  private readonly accounts = new Map<string, AccountBrowser>();
  private readonly root: string;
  private readonly maxActive: number;
  private readonly idleMs: number;
  private readonly now: () => number;
  private readonly createService: NonNullable<AccountBrowserOptions['createService']>;
  private timer?: ReturnType<typeof setInterval>;
  private disposed = false;

  constructor(options: AccountBrowserOptions) {
    this.root = resolve(options.root);
    this.maxActive = options.maxActive ?? 4;
    this.idleMs = options.idleMs ?? 10 * 60_000;
    if (!Number.isInteger(this.maxActive) || this.maxActive < 1 || this.maxActive > 16 || !Number.isFinite(this.idleMs) || this.idleMs < 1) throw new Error('Invalid account browser limits');
    this.now = options.now ?? Date.now;
    this.createService = options.createService ?? ((discovery, profile) => new ZhihuBrowserService(discovery, profile, { defaultChannel: 'chromium', publicMode: true }));
  }

  private async retire(key: string, browser: AccountBrowser): Promise<void> {
    if (browser.closing) return browser.closing;
    // Keep this slot reserved until Chromium has actually released its profile.
    browser.closing = browser.service.close().then(() => {
      if (this.accounts.get(key) === browser) this.accounts.delete(key);
    }).catch(error => { browser.closing = undefined; throw error; });
    return browser.closing;
  }

  async sweepIdle(): Promise<void> {
    const now = this.now();
    await Promise.allSettled([...this.accounts.entries()]
      .filter(([, browser]) => browser.pending === 0 && now - browser.lastUsed >= this.idleMs)
      .map(([key, browser]) => this.retire(key, browser)));
  }

  private async acquire(key: string, discovery: ZhihuDiscoveryService): Promise<AccountBrowser> {
    if (this.disposed) throw new ZhihuBrowserError('BROWSER_UNAVAILABLE', '知乎窗口正在重启，请稍后重新连接。', 503);
    await this.sweepIdle();
    if (this.disposed) throw new ZhihuBrowserError('BROWSER_UNAVAILABLE', '知乎窗口正在重启，请稍后重新连接。', 503);
    let browser = this.accounts.get(key);
    if (browser?.closing) { await browser.closing; browser = this.accounts.get(key); }
    if (!browser) {
      if (this.accounts.size >= this.maxActive) throw new ZhihuBrowserError('BROWSER_CAPACITY', '知乎窗口当前使用人数较多，请稍后重新连接。', 503);
      browser = { service: this.createService(discovery, join(this.root, key, 'profile')), lastUsed: this.now(), pending: 0 };
      this.accounts.set(key, browser);
      if (!this.timer) {
        this.timer = setInterval(() => void this.sweepIdle(), Math.min(60_000, this.idleMs));
        this.timer.unref();
      }
    }
    return browser;
  }

  private async run<T>(browser: AccountBrowser, operation: (service: BrowserOperations) => Promise<T>): Promise<T> {
    if (browser.closing) throw new ZhihuBrowserError('BROWSER_CLOSED', '这个知乎窗口已经关闭，请重新连接。', 409);
    if (browser.pending >= 16) throw new ZhihuBrowserError('BROWSER_BUSY', '上一批浏览操作正在完成，请稍后继续。', 429);
    browser.pending++;
    browser.lastUsed = this.now();
    try { return await operation(browser.service); }
    finally { browser.pending--; browser.lastUsed = this.now(); }
  }

  async open(accountId: string, discovery: ZhihuDiscoveryService, options: ZhihuBrowserOpen = {}): Promise<ZhihuBrowserFrame> {
    const key = zhihuBrowserAccountKey(accountId);
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw new ZhihuBrowserError('INVALID_BROWSER_OPTIONS', '浏览窗口参数不完整。');
    const browser = await this.acquire(key, discovery);
    try { return await this.run(browser, service => service.open({ ...options, channel: 'chromium' })); }
    catch (error) {
      // Failed launches should not occupy every slot until the idle timer fires.
      if (error instanceof ZhihuBrowserError && error.code === 'BROWSER_START_FAILED' && browser.pending === 0) await this.retire(key, browser).catch(() => undefined);
      throw error;
    }
  }

  async frame(accountId: string): Promise<ZhihuBrowserFrame> {
    const key = zhihuBrowserAccountKey(accountId), browser = this.accounts.get(key);
    if (!browser || browser.closing) return closedFrame();
    const frame = await this.run(browser, service => service.frame());
    // A renderer can close independently of its account session. Release its
    // capacity slot as soon as we observe it, while keeping its saved profile.
    if (frame.status === 'closed' && browser.pending === 0) await this.retire(key, browser);
    return frame;
  }

  private requireBrowser(accountId: string): AccountBrowser {
    const browser = this.accounts.get(zhihuBrowserAccountKey(accountId));
    if (!browser || browser.closing) throw new ZhihuBrowserError('BROWSER_CLOSED', '请先打开你的知乎窗口。', 409);
    return browser;
  }

  action(accountId: string, action: ZhihuBrowserAction): Promise<ZhihuBrowserFrame> {
    return this.run(this.requireBrowser(accountId), service => service.action(action));
  }

  capture(accountId: string, capture: ZhihuBrowserCapture) {
    return this.run(this.requireBrowser(accountId), service => service.capture(capture));
  }

  async captureCandidate(accountId: string, discovery: ZhihuDiscoveryService, candidateId: unknown) {
    const key = zhihuBrowserAccountKey(accountId);
    // A content hash is not an ownership credential. Resolve it in the current
    // account before reserving a renderer or making any upstream page request.
    const source = await discovery.source(candidateId);
    if (source.origin?.contentScope === 'webpage-selection' && source.origin.webpageScope === 'expanded') {
      return discovery.capturePage({ ...source, sourceUrl: source.origin.sourceUrl }, { visibleScope: 'expanded' });
    }
    const browser = await this.acquire(key, discovery);
    try { return await this.run(browser, service => service.captureCandidate(candidateId)); }
    catch (error) {
      if (error instanceof ZhihuBrowserError && error.code === 'BROWSER_START_FAILED' && browser.pending === 0) await this.retire(key, browser).catch(() => undefined);
      throw error;
    }
  }

  async close(accountId: string): Promise<ZhihuBrowserFrame> {
    const key = zhihuBrowserAccountKey(accountId), browser = this.accounts.get(key);
    if (browser) await this.retire(key, browser);
    return closedFrame();
  }

  async closeAll(): Promise<void> {
    this.disposed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await Promise.allSettled([...this.accounts.entries()].map(([key, browser]) => this.retire(key, browser)));
  }
}

/** Identity callbacks must come from the validated server session, never request data. */
export function createZhihuAccountBrowserRouter(accounts: ZhihuBrowserAccounts, accountFor: (request: Request) => string, discoveryFor: (request: Request) => ZhihuDiscoveryService): Router {
  const router = Router();
  router.post('/open', async (request, response) => response.json(await accounts.open(accountFor(request), discoveryFor(request), request.body)));
  router.get('/frame', async (request, response) => response.json(await accounts.frame(accountFor(request))));
  router.post('/action', async (request, response) => response.json(await accounts.action(accountFor(request), request.body)));
  router.post('/capture', async (request, response) => response.status(201).json(await accounts.capture(accountFor(request), request.body)));
  router.post('/capture-candidate', async (request, response) => response.status(201).json(await accounts.captureCandidate(accountFor(request), discoveryFor(request), request.body?.candidateId)));
  router.post('/close', async (request, response) => response.json(await accounts.close(accountFor(request))));
  const errors: ErrorRequestHandler = (error: unknown, _request, response, next) => {
    if (!(error instanceof ZhihuBrowserError)) return next(error);
    response.status(error.status).json({ error: { code: error.code, message: error.message, status: error.status } });
  };
  router.use(errors);
  return router;
}
