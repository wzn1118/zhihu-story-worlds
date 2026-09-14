import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Router, type ErrorRequestHandler } from 'express';
import { chromium, type BrowserContext, type Page } from 'playwright';
import type { ZhihuBrowserAction, ZhihuBrowserCapture, ZhihuBrowserChannel, ZhihuBrowserFrame, ZhihuBrowserOpen } from '../shared/zhihu-browser.ts';
import { canonicalZhihuSource, type ZhihuCandidate } from '../shared/zhihu-discovery.ts';
import { ZhihuDiscoveryService } from './zhihu-discovery.ts';
import { createZhihuPageDocument } from './zhihu-page-document.ts';

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
interface ReadablePost { title: string; author: string; sourceUrl: string; text: string; visibleScope?: 'excerpt' | 'expanded' }
// This is fixed application code. Page text is only read from DOM properties;
// it is never interpolated back into an executable expression.
export const ZHIHU_READABLE_POSTS_SCRIPT = `(() => {
  const text = (root, selector) => root.querySelector(selector)?.innerText ?? '';
  const visible = element => { const style = getComputedStyle(element); return style.display !== 'none' && style.visibility !== 'hidden' && (element.getClientRects().length > 0 || [...element.children].some(child => child.getClientRects().length > 0)); };
  const source = value => {
    try {
      const url = new URL(value, location.href);
      if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
      if ((url.hostname === 'www.zhihu.com' && /^\\/question\\/\\d{5,24}\\/answer\\/\\d{5,24}\\/?$/.test(url.pathname)) || (url.hostname === 'zhuanlan.zhihu.com' && /^\\/p\\/\\d{5,24}\\/?$/.test(url.pathname))) return url.origin + url.pathname.replace(/\\/$/, '');
    } catch {}
    return null;
  };
  const result = [], seenRich = new Set();
  const pageTitle = text(document, '.QuestionHeader-title, h1.Post-Title, h1');
  const roots = [...document.querySelectorAll('.AnswerItem, .ArticleItem, .Post-Main, .TopstoryItem .ContentItem, .TopstoryItem, .List-item .ContentItem')].filter(visible);
  for (const root of roots) {
    const rich = [...root.querySelectorAll('.RichContent-inner .RichText, .RichContent-inner .ztext, .Post-RichText, .RichText.ztext'), ...root.querySelectorAll('.RichContent-inner')]
      .find(element => element.getClientRects().length > 0 && getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden');
    if (!rich || seenRich.has(rich)) continue;
    // Question metadata frequently precedes the answer URL on homepage cards.
    // Inspect every candidate and accept only an actual answer/article identity.
    const urls = [...root.querySelectorAll('meta[itemprop="url"]')].map(node => node.getAttribute('content'));
    urls.push(...[...root.querySelectorAll('a[href*="/answer/"], a[href*="zhuanlan.zhihu.com/p/"]')].map(node => node.href));
    if (root.matches('.Post-Main, .AnswerItem')) urls.push(location.href);
    let sourceUrl = urls.map(source).find(Boolean);
    let metadata = {};
    const zop = root.getAttribute('data-zop') || root.querySelector('[data-zop]')?.getAttribute('data-zop');
    try { metadata = zop ? JSON.parse(zop) : {}; } catch {}
    if (!sourceUrl && metadata.type === 'answer') {
      const questionLink = [...root.querySelectorAll('a[href], meta[itemprop="url"]')].map(node => node.href || node.getAttribute('content')).find(value => /\\/question\\/\\d{5,24}\\/?(?:[?#]|$)/.test(value || ''));
      const questionId = questionLink?.match(/\\/question\\/(\\d{5,24})/)?.[1];
      // Read decimal IDs from the original JSON token to preserve large IDs.
      const answerId = zop?.match(/"itemId"\\s*:\\s*"?(\\d{5,24})"?(?=\\s*[,}])/)?.[1];
      if (questionId && answerId) sourceUrl = source('https://www.zhihu.com/question/' + questionId + '/answer/' + answerId);
    }
    if (!sourceUrl) continue;
    const author = text(root, '.AuthorInfo-name, .UserLink-link, .Post-Author .AuthorInfo-name') || (typeof metadata.authorName === 'string' ? metadata.authorName : '');
    const title = text(root, '.ContentItem-title') || (typeof metadata.title === 'string' ? metadata.title : '') || pageTitle;
    const content = rich.closest('.RichContent');
    const collapsed = content?.classList.contains('is-collapsed') || Boolean(content?.querySelector('.ContentItem-more'));
    const visibleScope = !collapsed && (root.matches('.Post-Main') || Boolean(content && rich.closest('.RichContent-inner'))) ? 'expanded' : 'excerpt';
    result.push({ title, author, sourceUrl, text: rich.innerText, visibleScope });
    seenRich.add(rich);
  }
  return result;
})()`;
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

