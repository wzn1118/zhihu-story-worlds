import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, ChevronLeft, GripVertical, LoaderCircle, MousePointer2, RefreshCw, Search, Send } from 'lucide-react';
import type { ZhihuCandidate, ZhihuDiscoveryResult } from '../shared/zhihu-discovery';
import { ZHIHU_BROWSER_POST_MIME, type ZhihuBrowserAction, type ZhihuBrowserFrame } from '../shared/zhihu-browser';
import { LIUKAN_POST_MIME } from '../shared/liukan-inbox';
import './ZhihuWorkspace.css';
import { ZhihuLivePage } from './ZhihuLivePage';

async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, body === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? `请求未完成（${response.status}）`);
  return data;
}
function feed(candidateId: string) { window.dispatchEvent(new CustomEvent('redleaf:feed-post', { detail: { candidateId } })); }

export function ZhihuWorkspace({ onClose, initialPost, initialUrl, active = true }: { onClose: () => void; initialPost?: ZhihuCandidate | null; initialUrl?: string; active?: boolean }) {
  const [mode, setMode] = useState<'web' | 'reader'>(initialPost ? 'reader' : 'web');
  const [frame, setFrame] = useState<ZhihuBrowserFrame | null>(null);
  const [url, setUrl] = useState(initialUrl ?? 'https://www.zhihu.com/');
  const [query, setQuery] = useState('悬疑故事 已完结');
  const [posts, setPosts] = useState<ZhihuCandidate[]>([]);
  const [selected, setSelected] = useState<ZhihuCandidate | null>(initialPost ?? null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [postsLoading, setPostsLoading] = useState(true), [postsError, setPostsError] = useState('');
  const [entry, setEntry] = useState('');
  const operationQueue = useRef(Promise.resolve());
  const emptyRefreshes = useRef(0);
  const discoveryPending = useRef<Promise<ZhihuDiscoveryResult> | null>(null);
  const running = useRef(false), screen = useRef<HTMLDivElement>(null);
  const wheel = useRef<number | undefined>(undefined), wheelDelta = useRef(0);
  const frameRef = useRef(frame); frameRef.current = frame;
  const applyFrame = (next: ZhihuBrowserFrame) => { if (next.posts.length || next.url !== frameRef.current?.url) emptyRefreshes.current = 0; setFrame(next); if (next.url) setUrl(next.url); };
  function act(operation: () => Promise<void>): Promise<void> {
    const task = operationQueue.current.catch(() => {}).then(async () => {
      running.current = true; setBusy(true); setError('');
      try { await operation(); } catch (e) { setError(e instanceof Error ? e.message : '这次操作没有完成。'); }
      finally { running.current = false; setBusy(false); }
    });
    operationQueue.current = task;
    return task;
  }
  const action = (value: ZhihuBrowserAction) => act(async () => {
    try {
      applyFrame(await request('/api/zhihu-browser/action', value));
    } catch (error) {
      // Dynamic hot/search lists can rotate their document while a pointer is
      // in flight. Refresh once so the user gets the current page instead of
      // a dead-end stale-control error.
      if (error instanceof Error && /页面已经变化|控件已经更新|STALE_BROWSER_FRAME/.test(error.message)) {
        applyFrame(await request('/api/zhihu-browser/frame'));
        throw new Error('知乎列表刚刚更新，已刷新当前页面；请再点一次。');
      }
      throw error;
    }
  });
  const open = () => act(async () => {
    const current = await request<ZhihuBrowserFrame>('/api/zhihu-browser/frame');
    applyFrame(current.status === 'closed' ? await request('/api/zhihu-browser/open', { url, width: Math.min(1440, Math.max(800, innerWidth)), height: Math.max(600, Math.min(1000, innerHeight - 150)) }) : initialUrl && current.url !== initialUrl ? await request('/api/zhihu-browser/action', { kind: 'navigate', url: initialUrl }) : current);
  });
  const navigate = (destination: string) => act(async () => {
    const current = frameRef.current ?? await request<ZhihuBrowserFrame>('/api/zhihu-browser/frame');
    applyFrame(current.status === 'closed'
      ? await request('/api/zhihu-browser/open', { url: destination, width: Math.min(1440, Math.max(800, innerWidth)), height: Math.max(600, Math.min(1000, innerHeight - 150)) })
      : await request('/api/zhihu-browser/action', { kind: 'navigate', url: destination }));
  });
  useEffect(() => {
    if (!active) { setEntry(''); return; }
    const previous = document.body.style.overflow; document.body.style.overflow = 'hidden';
    if (!initialPost) void open();
    return () => { document.body.style.overflow = previous; if (wheel.current) clearTimeout(wheel.current); wheelDelta.current = 0; };
  }, [active]);
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
  useEffect(() => {
    const element = screen.current;
    if (!active || mode !== 'web' || !element || !(frame?.screenshot || frame?.document)) return;
    let cancelled = false;
    // The screenshot forwards wheel input to the real page; retain queued movement
    // while a previous browser request is still running.
    const flush = async () => {
      if (cancelled) return;
      if (running.current) { wheel.current = window.setTimeout(() => void flush(), 160); return; }
      const deltaY = Math.max(-2400, Math.min(2400, Math.round(wheelDelta.current)));
      wheelDelta.current -= deltaY;
      if (deltaY) await action({ kind: 'scroll', deltaY });
      if (cancelled) return;
      if (wheelDelta.current) wheel.current = window.setTimeout(() => void flush(), 160);
      else wheel.current = undefined;
    };
    const scroll = (event: WheelEvent) => {
      event.preventDefault();
      wheelDelta.current += Math.round(event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1));
      if (!wheel.current) wheel.current = window.setTimeout(() => void flush(), 160);
    };
    element.addEventListener('wheel', scroll, { passive: false });
    return () => { cancelled = true; element.removeEventListener('wheel', scroll); if (wheel.current) clearTimeout(wheel.current); wheel.current = undefined; wheelDelta.current = 0; };
  }, [active, mode, Boolean(frame?.screenshot)]);
  useEffect(() => { if (initialPost) { setSelected(initialPost); setMode('reader'); } }, [initialPost]);
  useEffect(() => {
    // Zhihu paints the shell before its answer feed. Refresh only that empty
    // initial state; readable documents stay untouched while selecting text.
    if (!active || mode !== 'web' || busy || frame?.status !== 'ready' || frame.posts.length || emptyRefreshes.current >= 3) return;
    const timer = window.setTimeout(() => { emptyRefreshes.current++; void act(async () => applyFrame(await request('/api/zhihu-browser/frame'))); }, 1800);
    return () => clearTimeout(timer);
  }, [active, mode, busy, frame?.frameId]);
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
      <div className="zhw-tabs" role="tablist" aria-label="知乎阅读方式"><button role="tab" aria-selected={mode === 'web'} onClick={() => { setMode('web'); if (!frame || frame.status === 'closed') void open(); }}>知乎网页</button><button role="tab" aria-selected={mode === 'reader'} onClick={() => setMode('reader')}>知乎内容阅读</button></div>
      {mode === 'web' ? <form className="zhw-address" onSubmit={e => { e.preventDefault(); void navigate(url); }}><button type="button" title="网页后退" aria-label="网页后退" disabled={busy || !(frame?.screenshot || frame?.document)} onClick={() => void action({ kind: 'back' })}><ChevronLeft size={17} /></button><input aria-label="知乎网页地址" value={url} onChange={e => setUrl(e.target.value)} /><button type="submit" disabled={busy || !url.trim()} aria-label="打开知乎地址"><ArrowRight size={17} /></button><button type="button" aria-label="刷新知乎画面" disabled={busy} onClick={() => void ((frame?.screenshot || frame?.document) ? action({ kind: 'reload' }) : open())}><RefreshCw size={16} /></button></form>
      : <form className="zhw-address" onSubmit={e => { e.preventDefault(); void search(); }}><Search size={17} /><input aria-label="在知乎搜索回答" value={query} onChange={e => setQuery(e.target.value)} maxLength={120} /><button disabled={busy || query.trim().length < 2}>搜索</button></form>}
    </div>
    {error && <div className="zhw-error" role="alert">{error}<button disabled={busy} onClick={() => void (mode === 'reader' ? search() : open())}>{mode === 'reader' ? '重新搜索' : '重新连接'}</button></div>}
    <div className="zhw-browser" hidden={mode !== 'web'}>
      <div className="zhw-page-state" role="status"><span className={`zhw-dot ${frame?.status ?? ''}`} />{frame?.status === 'ready' ? '知乎实时网页' : frame?.status === 'login-required' ? '请在下方知乎页面登录' : frame?.status === 'blocked' ? `知乎页面返回 ${frame.httpStatus ?? '访问验证'}` : frame?.status === 'error' ? '知乎页面读取未完成' : '知乎浏览窗口'}<span>{frame?.title}</span>{busy && <><span className="zhw-busy-label">正在更新…</span><LoaderCircle size={14} className="spin" /></>}</div>
      {frame?.message && <div className="zhw-page-notice">{frame.message}</div>}
      {frame?.document ? <ZhihuLivePage frame={frame} busy={busy} active={active && mode === 'web'} onAction={action} onFeed={capture} /> : <div ref={screen} className="zhw-browser-screen" aria-busy={busy}>
        {frame?.screenshot ? <img src={frame.screenshot} alt="知乎网页实时画面" draggable={false} onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); void action({ kind: 'click', frameId: frame.frameId, x: Math.round((event.clientX - rect.left) / rect.width * frame.width), y: Math.round((event.clientY - rect.top) / rect.height * frame.height) }); }} /> : <div className="zhw-wait"><span className="zhw-logo">知乎</span><p>{busy ? '知乎正在打开，请稍候…' : '点击上方刷新，连接知乎网页。'}</p></div>}
      </div>}
      {!frame?.document && <form className="zhw-web-input" onSubmit={e => { e.preventDefault(); const text = entry; void act(async () => { applyFrame(await request('/api/zhihu-browser/action', { kind: 'text', text })); setEntry(''); }); }}><label htmlFor="zhw-page-input">网页输入</label><input id="zhw-page-input" type="password" autoComplete="off" maxLength={4000} disabled={busy || !(frame?.screenshot || frame?.document)} placeholder="先点网页输入框，再在这里输入" value={entry} onChange={e => setEntry(e.target.value)} /><button disabled={busy || !(frame?.screenshot || frame?.document) || !entry}>输入到网页</button><button type="button" disabled={busy || !(frame?.screenshot || frame?.document)} onClick={() => void action({ kind: 'key', key: 'Enter' })}>回车</button><button type="button" disabled={busy || !(frame?.screenshot || frame?.document)} onClick={() => void action({ kind: 'key', key: 'Tab' })}>下个输入框</button><button type="button" disabled={busy || !(frame?.screenshot || frame?.document)} onClick={() => void act(async () => { await request('/api/zhihu-browser/action', { kind: 'key', key: 'Control+A' }); applyFrame(await request('/api/zhihu-browser/action', { kind: 'key', key: 'Backspace' })); })}>清空当前输入框</button><button type="button" disabled={busy} onClick={() => void act(async () => applyFrame(await request('/api/zhihu-browser/frame')))}>更新画面</button></form>}
      {frame?.status === 'login-required' && <p className="zhw-input-help">点击画面中的输入框或二维码完成登录；手机确认后，点击“更新画面”继续。</p>}
      <div className="zhw-native-posts"><p>当前页面可交给看山的回答 <b>{frame?.posts.length ?? 0}</b></p>{frame?.posts.map(post => <article key={post.id} draggable onDragStart={event => { event.dataTransfer.setData(ZHIHU_BROWSER_POST_MIME, JSON.stringify({ postId: post.id, frameId: frame.frameId })); event.dataTransfer.effectAllowed = 'copy'; window.dispatchEvent(new Event('redleaf:post-drag-start')); }} onDragEnd={dragEnd}><GripVertical size={17} /><div><h3>{post.title}</h3><p>{post.author} · {post.characters} 字 · {post.visibleScope === 'expanded' ? '网页展开正文' : '网页可见节选'}</p><p>{post.excerpt}</p></div><button disabled={busy} onClick={() => void capture(post.id)}><Send size={14} />交给看山</button></article>)}{!frame?.posts.length && <p className="zhw-subtle">{frame?.status === 'blocked' ? '当前页面受到访问限制，尚未读取到可保存的回答。' : frame?.status === 'login-required' ? '完成登录并展开回答后，可读取的正文会显示在这里。' : '在知乎展开一篇回答，它会出现在这里，拖给看山就能保存。'}</p>}</div>
    </div><div className={`zhw-reader ${selected ? 'has-selection' : ''}`} hidden={mode !== 'reader'}>
      <div className="zhw-post-list"><div className="zhw-reader-note">真实知乎内容 · 标明来源范围</div>{postsError && <p className="zhw-reader-error" role="alert">{postsError}</p>}{postsLoading && <p className="zhw-subtle" role="status">正在读取已保存的知乎内容…</p>}{!postsLoading && !postsError && !posts.length && <p className="zhw-subtle">还没有保存的内容，输入关键词搜索知乎回答。</p>}{posts.map(post => <article key={post.id} draggable onDragStart={e => dragCandidate(e, post)} onDragEnd={dragEnd} className={selected?.id === post.id ? 'selected' : ''}><button className="zhw-post-open" onClick={() => setSelected(post)}><span className="zhw-author">{post.author}</span><h2>{post.title}</h2><p>{post.excerpt.slice(0, 180)}</p><span className="zhw-meta">{post.characters} 字 · {post.origin.contentScope === 'webpage-selection' ? '网页选取' : '官方搜索节选'}</span></button><button className="zhw-feed" onClick={() => feed(post.id)}><Send size={14} />交给看山 <GripVertical size={14} /></button></article>)}</div>
      {selected ? <article className="zhw-reading"><button className="zhw-reading-back" onClick={() => setSelected(null)}><ChevronLeft size={15} />返回回答列表</button><div className="zhw-reading-heading" draggable onDragStart={e => dragCandidate(e, selected)} onDragEnd={dragEnd}><p className="zhw-author">{selected.author}</p><h1>{selected.title}</h1><p className="zhw-scope">{selected.origin.contentScope === 'webpage-selection' ? '知乎网页可见正文，可能只是原作的一部分' : '知乎官方搜索返回的节选，非完整原作'}</p><button className="zhw-primary" onClick={() => feed(selected.id)}><Send size={16} />交给刘看山 <GripVertical size={16} /></button><button className="zhw-reading-link" disabled={busy} onClick={() => { setMode('web'); setUrl(selected.origin.sourceUrl); void navigate(selected.origin.sourceUrl); }}>在这里打开知乎原页面 <ArrowRight size={13} /></button></div><pre data-testid="zhw-source-text">{selected.excerpt}</pre><div className="zhw-source-url">{selected.origin.sourceUrl}</div></article> : <div className="zhw-reader-empty"><BookOpen size={34} /><h2>读到心动的那一段了吗？</h2><p>打开一篇回答，或直接把它拖给右下角的刘看山。</p></div>}
    </div>
  </section>;
}
