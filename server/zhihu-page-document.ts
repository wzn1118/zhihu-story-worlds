import { randomUUID } from 'node:crypto';
import type { Page } from 'playwright';
import type { ZhihuBrowserPost } from '../shared/zhihu-browser.ts';
import type { ZhihuPageDocument } from '../shared/zhihu-page-document.ts';

// Application-owned code reads the current page. Source text is passed as data;
// the returned document has no scripts and does not inherit the website session.
const DOCUMENT_SCRIPT = String.raw`async ({ id, posts }) => {
  const controlAttribute = 'data-redleaf-control', postAttribute = 'data-redleaf-post';
  const safeAsset = (value, base = location.href) => {
    if (!value) return null;
    if (/^#[A-Za-z_][\w:.-]*$/.test(value)) return value;
    if (/^data:image\/(?:png|jpeg|jpg|webp|gif|avif);base64,[a-z\d+/=\s]+$/i.test(value)) return value;
    if (/^data:(?:font\/(?:woff2?|ttf|otf)|application\/(?:font-woff|x-font-ttf));base64,[a-z\d+/=\s]+$/i.test(value)) return value;
    try {
      const url = new URL(value, base);
      if (url.protocol !== 'https:' || url.username || url.password || url.port || !/(^|\.)(zhihu\.com|zhimg\.com)$/.test(url.hostname)) return null;
      if ([...url.searchParams.keys()].some(key => /^(?:access[_-]?token|refresh[_-]?token|authorization|password|secret|csrf|xsrf|session|cookie)$/i.test(key))) return null;
      return url.href;
    } catch { return null; }
  };
  const source = value => {
    try {
      const url = new URL(value, location.href);
      if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
      if ((url.hostname === 'www.zhihu.com' && /^\/question\/\d{5,24}\/answer\/\d{5,24}\/?$/.test(url.pathname)) || (url.hostname === 'zhuanlan.zhihu.com' && /^\/p\/\d{5,24}\/?$/.test(url.pathname))) return url.origin + url.pathname.replace(/\/$/, '');
    } catch {}
    return null;
  };
  const css = (value, base) => value
    .replace(/@import\s+(?:url\(\s*)?(?:"[^"]*"|'[^']*'|[^;\s)]+)\s*\)?[^;]*;/gi, '')
    .replace(/(?:-moz-binding|behavior)\s*:[^;}]+[;}]?/gi, '')
    .replace(/expression\s*\([^)]*\)/gi, '')
    .replace(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi, (_all, a, b, c) => {
      const url = safeAsset((a ?? b ?? c ?? '').trim(), base);
      return url ? 'url("' + url.replace(/"/g, '%22').replace(/\\/g, '%5C') + '")' : 'url("")';
    }).replace(/</g, '\\3c ');
  const liveRoot = document.documentElement;
  const clonedRoot = liveRoot.cloneNode(true);
  const live = [liveRoot, ...liveRoot.querySelectorAll('*')];
  const cloned = [clonedRoot, ...clonedRoot.querySelectorAll('*')];
  const twins = new Map(live.map((node, index) => [node, cloned[index]]));
  const originals = new Map(cloned.map((node, index) => [node, live[index]]));
  for (const node of live) {
    node.removeAttribute(controlAttribute);
    node.removeAttribute(postAttribute);
  }
  let control = 0;
  const controls = 'a[href],button,input:not([type="hidden"]),textarea,select,summary,label[for],[role="button"],[role="tab"],[role="link"],[tabindex],[contenteditable="true"],.ContentItem-more';
  for (const node of live) {
    const copy = twins.get(node);
    for (const attribute of [...copy.attributes]) if (attribute.name.startsWith('data-redleaf-')) copy.removeAttribute(attribute.name);
    if (node.matches(controls)) {
      const token = id + '-' + (++control);
      node.setAttribute(controlAttribute, token);
      copy.setAttribute(controlAttribute, token);
    }
  }
  const postsBySource = new Map(posts.map(post => [source(post.sourceUrl), post]));
  for (const node of liveRoot.querySelectorAll('.AnswerItem, .ArticleItem, .Post-Main, .TopstoryItem .ContentItem, .TopstoryItem, .List-item .ContentItem')) {
    if (node.querySelector('.AnswerItem,.ArticleItem,.Post-Main,.ContentItem')) continue;
    const urls = [...node.querySelectorAll('meta[itemprop="url"]')].map(item => item.getAttribute('content'));
    urls.push(...[...node.querySelectorAll('a[href*="/answer/"], a[href*="zhuanlan.zhihu.com/p/"]')].map(item => item.href));
    if (node.matches('.Post-Main, .AnswerItem')) urls.push(location.href);
    let identity = urls.map(source).find(Boolean);
    const zop = node.getAttribute('data-zop') || node.querySelector('[data-zop]')?.getAttribute('data-zop');
    if (!identity && /"type"\s*:\s*"answer"/.test(zop || '')) {
      const questionId = [...node.querySelectorAll('a[href],meta[itemprop="url"]')].map(item => item.href || item.getAttribute('content')).map(value => value?.match(/\/question\/(\d{5,24})\/?(?:[?#]|$)/)?.[1]).find(Boolean);
      const answerId = zop?.match(/"itemId"\s*:\s*"?(\d{5,24})"?(?=\s*[,}])/)?.[1];
      if (questionId && answerId) identity = source('https://www.zhihu.com/question/' + questionId + '/answer/' + answerId);
    }
    const post = postsBySource.get(identity);
    if (post) {
      node.setAttribute(postAttribute, post.id);
      twins.get(node).setAttribute(postAttribute, post.id);
    }
  }
  const styles = [];
  const sheets = [...document.styleSheets, ...(document.adoptedStyleSheets || [])];
  for (const sheet of sheets) {
    try {
      const value = [...sheet.cssRules].map(rule => rule.cssText).join('\n');
      styles.push({ owner: sheet.ownerNode, text: css(value, sheet.href || location.href), media: sheet.media?.mediaText || '' });
    } catch { /* Cross-origin sheets remain ordinary, allowlisted CSS links. */ }
  }
  clonedRoot.querySelectorAll('script,iframe,frame,frameset,object,embed,applet,base,meta,noscript,template,input[type="hidden"],[hidden],animate,animateMotion,animateTransform,set').forEach(node => node.remove());
  const secretName = /(?:^|[-_:])(?:csrf|xsrf|token|secret|password|authorization|cookie|session)(?:$|[-_:])/i;
  for (const node of [clonedRoot, ...clonedRoot.querySelectorAll('*')]) {
    const original = originals.get(node);
    for (const attribute of [...node.attributes]) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith('on') || ['srcdoc', 'nonce', 'integrity', 'autofocus', 'action', 'formaction', 'method', 'formmethod', 'formenctype', 'formtarget', 'target', 'ping', 'download', 'is'].includes(name) || secretName.test(name) || (name.startsWith('data-') && !['data-redleaf-control', 'data-redleaf-post', 'data-theme', 'data-theme-mode', 'data-tooltip'].includes(name))) node.removeAttribute(attribute.name);
    }
    if (node.matches('input,textarea,select')) {
      node.removeAttribute('value');
      node.removeAttribute('checked');
      if (node.matches('textarea')) node.textContent = '';
      if (node.matches('select')) node.querySelectorAll('option').forEach(option => option.removeAttribute('selected'));
      if (node.matches('input')) node.setAttribute('autocomplete', 'off');
    }
    if (node.matches('button')) node.setAttribute('type', 'button');
    if (node.hasAttribute('contenteditable')) node.setAttribute('contenteditable', 'false');
    if (node.hasAttribute('style')) node.setAttribute('style', css(node.getAttribute('style') || '', location.href));
    if (node.matches('img')) {
      const selected = safeAsset(original?.currentSrc || original?.getAttribute('data-original') || original?.getAttribute('data-actualsrc') || original?.getAttribute('data-src') || original?.getAttribute('src'));
      node.removeAttribute('srcset');
      node.removeAttribute('sizes');
      node.removeAttribute('loading');
      if (selected) node.setAttribute('src', selected); else node.removeAttribute('src');
      node.setAttribute('referrerpolicy', 'no-referrer');
      node.setAttribute('draggable', 'false');
    } else if (node.hasAttribute('src')) {
      const url = safeAsset(node.getAttribute('src'));
      if (url) node.setAttribute('src', url); else node.removeAttribute('src');
    }
    if (node.hasAttribute('srcset')) node.removeAttribute('srcset');
    for (const attribute of ['href', 'xlink:href', 'poster', 'background']) {
      if (!node.hasAttribute(attribute)) continue;
      const url = safeAsset(node.getAttribute(attribute));
      if (url) node.setAttribute(attribute, url); else node.removeAttribute(attribute);
    }
    if (node.matches('a')) { node.setAttribute('rel', 'noreferrer noopener'); node.setAttribute('draggable', 'false'); }
    if (node.matches('link') && (node.getAttribute('rel')?.toLowerCase() !== 'stylesheet' || !node.hasAttribute('href'))) node.remove();
    if (node.matches('style')) node.textContent = css(node.textContent || '', location.href);
    if (node.matches('video,audio')) { node.removeAttribute('autoplay'); node.setAttribute('preload', 'none'); }
  }
  const comments = document.createTreeWalker(clonedRoot, NodeFilter.SHOW_COMMENT);
  const removedComments = [];
  while (comments.nextNode()) removedComments.push(comments.currentNode);
  removedComments.forEach(node => node.remove());
  let head = clonedRoot.querySelector('head');
  if (!head) { head = document.createElement('head'); clonedRoot.prepend(head); }
  for (const sheet of styles) {
    const style = document.createElement('style');
    style.textContent = sheet.text;
    if (sheet.media) style.media = sheet.media;
    const old = sheet.owner && twins.get(sheet.owner);
    if (old?.isConnected || old?.parentNode) old.replaceWith(style); else head.append(style);
  }
  const csp = document.createElement('meta');
  csp.httpEquiv = 'Content-Security-Policy';
  csp.content = "default-src 'none'; script-src 'none'; style-src 'unsafe-inline' https://*.zhimg.com https://*.zhihu.com; img-src data: https://*.zhimg.com https://*.zhihu.com; font-src data: https://*.zhimg.com https://*.zhihu.com; media-src https://*.zhimg.com https://*.zhihu.com; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'";
  const charset = document.createElement('meta'); charset.setAttribute('charset', 'utf-8');
  const referrer = document.createElement('meta'); referrer.name = 'referrer'; referrer.content = 'no-referrer';
  head.prepend(charset, csp, referrer);
  const selection = document.createElement('style');
  selection.textContent = '[data-redleaf-post] .RichText,[data-redleaf-post] .ztext{user-select:text!important;-webkit-user-select:text!important}::selection{background:#b5d9ff;color:inherit}html{scroll-behavior:auto!important}';
  head.append(selection);
  // React can put a styled div (for example an @mention) inside a paragraph.
  // HTML parsing would close that paragraph and its RichText ancestors early.
  // Keep its computed display while using a phrasing tag for the transport.
  for (const node of clonedRoot.querySelectorAll('p div,p section,p article,p aside,p header,p footer,p h1,p h2,p h3,p blockquote')) {
    const inline = document.createElement('span');
    for (const attribute of [...node.attributes]) inline.setAttribute(attribute.name, attribute.value);
    const original = originals.get(node);
    if (original) inline.style.display = getComputedStyle(original).display;
    inline.append(...node.childNodes); node.replaceWith(inline);
  }
  return { id, html: '<!doctype html>\n' + clonedRoot.outerHTML, scrollY, width: innerWidth, height: innerHeight };
}`;

export async function createZhihuPageDocument(page: Page, posts: ZhihuBrowserPost[]): Promise<ZhihuPageDocument> {
  // Compile only the fixed application function, so tsx's function-name helpers
  // never leak into Playwright's isolated page. Post/source data stays an argument.
  const render = new Function('return (' + DOCUMENT_SCRIPT + ')')() as (input: { id: string; posts: ZhihuBrowserPost[] }) => Promise<ZhihuPageDocument>;
  return page.evaluate(render, { id: randomUUID(), posts });
}
