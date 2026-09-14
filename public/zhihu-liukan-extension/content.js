(function () {
  'use strict';
  const PET_ID = 'redleaf-liukan-pet';
  const answerSelector = '.AnswerItem, .Post-Main, .ArticleItem, .TopstoryItem .ContentItem, .List-item, [data-za-detail-view-path^="/answer/"], [data-za-detail-view-path^="/article/"]';
  const touchFallback = matchMedia('(hover:none), (pointer:coarse)').matches;
  const textOf = (root, selector) => root.querySelector(selector)?.innerText?.trim() || '';
  const sourceOf = root => {
    const link = root.querySelector('a[href*="/answer/"], a[href*="zhuanlan.zhihu.com/p/"]');
    return link ? new URL(link.href, location.href).toString().replace(/\/$/, '') : location.href;
  };
  const payloadOf = root => ({
    kind: 'extension', sourceUrl: sourceOf(root), title: textOf(root, '.ContentItem-title') || document.querySelector('h1')?.innerText?.trim() || document.title,
    author: textOf(root, '.AuthorInfo-name, .UserLink-link, .Post-Author .AuthorInfo-name'),
    text: textOf(root, '.RichContent-inner .RichText, .RichContent-inner, .Post-RichText')
  });
  const payloadCache = new WeakMap();
  const payloadCached = root => { let payload = payloadCache.get(root); if (!payload) { payload = payloadOf(root); payloadCache.set(root, payload); } return payload; };
  function deliver(payload) {
    return chrome.runtime.sendMessage({ type: 'redleaf:learn-zhihu-selection', payload }).then(result => {
      if (!result?.ok) throw new Error('local-workbench-unavailable'); return result;
    });
  }
  function send(root, button) {
    const payload = payloadOf(root);
    if (!payload.text || payload.text.length > 120000) return;
    button.disabled = true; button.textContent = '正在交给看山';
    deliver(payload).then(() => { button.dataset.done = 'true'; button.textContent = '已交给看山'; }).catch(() => { button.textContent = '请打开赤页工作台'; }).finally(() => { setTimeout(() => { button.disabled = false; button.dataset.done = ''; button.textContent = '交给看山'; }, 1800); });
  }
  function decorate(roots) {
    roots.forEach(root => {
      if (root.parentElement?.closest(answerSelector) || !root.querySelector('.RichContent-inner, .Post-RichText, .RichText, article, [data-za-detail-view-path]')) return;
      root.style.position = root.style.position || 'relative';
      if (!touchFallback || root.querySelector(':scope > .redleaf-liukan-feed')) return;
      const button = document.createElement('button'); button.className = 'redleaf-liukan-feed'; button.type = 'button'; button.textContent = '交给看山';
      button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); send(root, button); }); root.append(button);
    });
  }
  document.addEventListener('dragstart', event => {
    const root = event.target instanceof Element ? event.target.closest(answerSelector) : null;
    if (!root) return;
    const payload = payloadCached(root);
    if (!payload.text) return;
    event.dataTransfer?.setData('application/x-redleaf-zhihu', JSON.stringify(payload));
    event.dataTransfer?.setData('text/plain', payload.text.slice(0, 2000));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
  }, true);
  document.addEventListener('pointerdown', event => {
    const root = event.target instanceof Element ? event.target.closest(answerSelector) : null;
    if (root) activate(root);
  }, true);
  const pet = document.createElement('button'); pet.id = PET_ID; pet.type = 'button'; pet.title = '看山：交给当前回答'; pet.textContent = '🦊';
  pet.addEventListener('click', () => { const root = document.querySelector(answerSelector); if (root) send(root, pet); }); document.documentElement.append(pet);
  pet.addEventListener('dragover', event => { if (event.dataTransfer?.types.includes('application/x-redleaf-zhihu')) { event.preventDefault(); pet.dataset.drop = 'true'; event.dataTransfer.dropEffect = 'copy'; } });
  pet.addEventListener('dragleave', () => { pet.dataset.drop = ''; });
  pet.addEventListener('drop', event => {
    event.preventDefault(); pet.dataset.drop = '';
    try { const payload = JSON.parse(event.dataTransfer?.getData('application/x-redleaf-zhihu') || ''); if (!payload?.text) return; deliver(payload).then(() => { pet.textContent = '✓'; setTimeout(() => { pet.textContent = '🦊'; }, 1300); }).catch(() => { pet.textContent = '!'; setTimeout(() => { pet.textContent = '🦊'; }, 1300); }); } catch { /* Ignore foreign drag data. */ }
  });
  const queued = new Set(); let scheduled = false; const observed = new WeakSet();
  function activate(root) {
    if (!(root instanceof HTMLElement) || root.dataset.redleafDrag === 'true') return;
    root.dataset.redleafDrag = 'true'; root.draggable = true;
  }
  function queue(root) {
    queued.add(root);
    if (scheduled) return; scheduled = true;
    const run = () => { scheduled = false; const roots = [...queued]; queued.clear(); decorate(roots); };
    if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 180 }); else requestAnimationFrame(run);
  }
  function enqueue(node) {
    if (!(node instanceof Element)) return;
    const observe = root => { if (!(root instanceof Element) || observed.has(root)) return; observed.add(root); activate(root); queue(root); };
    if (node.matches(answerSelector)) observe(node);
    node.querySelectorAll(answerSelector).forEach(observe);
  }
  new MutationObserver(records => {
    for (const record of records) {
      record.removedNodes.forEach(node => { if (node instanceof Element) queued.delete(node); });
      record.addedNodes.forEach(enqueue);
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
  enqueue(document.documentElement);
})();
