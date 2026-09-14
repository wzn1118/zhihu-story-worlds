import { ZhihuRequestError, requestZhihuJson as request } from './zhihu-request';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, ChevronLeft, GripVertical, LoaderCircle, MousePointer2, RefreshCw, Search, Send } from 'lucide-react';
import type { ZhihuCandidate, ZhihuDiscoveryResult } from '../shared/zhihu-discovery';
import { ZHIHU_BROWSER_POST_MIME, type ZhihuBrowserAction, type ZhihuBrowserFrame } from '../shared/zhihu-browser';
import { LIUKAN_POST_MIME } from '../shared/liukan-inbox';
import './ZhihuWorkspace.css';
import { ZhihuLivePage } from './ZhihuLivePage';
import { ZhihuQuestionReader } from './ZhihuQuestionReader';

function feed(candidateId: string) { window.dispatchEvent(new CustomEvent('redleaf:feed-post', { detail: { candidateId } })); }


function questionLink(value: string, includeAnswer = false): string | null {
  try {
    const url = new URL(value);
    const match = /^\/question\/([0-9]{5,24})(?:\/answer\/[0-9]{5,24})?\/?$/.exec(url.pathname);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && ['www.zhihu.com', 'zhihu.com'].includes(url.hostname) && match && (includeAnswer || !url.pathname.includes('/answer/')) ? `https://www.zhihu.com/question/${match[1]}` : null;
  } catch { return null; }
}
function hotlistLink(value: string) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.port && ['www.zhihu.com', 'zhihu.com'].includes(url.hostname) && /^\/hot\/?$/.test(url.pathname); } catch { return false; }
}
const savedScope = (scope?: string) => scope === 'question-answer-excerpt' ? '官方回答节选' : scope === 'webpage-selection' ? '网页选取' : '官方搜索节选';

