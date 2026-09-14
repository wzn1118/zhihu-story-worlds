// Fixed application code shared by extraction and the inert page's drag handles.
// Website text and metadata remain data; none of them is compiled as JavaScript.
export const ZHIHU_POST_DOM_HELPERS = String.raw`
  const postSelectors = '.AnswerItem, .ArticleItem, .Post-Main, .TopstoryItem .ContentItem, .TopstoryItem, .List-item .ContentItem';
  const allPostRoots = [...document.querySelectorAll(postSelectors)];
  const postRoots = allPostRoots.filter(root => !allPostRoots.some(child => child !== root && root.contains(child)));
  const source = value => {
    if (typeof value !== 'string' || !value) return null;
    try {
      const url = new URL(value, location.href);
      if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
      if ((url.hostname === 'www.zhihu.com' && /^\/question\/\d{5,24}\/answer\/\d{5,24}\/?$/.test(url.pathname)) || (url.hostname === 'zhuanlan.zhihu.com' && /^\/p\/\d{5,24}\/?$/.test(url.pathname))) return url.origin + url.pathname.replace(/\/$/, '');
    } catch {}
    return null;
  };
  const questionIdFrom = value => {
    if (typeof value !== 'string' || !value) return null;
    try {
      const url = new URL(value, location.href);
      if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hostname !== 'www.zhihu.com') return null;
      return url.pathname.match(/^\/question\/(\d{5,24})(?:\/answer\/\d{5,24})?\/?$/)?.[1] || null;
    } catch { return null; }
  };
  const decimalId = value => typeof value === 'string' && /^\d{5,24}$/.test(value) ? value : null;
  const postMetadata = root => {
    const raw = root.getAttribute('data-zop') || [...root.querySelectorAll('[data-zop]')].find(node => !node.closest('.RichText,.ztext,.Post-RichText'))?.getAttribute('data-zop') || '';
    let data = {};
    try { const parsed = JSON.parse(raw); if (parsed && typeof parsed === 'object') data = parsed; } catch {}
    return { raw, data };
  };
  const postSource = (root, metadata = postMetadata(root)) => {
    // Links quoted in an answer's prose identify another work, not this answer.
    const identityNodes = [...root.querySelectorAll('meta[itemprop="url"],a[href]')].filter(node => !node.closest('.RichText,.ztext,.Post-RichText'));
    const urls = [root.getAttribute('itemid'), ...identityNodes.map(node => node.getAttribute('content') || node.getAttribute('href'))].filter(Boolean);
    const directSources = urls.map(source).filter(Boolean);
    const isAnswer = root.matches('.AnswerItem') || metadata.data.type === 'answer';
    // JSON numbers can exceed Number.MAX_SAFE_INTEGER. Keep the original token.
    const answerId = isAnswer ? decimalId(metadata.raw.match(/"itemId"\s*:\s*"?(\d{5,24})"?(?=\s*[,}])/)?.[1]) || decimalId(root.getAttribute('data-answer-id')) : null;
    if (answerId) {
      const direct = directSources.find(value => value.endsWith('/answer/' + answerId));
      if (direct) return direct;
      // A footer link to a different answer does not supply this answer's
      // question identity either. Prefer its own plain question link or page.
      const questionId = urls.filter(value => !source(value)).map(questionIdFrom).find(Boolean) || questionIdFrom(location.href);
      if (questionId) return source('https://www.zhihu.com/question/' + questionId + '/answer/' + answerId);
      // An unrelated footer answer must not silently replace this answer's ID.
      return null;
    }
    if (directSources.length) return directSources[0];
    if (root.matches('.Post-Main')) return source(location.href);
    // A detail page can contain several answers. Its URL only identifies the
    // sole answer when no per-answer identity is available.
    if (root.matches('.AnswerItem') && postRoots.filter(node => node.matches('.AnswerItem')).length === 1) return source(location.href);
    return null;
  };
`;

