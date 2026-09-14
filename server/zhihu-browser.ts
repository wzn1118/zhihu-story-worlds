import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Router, type ErrorRequestHandler } from 'express';
import { chromium, type BrowserContext, type Page, type Request as BrowserRequest } from 'playwright';
import type { ZhihuBrowserAction, ZhihuBrowserCapture, ZhihuBrowserChannel, ZhihuBrowserFrame, ZhihuBrowserOpen } from '../shared/zhihu-browser.ts';
import { canonicalZhihuSource, type ZhihuCandidate } from '../shared/zhihu-discovery.ts';
import { ZhihuDiscoveryService } from './zhihu-discovery.ts';
import { createZhihuPageDocument } from './zhihu-page-document.ts';
import { zhihuBrowserAccessIssue } from './zhihu-browser-access.ts';

export class ZhihuBrowserError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) { super(message); }
}
export function isZhihuBlockedPage(status: number | undefined, body: string, contentRoots: number) {
  return status === 403 || status === 429 || (contentRoots === 0 && /^(?:\s*(?:403|429)\s*)?(?:Forbidden\b|请求存在异常|访问受限|安全验证|系统检测到异常|访问过于频繁)/i.test(body.trim()));
}
export function zhihuBrowserUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048) throw new ZhihuBrowserError('INVALID_ZHIHU_URL', '请填写知乎页面的 HTTPS 链接。');
  let url: URL;
  try { url = new URL(value); } catch { throw new ZhihuBrowserError('INVALID_ZHIHU_URL', '这个页面链接不完整。'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !['www.zhihu.com', 'zhihu.com', 'zhuanlan.zhihu.com'].includes(url.hostname)) throw new ZhihuBrowserError('ZHIHU_ONLY', '游戏内浏览窗口只打开知乎页面。');
  return url.toString();
}
interface ReadablePost { title: string; author: string; sourceUrl: string; text: string; visibleScope?: 'excerpt' | 'expanded'; collapsed?: boolean }
import { ZHIHU_READABLE_POSTS_SCRIPT, ZHIHU_CAPTURE_POST_SCRIPT, ZHIHU_EXPAND_POST_CONTROL_SCRIPT } from './zhihu-post-dom.ts';
export { ZHIHU_READABLE_POSTS_SCRIPT } from './zhihu-post-dom.ts';
type CaptureTarget = { sourceUrl: string; postId: string };
type CapturePostState = { post: unknown; loading: boolean; hasCollapseControl: boolean } | null;
// Compile only fixed application code; the chosen URL and opaque ID remain
// Playwright arguments, never executable source or website-supplied code.
const readCapturePost = new Function('return (' + ZHIHU_CAPTURE_POST_SCRIPT + ')')() as (selected: CaptureTarget) => CapturePostState;
const expandPostControl = new Function('return (' + ZHIHU_EXPAND_POST_CONTROL_SCRIPT + ')')() as (selected: CaptureTarget) => Element | null;
export function readableZhihuPosts(raw: unknown): ReadablePost[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>(), posts: ReadablePost[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as ReadablePost;
    if (typeof row.title !== 'string' || !row.title.trim() || row.title.length > 120 || typeof row.author !== 'string' || !row.author.trim() || row.author.length > 120 || typeof row.text !== 'string' || !row.text.trim() || row.text.length > 120000 || row.text.includes('\u0000')) continue;
    try { const identity = canonicalZhihuSource(row.sourceUrl); if (seen.has(identity.sourceUrl)) continue; seen.add(identity.sourceUrl); posts.push({ ...row, sourceUrl: identity.sourceUrl }); } catch { /* A question link is not a selected answer. */ }
  }
  // Keep every validated card currently exposed by the live page. The browser
  // itself remains the source of truth for infinite recommendation scrolling.
  return posts;
}
function postHash(post: ReadablePost): string { return createHash('sha256').update(JSON.stringify(post)).digest('hex').slice(0, 32); }
const keys = new Set(['Enter', 'Backspace', 'Tab', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Control+A']);
const channels = new Set<ZhihuBrowserChannel>(['chromium', 'chrome', 'msedge']);

// A popup's initial navigation can arrive before Playwright has a Frame.
// Unknown-frame navigations must still pass the top-level URL boundary.
function isTopNavigation(request: BrowserRequest): boolean {
  if (!request.isNavigationRequest()) return false;
  try { return request.frame().parentFrame() === null; } catch { return true; }
}
const LIVE_SURFACE_SCRIPT = `(() => {
  const visible = node => node.getClientRects().length > 0 && getComputedStyle(node).display !== 'none' && getComputedStyle(node).visibility !== 'hidden';
  if (/^\\/signin(?:[/?#]|$)/.test(location.pathname) || [...document.querySelectorAll('.SignFlow,.SignFlowModal')].some(visible)) return 'login';
  if (location.pathname === '/account/unhuman' || location.pathname.startsWith('/account/unhuman/')) return 'verification';
  if ([...document.querySelectorAll('[class*="Captcha"],[class*="captcha"],[class*="yidun"],iframe[src*="captcha"]')].some(visible)) return 'verification';
  return null;
})()`;

export class ZhihuBrowserService {
  private context?: BrowserContext;
  private page?: Page;
  private queue: Promise<unknown> = Promise.resolve();
  private pendingFrame?: Promise<ZhihuBrowserFrame>;
  private latest?: ZhihuBrowserFrame;
  private posts = new Map<string, ReadablePost>();
  private channel?: ZhihuBrowserChannel;
  private httpStatus?: number;
  private pageHttpStatuses = new WeakMap<Page, number>();
  private earlyPopupStatuses = new Map<string, number>();
  private backgroundPages = new WeakSet<Page>();
  private creatingBackgroundPage = false;
  private backgroundReadActive = false;
  private notice?: string;
  private ownerToken?: string;
  private releasingProfile?: Promise<void>;
  private documents = new Map<string, Set<string>>();
  private capturedPosts = new Map<string, ReadablePost>();
  private readonly profile: string;
  private screenFrames = new Map<string, { page: Page; url: string; width: number; height: number; at: number }>();
  constructor(private readonly discovery = new ZhihuDiscoveryService(), profile = resolve('.local/zhihu-browser'), private readonly options: { defaultChannel?: ZhihuBrowserChannel; publicMode?: boolean } = {}) { this.profile = resolve(profile); }
  private serialize<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.catch(() => undefined).then(task).catch(error => {
      if (!(error instanceof ZhihuBrowserError) && error instanceof Error && /(?:Target page, context or browser has been closed|Target closed|Page closed)/i.test(error.message)) throw new ZhihuBrowserError('BROWSER_CLOSED', '这个知乎窗口已经关闭，请重新连接。', 409);
      throw error;
    });
    this.queue = next; return next;
  }
  private closed(): ZhihuBrowserFrame { return { status: 'closed', frameId: '', url: '', title: '', width: 1100, height: 720, posts: [], capturedAt: new Date().toISOString() }; }
  private activatePage(page: Page) {
    if (this.backgroundPages.has(page)) return;
    if (this.page === page) return;
    this.page = page; this.latest = undefined; this.httpStatus = this.pageHttpStatuses.get(page) ?? this.earlyPopupStatuses.get(page.url()); this.notice = undefined;
    if (this.httpStatus !== undefined) this.pageHttpStatuses.set(page, this.httpStatus);
    this.earlyPopupStatuses.delete(page.url());
    this.posts.clear(); this.screenFrames.clear();
  }
  private bindPage(page: Page, context: BrowserContext) {
    page.on('dialog', dialog => void dialog.dismiss().catch(() => undefined));
    page.on('framenavigated', frame => {
      if (this.context !== context || this.backgroundPages.has(page) || frame !== page.mainFrame() || page.isClosed()) return;
      try { zhihuBrowserUrl(frame.url()); } catch { return; }
      this.activatePage(page);
      this.latest = undefined; this.screenFrames.clear();
    });
    page.on('close', () => {
      if (this.context !== context || this.page !== page) return;
      this.page = undefined; this.latest = undefined; this.posts.clear(); this.screenFrames.clear();
      const previous = context.pages().filter(candidate => !candidate.isClosed() && !this.backgroundPages.has(candidate)).reverse().find(candidate => {
        try { zhihuBrowserUrl(candidate.url()); return true; } catch { return false; }
      });
      if (previous) this.activatePage(previous);
    });
  }
  private async claimProfile() {
    await mkdir(this.profile, { recursive: true, mode: 0o700 });
    const path = join(this.profile, 'redleaf-owner.json'), token = randomUUID();
    for (let attempt = 0; attempt < 2; attempt++) {
      try { await writeFile(path, JSON.stringify({ pid: process.pid, token }), { flag: 'wx', mode: 0o600 }); this.ownerToken = token; return; }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        const owner = await readFile(path, 'utf8').then(text => JSON.parse(text) as { pid: number }).catch(() => null);
        if (owner && Number.isInteger(owner.pid)) { try { process.kill(owner.pid, 0); throw new ZhihuBrowserError('BROWSER_IN_USE', '这个知乎窗口正在另一个本机服务中使用，请回到已打开的窗口。', 409); } catch (error) { if (error instanceof ZhihuBrowserError || (error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; } }
        else throw new ZhihuBrowserError('BROWSER_PROFILE_BUSY', '知乎浏览器的持有记录暂时不可读，请稍后再打开。', 409);
        await rm(path, { force: true });
      }
    }
    throw new ZhihuBrowserError('BROWSER_PROFILE_BUSY', '知乎浏览窗口正在启动，请稍后再打开。', 409);
  }
  private releaseProfile(): Promise<void> {
    if (this.releasingProfile) return this.releasingProfile;
    const token = this.ownerToken;
    if (!token) return Promise.resolve();
    const releasing = (async () => {
      const path = join(this.profile, 'redleaf-owner.json');
      const owner = await readFile(path, 'utf8').then(text => JSON.parse(text) as { token?: string }).catch(() => null);
      if (owner?.token === token) await rm(path, { force: true });
      if (this.ownerToken === token) this.ownerToken = undefined;
    })();
    this.releasingProfile = releasing;
    void releasing.finally(() => { if (this.releasingProfile === releasing) this.releasingProfile = undefined; }).catch(() => undefined);
    return releasing;
  }
  open(options: ZhihuBrowserOpen = {}): Promise<ZhihuBrowserFrame> { return this.serialize(async () => {
    if (!options || typeof options !== 'object') throw new ZhihuBrowserError('INVALID_BROWSER_OPTIONS', '浏览窗口参数不完整。');
    const url = options.url === undefined ? 'https://www.zhihu.com/' : zhihuBrowserUrl(options.url);
    const width = options.width ?? 1100, height = options.height ?? 720, channel = options.channel ?? this.options.defaultChannel ?? (process.env.PUBLIC_MODE === '1' ? 'chromium' : 'msedge');
    if (![width, height].every(Number.isInteger) || width < 390 || width > 1600 || height < 500 || height > 1200 || !channels.has(channel)) throw new ZhihuBrowserError('INVALID_BROWSER_OPTIONS', '浏览窗口尺寸或浏览器类型有误。');
    if (!this.context) {
      // A spontaneous browser close releases the profile asynchronously.
      // Reconnection must wait for that release, not mistake our own old lock
      // for another live account browser.
      await this.releasingProfile;
      await this.claimProfile();
      try {
        let executablePath: string | undefined;
        if (channel === 'chromium') {
          const installed = join(process.env.LOCALAPPDATA ?? '', 'ms-playwright', 'chromium-1234', 'chrome-win64', 'chrome.exe');
          if (await access(installed).then(() => true, () => false)) executablePath = installed;
        }
        if (process.platform === 'win32' && channel !== 'chromium') {
          // Desktop/hidden launches can omit ProgramFiles; use the selected installed browser.
          const suffix = channel === 'msedge' ? ['Microsoft', 'Edge', 'Application', 'msedge.exe'] : ['Google', 'Chrome', 'Application', 'chrome.exe'];
          for (const base of [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, 'C:/Program Files (x86)', 'C:/Program Files', process.env.LOCALAPPDATA].filter((value): value is string => Boolean(value))) {
            const candidate = join(base, ...suffix);
            if (await access(candidate).then(() => true, () => false)) { executablePath = candidate; break; }
          }
        }
        this.context = await chromium.launchPersistentContext(this.profile, { headless: true, timeout: 30000, ...(executablePath ? { executablePath } : channel === 'chromium' ? {} : { channel }), viewport: { width, height }, locale: 'zh-CN', acceptDownloads: false });
        this.pageHttpStatuses = new WeakMap(); this.earlyPopupStatuses.clear();
        this.channel = channel;
        this.page = this.context.pages()[0] ?? await this.context.newPage();
        const context = this.context, primary = this.page;
        for (const extra of context.pages()) if (extra !== primary) await extra.close();
        this.bindPage(primary, context);
        // Context responses include a popup's first response, which can arrive
        // before its page event and before per-page listeners are attached.
        context.on('response', response => {
          if (this.context !== context || !response.request().isNavigationRequest()) return;
          try {
            const frame = response.frame();
            if (frame.parentFrame() !== null) return;
            const page = frame.page();
            this.pageHttpStatuses.set(page, response.status());
            if (this.page === page) this.httpStatus = response.status();
          } catch {
            // Chromium does not associate an initial popup request with a Frame
            // yet. Hold only its status until that permitted page is activated.
            try { zhihuBrowserUrl(response.url()); } catch { return; }
            this.earlyPopupStatuses.set(response.url(), response.status());
            while (this.earlyPopupStatuses.size > 8) this.earlyPopupStatuses.delete(this.earlyPopupStatuses.keys().next().value!);
            if (this.page?.url() === response.url()) {
              this.pageHttpStatuses.set(this.page, response.status());
              this.httpStatus = response.status();
            }
          }
        });
        context.on('page', popup => {
          // Classify by opener before binding activation listeners. A delayed
          // foreground login popup must stay a user window during a background
          // read. Our explicit newPage is also registered before goto below.
          void popup.opener().catch(() => null).then(opener => {
            if (this.context !== context || popup.isClosed()) return;
            if (opener ? this.backgroundPages.has(opener) : this.creatingBackgroundPage) this.backgroundPages.add(popup);
            this.bindPage(popup, context);
            if (this.backgroundPages.has(popup)) {
              if (context.pages().filter(page => this.backgroundPages.has(page)).length > 2) void popup.close().catch(() => undefined);
              return;
            }
            // A permitted popup becomes active on its first commit. That
            // commit/response can precede this asynchronous opener lookup.
            if (context.pages().filter(page => !this.backgroundPages.has(page)).length > 4) void popup.close().catch(() => undefined);
            else { try { zhihuBrowserUrl(popup.url()); this.activatePage(popup); } catch { /* Await its first permitted navigation. */ } }
          }).catch(() => undefined);
        });
        await context.route('**/*', async route => {
          try {
            const request = route.request();
            if (isTopNavigation(request)) {
              try { zhihuBrowserUrl(request.url()); }
              catch {
                let background = false;
                try { background = this.backgroundPages.has(request.frame().page()); } catch { background = this.backgroundReadActive; }
                if (!background) this.notice = '这个链接指向知乎之外，已留在当前窗口。';
                await route.abort('blockedbyclient').catch(() => undefined);
                return;
              }
            }
            await route.fallback();
          } catch {
            // Closing a page races with in-flight routes. An event-handler
            // rejection must never terminate other users' browser sessions.
            await route.abort('failed').catch(() => undefined);
          }
        });
        context.on('close', () => {
          if (this.context !== context) return;
          this.context = undefined; this.page = undefined; this.latest = undefined; this.posts.clear(); this.screenFrames.clear();
          this.pageHttpStatuses = new WeakMap(); this.earlyPopupStatuses.clear();
          void this.releaseProfile().catch(() => undefined);
        });
      } catch {
        const failedContext = this.context;
        this.context = undefined; this.page = undefined;
        if (failedContext) await failedContext.close().catch(() => undefined);
        await this.releaseProfile();
        throw new ZhihuBrowserError('BROWSER_START_FAILED', this.options.publicMode ? '你的知乎窗口暂时没有启动成功，请稍后重新连接。' : `本机 ${channel} 浏览器没有启动成功，请检查浏览器安装与独立配置目录。`, 503);
      }
      await this.navigate(url);
    } else {
      if (channel !== this.channel && options.channel !== undefined) throw new ZhihuBrowserError('BROWSER_CHANNEL_CHANGED', '先关闭当前知乎窗口，再选择另一个浏览器。', 409);
      if (!this.page || this.page.isClosed()) {
        const page = await this.context.newPage();
        this.activatePage(page);
        await page.setViewportSize({ width, height });
        await this.navigate(url);
        return this.snapshot();
      }
      const previousSize = this.page.viewportSize();
      if (previousSize?.width !== width || previousSize?.height !== height) this.screenFrames.clear();
      await this.page!.setViewportSize({ width, height });
      if (options.url) await this.navigate(url);
    }
    return this.snapshot();
  }); }
  frame(): Promise<ZhihuBrowserFrame> {
    // A plain refusal response has no changing login or verification surface.
    // Explicit actions and navigation invalidate it; polling need not recapture
    // an unchanged JSON error for every connected client.
    if (this.latest?.accessIssue?.kind === 'request-denied') return this.serialize(async () => this.page && !this.page.isClosed() ? this.latest ?? this.snapshot() : this.closed());
    // Reading the displayed document must not replace its live control IDs.
    // Navigation and explicit actions publish the next document; login frames
    // keep polling the real surface until the user finishes authentication.
    if (this.latest?.document && this.latest.posts.length) return this.serialize(async () => {
      if (!this.page || this.page.isClosed()) return this.closed();
      // A login/captcha can appear asynchronously on a previously readable page.
      return await this.page.evaluate(LIVE_SURFACE_SCRIPT).catch(() => null) ? this.snapshot() : this.latest ?? this.snapshot();
    });
    // Several UI readers share the same capture instead of queuing renderer work.
    if (this.pendingFrame) return this.pendingFrame;
    const pending = this.serialize(async () => this.page && !this.page.isClosed() ? this.snapshot() : this.closed());
    this.pendingFrame = pending;
    void pending.finally(() => { if (this.pendingFrame === pending) this.pendingFrame = undefined; }).catch(() => undefined);
    return pending;
  }
  private requirePage(): Page { if (!this.page || this.page.isClosed()) throw new ZhihuBrowserError('BROWSER_CLOSED', '请先打开游戏内的知乎窗口。', 409); return this.page; }
  private requireScreenFrame(frameId: string, page: Page) {
    const recorded = this.screenFrames.get(frameId), viewport = page.viewportSize();
    if (!recorded || recorded.page !== page || recorded.url !== page.url() || recorded.width !== viewport?.width || recorded.height !== viewport?.height || Date.now() - recorded.at > 15_000) throw new ZhihuBrowserError('STALE_BROWSER_FRAME', '网页画面已经更新，请在新画面上操作。', 409);
  }
  private validPoint(point: { x: number; y: number }, page: Page) {
    const viewport = page.viewportSize()!;
    return point && [point.x, point.y].every(Number.isFinite) && point.x >= 0 && point.y >= 0 && point.x < viewport.width && point.y < viewport.height;
  }
  private async navigate(url: string) {
    this.notice = undefined; this.httpStatus = undefined;
    // Zhihu can keep deferred scripts pending after the useful page is painted.
    // Returning its committed document avoids adding that wait to every action.
    try { await this.requirePage().goto(url, { waitUntil: 'commit', timeout: 15_000 }); }
    catch { this.notice = '页面还没有完整打开，当前画面已保留；可以重新载入。'; }
    await this.requirePage().waitForFunction(`() => {
      const body = document.body?.innerText.trim() || '';
      const hasReadable = [...document.querySelectorAll('.RichContent-inner,.AnswerItem .RichText,.ArticleItem .RichText,.Post-RichText')]
        .some(node => node.textContent.trim());
      const hasFeed = document.querySelector('.TopstoryItem,.Topstory-mainColumn .ContentItem,.HotList-list .HotItem,.HotList-item,.HotItem') !== null;
      return hasReadable || hasFeed || Boolean(document.querySelector('.SignFlow,.SignFlowModal')) || /^(?:403|Forbidden|请求存在异常|访问受限)/i.test(body);
    }`, undefined, { timeout: 12_000, polling: 120 }).catch(() => undefined);
    // Recommendation and hot-list data can land just after the first matching
    // node. A small settle window prevents an empty first frame without making
    // every subsequent action wait for network-idle.
    await this.requirePage().waitForTimeout(350);
  }
  private async clickLiveLink(url: string, reference: { documentId?: string; elementId?: string } = {}) {
    const page = this.requirePage(), targetUrl = zhihuBrowserUrl(url);
    const elementId = reference.documentId && this.documents.has(reference.documentId) &&
      typeof reference.elementId === 'string' && reference.elementId.startsWith(reference.documentId + '-') && /^[a-f0-9-]+$/.test(reference.elementId) ? reference.elementId : undefined;
    const handle = await page.evaluateHandle(({ targetUrl, elementId }) => {
      let first: HTMLAnchorElement | null = null;
      for (const node of document.querySelectorAll<HTMLAnchorElement>('a[href]')) {
        try {
          if (new URL(node.href, location.href).href !== targetUrl || node.getClientRects().length === 0 || getComputedStyle(node).visibility === 'hidden') continue;
          if (elementId && node.getAttribute('data-redleaf-control') === elementId) return node;
          first ??= node;
        } catch { /* Ignore a malformed live href. */ }
      }
      return first;
    }, { targetUrl, elementId });
    try {
      const link = handle.asElement();
      if (!link) throw new ZhihuBrowserError('STALE_BROWSER_LINK', '这条链接已不在当前知乎页面，请更新画面后重新点击。', 409);
      this.notice = undefined;
      // Real anchor activation preserves handlers, SPA routing, popup behavior,
      // and the site's own referrer policy. A raw goto loses that context.
      await link.click({ timeout: 5000 });
    } catch (error) {
      if (error instanceof Error && /(?:Element is not attached|element was detached|not connected to a Document)/i.test(error.message)) throw new ZhihuBrowserError('STALE_BROWSER_LINK', '这条链接刚刚更新，请更新画面后重新点击。', 409);
      throw error;
    } finally { await handle.dispose().catch(() => undefined); }
    await this.requirePage().waitForTimeout(320);
  }
  action(action: ZhihuBrowserAction): Promise<ZhihuBrowserFrame> { return this.serialize(async () => {
    const page = this.requirePage();
    if (!action || typeof action !== 'object') throw new ZhihuBrowserError('INVALID_BROWSER_ACTION', '浏览操作不完整。');
    if (action.kind === 'navigate') await this.navigate(zhihuBrowserUrl(action.url));
    else if (action.kind === 'link') await this.clickLiveLink(action.url, action);
    else if (action.kind === 'element') {
    const ids = this.documents.get(action.documentId);
      if (!ids || typeof action.documentId !== 'string' || !/^[a-f0-9-]{36}$/.test(action.documentId) || typeof action.elementId !== 'string' || !action.elementId.startsWith(action.documentId + '-') || !/^[a-f0-9-]+$/.test(action.elementId)) throw new ZhihuBrowserError('STALE_BROWSER_FRAME', '这一页已经更新，请使用新页面上的控件。', 409);
      const control = page.locator(`[data-redleaf-control="${action.elementId}"]`);
      if (await control.count() !== 1) throw new ZhihuBrowserError('STALE_BROWSER_FRAME', '这个控件已经更新，请刷新知乎页面。', 409);
      if (action.event === 'fill') {
        if (typeof action.text !== 'string' || action.text.length > 4000 || action.text.includes('\u0000')) throw new ZhihuBrowserError('INVALID_BROWSER_TEXT', '输入文字超出了单次操作范围。');
        await control.fill(action.text, { timeout: 5000 });
        await control.press('Enter', { timeout: 5000 });
      } else if (action.event === 'click') {
        const beforeUrl = page.url();
        const info = await control.evaluate((node: Element) => ({ href: (node as HTMLAnchorElement).href, text: (node as HTMLElement).innerText }));
        // A hot-list question can naturally contain words such as "关注" in
        // its title. Only linkless account-action controls are restricted;
        // every in-site reading link keeps its normal same-page navigation.
        if (!info.href && /赞同|取消赞同|关注|收藏|分享|评论|提问|写回答|写文章|发视频|发布|退出|私信|消息/.test(info.text ?? '')) throw new ZhihuBrowserError('READING_CONTROL_ONLY', '这里用于阅读和选篇，这个账号操作请在知乎中自行处理。', 400);
        if (info.href?.startsWith('http')) await this.clickLiveLink(info.href, action);
        else await control.click({ timeout: 5000 });
        if (!info.href?.startsWith('http')) {
          await page.waitForFunction(({ before }) => location.href !== before || Boolean(document.querySelector('.AnswerItem,.Post-Main,.QuestionHeader,.HotList-list .HotItem,.TopstoryItem')), { before: beforeUrl }, { timeout: 8000, polling: 120 }).catch(() => undefined);
          await page.waitForTimeout(320);
        }
      } else throw new ZhihuBrowserError('INVALID_BROWSER_ACTION', '这个浏览操作暂时未开放。');
      await page.waitForTimeout(400);
    } else if (action.kind === 'back' || action.kind === 'reload') {
      this.notice = undefined;
      try {
        if (action.kind === 'back') {
          const previous = await page.goBack({ waitUntil: 'commit', timeout: 15000 });
          // A newly opened login window has no history of its own. Returning
          // closes that window and restores its still-open reading surface.
          if (!previous && await page.opener()) await page.close();
        } else await page.reload({ waitUntil: 'commit', timeout: 15000 });
      } catch { this.notice = '页面暂时没有完整加载，已保留当前画面。'; }
    } else if (action.kind === 'click') {
      this.requireScreenFrame(action.frameId, page);
      if (!this.validPoint(action, page)) throw new ZhihuBrowserError('INVALID_CLICK', '点击位置超出了知乎窗口。');
      this.screenFrames.clear();
      const link = await page.evaluate(({ x, y }) => { const anchor = document.elementFromPoint(x, y)?.closest('a'); return anchor?.href ? { href: anchor.href, newTab: anchor.target === '_blank' } : null; }, { x: action.x, y: action.y });
      if (link && /^https?:/i.test(link.href)) zhihuBrowserUrl(link.href);
      await page.mouse.click(action.x, action.y);
    } else if (action.kind === 'drag') {
      this.requireScreenFrame(action.frameId, page);
      if (!Array.isArray(action.points) || action.points.length < 2 || action.points.length > 120 || !action.points.every(point => this.validPoint(point, page)) || (action.durationMs !== undefined && (!Number.isFinite(action.durationMs) || action.durationMs < 0 || action.durationMs > 5000))) throw new ZhihuBrowserError('INVALID_DRAG', '拖动轨迹超出了知乎窗口或单次操作范围。');
      this.screenFrames.clear();
      const [start, ...steps] = action.points;
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      try {
        const interval = (action.durationMs ?? 300) / steps.length;
        for (const point of steps) {
          if (interval > 0) await page.waitForTimeout(interval);
          await page.mouse.move(point.x, point.y);
        }
      } finally { await page.mouse.up().catch(() => undefined); }
    } else if (action.kind === 'load-more') {
      // The reading iframe scrolls independently. Reaching its bottom must
      // advance the real page to its loaded end, not another viewport near top.
      if (await page.evaluate(LIVE_SURFACE_SCRIPT)) throw new ZhihuBrowserError('READING_PAGE_REQUIRED', '请先完成当前页面的登录或验证。', 409);
      const before = await page.evaluate(() => ({ height: document.documentElement.scrollHeight, answers: document.querySelectorAll('.AnswerItem,.TopstoryItem').length }));
      await page.evaluate(() => window.scrollTo(0, Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0)));
      await page.mouse.wheel(0, 180);
      await page.waitForFunction(({ height, answers }) => document.documentElement.scrollHeight > height || document.querySelectorAll('.AnswerItem,.TopstoryItem').length > answers, before, { timeout: 1800, polling: 100 }).catch(() => undefined);
    } else if (action.kind === 'scroll') {
      if (!Number.isFinite(action.deltaY) || Math.abs(action.deltaY) > 2400 || (action.deltaX !== undefined && (!Number.isFinite(action.deltaX) || Math.abs(action.deltaX) > 2400))) throw new ZhihuBrowserError('INVALID_SCROLL', '滚动距离超出了单次操作范围。');
      const beforeHeight = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0)).catch(() => 0);
      await page.mouse.wheel(action.deltaX ?? 0, action.deltaY);
      // Recommendation feeds append cards asynchronously. Give the live page a
      // short, bounded settle window so the next native snapshot contains them.
      await page.waitForTimeout(260);
      if (beforeHeight > 0) await page.waitForFunction(({ before }) => Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0) > before || window.scrollY + window.innerHeight < document.documentElement.scrollHeight - 8, { before: beforeHeight }, { timeout: 900, polling: 80 }).catch(() => undefined);
    } else if (action.kind === 'text') {
      if (typeof action.text !== 'string' || action.text.length > 4000 || /\u0000/.test(action.text)) throw new ZhihuBrowserError('INVALID_BROWSER_TEXT', '输入文字超出了单次操作范围。');
      await page.keyboard.insertText(action.text);
    } else if (action.kind === 'key') {
      if (!keys.has(action.key)) throw new ZhihuBrowserError('INVALID_BROWSER_KEY', '这个按键暂时未开放。');
      await page.keyboard.press(action.key);
    } else throw new ZhihuBrowserError('INVALID_BROWSER_ACTION', '这个浏览操作暂时未开放。');
    await this.requirePage().waitForTimeout(220);
    return this.snapshot();
  }); }
  private async extract(): Promise<ReadablePost[]> {
    const raw = await this.requirePage().evaluate(ZHIHU_READABLE_POSTS_SCRIPT);
    return readableZhihuPosts(raw);
  }
  private async snapshot(): Promise<ZhihuBrowserFrame> {
    const page = this.requirePage();
    const viewport = page.viewportSize()!;
    const body = await page.locator('body').innerText({ timeout: 3000 }).catch(() => '');
    const liveSurface = await page.evaluate(LIVE_SURFACE_SCRIPT).catch(() => null);
    const accessIssue = zhihuBrowserAccessIssue(this.httpStatus, body, liveSurface === 'verification');
    const blocked = Boolean(accessIssue) || isZhihuBlockedPage(this.httpStatus, body, await page.locator('.ContentItem,.Post-Main,.QuestionHeader').count());
    const readable = blocked ? [] : await this.extract();
    this.posts = new Map(readable.map(post => [postHash(post), post]));
    const url = page.url(), title = await page.title().catch(() => '知乎');
    const login = !blocked && (liveSurface === 'login' || /\/signin/.test(url));
    const postRows = readable.map(post => ({ id: postHash(post), title: post.title, author: post.author, sourceUrl: post.sourceUrl, excerpt: post.text.slice(0, 240), characters: post.text.length, visibleScope: post.visibleScope }));
    const document = !blocked && !login ? await createZhihuPageDocument(page, postRows) : undefined;
    const screenshot = document ? undefined : await this.captureViewport(page);
    const inputState = await page.evaluate(() => {
      const field = globalThis.document.activeElement;
      const focusedInput = field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement ? { type: field instanceof HTMLInputElement ? field.type : 'text', ...(field.inputMode ? { inputMode: field.inputMode } : {}) } : undefined;
      const inputs = [];
      for (const node of globalThis.document.querySelectorAll('input,textarea')) {
        if (!(node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) || node.disabled || node.readOnly || (node instanceof HTMLInputElement && !['text', 'search', 'tel', 'email', 'url', 'password', 'number'].includes(node.type))) continue;
        const box = node.getBoundingClientRect();
        const x = Math.max(0, box.x), y = Math.max(0, box.y), right = Math.min(innerWidth, box.right), bottom = Math.min(innerHeight, box.bottom);
        if (right <= x || bottom <= y || getComputedStyle(node).visibility !== 'visible' || globalThis.document.elementFromPoint((x + right) / 2, (y + bottom) / 2) !== node) continue;
        inputs.push({ type: node instanceof HTMLInputElement ? node.type : 'text', ...(node.inputMode ? { inputMode: node.inputMode } : {}), x, y, width: right - x, height: bottom - y });
        if (inputs.length === 32) break;
      }
      return { focusedInput, inputs };
    }).catch(() => ({}));
    const frame: ZhihuBrowserFrame = { status: blocked ? 'blocked' : login ? 'login-required' : this.notice ? 'error' : 'ready', frameId: randomUUID(), url, title, ...viewport, ...(screenshot ? { screenshot: `data:image/png;base64,${screenshot}` } : {}), document, posts: postRows, channel: this.channel, httpStatus: this.httpStatus, ...(accessIssue ? { accessIssue } : {}), ...inputState, capturedAt: new Date().toISOString(), ...(this.notice ? { message: this.notice } : accessIssue?.kind === 'request-denied' ? { message: '知乎拒绝了当前页面访问，这个错误页没有可操作的验证控件。可以返回热榜，或在你自己的浏览器打开原文。' } : blocked ? { message: '知乎当前显示访问限制，画面来自真实页面；如果页面提供验证，可以在这里完成。' } : login ? { message: '知乎需要登录，直接在这块真实页面里操作即可。' } : {}) };
    if (screenshot) {
      this.screenFrames.set(frame.frameId, { page, url, ...viewport, at: Date.now() });
      while (this.screenFrames.size > 8) this.screenFrames.delete(this.screenFrames.keys().next().value!);
    }
    this.documents.set(frame.frameId, new Set(postRows.map(post => post.id)));
    if (document) this.documents.set(document.id, new Set(postRows.map(post => post.id)));
    for (const post of readable) this.capturedPosts.set(postHash(post), post);
    while (this.documents.size > 16) this.documents.delete(this.documents.keys().next().value!);
    if (this.capturedPosts.size > 200) { const keep = new Set([...this.documents.values()].flatMap(ids => [...ids])); for (const id of this.capturedPosts.keys()) if (!keep.has(id)) this.capturedPosts.delete(id); }
    this.latest = frame; return frame;
  }
  private async captureViewport(page: Page): Promise<string> {
    // Capture the current renderer surface without waiting for remote web fonts.
    // This changes only screenshot timing; the site and browser protections stay intact.
    const session = await page.context().newCDPSession(page);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        session.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false }),
        new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('capture timeout')), 10_000); }),
      ]);
      return result.data;
    } catch {
      throw new ZhihuBrowserError('BROWSER_FRAME_TIMEOUT', '知乎页面正在绘制，点击更新画面即可继续。', 504);
    } finally {
      if (timer) clearTimeout(timer);
      await session.detach().catch(() => undefined);
    }
  }
  private async expandCapturedPost(post: ReadablePost, postId: string, backgroundPage?: Page): Promise<ReadablePost> {
    let readingPage = backgroundPage;
    const currentPage = () => readingPage ?? this.requirePage();
    const selected = { sourceUrl: post.sourceUrl, postId };
    const failure = () => new ZhihuBrowserError('BROWSER_POST_EXPANSION_FAILED', '这条回答的全文暂时没有加载完成，请稍后再拖一次。本次没有保存摘要。', 409);
    const read = async () => {
      const page = currentPage();
      if (await page.evaluate(LIVE_SURFACE_SCRIPT)) throw new ZhihuBrowserError('BROWSER_FULLTEXT_AUTH_REQUIRED', '知乎要求先完成登录或验证，完成后再拖入即可自动获取全文。', 409);
      const state = await page.evaluate(readCapturePost, selected);
      const current = readableZhihuPosts(state?.post ? [state.post] : [])[0];
      return current ? { post: current, loading: state!.loading, hasCollapseControl: state!.hasCollapseControl } : null;
    };
    const initial = await read();
    if (!initial) throw new ZhihuBrowserError('POST_CHANGED', '这条回答已经不在当前页面，请重新打开原回答后再拖动。', 409);
    // Only a collapsed selection is refreshed. Already expanded selections
    // continue to preserve exactly the server snapshot the reader dragged.
    if (!backgroundPage) { this.latest = undefined; this.screenFrames.clear(); }
    if (initial.post.collapsed) {
      const handle = await currentPage().evaluateHandle(expandPostControl, selected);
      try {
        const control = handle.asElement();
        if (!control) throw failure();
        const href = await control.evaluate(node => node instanceof HTMLAnchorElement ? node.href : null);
        if (href) {
          // A native read-more link may open this answer's detail page. Never
          // follow an unrelated link or a quoted answer to obtain its prose.
          let identity: ReturnType<typeof canonicalZhihuSource>;
          try { identity = canonicalZhihuSource(href); } catch { throw failure(); }
          if (identity.sourceUrl !== post.sourceUrl) throw failure();
        }
        await control.click({ timeout: 4000 });
      } catch (error) {
        if (error instanceof ZhihuBrowserError) throw error;
        throw failure();
      } finally { await handle.dispose(); }
    }
    const deadline = Date.now() + 8000;
    let stableText: string | undefined, stableSince = 0;
    while (Date.now() < deadline) {
      if (backgroundPage) {
        // Native read-more anchors can use handlers or open a detail tab. Keep
        // their click behavior, and follow only our child tab for this answer.
        const detail = backgroundPage.context().pages().find(page => {
          if (page === backgroundPage || page.isClosed() || !this.backgroundPages.has(page)) return false;
          try { return canonicalZhihuSource(page.url()).sourceUrl === post.sourceUrl; } catch { return false; }
        });
        if (detail) readingPage = detail;
      }
      let state: Awaited<ReturnType<typeof read>> = null;
      try { state = await read(); }
      catch (error) {
        if (error instanceof ZhihuBrowserError) throw error;
        // A native reading link can briefly replace its execution context.
        if (!(error instanceof Error) || !/Execution context was destroyed|Cannot find context/.test(error.message)) throw error;
      }
      const current = state?.post;
      // Removing a collapsed class is not sufficient: asynchronous sites may
      // still be rendering the old excerpt. Wait for actual replacement text
      // or the site's explicit completed "收起" control, then let it settle.
      const ready = current?.visibleScope === 'expanded' && !current.collapsed && !state?.loading && (current.text !== post.text || state?.hasCollapseControl);
      if (ready && current) {
        if (stableText !== current.text) { stableText = current.text; stableSince = Date.now(); }
        else if (Date.now() - stableSince >= 500) return current;
      } else { stableText = undefined; stableSince = 0; }
      await currentPage().waitForTimeout(120);
    }
    throw failure();
  }
  private async readAnswerDetail(sourceUrl: string): Promise<ReadablePost> {
    const context = this.context;
    if (!context) throw new ZhihuBrowserError('BROWSER_CLOSED', '知乎窗口已关闭，请重新连接后再拖入。', 409);
    let page: Page | undefined;
    this.backgroundReadActive = true;
    try {
      this.creatingBackgroundPage = true;
      try { page = await context.newPage(); this.backgroundPages.add(page); }
      finally { this.creatingBackgroundPage = false; }
      // Normal navigation to the exact, server-validated answer in the same
      // account. Do not replace the reader's current page, scroll or history.
      const response = await page.goto(sourceUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      if ([401, 403, 429].includes(response?.status() ?? 0)) throw new ZhihuBrowserError('BROWSER_FULLTEXT_RESTRICTED', '知乎暂时限制了这条回答的全文访问，未保存摘要。可以在知乎原页面完成登录或验证后重试。', 409);
      const deadline = Date.now() + 8000;
      let stableText = '', stableSince = 0;
      while (Date.now() < deadline) {
        if (await page.evaluate(LIVE_SURFACE_SCRIPT)) throw new ZhihuBrowserError('BROWSER_FULLTEXT_AUTH_REQUIRED', '知乎要求先完成登录或验证，完成后再拖入即可自动获取全文。', 409);
        const state = await page.evaluate(readCapturePost, { sourceUrl, postId: '' });
        const post = readableZhihuPosts(state?.post ? [state.post] : [])[0];
        if (post?.collapsed && !state?.loading) {
          const handle = await page.evaluateHandle(expandPostControl, { sourceUrl, postId: '' });
          const ready = Boolean(handle.asElement());
          await handle.dispose();
          if (ready) return await this.expandCapturedPost(post, '', page);
        }
        if (post?.visibleScope === 'expanded' && !state?.loading) {
          if (stableText !== post.text) { stableText = post.text; stableSince = Date.now(); }
          else if (Date.now() - stableSince >= 500) return post;
        } else { stableText = ''; stableSince = 0; }
        await page.waitForTimeout(120);
      }
      throw new ZhihuBrowserError('BROWSER_POST_EXPANSION_FAILED', '这条回答的全文暂时没有加载完成，请稍后再拖一次。本次没有保存摘要。', 409);
    } catch (error) {
      if (error instanceof ZhihuBrowserError) throw error;
      throw new ZhihuBrowserError('BROWSER_FULLTEXT_FAILED', '这次没有取得回答全文，请稍后重试。本次没有保存摘要。', 502);
    } finally {
      this.creatingBackgroundPage = false;
      await Promise.allSettled(context.pages().filter(candidate => this.backgroundPages.has(candidate)).map(candidate => candidate.close()));
      this.backgroundReadActive = false;
    }
  }
  private async completePost(post: ReadablePost, postId: string): Promise<ReadablePost> {
    if (post.visibleScope === 'expanded' && !post.collapsed) return post;
    try { return await this.expandCapturedPost(post, postId); }
    catch (error) {
      if (!(error instanceof ZhihuBrowserError) || !['BROWSER_POST_EXPANSION_FAILED', 'POST_CHANGED'].includes(error.code)) throw error;
      return this.readAnswerDetail(post.sourceUrl);
    }
  }
  async captureCandidate(candidateId: unknown): Promise<ZhihuCandidate> {
    // Resolve IDs only through this account's validated saved selections. A
    // client-supplied URL, author, excerpt or another user's ID is never trusted.
    const source = await this.discovery.source(candidateId);
    if (source.origin?.contentScope === 'webpage-selection' && source.origin.webpageScope === 'expanded') {
      return this.discovery.capturePage({ ...source, sourceUrl: source.origin.sourceUrl }, { visibleScope: 'expanded' });
    }
    const identity = canonicalZhihuSource(source.origin?.sourceUrl);
    if (!this.context) await this.open();
    return this.serialize(async () => {
      this.requirePage();
      const state = await this.requirePage().evaluate(readCapturePost, { sourceUrl: identity.sourceUrl, postId: '' });
      const current = readableZhihuPosts(state?.post ? [state.post] : [])[0];
      if (current && await this.requirePage().evaluate(LIVE_SURFACE_SCRIPT)) throw new ZhihuBrowserError('BROWSER_FULLTEXT_AUTH_REQUIRED', '知乎要求先完成登录或验证，完成后再拖入即可自动获取全文。', 409);
      const post = current ? await this.completePost(current, '') : await this.readAnswerDetail(identity.sourceUrl);
      return this.discovery.capturePage(post, { visibleScope: 'expanded' });
    });
  }
  capture(request: ZhihuBrowserCapture): Promise<ZhihuCandidate> { return this.serialize(async () => {
    this.requirePage();
    if (!request || !this.documents.get(request.frameId)?.has(request.postId) || typeof request.postId !== 'string') throw new ZhihuBrowserError('STALE_BROWSER_POST', '页面已经变化，请重新拖动现在看到的帖子。', 409);
    const post = this.capturedPosts.get(request.postId);
    // The opaque ID is bound to the exact server snapshot the user selected.
    // A recommendation refresh or expanding another answer must not invalidate it.
    if (!post) throw new ZhihuBrowserError('POST_CHANGED', '这篇正文的阅读记录已过期，请重新选择。', 409);
    const selected = await this.completePost(post, request.postId);
    return this.discovery.capturePage(selected, { visibleScope: selected.visibleScope });
  }); }
  close(): Promise<ZhihuBrowserFrame> { return this.serialize(async () => { const context = this.context; this.context = undefined; this.page = undefined; this.latest = undefined; this.posts.clear(); this.documents.clear(); this.capturedPosts.clear(); this.screenFrames.clear(); this.pageHttpStatuses = new WeakMap(); this.earlyPopupStatuses.clear(); if (context) await context.close(); await this.releaseProfile(); return this.closed(); }); }
}

export function createZhihuBrowserRouter(discovery = new ZhihuDiscoveryService(), service = new ZhihuBrowserService(discovery)): Router {
  const router = Router();
  router.post('/open', async (request, response) => response.json(await service.open(request.body)));
  router.get('/frame', async (_request, response) => response.json(await service.frame()));
  router.post('/action', async (request, response) => response.json(await service.action(request.body)));
  router.post('/capture', async (request, response) => response.status(201).json(await service.capture(request.body)));
  router.post('/capture-candidate', async (request, response) => response.status(201).json(await service.captureCandidate(request.body?.candidateId)));
  router.post('/close', async (_request, response) => response.json(await service.close()));
  const errors: ErrorRequestHandler = (error: unknown, _request, response, next) => { if (!(error instanceof ZhihuBrowserError)) return next(error); response.status(error.status).json({ error: { code: error.code, message: error.message, status: error.status } }); };
  router.use(errors); return router;
}
