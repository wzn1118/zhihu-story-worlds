import { useEffect, useRef, useState } from 'react';
import type { ZhihuBrowserAction, ZhihuBrowserFrame } from '../shared/zhihu-browser';
import { ZHIHU_BROWSER_POST_MIME } from '../shared/zhihu-browser';
import './ZhihuLivePage.css';

const readingPositions = new Map<string, { scrollY: number; postId: string }>();

export function ZhihuLivePage({ frame, busy, active = true, onAction, onFeed }: { frame: ZhihuBrowserFrame; busy: boolean; active?: boolean; onAction: (action: ZhihuBrowserAction) => Promise<void>; onFeed: (postId: string) => void }) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const savedScroll = useRef<number | null>(readingPositions.get(frame.url)?.scrollY ?? null);
  const currentUrl = useRef(frame.url);
  const [selected, setSelected] = useState(readingPositions.get(frame.url)?.postId ?? '');
  const [ready, setReady] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [dragPreview, setDragPreview] = useState<{ x: number; y: number; title: string } | null>(null);
  const loadMoreRequested = useRef<string | null>(null);
  const previewElement = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onAction, onFeed, busy, frame }); callbacks.current = { onAction, onFeed, busy, frame };
  const cleanup = useRef<() => void>(() => {});
  const connectedDocument = useRef<Document | null>(null);
  const post = frame.posts.find(item => item.id === selected);
  const isQuestion = /^https:\/\/(?:www\.)?zhihu\.com\/question\/\d+(?:\/|[?#]|$)/.test(frame.url);
  const loadingMorePending = useRef(false);
  const requestMore = async () => {
    if (loadingMorePending.current || callbacks.current.busy) return;
    loadingMorePending.current = true; setLoadingMore(true);
    try { await callbacks.current.onAction({ kind: 'load-more' }); }
    finally { loadingMorePending.current = false; setLoadingMore(false); }
  };
  useEffect(() => () => cleanup.current(), []);
  useEffect(() => {
    if (!active) return;
    const restore = requestAnimationFrame(() => iframe.current?.contentWindow?.scrollTo(0, savedScroll.current ?? frame.document?.scrollY ?? 0));
    return () => cancelAnimationFrame(restore);
  }, [active]);
  useEffect(() => { setReady(false); if (currentUrl.current !== frame.url) { savedScroll.current = readingPositions.get(frame.url)?.scrollY ?? frame.document?.scrollY ?? 0; currentUrl.current = frame.url; setSelected(readingPositions.get(frame.url)?.postId ?? ''); } }, [frame.document?.id]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const attach = () => {
      const doc = iframe.current?.contentDocument;
      if (doc?.body && doc.readyState !== 'loading' && doc.querySelector(`[data-redleaf-control^="${frame.document?.id}-"]`)) connect();
      else timer = setTimeout(attach, 80);
    };
    attach();
    return () => clearTimeout(timer);
  }, [frame.document?.id]);
  function connect() {
    const doc = iframe.current?.contentDocument, win = iframe.current?.contentWindow;
    if (!doc || !win) return;
    if (connectedDocument.current === doc) { setReady(true); return; }
    cleanup.current(); connectedDocument.current = doc;
    const wrapper = (node: Node | null) => (node?.nodeType === 1 ? node as Element : node?.parentElement)?.closest<HTMLElement>('[data-redleaf-post]');
    const remember = (postId = readingPositions.get(frame.url)?.postId ?? '') => {
      readingPositions.set(frame.url, { scrollY: savedScroll.current ?? 0, postId });
      while (readingPositions.size > 8) readingPositions.delete(readingPositions.keys().next().value!);
    };
    const choose = (element: Element | null | undefined) => { const id = element?.getAttribute('data-redleaf-post'); if (id) { setSelected(id); remember(id); } return id; };
    const selection = () => { const s = win.getSelection(); if (s && !s.isCollapsed) choose(wrapper(s.anchorNode)); };
    const scroll = () => {
      if (!iframe.current?.getClientRects().length) return;
      savedScroll.current = win.scrollY; remember();
      const root = doc.documentElement;
      const remaining = root.scrollHeight - (win.scrollY + win.innerHeight);
      // The iframe is an inert native rendering of the authenticated page.
      // Reading scroll happens locally; the real browser may still be near the
      // top of a long answer. Explicitly load the live list's next page instead
      // of advancing the remote viewport by one small, unrelated wheel step.
      // Identical content stays disarmed after a no-op response, so restoring
      // this scroll position cannot start an endless sequence of requests.
      const contentKey = callbacks.current.frame.url + '\n' + callbacks.current.frame.posts.map(item => item.id).join(',') + '\n' + root.scrollHeight;
      if (remaining < Math.max(420, win.innerHeight * 0.55) && root.scrollHeight > win.innerHeight + 32 && loadMoreRequested.current !== contentKey && !callbacks.current.busy && !loadingMorePending.current) {
        loadMoreRequested.current = contentKey;
        void requestMore().catch(() => {
          // Automatic feed extension is opportunistic. Keep the current page
          // usable and allow a later deliberate scroll to retry it.
          if (loadMoreRequested.current === contentKey) loadMoreRequested.current = null;
        });
      }
    };
    let pointer: { id: number; x: number; y: number; postId: string; frameId: string; handle: HTMLElement; moved: boolean; transfer: DataTransfer } | null = null;
    let paint = 0, point = { x: 0, y: 0 };
    let suppressClickUntil = 0;
    let hovered: Element | null = null;
    const transferFor = (postId: string, frameId: string) => {
      const transfer = new DataTransfer();
      transfer.setData(ZHIHU_BROWSER_POST_MIME, JSON.stringify({ postId, frameId }));
      transfer.effectAllowed = 'copy';
      return transfer;
    };
    const finishPointer = () => {
      cancelAnimationFrame(paint); paint = 0;
      if (pointer?.handle.hasPointerCapture(pointer.id)) pointer.handle.releasePointerCapture(pointer.id);
      pointer = null; hovered = null; setDragPreview(null);
      window.dispatchEvent(new Event('dragend'));
    };
    // Pointer capture keeps the answer handle attached to the finger/mouse when
    // it crosses the iframe edge; native cross-frame drag is inconsistent.
    const pointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      const selectedText = win.getSelection();
      const insideSelection = selectedText && !selectedText.isCollapsed && selectedText.rangeCount > 0 &&
        [...selectedText.getRangeAt(0).getClientRects()].some(rect => event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom);
      const handle = target.closest<HTMLElement>('[data-redleaf-feed]') ?? (insideSelection ? target : null);
      const postId = handle && choose(wrapper(handle));
      if (!handle || !postId || event.button !== 0 || !event.isPrimary || pointer || callbacks.current.busy) return;
      const frameId = callbacks.current.frame.frameId;
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, postId, frameId, handle, moved: false, transfer: transferFor(postId, frameId) };
      handle.setPointerCapture(event.pointerId);
      event.preventDefault();
    };
    const pointerMove = (event: PointerEvent) => {
      if (!pointer || pointer.id !== event.pointerId) return;
      if (!pointer.moved && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) < 6) return;
      const rect = iframe.current!.getBoundingClientRect();
      const x = rect.left + event.clientX, y = rect.top + event.clientY;
      if (!pointer.moved) {
        window.dispatchEvent(new DragEvent('dragstart', { dataTransfer: pointer.transfer }));
        setDragPreview({ x, y, title: callbacks.current.frame.posts.find(item => item.id === pointer!.postId)?.title ?? '知乎回答' });
        pointer.moved = true;
      }
      point = { x, y };
      if (!paint) paint = requestAnimationFrame(() => {
        paint = 0;
        if (!pointer) return;
        if (previewElement.current) previewElement.current.style.transform = `translate3d(${Math.min(innerWidth - 228, Math.max(8, point.x - 110))}px,${Math.max(8, point.y - 70)}px,0)`;
        const target = document.elementFromPoint(point.x, point.y)?.closest('.liukan-pet') ?? null;
        if (hovered && hovered !== target) hovered.dispatchEvent(new DragEvent('dragleave', { bubbles: true, dataTransfer: pointer.transfer }));
        target?.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: pointer.transfer }));
        hovered = target;
      });
    };
    const pointerUp = (event: PointerEvent) => {
      if (!pointer || pointer.id !== event.pointerId) return;
      if (pointer.moved) {
        suppressClickUntil = performance.now() + 250;
        const rect = iframe.current!.getBoundingClientRect();
        document.elementFromPoint(rect.left + event.clientX, rect.top + event.clientY)?.closest('.liukan-pet')?.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transferFor(pointer.postId, pointer.frameId) }));
      }
      finishPointer();
    };
    const drag = (event: DragEvent) => {
      const selectedText = win.getSelection();
      const root = wrapper(event.target as Node) ?? wrapper(selectedText?.anchorNode ?? null);
      const id = choose(root);
      if (!id || !event.dataTransfer) return;
      event.dataTransfer.setData(ZHIHU_BROWSER_POST_MIME, JSON.stringify({ postId: id, frameId: callbacks.current.frame.frameId }));
      event.dataTransfer.effectAllowed = 'copy';
      window.dispatchEvent(new CustomEvent('redleaf:post-drag-start'));
      const transfer = new DataTransfer(); transfer.setData(ZHIHU_BROWSER_POST_MIME, JSON.stringify({ postId: id, frameId: callbacks.current.frame.frameId }));
      window.dispatchEvent(new DragEvent('dragstart', { dataTransfer: transfer }));
    };
    const end = () => window.dispatchEvent(new Event('dragend'));
    const click = (event: MouseEvent) => {
      if (performance.now() < suppressClickUntil) { suppressClickUntil = 0; event.preventDefault(); event.stopImmediatePropagation(); return; }
      const target = event.target as Element;
      const feed = target.closest('[data-redleaf-feed]');
      if (feed) { event.preventDefault(); const id = choose(wrapper(feed)); if (id && !callbacks.current.busy) callbacks.current.onFeed(id); return; }
      choose(wrapper(target));
      const control = target.closest<HTMLElement>('[data-redleaf-control]');
      if (!control) { if (target.closest('a')) event.preventDefault(); return; }
      if (control.matches('input,textarea,select')) return;
      // Focusable article wrappers are reading surfaces, not website actions.
      if (!control.matches('a[href],button,summary,label[for],[role="button"],[role="tab"],[role="link"],.ContentItem-more')) return;
      event.preventDefault();
      if (win.getSelection()?.toString() || callbacks.current.busy) return;
      // Follow the matching live link so the site's click handler, routing and
      // referrer policy remain intact even when a list recycles control IDs.
      if (control.matches('a[href]')) {
        const href = (control as HTMLAnchorElement).href;
        if (/^https:\/\/(?:www\.)?zhihu\.com(?:\/|$)|^https:\/\/zhuanlan\.zhihu\.com(?:\/|$)/.test(href)) {
          void callbacks.current.onAction({ kind: 'link', url: href, documentId: callbacks.current.frame.document!.id, elementId: control.dataset.redleafControl });
          return;
        }
      }
      void callbacks.current.onAction({ kind: 'element', documentId: callbacks.current.frame.document!.id, elementId: control.dataset.redleafControl!, event: 'click' });
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && pointer) {
        event.preventDefault(); event.stopPropagation(); suppressClickUntil = performance.now() + 250; finishPointer(); return;
      }
      if (event.key !== 'Enter') return;
      const target = event.target as HTMLInputElement;
      if (!target.matches('input[data-redleaf-control]')) return;
      event.preventDefault();
      if (callbacks.current.busy) return;
      void callbacks.current.onAction({ kind: 'element', documentId: callbacks.current.frame.document!.id, elementId: target.dataset.redleafControl!, event: 'fill', text: target.value });
    };
    const submit = (event: Event) => event.preventDefault();
    doc.addEventListener('click', click, true); doc.addEventListener('keydown', key, true); doc.addEventListener('submit', submit, true);
    window.addEventListener('keydown', key, true);
    doc.addEventListener('pointerdown', pointerDown, true); doc.addEventListener('pointermove', pointerMove, true); doc.addEventListener('pointerup', pointerUp, true); doc.addEventListener('pointercancel', finishPointer, true);
    doc.addEventListener('selectionchange', selection); doc.addEventListener('dragstart', drag); doc.addEventListener('dragend', end); win.addEventListener('scroll', scroll, { passive: true });
    doc.querySelectorAll('.redleaf-answer-tools, style[data-redleaf-tools]').forEach(element => element.remove());
    const annotated = new Set<string>();
    for (const root of doc.querySelectorAll<HTMLElement>('[data-redleaf-post]')) {
      const id = root.getAttribute('data-redleaf-post')!;
      if (annotated.has(id)) continue;
      annotated.add(id);
      root.style.position ||= 'relative';
      const bar = doc.createElement('div'); bar.className = 'redleaf-answer-tools';
      const item = callbacks.current.frame.posts.find(post => post.id === id);
      const handle = doc.createElement('button'); handle.type = 'button'; handle.textContent = '⠿ 拖给刘看山'; handle.style.touchAction = 'none'; handle.draggable = true; handle.setAttribute('data-redleaf-feed', ''); handle.setAttribute('aria-label', `把${item?.author || '这位作者'}的回答交给刘看山`); handle.title = '直接拖动或点击，自动获取回答全文';
      bar.append(handle); root.append(bar);
    }
    const style = doc.createElement('style'); style.textContent = '.redleaf-answer-tools{display:flex;justify-content:flex-end;padding:8px 0;position:relative;z-index:4}.redleaf-answer-tools button{font:500 13px/1.5 system-ui;color:#056de8;border:1px solid #d4e7ff;background:#f2f8ff;border-radius:7px;padding:7px 12px;cursor:grab}.redleaf-answer-tools button:active{cursor:grabbing} [data-redleaf-post]:hover{outline:1px solid #a8d0ff;outline-offset:3px} ::selection{background:#b9dcff;color:#122f57}'; doc.head.append(style);
    style.setAttribute('data-redleaf-tools', '');
    style.textContent += `@media(max-width:760px){
      html,body,#root{min-width:0!important;width:100%!important;overflow-x:hidden!important}
      .AppHeader-inner{min-width:0!important;width:100%!important;padding:0 12px!important;box-sizing:border-box}
      .AppHeader .SearchBar,.AppHeader-userInfo,.GlobalSideBar,.Topstory-sideBar,.WriteArea{display:none!important}
      .AppHeader-Tabs{min-width:0!important;overflow:auto;white-space:nowrap;margin:0 0 0 14px!important}
      .Topstory-container,.Topstory-mainColumn,.Question-main,.Question-mainColumn,.QuestionHeader-content,.Post-Main{min-width:0!important;width:100%!important;max-width:100%!important;margin:0!important;box-sizing:border-box}
      .Topstory-container,.Question-main{display:block!important;padding:0!important}
      .Question-sideColumn{display:none!important}.ContentItem{box-sizing:border-box}
      .RichContent-inner{overflow-wrap:anywhere}.RichText{font-size:16px;line-height:1.85}
      .RichText img{max-width:100%!important;height:auto!important}
      .ContentItem-actions{max-width:100%;overflow:auto;box-sizing:border-box;position:static!important;width:100%!important}
      .redleaf-answer-tools button{padding:10px 14px;min-height:42px}
    }`;
    win.scrollTo(0, savedScroll.current ?? frame.document?.scrollY ?? 0); setReady(true);
    cleanup.current = () => { finishPointer(); doc.removeEventListener('click', click, true); doc.removeEventListener('keydown', key, true); window.removeEventListener('keydown', key, true); doc.removeEventListener('submit', submit, true); doc.removeEventListener('pointerdown', pointerDown, true); doc.removeEventListener('pointermove', pointerMove, true); doc.removeEventListener('pointerup', pointerUp, true); doc.removeEventListener('pointercancel', finishPointer, true); doc.removeEventListener('selectionchange', selection); doc.removeEventListener('dragstart', drag); doc.removeEventListener('dragend', end); win.removeEventListener('scroll', scroll); };
  }
  return <div className="zhw-live-page">
    <div className="zhw-selection-bar"><span>{post ? `已选：${post.title}` : '无需展开，直接把回答拖给右下角的刘看山'}</span>{post && <button disabled={busy} draggable={!busy} onDragStart={event => { event.dataTransfer.setData(ZHIHU_BROWSER_POST_MIME, JSON.stringify({ postId: post.id, frameId: frame.frameId })); event.dataTransfer.effectAllowed = 'copy'; }} onClick={() => onFeed(post.id)}>交给看山 · 获取全文</button>}<small>{busy ? '知乎正在响应…' : ready ? '原网页排版 · 文字可选 · 本地滚动' : '正在还原页面…'}</small></div>
    <iframe ref={iframe} title="知乎原网页，可直接选字和拖给刘看山" sandbox="allow-same-origin" srcDoc={frame.document?.html} onLoad={connect} />
    <div className="zhw-answer-list-controls"><span>{isQuestion ? `已读取 ${frame.posts.length} 条回答，每条都可拖给刘看山` : '滚动浏览，遇到喜欢的回答就交给刘看山'}</span><button type="button" disabled={busy || loadingMore} onClick={() => void requestMore().catch(() => undefined)}>{loadingMore ? '正在加载…' : isQuestion ? '继续加载回答' : '继续浏览'}</button></div>
    {dragPreview && <div ref={previewElement} className="zhw-answer-drag-preview" style={{ left: 0, top: 0, transform: `translate3d(${Math.min(innerWidth - 228, Math.max(8, dragPreview.x - 110))}px,${Math.max(8, dragPreview.y - 70)}px,0)` }}><b>交给刘看山</b><span>{dragPreview.title}</span></div>}
  </div>;
}