const ZHIHU_POST_READ_HELPERS = String.raw`
  const text = (root, selector) => root.querySelector(selector)?.innerText ?? '';
  const visible = element => {
    for (let node = element; node instanceof Element; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (node.hasAttribute('hidden') || style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0') return false;
      // Full text in a zero-height clipped container is not currently visible.
      if (/^(?:hidden|clip)$/.test(style.overflowY) && node.clientHeight === 0 && node.scrollHeight > 0) return false;
    }
    const hasArea = node => [...node.getClientRects()].some(rect => rect.width > 0 && rect.height > 0);
    return hasArea(element) || [...element.children].some(hasArea);
  };
  const pageTitle = text(document, '.QuestionHeader-title, h1.Post-Title, h1') || document.title;
  const readUiSelector = '.ContentItem-more,.RichContent-more,.RichContent-expand,.RichContent-collapse,.RichContent-inner-more';
  const bodySelector = '.RichContent,.RichContent-inner,.Post-RichText,.RichContent-excerpt,.RichContent-summary,.ContentItem-excerpt';
  const readingControls = root => [...root.querySelectorAll('button,[role="button"],a[href],summary,[aria-expanded][aria-controls],' + readUiSelector)].filter(node => visible(node) && (!node.closest('.RichText,.ztext,.Post-RichText') || node.matches(readUiSelector)));
  const controlText = node => (node.innerText?.trim() || node.getAttribute('aria-label') || node.getAttribute('title') || '').replace(/[\s\u200b-\u200d\ufeff]/g, '').replace(/^[…⋯.]+|[>›»⌄∨↓↑…⋯.]+$/g, '');
  const expandLabel = label => /^(?:阅读全文|查看全文|阅读全部|继续阅读|展开(?:全文|全部(?:内容|文字|正文)?|回答(?:全文)?|正文|阅读全文)?|显示全部(?:内容|文字|正文)?|阅读完整(?:回答|文章|内容)|查看完整(?:回答|文章|内容))$/.test(label);
  const collapseLabel = label => /^(?:收起|收起全文|收起内容|收起正文|收起回答|折叠全文)$/.test(label);
  const controlsBody = (node, root) => node.matches(readUiSelector) || Boolean(node.closest(bodySelector)) || (node.getAttribute('aria-controls') || '').split(/\s+/).some(id => {
    const target = document.getElementById(id);
    return target && root.contains(target) && target.matches(bodySelector);
  });
  const readingBarrier = root => [...root.querySelectorAll('.RichContent-loginMask,.RichContent-loginRequired,.RichContent-paywall,.RichContent-Paywall,.KfeCollection-PaidReadMore,.PaidContent-readMore,.Paywall-mask')].some(visible) || readingControls(root).some(node => controlsBody(node, root) && /^(?:登录(?:后)?(?:继续|查看|阅读)|开通(?:盐选)?会员|立即开通(?:盐选)?会员|购买(?:本篇|全文|后阅读)|付费阅读|订阅后阅读|解锁全文|去App(?:查看|阅读)|在知乎App(?:查看|阅读))/.test(controlText(node)));
  const expandControl = root => readingBarrier(root) ? undefined : readingControls(root).find(node => node.getAttribute('aria-expanded') !== 'true' && controlsBody(node, root) && (expandLabel(controlText(node)) || (!controlText(node) && node.getAttribute('aria-expanded') === 'false')));
  const collapseControl = root => readingControls(root).find(node => collapseLabel(controlText(node)) && (controlsBody(node, root) || node.closest('.ContentItem-actions,.RichContent-actions')));
  const isLoading = root => (root.matches('[aria-busy="true"]') && visible(root)) || [...root.querySelectorAll('[aria-busy="true"],.LoadingBar,.LoadingSpinner,.RichContent-loading,.RichContent-inner--loading')].some(visible);
  const bodyTools = root => [...new Set([
    ...root.querySelectorAll('.ContentItem-more,.ContentItem-actions,.RichContent-actions,.RichContent-more,.RichContent-collapse'),
    ...readingControls(root).filter(node => expandLabel(controlText(node)) || collapseLabel(controlText(node))),
  ])].filter(node => !node.closest('.RichText,.ztext,.Post-RichText') || node.matches(readUiSelector));
  const bodyTextNode = root => {
    const belongsToBody = node => visible(node) && !node.closest('.AuthorInfo,.AuthorInfo-headline,.AuthorInfo-detail,.Profile,.ProfileHeader,.UserLink,.Popover,.Tooltip,[role="tooltip"]');
    // Selector unions are returned in DOM order, not selector priority. An
    // author's RichText headline often precedes the answer's real RichText.
    // Search only body containers first and never a descendant-wide RichText.
    for (const selector of ['.RichContent-inner', '.Post-RichText', '.RichContent .RichText', '.RichContent .ztext', '.RichContent-excerpt', '.RichContent-summary', '.ContentItem-excerpt']) {
      for (const container of root.querySelectorAll(selector)) {
        if (!belongsToBody(container)) continue;
        if (selector !== '.RichContent-inner') return container;
        const rich = [...container.querySelectorAll('.RichText,.ztext')].find(belongsToBody);
        if (!rich) return container;
        const tools = bodyTools(container), walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const node = walker.currentNode;
          // A RichText quote does not own paragraphs before or after it, nor
          // other sibling RichText blocks. Keep their complete body container.
          if (node.textContent.trim() && node.parentElement && belongsToBody(node.parentElement) && !rich.contains(node) && !tools.some(tool => tool.contains(node))) return container;
        }
        return rich;
      }
    }
    // Some answer detail renderers put the body directly on the AnswerItem.
    // Only direct children qualify, never text nested in an author/profile UI.
    return [...root.children].find(node => node.matches('.RichText,.ztext') && belongsToBody(node));
  };
  const bodyText = rich => {
    const tools = bodyTools(rich).filter(visible).map(node => ({ node, style: node.getAttribute('style') }));
    if (!tools.length) return rich.innerText;
    // Preserve Chromium's exact paragraph/whitespace rendering while omitting
    // only the site's non-prose tools. Restore synchronously before any paint;
    // no paragraph reconstruction or text-based deletion changes the source.
    try {
      for (const { node } of tools) node.style.setProperty('display', 'none', 'important');
      return rich.innerText;
    } finally {
      for (const { node, style } of tools) style === null ? node.removeAttribute('style') : node.setAttribute('style', style);
    }
  };
  const bodyIsCollapsed = (root, rich) => {
    if (readingBarrier(root) || expandControl(root)) return true;
    for (let node = rich; node && root.contains(node); node = node.parentElement) {
      if (node.matches('.RichContent-excerpt,.RichContent-summary,.ContentItem-excerpt') || [...node.classList].some(name => /^(?:is-(?:collapsed|folded)|(?:RichContent|RichContent-inner|AnswerItem|ArticleItem)--(?:collapsed|folded|excerpt|summary))$/i.test(name))) return true;
      if (node.getAttribute('aria-expanded') === 'false' && (node === root || node.matches(bodySelector))) return true;
      const style = getComputedStyle(node);
      if (/^(?:hidden|clip)$/.test(style.overflowY) && node.clientHeight > 0 && node.scrollHeight > node.clientHeight + 2) return true;
      if (node === root) break;
    }
    return false;
  };
  const readPost = root => {
    if (!visible(root)) return null;
    const rich = bodyTextNode(root);
    if (!rich) return null;
    const metadata = postMetadata(root);
    const sourceUrl = postSource(root, metadata);
    if (!sourceUrl) return null;
    const author = text(root, '.AuthorInfo-name, .UserLink-link, .Post-Author .AuthorInfo-name, .AnonymousAuthor') || (typeof metadata.data.authorName === 'string' ? metadata.data.authorName : '') || '作者未显示';
    const title = text(root, '.ContentItem-title') || (typeof metadata.data.title === 'string' ? metadata.data.title : '') || pageTitle;
    const content = rich.closest('.RichContent');
    const collapsed = bodyIsCollapsed(root, rich);
    const directDetailBody = root.matches('.AnswerItem') && source(location.href) === sourceUrl && rich.parentElement === root && rich.matches('.RichText,.ztext');
    const visibleScope = !collapsed && !isLoading(root) && (root.matches('.Post-Main') || Boolean(content && rich.closest('.RichContent-inner')) || directDetailBody) ? 'expanded' : 'excerpt';
    return { title, author, sourceUrl, text: bodyText(rich), visibleScope, collapsed };
  };
`;