/** Login and verification pages must keep running in the real browser. */
function ZhihuRemoteScreen({ frame, active, onAction, onInteraction }: { frame: ZhihuBrowserFrame; active: boolean; onAction: (action: ZhihuBrowserAction) => Promise<void>; onInteraction: (value: boolean) => void }) {
  const image = useRef<HTMLImageElement>(null), keyboard = useRef<HTMLTextAreaElement>(null);
  const pointer = useRef<{ id: number; frameId: string; started: number; points: { x: number; y: number }[]; width: number; height: number } | null>(null);
  const pendingText = useRef(''), textTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const composing = useRef(false), scrollDelta = useRef(0), scrollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const callbacks = useRef({ frame, onAction, onInteraction }); callbacks.current = { frame, onAction, onInteraction };
  const [dragPoint, setDragPoint] = useState<{ x: number; y: number } | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const flushText = () => {
    clearTimeout(textTimer.current); textTimer.current = undefined;
    const text = pendingText.current; pendingText.current = '';
    if (text) void callbacks.current.onAction({ kind: 'text', text });
  };
  const inputText = (text: string) => {
    if (!text) return;
    pendingText.current = (pendingText.current + text).slice(0, 4000);
    clearTimeout(textTimer.current); textTimer.current = setTimeout(flushText, 140);
  };
  useEffect(() => {
    if (active) return;
    clearTimeout(textTimer.current); pendingText.current = '';
    keyboard.current?.blur(); pointer.current = null; setDragPoint(null); callbacks.current.onInteraction(false);
  }, [active]);
  useEffect(() => () => {
    clearTimeout(textTimer.current); clearTimeout(scrollTimer.current);
    pendingText.current = ''; callbacks.current.onInteraction(false);
  }, []);
  useEffect(() => {
    const element = keyboard.current;
    if (!element) return;
    // Phone keyboards can edit through beforeinput without a usable keydown.
    const beforeInput = (event: InputEvent) => {
      if (event.isComposing || composing.current) return;
      const key = event.inputType === 'deleteContentBackward' ? 'Backspace' : ['insertParagraph', 'insertLineBreak'].includes(event.inputType) ? 'Enter' : null;
      if (!key) return;
      event.preventDefault(); flushText(); void callbacks.current.onAction({ kind: 'key', key });
    };
    element.addEventListener('beforeinput', beforeInput);
    return () => element.removeEventListener('beforeinput', beforeInput);
  }, []);
  useEffect(() => {
    const element = image.current;
    if (!element) return;
    let cancelled = false, sending = false;
    const flush = async () => {
      if (cancelled || sending) return;
      const deltaY = Math.max(-2400, Math.min(2400, Math.round(scrollDelta.current)));
      scrollDelta.current -= deltaY;
      if (deltaY) {
        sending = true;
        try { await callbacks.current.onAction({ kind: 'scroll', deltaY }); }
        finally { sending = false; }
      }
      if (cancelled) return;
      if (scrollDelta.current) scrollTimer.current = setTimeout(() => void flush(), 160);
      else scrollTimer.current = undefined;
    };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      scrollDelta.current += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1);
      if (!scrollTimer.current) scrollTimer.current = setTimeout(() => void flush(), 160);
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => { cancelled = true; element.removeEventListener('wheel', wheel); clearTimeout(scrollTimer.current); scrollTimer.current = undefined; scrollDelta.current = 0; };
  }, []);
  const pointFor = (event: React.PointerEvent<HTMLImageElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const viewport = pointer.current ?? callbacks.current.frame;
    return { x: Math.max(0, Math.min(viewport.width - 1, Math.round((event.clientX - rect.left) / rect.width * viewport.width))), y: Math.max(0, Math.min(viewport.height - 1, Math.round((event.clientY - rect.top) / rect.height * viewport.height))) };
  };
  const endPointer = (event: React.PointerEvent<HTMLImageElement>, cancelled = false) => {
    const current = pointer.current;
    if (!current || current.id !== event.pointerId) return;
    const end = pointFor(event), first = current.points[0];
    pointer.current = null; setDragPoint(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!cancelled) {
      // Focus happens during the user's gesture so desktop text, paste and IME
      // go straight to the selected remote input. Visible input geometry lets
      // touch users open their keyboard without doing so on website buttons.
      flushText();
      const moved = current.points.some(point => Math.hypot(point.x - first.x, point.y - first.y) > 5) || Math.hypot(end.x - first.x, end.y - first.y) > 5;
      const input = callbacks.current.frame.inputs?.find(input => first.x >= input.x && first.x <= input.x + input.width && first.y >= input.y && first.y <= input.y + input.height);
      if (!moved && keyboard.current && (event.pointerType !== 'touch' || input)) {
        keyboard.current.inputMode = input?.inputMode || (input?.type === 'tel' ? 'tel' : input?.type === 'number' ? 'numeric' : 'text');
        keyboard.current.focus({ preventScroll: true });
      }
      const verticalSwipe = event.pointerType === 'touch' && Math.abs(end.y - first.y) > 12 && Math.abs(end.y - first.y) > Math.abs(end.x - first.x) * 1.2;
      const action: ZhihuBrowserAction = verticalSwipe
        ? { kind: 'scroll', deltaY: Math.max(-2400, Math.min(2400, first.y - end.y)) }
        : moved
          ? { kind: 'drag', frameId: current.frameId, points: [...current.points, end], durationMs: Math.min(5000, Math.round(performance.now() - current.started)) }
          : { kind: 'click', frameId: current.frameId, ...end };
      void callbacks.current.onAction(action);
    }
    callbacks.current.onInteraction(false);
  };
  return <div className="zhw-remote-control">
    <div className="zhw-remote-hint"><span>点击网页输入框即可打字，也可以滚动和拖动。</span><button type="button" onClick={() => setZoomed(value => !value)}>{zoomed ? '适应宽度' : '放大画面'}</button></div>
    <div className={`zhw-browser-screen ${zoomed ? 'is-zoomed' : ''}`}>
      <div className="zhw-remote-viewport" style={zoomed ? { width: frame.width } : undefined}>
        <img ref={image} src={frame.screenshot} alt="知乎网页实时画面" draggable={false}
          onPointerDown={event => {
            if (event.button !== 0 || !event.isPrimary || pointer.current) return;
            event.preventDefault(); flushText();
            const point = pointFor(event);
            pointer.current = { id: event.pointerId, frameId: frame.frameId, started: performance.now(), points: [point], width: frame.width, height: frame.height };
            event.currentTarget.setPointerCapture(event.pointerId); callbacks.current.onInteraction(true);
          }}
          onPointerMove={event => {
            const current = pointer.current;
            if (!current || current.id !== event.pointerId) return;
            const point = pointFor(event), last = current.points.at(-1)!;
            if (Math.hypot(point.x - last.x, point.y - last.y) < 3) return;
            // Retain both endpoints even for long gestures; each action is one
            // bounded request rather than hundreds of queued pointer messages.
            if (current.points.length >= 118) current.points.splice(1, 1);
            current.points.push(point); setDragPoint(point);
          }}
          onPointerUp={event => endPointer(event)} onPointerCancel={event => endPointer(event, true)} />
        {dragPoint && <span className="zhw-remote-pointer" style={{ left: `${dragPoint.x / frame.width * 100}%`, top: `${dragPoint.y / frame.height * 100}%` }} />}
        <textarea ref={keyboard} className="zhw-remote-keyboard" aria-label="直接向知乎网页输入" autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} maxLength={4000}
          onCompositionStart={() => { composing.current = true; callbacks.current.onInteraction(true); }}
          onCompositionEnd={event => { composing.current = false; inputText(event.currentTarget.value); event.currentTarget.value = ''; callbacks.current.onInteraction(false); }}
          onInput={event => { if (!composing.current) { inputText(event.currentTarget.value); event.currentTarget.value = ''; } }}
          onKeyDown={event => {
            if (event.nativeEvent.isComposing || composing.current) return;
            const key = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a' ? 'Control+A' : event.key;
            if (!['Enter', 'Backspace', 'Tab', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Control+A'].includes(key)) return;
            event.preventDefault(); flushText();
            void callbacks.current.onAction({ kind: 'key', key: key as Extract<ZhihuBrowserAction, { kind: 'key' }>['key'] });
          }} />
      </div>
    </div>
  </div>;
}

export function ZhihuWorkspace({ onClose, initialPost, initialUrl, active = true, browserAvailable = true }: { onClose: () => void; initialPost?: ZhihuCandidate | null; initialUrl?: string; active?: boolean; browserAvailable?: boolean }) {
  const [requestedMode, setMode] = useState<'web' | 'reader' | 'questions'>(initialPost || !browserAvailable ? 'reader' : 'web');
  const mode = browserAvailable || requestedMode === 'questions' ? requestedMode : 'reader';
  const [questionUrl, setQuestionUrl] = useState<string | null>(null);
  const [questionTitle, setQuestionTitle] = useState('');
  const openQuestion = (value: string | null, title = '') => { setQuestionTitle(title); setQuestionUrl(value && questionLink(value)); setMode('questions'); setError(''); }; 
  const [frame, setFrame] = useState<ZhihuBrowserFrame | null>(null);
  const [url, setUrl] = useState(initialUrl ?? 'https://www.zhihu.com/');
  const [query, setQuery] = useState('悬疑故事 已完结');
  const [posts, setPosts] = useState<ZhihuCandidate[]>([]);
  const [selected, setSelected] = useState<ZhihuCandidate | null>(initialPost ?? null);
  const [operationBusy, setBusy] = useState(false), [error, setError] = useState('');
  const [capturing, setCapturing] = useState(false);
  const busy = operationBusy || capturing;
  const [postsLoading, setPostsLoading] = useState(true), [postsError, setPostsError] = useState('');
  const [entry, setEntry] = useState('');
  const operationQueue = useRef(Promise.resolve());
  const emptyRefreshes = useRef(0);
  const discoveryPending = useRef<Promise<ZhihuDiscoveryResult> | null>(null);
  const running = useRef(false), queued = useRef(0), interacting = useRef(false);
  const frameRef = useRef(frame); frameRef.current = frame;
  const capturedFrameDirty = useRef(false);
  const disconnected = useRef(false), refreshing = useRef(false), connectionGeneration = useRef(0);
  const applyFrame = (next: ZhihuBrowserFrame) => {
    if (next.posts.length || next.url !== frameRef.current?.url) emptyRefreshes.current = 0;
    frameRef.current = next; disconnected.current = next.status === 'closed'; setFrame(next);
    if (next.url) setUrl(next.url);
    const question = next.accessIssue?.kind === 'request-denied' && questionLink(next.url, true);
    if (question) openQuestion(question);
  };
  function act(operation: () => Promise<void>, background = false): Promise<void> {
    queued.current++;
    const task = operationQueue.current.catch(() => {}).then(async () => {
      running.current = true;
      if (!background) { setBusy(true); setError(''); }
      try { await operation(); } catch (e) { setError(e instanceof Error ? e.message : '这次操作没有完成。'); }
      finally { queued.current--; running.current = false; if (!background) setBusy(false); }
    });
    operationQueue.current = task;
    return task;
  }
  const clearClosedFrame = () => { connectionGeneration.current++; disconnected.current = true; frameRef.current = null; setFrame(null); setEntry(''); };
  const browserSize = () => ({ width: Math.min(1440, Math.max(800, innerWidth)), height: Math.max(600, Math.min(1000, innerHeight - 150)) });
  const connect = async (destination = frameRef.current?.url || url) => {
    clearClosedFrame(); setBusy(true);
    try { applyFrame(await request('/api/zhihu-browser/open', { url: destination, ...browserSize() })); }
    finally { setBusy(false); }
  };
  const closedError = (error: unknown) => error instanceof ZhihuRequestError && error.code === 'BROWSER_CLOSED' || error instanceof Error && /BROWSER_CLOSED|请先打开.*知乎窗口|(?:浏览器|浏览窗口|知乎窗口).*(?:关闭|断开)|Target.*closed|browser.*closed/i.test(error.message);
  const connectionError = (error: unknown) => error instanceof ZhihuRequestError && (['NETWORK_ERROR', 'REQUEST_TIMEOUT', 'INVALID_RESPONSE'].includes(error.code) || error.status >= 500);
  const action = (value: ZhihuBrowserAction) => {
    if (value.kind === 'link' && (questionLink(value.url) || hotlistLink(value.url))) {
      const doc = document.querySelector<HTMLIFrameElement>('iframe[title="知乎原网页，可直接选字和拖给刘看山"]')?.contentDocument;
      const link = doc && [...doc.querySelectorAll<HTMLAnchorElement>('a[href]')].find(link => link.href === value.url);
      const title = link ? (link.querySelector('h2,h3')?.textContent || link.textContent || '').trim().slice(0, 500) : '';
      openQuestion(questionLink(value.url), title); return Promise.resolve();
    }
    const generation = connectionGeneration.current;
    return act(async () => {
    if (!browserAvailable || generation !== connectionGeneration.current) return;
    try {
      const next = await request<ZhihuBrowserFrame>('/api/zhihu-browser/action', value);
      if (next.status === 'closed') { await connect(); throw new Error('知乎窗口已重新连接，请重试刚才的操作。'); }
      applyFrame(next);
    } catch (error) {
      if (closedError(error)) {
        await connect();
        // A failed login click may already have reached Zhihu. Reconnect the
        // page without replaying credentials, SMS requests or form submission.
        throw new Error('知乎窗口已重新连接，请重试刚才的操作。');
      }
      if (connectionError(error)) clearClosedFrame();
      if (error instanceof ZhihuRequestError && ['STALE_BROWSER_FRAME', 'STALE_BROWSER_LINK'].includes(error.code) || error instanceof Error && /页面已经变化|控件已经更新|画面已经更新|这一页已经更新|STALE_BROWSER_FRAME/.test(error.message)) {
        const current = await request<ZhihuBrowserFrame>('/api/zhihu-browser/frame');
        if (current.status === 'closed') await connect(); else applyFrame(current);
        throw new Error('知乎页面刚刚更新，请在当前画面上再操作一次。');
      }
      throw error;
    }
    });
  };
  const open = (force = false) => act(async () => {
    if (!browserAvailable) return;
    if (force || disconnected.current) { await connect(); return; }
    try {
      const current = await request<ZhihuBrowserFrame>('/api/zhihu-browser/frame');
      if (current.status === 'closed' || (current.status === 'error' && !current.screenshot && !current.document)) await connect();
      else if (initialUrl && current.url !== initialUrl) applyFrame(await request('/api/zhihu-browser/action', { kind: 'navigate', url: initialUrl }));
      else applyFrame(current);
    } catch (error) {
      if (closedError(error)) await connect();
      else { clearClosedFrame(); throw error; }
    }
  });
  const navigate = (destination: string, original = false) => act(async () => {
    if (!original && (questionLink(destination) || hotlistLink(destination))) { openQuestion(questionLink(destination)); return; }
    if (!browserAvailable) return;
    if (!frameRef.current || disconnected.current || frameRef.current.status === 'closed') { await connect(destination); return; }
    try {
      const next = await request<ZhihuBrowserFrame>('/api/zhihu-browser/action', { kind: 'navigate', url: destination });
      if (next.status === 'closed') await connect(destination); else applyFrame(next);
    } catch (error) { if (closedError(error)) await connect(destination); else { if (connectionError(error)) clearClosedFrame(); throw error; } }
  });
  useEffect(() => {
    if (!active) { setEntry(''); return; }
    const previous = document.body.style.overflow; document.body.style.overflow = 'hidden';
    if (!initialPost && initialUrl && (questionLink(initialUrl) || hotlistLink(initialUrl))) openQuestion(questionLink(initialUrl));
    else if (!initialPost && browserAvailable) void open();
    return () => { document.body.style.overflow = previous; };
  }, [active, browserAvailable]);
  useEffect(() => { if (!browserAvailable) setMode('reader'); }, [browserAvailable]);
  useEffect(() => {
    if (mode !== 'reader' || !active) return;
    let live = true;
    setPostsLoading(true); setPostsError('');
    const pending = discoveryPending.current ?? request<ZhihuDiscoveryResult>('/api/workshop/discovery');
    discoveryPending.current = pending;
    void pending.then(result => {
      if (live) setPosts(previous => [...result.candidates, ...previous.filter(post => !result.candidates.some(item => item.id === post.id))]);
    }).catch(e => { if (live) setPostsError(e instanceof Error ? e.message : '已保存的知乎内容暂时无法读取。'); })
      .finally(() => { if (discoveryPending.current === pending) discoveryPending.current = null; if (live) setPostsLoading(false); });
    return () => { live = false; };
  }, [mode, active]);
  useEffect(() => { if (initialPost) { setSelected(initialPost); setMode('reader'); } }, [initialPost]);
  const useDocument = Boolean(frame?.document && frame.status !== 'closed' && frame.status !== 'login-required' && frame.status !== 'blocked');
  const accessDenied = frame?.accessIssue?.kind === 'request-denied';
  useEffect(() => {
    if (!active || !browserAvailable || mode !== 'web' || !frame || frame.status === 'closed' || error || accessDenied) return;
    // QR codes, form errors and verification challenges change without an
    // explicit click. Poll only interactive surfaces; article snapshots keep
    // their local text selection and reading position intact.
    const dynamic = !useDocument;
    if (!dynamic && (frame.posts.length || emptyRefreshes.current >= 3)) return;
    const timer = window.setInterval(() => {
      if (!dynamic && emptyRefreshes.current >= 3) { clearInterval(timer); return; }
      if (document.hidden || queued.current || running.current || refreshing.current || interacting.current || capturing) return;
      refreshing.current = true;
      if (!dynamic) emptyRefreshes.current++;
      void act(async () => {
        try {
          const current = await request<ZhihuBrowserFrame>('/api/zhihu-browser/frame');
          if (current.status === 'closed') await connect(); else applyFrame(current);
        } catch (error) {
          if (closedError(error)) await connect();
          else { if (connectionError(error)) clearClosedFrame(); throw error; }
        } finally { refreshing.current = false; }
      }, true);
    }, dynamic ? 1200 : 1800);
    return () => clearInterval(timer);
  }, [active, mode, browserAvailable, frame?.status, useDocument, Boolean(frame?.posts.length), error, accessDenied, capturing]);
  useEffect(() => {
    if (!browserAvailable) return;
    const state = (event: Event) => setCapturing((event as CustomEvent).detail?.pending === true);
    const refresh = () => {
      capturedFrameDirty.current = true;
      if (!active || mode !== 'web') return;
      void act(async () => {
        const current = await request<ZhihuBrowserFrame>('/api/zhihu-browser/frame');
        if (current.status === 'closed') clearClosedFrame(); else applyFrame(current);
        capturedFrameDirty.current = false;
      }, true);
    };
    window.addEventListener('redleaf:browser-capture-state', state);
    window.addEventListener('redleaf:browser-capture-updated', refresh);
    // Capturing a saved candidate can expand its answer in the existing page
    // while the reader tab is showing. Re-read that page on return, preserving
    // its URL and history rather than navigating away from it.
    if (active && mode === 'web' && capturedFrameDirty.current) refresh();
    return () => {
      window.removeEventListener('redleaf:browser-capture-state', state);
      window.removeEventListener('redleaf:browser-capture-updated', refresh);
    };
  }, [active, mode, browserAvailable]);
  const search = () => act(async () => { const result = await request<ZhihuDiscoveryResult>('/api/workshop/discovery', { query }); setPosts(result.candidates); setPostsError(''); setSelected(null); setMode('reader'); });
  const dragCandidate = (event: React.DragEvent, post: ZhihuCandidate) => { event.dataTransfer.setData(LIUKAN_POST_MIME, JSON.stringify({ candidateId: post.id })); event.dataTransfer.effectAllowed = 'copy'; window.dispatchEvent(new Event('redleaf:post-drag-start')); };
  const dragEnd = () => window.dispatchEvent(new Event('redleaf:post-drag-end'));
  function capture(postId: string) {
    const frameId = frameRef.current?.frameId;
    if (frameId) window.dispatchEvent(new CustomEvent('redleaf:feed-post', { detail: { kind: 'browser', postId, frameId } }));
  }
  return <section className="zhihu-workspace" hidden={!active} aria-label="知乎选篇工作区" onKeyDown={event => event.stopPropagation()}>
    <header className="zhw-header"><button className="zhw-back" onClick={onClose}><ArrowLeft size={17} />回到改编工作台</button><span className="zhw-logo">知乎</span><span className="zhw-title">看见好故事，交给看山</span><span className="zhw-pet-note"><MousePointer2 size={14} />拖动帖子给刘看山</span></header>
    <div className="zhw-toolbar" data-tour="zhihu-reader">
      {browserAvailable ? <div className="zhw-tabs" role="tablist" aria-label="知乎阅读方式"><button role="tab" aria-selected={mode === 'web'} onClick={() => { setMode('web'); if (!frame || frame.status === 'closed') void open(); }}>知乎网页</button><button role="tab" aria-selected={mode === 'questions'} onClick={() => openQuestion(null)}>热榜与回答</button><button role="tab" aria-selected={mode === 'reader'} onClick={() => setMode('reader')}>知乎内容阅读</button></div> : <div className="zhw-public-heading"><span>知乎内容阅读</span><a href={initialUrl ?? 'https://www.zhihu.com/'} target="_blank" rel="noreferrer">{initialUrl ? '在知乎查看原文' : '打开知乎'}<ArrowRight size={13} /></a></div>}
      {mode === 'web' ? <form className="zhw-address" onSubmit={e => { e.preventDefault(); void navigate(url); }}><button type="button" title="网页后退" aria-label="网页后退" disabled={busy || !(frame?.screenshot || frame?.document)} onClick={() => void action({ kind: 'back' })}><ChevronLeft size={17} /></button><input aria-label="知乎网页地址" value={url} onChange={e => setUrl(e.target.value)} /><button type="submit" disabled={busy || !url.trim()} aria-label="打开知乎地址"><ArrowRight size={17} /></button><button type="button" aria-label="刷新知乎画面" disabled={busy} onClick={() => void ((frame?.screenshot || frame?.document) ? action({ kind: 'reload' }) : open())}><RefreshCw size={16} /></button></form>
      : mode === 'questions' ? <span className="zhw-reader-note">知乎热榜 · 回答可逐条拖给刘看山</span> : <form className="zhw-address" onSubmit={e => { e.preventDefault(); void search(); }}><Search size={17} /><input aria-label="在知乎搜索回答" value={query} onChange={e => setQuery(e.target.value)} maxLength={120} /><button disabled={busy || query.trim().length < 2}>搜索</button></form>}
    </div>
    {error && <div className="zhw-error" role="alert">{error}<button disabled={busy} onClick={() => void (mode === 'reader' ? search() : open(true))}>{mode === 'reader' ? '重新搜索' : '重新连接'}</button></div>}
    <ZhihuQuestionReader questionUrl={questionUrl} questionTitle={questionTitle} active={active && mode === 'questions'} onQuestion={(destination, title) => { if (!destination && frameRef.current && hotlistLink(frameRef.current.url) && frameRef.current.document) setMode('web'); else openQuestion(destination, title); }} onBack={() => setMode(browserAvailable ? 'web' : 'reader')} onOriginal={(destination: string) => { setMode('web'); void navigate(destination, true); }} />
    {browserAvailable && <div className="zhw-browser" hidden={mode !== 'web'}>
      <div className="zhw-page-state" role="status"><span className={`zhw-dot ${frame?.status ?? ''}`} />{frame?.status === 'ready' ? '知乎实时网页' : frame?.status === 'login-required' ? '请在下方知乎页面登录' : frame?.status === 'blocked' ? `知乎页面返回 ${frame.httpStatus ?? '访问验证'}` : frame?.status === 'error' ? '知乎页面读取未完成' : '知乎浏览窗口'}<span>{frame?.title}</span>{busy && <><span className="zhw-busy-label">正在更新…</span><LoaderCircle size={14} className="spin" /></>}</div>
      {frame?.message && <div className="zhw-page-notice">{frame.message}{accessDenied && <div className="zhw-access-actions"><button disabled={busy} onClick={() => void action({ kind: 'back' })}>返回上一页</button><button disabled={busy} onClick={() => void navigate('https://www.zhihu.com/hot')}>返回热榜</button>{/^https:\/\/(?:www\.)?zhihu\.com(?:\/|$)|^https:\/\/zhuanlan\.zhihu\.com(?:\/|$)/.test(frame.url) && <a href={frame.url} target="_blank" rel="noreferrer">在自己的浏览器打开原页 <ArrowRight size={13} /></a>}</div>}</div>}
      {useDocument && frame ? <ZhihuLivePage frame={frame} busy={busy} active={active && mode === 'web'} onAction={action} onFeed={capture} /> : frame?.screenshot ? accessDenied ? <div className="zhw-browser-screen"><img src={frame.screenshot} alt="知乎返回的访问限制" draggable={false} /></div> : <ZhihuRemoteScreen frame={frame} active={active && mode === 'web' && !capturing} onAction={action} onInteraction={value => { interacting.current = value; }} /> : <div className="zhw-browser-screen"><div className="zhw-wait"><span className="zhw-logo">知乎</span><p>{busy ? '知乎正在连接，请稍候…' : '知乎窗口已断开，点击重新连接继续。'}</p>{!busy && <button className="zhw-primary" onClick={() => void open(true)}>重新连接知乎</button>}</div></div>}
      {!useDocument && !accessDenied && frame?.screenshot && <form className="zhw-web-input" onSubmit={e => { e.preventDefault(); const text = entry; setEntry(''); void action({ kind: 'text', text }); }}><label htmlFor="zhw-page-input">网页输入</label><input id="zhw-page-input" type={frame.focusedInput?.type === 'password' ? 'password' : 'text'} inputMode={frame.focusedInput?.inputMode === 'numeric' || frame.focusedInput?.inputMode === 'tel' ? frame.focusedInput.inputMode : 'text'} autoComplete="off" maxLength={4000} disabled={busy} placeholder="先点上方网页输入框，再输入文字" value={entry} onChange={e => setEntry(e.target.value)} /><button disabled={busy || !entry}>输入到网页</button><button type="button" disabled={busy} onClick={() => void action({ kind: 'key', key: 'Enter' })}>回车</button><button type="button" disabled={busy} onClick={() => void action({ kind: 'key', key: 'Tab' })}>下个输入框</button><button type="button" disabled={busy} onClick={() => { void action({ kind: 'key', key: 'Control+A' }); void action({ kind: 'key', key: 'Backspace' }); }}>清空当前输入框</button><button type="button" disabled={busy} onClick={() => void open()}>更新画面</button></form>}
      {frame?.status === 'login-required' && <p className="zhw-input-help">在上方知乎页面扫码或输入验证码登录。二维码和登录结果会自动更新；遇到验证滑块，可直接按住拖动。</p>}
      <div className="zhw-native-posts"><p>当前页面可交给看山的回答 <b>{frame?.posts.length ?? 0}</b></p>{frame?.posts.map(post => <article key={post.id} draggable onDragStart={event => { event.dataTransfer.setData(ZHIHU_BROWSER_POST_MIME, JSON.stringify({ postId: post.id, frameId: frame.frameId })); event.dataTransfer.effectAllowed = 'copy'; window.dispatchEvent(new Event('redleaf:post-drag-start')); }} onDragEnd={dragEnd}><GripVertical size={17} /><div><h3>{post.title}</h3><p>{post.author} · {post.characters} 字 · {post.visibleScope === 'expanded' ? '网页展开正文' : '网页可见节选'}</p><p>{post.excerpt}</p></div><button disabled={busy} onClick={() => void capture(post.id)}><Send size={14} />交给看山</button></article>)}{!frame?.posts.length && <p className="zhw-subtle">{frame?.status === 'blocked' ? '当前页面受到访问限制，尚未读取到可保存的回答。' : frame?.status === 'login-required' ? '完成登录后，直接拖动回答即可自动读取全文。' : '打开知乎回答后，直接拖给看山即可获取全文，无需手动展开。'}</p>}</div>
    </div>}<div className={`zhw-reader ${selected ? 'has-selection' : ''}`} hidden={mode !== 'reader'}>
      <div className="zhw-post-list"><div className="zhw-reader-note">真实知乎内容 · 标明来源范围</div>{postsError && <p className="zhw-reader-error" role="alert">{postsError}</p>}{postsLoading && <p className="zhw-subtle" role="status">正在读取已保存的知乎内容…</p>}{!postsLoading && !postsError && !posts.length && <p className="zhw-subtle">还没有保存的内容，输入关键词搜索知乎回答。</p>}{posts.map(post => <article key={post.id} draggable onDragStart={e => dragCandidate(e, post)} onDragEnd={dragEnd} className={selected?.id === post.id ? 'selected' : ''}><button className="zhw-post-open" onClick={() => setSelected(post)}><span className="zhw-author">{post.author}</span><h2>{post.title}</h2><p>{post.excerpt.slice(0, 180)}</p><span className="zhw-meta">{post.characters} 字 · {savedScope(post.origin.contentScope)}</span></button><button className="zhw-feed" onClick={() => feed(post.id)}><Send size={14} />交给看山 <GripVertical size={14} /></button></article>)}</div>
      {selected ? <article className="zhw-reading"><button className="zhw-reading-back" onClick={() => setSelected(null)}><ChevronLeft size={15} />返回回答列表</button><div className="zhw-reading-heading" draggable onDragStart={e => dragCandidate(e, selected)} onDragEnd={dragEnd}><p className="zhw-author">{selected.author}</p><h1>{selected.title}</h1><p className="zhw-scope">{selected.origin.contentScope === 'question-answer-excerpt' ? '知乎官方回答接口返回的节选，非完整原文' : selected.origin.contentScope === 'webpage-selection' ? '知乎网页可见正文，可能只是原作的一部分' : '知乎官方搜索返回的节选，非完整原作'}</p><button className="zhw-primary" onClick={() => feed(selected.id)}><Send size={16} />交给刘看山 <GripVertical size={16} /></button>{browserAvailable ? <button className="zhw-reading-link" disabled={busy} onClick={() => { setMode('web'); setUrl(selected.origin.sourceUrl); void navigate(selected.origin.sourceUrl); }}>在这里打开知乎原页面 <ArrowRight size={13} /></button> : <a className="zhw-reading-link" href={selected.origin.sourceUrl} target="_blank" rel="noreferrer">在知乎查看原文 <ArrowRight size={13} /></a>}</div><pre data-testid="zhw-source-text">{selected.excerpt}</pre><div className="zhw-source-url">{selected.origin.sourceUrl}</div></article> : <div className="zhw-reader-empty"><BookOpen size={34} /><h2>读到心动的那一段了吗？</h2><p>打开一篇回答，或直接把它拖给右下角的刘看山。</p></div>}
    </div>
  </section>;
}