export class ZhihuBrowserService {
  private context?: BrowserContext;
  private page?: Page;
  private queue: Promise<unknown> = Promise.resolve();
  private pendingFrame?: Promise<ZhihuBrowserFrame>;
  private latest?: ZhihuBrowserFrame;
  private posts = new Map<string, ReadablePost>();
  private channel?: ZhihuBrowserChannel;
  private httpStatus?: number;
  private notice?: string;
  private ownerToken?: string;
  private releasingProfile?: Promise<void>;
  private documents = new Map<string, Set<string>>();
  private capturedPosts = new Map<string, ReadablePost>();
  private readonly profile: string;
  constructor(private readonly discovery = new ZhihuDiscoveryService(), profile = resolve('.local/zhihu-browser')) { this.profile = resolve(profile); }
  private serialize<T>(task: () => Promise<T>): Promise<T> { const next = this.queue.catch(() => undefined).then(task); this.queue = next; return next; }
  private closed(): ZhihuBrowserFrame { return { status: 'closed', frameId: '', url: '', title: '', width: 1100, height: 720, posts: [], capturedAt: new Date().toISOString() }; }
  private async claimProfile() {
    await mkdir(this.profile, { recursive: true });
    const path = join(this.profile, 'redleaf-owner.json'), token = randomUUID();
    for (let attempt = 0; attempt < 2; attempt++) {
      try { await writeFile(path, JSON.stringify({ pid: process.pid, token }), { flag: 'wx' }); this.ownerToken = token; return; }
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
    const width = options.width ?? 1100, height = options.height ?? 720, channel = options.channel ?? 'msedge';
    if (![width, height].every(Number.isInteger) || width < 390 || width > 1600 || height < 500 || height > 1200 || !channels.has(channel)) throw new ZhihuBrowserError('INVALID_BROWSER_OPTIONS', '浏览窗口尺寸或浏览器类型有误。');
    if (!this.context) {
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
        this.channel = channel;
        this.page = this.context.pages()[0] ?? await this.context.newPage();
        const primary = this.page;
        for (const extra of this.context.pages()) if (extra !== primary) await extra.close();
        this.context.on('page', popup => { if (popup !== primary) void popup.close().catch(() => undefined); });
        await this.context.route('**/*', async route => {
          const request = route.request();
          if (request.isNavigationRequest() && request.frame() === primary.mainFrame()) {
            try { zhihuBrowserUrl(request.url()); } catch { this.notice = '这个链接指向知乎之外，已留在当前窗口。'; await route.abort('blockedbyclient'); return; }
          }
          await route.continue();
        });
        this.page.on('dialog', dialog => void dialog.dismiss().catch(() => undefined));
        this.page.on('response', response => { if (response.request().isNavigationRequest() && response.frame() === primary.mainFrame()) this.httpStatus = response.status(); });
        this.context.on('close', () => { this.context = undefined; this.page = undefined; this.latest = undefined; this.posts.clear(); void this.releaseProfile(); });
      } catch {
        const failedContext = this.context;
        this.context = undefined; this.page = undefined;
        if (failedContext) await failedContext.close().catch(() => undefined);
        await this.releaseProfile();
        throw new ZhihuBrowserError('BROWSER_START_FAILED', `本机 ${channel} 浏览器没有启动成功，请检查浏览器安装与独立配置目录。`, 503);
      }
      await this.navigate(url);
    } else {
      if (channel !== this.channel && options.channel !== undefined) throw new ZhihuBrowserError('BROWSER_CHANNEL_CHANGED', '先关闭当前知乎窗口，再选择另一个浏览器。', 409);
      await this.page!.setViewportSize({ width, height });
      if (options.url) await this.navigate(url);
    }
    return this.snapshot();
  }); }
  frame(): Promise<ZhihuBrowserFrame> {
    // Reading the displayed document must not replace its live control IDs.
    // Navigation and explicit actions publish the next document; login frames
    // keep polling the real surface until the user finishes authentication.
    if (this.latest?.document && this.latest.posts.length) return this.serialize(async () => this.latest ?? this.closed());
    // Several UI readers share the same capture instead of queuing renderer work.
    if (this.pendingFrame) return this.pendingFrame;
    const pending = this.serialize(async () => this.page ? this.snapshot() : this.closed());
    this.pendingFrame = pending;
    void pending.finally(() => { if (this.pendingFrame === pending) this.pendingFrame = undefined; }).catch(() => undefined);
    return pending;
  }
  private requirePage(): Page { if (!this.page || this.page.isClosed()) throw new ZhihuBrowserError('BROWSER_CLOSED', '请先打开游戏内的知乎窗口。', 409); return this.page; }
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
  action(action: ZhihuBrowserAction): Promise<ZhihuBrowserFrame> { return this.serialize(async () => {
    const page = this.requirePage();
    if (!action || typeof action !== 'object') throw new ZhihuBrowserError('INVALID_BROWSER_ACTION', '浏览操作不完整。');
    if (action.kind === 'navigate') await this.navigate(zhihuBrowserUrl(action.url));
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
        if (info.href?.startsWith('http')) await this.navigate(zhihuBrowserUrl(info.href));
        else await control.click({ timeout: 5000 });
        if (!info.href?.startsWith('http')) {
          await page.waitForFunction(({ before }) => location.href !== before || Boolean(document.querySelector('.AnswerItem,.Post-Main,.QuestionHeader,.HotList-list .HotItem,.TopstoryItem')), { before: beforeUrl }, { timeout: 8000, polling: 120 }).catch(() => undefined);
          await page.waitForTimeout(320);
        }
      } else throw new ZhihuBrowserError('INVALID_BROWSER_ACTION', '这个浏览操作暂时未开放。');
      await page.waitForTimeout(400);
    } else if (action.kind === 'back' || action.kind === 'reload') {
      this.notice = undefined;
      try { if (action.kind === 'back') await page.goBack({ waitUntil: 'commit', timeout: 15000 }); else await page.reload({ waitUntil: 'commit', timeout: 15000 }); } catch { this.notice = '页面暂时没有完整加载，已保留当前画面。'; }
    } else if (action.kind === 'click') {
      if (action.frameId !== this.latest?.frameId) throw new ZhihuBrowserError('STALE_BROWSER_FRAME', '网页画面已经更新，请在新画面上点击。', 409);
      const viewport = page.viewportSize()!;
      if (![action.x, action.y].every(Number.isFinite) || action.x < 0 || action.y < 0 || action.x >= viewport.width || action.y >= viewport.height) throw new ZhihuBrowserError('INVALID_CLICK', '点击位置超出了知乎窗口。');
      const link = await page.evaluate(({ x, y }) => { const anchor = document.elementFromPoint(x, y)?.closest('a'); return anchor?.href ? { href: anchor.href, newTab: anchor.target === '_blank' } : null; }, { x: action.x, y: action.y });
      if (link && /^https?:/i.test(link.href)) { const url = zhihuBrowserUrl(link.href); if (link.newTab) await this.navigate(url); else await page.mouse.click(action.x, action.y); }
      else await page.mouse.click(action.x, action.y);
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
    await page.waitForTimeout(220);
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
    const blocked = isZhihuBlockedPage(this.httpStatus, body, await page.locator('.ContentItem,.Post-Main,.QuestionHeader').count());
    const readable = blocked ? [] : await this.extract();
    this.posts = new Map(readable.map(post => [postHash(post), post]));
    const url = page.url(), title = await page.title().catch(() => '知乎');
    const login = !blocked && (/\/signin/.test(url) || (await page.locator('.SignFlow, .SignFlowModal').count()) > 0);
    const postRows = readable.map(post => ({ id: postHash(post), title: post.title, author: post.author, sourceUrl: post.sourceUrl, excerpt: post.text.slice(0, 240), characters: post.text.length, visibleScope: post.visibleScope }));
    const document = !blocked && !login ? await createZhihuPageDocument(page, postRows) : undefined;
    const screenshot = document ? undefined : await this.captureViewport(page);
    const frame: ZhihuBrowserFrame = { status: blocked ? 'blocked' : login ? 'login-required' : this.notice ? 'error' : 'ready', frameId: randomUUID(), url, title, ...viewport, ...(screenshot ? { screenshot: `data:image/png;base64,${screenshot}` } : {}), document, posts: postRows, channel: this.channel, httpStatus: this.httpStatus, capturedAt: new Date().toISOString(), ...(this.notice ? { message: this.notice } : blocked ? { message: '知乎当前显示访问限制，画面来自真实页面；可以在这里处理页面验证，或使用明确标注的官方接口阅读。' } : login ? { message: '知乎需要登录，直接在这块真实页面里操作即可。' } : {}) };
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
  capture(request: ZhihuBrowserCapture): Promise<ZhihuCandidate> { return this.serialize(async () => {
    this.requirePage();
    if (!request || !this.documents.get(request.frameId)?.has(request.postId) || typeof request.postId !== 'string') throw new ZhihuBrowserError('STALE_BROWSER_POST', '页面已经变化，请重新拖动现在看到的帖子。', 409);
    const post = this.capturedPosts.get(request.postId);
    // The opaque ID is bound to the exact server snapshot the user selected.
    // A recommendation refresh or expanding another answer must not invalidate it.
    if (!post) throw new ZhihuBrowserError('POST_CHANGED', '这篇正文的阅读记录已过期，请重新选择。', 409);
    return this.discovery.capturePage(post);
  }); }
  close(): Promise<ZhihuBrowserFrame> { return this.serialize(async () => { const context = this.context; this.context = undefined; this.page = undefined; this.latest = undefined; this.posts.clear(); this.documents.clear(); this.capturedPosts.clear(); if (context) await context.close(); await this.releaseProfile(); return this.closed(); }); }
}

export function createZhihuBrowserRouter(discovery = new ZhihuDiscoveryService(), service = new ZhihuBrowserService(discovery)): Router {
  const router = Router();
  router.post('/open', async (request, response) => response.json(await service.open(request.body)));
  router.get('/frame', async (_request, response) => response.json(await service.frame()));
  router.post('/action', async (request, response) => response.json(await service.action(request.body)));
  router.post('/capture', async (request, response) => response.status(201).json(await service.capture(request.body)));
  router.post('/close', async (_request, response) => response.json(await service.close()));
  const errors: ErrorRequestHandler = (error: unknown, _request, response, next) => { if (!(error instanceof ZhihuBrowserError)) return next(error); response.status(error.status).json({ error: { code: error.code, message: error.message, status: error.status } }); };
  router.use(errors); return router;
}