export const ZHIHU_READABLE_POSTS_SCRIPT = String.raw`(() => {
  ${ZHIHU_POST_DOM_HELPERS}
  ${ZHIHU_POST_READ_HELPERS}
  return postRoots.map(readPost).filter(Boolean);
})()`;

// Resolve by the selected answer's canonical identity. Neither a neighbouring
// card nor a hyperlink quoted inside its prose can become the selected work.
const ZHIHU_CAPTURE_TARGET_HELPERS = String.raw`
  ${ZHIHU_POST_DOM_HELPERS}
  ${ZHIHU_POST_READ_HELPERS}
  const matches = postRoots.filter(root => visible(root) && postSource(root) === selected.sourceUrl);
  const root = matches.find(node => node.getAttribute('data-redleaf-post') === selected.postId) || matches[0];
`;
export const ZHIHU_CAPTURE_POST_SCRIPT = String.raw`selected => {
  ${ZHIHU_CAPTURE_TARGET_HELPERS}
  if (!root) return null;
  return {
    post: readPost(root),
    loading: isLoading(root),
    hasCollapseControl: Boolean(collapseControl(root)),
  };
}`;
export const ZHIHU_EXPAND_POST_CONTROL_SCRIPT = String.raw`selected => {
  ${ZHIHU_CAPTURE_TARGET_HELPERS}
  return root ? expandControl(root) || null : null;
}`;
