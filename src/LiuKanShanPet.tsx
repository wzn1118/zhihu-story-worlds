import { accountFetch } from './account-storage';
import { accountLocalStorage } from './account-storage';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronDown, ExternalLink, Grip, Inbox, LoaderCircle, MessageCircle, Send, Sparkles, X } from 'lucide-react';
import type { LiukanMemoryRecord, LiukanProgressRequest, LiukanRecallResponse } from '../shared/liukan';
import { uniqueInboxPosts } from '../shared/liukan-inbox-versions';
import type { LiukanInboxPost, LiukanPostAnswer } from '../shared/liukan-inbox';
import type { WorkshopProject } from '../shared/workshop';
import { isLiukanDrag, LIUKAN_FEED_EVENT, parseLiukanDrop, parseLiukanFeed, type LiukanDrop } from './liukan-drop';
import { avoidPetChoices, clampPetPosition, petPanelPosition, LIU_KAN_SHAN_OPEN_KEY, LIU_KAN_SHAN_POSITION_KEY, type PetPosition } from './liukan-shan';
import { LiuKanShanAvatar } from './LiuKanShanAvatar';
import { LiukanActionGallery } from './LiukanActionGallery';
import { performLiukanAction, isLiukanActionId } from './liukan-actions';
import './LiuKanShanPet.css';

export interface PetMemory {
  completedLevels: number;
  recentTitles?: string[];
}

export interface LiuKanShanPetProps {
  memory?: PetMemory;
  onAsk?: () => void;
  onStartGuide?: () => void;
  onCapabilities?: () => void;
  onActivityDesk?: () => void;
  onReadingDesk?: (postId?: string) => void;
  onRecall?: () => void;
  initialOpen?: boolean;
  busy?: boolean;
  children?: React.ReactNode;
  progress?: LiukanProgressRequest;
  worldTitle?: string;
  isEnding?: boolean;
  reducedMotion?: boolean;
  browserAvailable?: boolean;
  onProject?: (project: WorkshopProject) => void;
  onReadPost?: (post: LiukanInboxPost) => void;
}

export { clampPetPosition, LIU_KAN_SHAN_OPEN_KEY, LIU_KAN_SHAN_POSITION_KEY, type PetPosition } from './liukan-shan';

function readPosition(): PetPosition | null {
  try {
    const raw = accountLocalStorage.getItem(LIU_KAN_SHAN_POSITION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PetPosition>;
    if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number') return null;
    return { x: parsed.x, y: parsed.y };
  } catch { return null; }
}

function readOpen(defaultValue: boolean) {
  try {
    const value = accountLocalStorage.getItem(LIU_KAN_SHAN_OPEN_KEY);
    return value === null ? defaultValue : value === '1';
  } catch { return defaultValue; }
}

function defaultPosition(): PetPosition {
  return clampPetPosition({ x: window.innerWidth - 112, y: window.innerHeight - 140 }, { width: window.innerWidth, height: window.innerHeight });
}

export function LiuKanShanPet({ memory, onAsk, onRecall, initialOpen = false, busy = false, children, progress, worldTitle, isEnding = false, reducedMotion: userReducedMotion = false, browserAvailable = false, onProject, onReadPost, onStartGuide, onCapabilities, onReadingDesk, onActivityDesk }: LiuKanShanPetProps) {
  const [position, setPosition] = useState<PetPosition>(() => clampPetPosition(readPosition() ?? defaultPosition(), { width: window.innerWidth, height: window.innerHeight }));
  const [open, setOpen] = useState(() => readOpen(initialOpen));
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [memories, setMemories] = useState<LiukanMemoryRecord[]>([]);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [answering, setAnswering] = useState(false);
  const [error, setError] = useState('');
  const [memoryError, setMemoryError] = useState('');
  const [memoryRetry, setMemoryRetry] = useState(0);
  const [showMemories, setShowMemories] = useState(false);
  const [posts, setPosts] = useState<LiukanInboxPost[]>([]);
  const inboxRevision = useRef(0);
  const [selectedPostId, setSelectedPostId] = useState('');
  const [view, setView] = useState<'reading' | 'journey'>(progress ? 'journey' : 'reading');
  const [feedBusy, setFeedBusy] = useState(false);
  const [feedStage, setFeedStage] = useState<'capture' | 'save'>('save');
  const [feedError, setFeedError] = useState('');
  const [failedFeed, setFailedFeed] = useState<LiukanDrop | null>(null);
  const [dropAvailable, setDropAvailable] = useState(false);
  const [dropHover, setDropHover] = useState(false);
  const [postQuestion, setPostQuestion] = useState('');
  const [postMessages, setPostMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [postAnswering, setPostAnswering] = useState(false);
  const [postError, setPostError] = useState('');
  const [project, setProject] = useState<WorkshopProject | null>(null);
  const [generating, setGenerating] = useState(false);
  const [projectRefresh, setProjectRefresh] = useState(0);
  const [generationError, setGenerationError] = useState('');
  const [inboxReady, setInboxReady] = useState(false);
  const feedRunning = useRef(false);
  const generationRunning = useRef(false);
  const feedHandler = useRef<(payload: LiukanDrop) => void>(() => {});
  const postPending = useRef<AbortController | null>(null);
  const postMessagesRef = useRef<HTMLDivElement>(null);
  const selectedPostRef = useRef(selectedPostId);
  selectedPostRef.current = selectedPostId;
  const pending = useRef<AbortController | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const rememberKey = useRef('');
  const dragOffset = useRef<PetPosition>({ x: 0, y: 0 });
  const dragStart = useRef<PetPosition>({ x: 0, y: 0 });
  const didDrag = useRef(false);
  const completed = memory?.completedLevels ?? memories.length;
  const recentTitles = memory?.recentTitles ?? memories.slice(-2).map(item => item.endingTitle);
  const title = useMemo(() => completed > 0 ? `已经一起走到 ${completed} 个结局了` : '我会记得你走过的路', [completed]);
  const selectedPost = posts.find(post => post.id === selectedPostId);

  useEffect(() => { const cue = (event: Event) => { const action = (event as CustomEvent).detail?.action; if (isLiukanActionId(action)) performLiukanAction(action); }; window.addEventListener('redleaf:liukan-tour-step', cue); return () => window.removeEventListener('redleaf:liukan-tour-step', cue); }, []);

  async function inboxRequest<T>(url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    const response = await accountFetch(url, { ...(body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), signal });
    const data = await response.json() as T & { error?: { message?: string } | string };
    if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : data.error?.message ?? '这次没有接上，请再试一次。');
    return data;
  }

  useEffect(() => {
    const controller = new AbortController(), revision = inboxRevision.current;
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    inboxRequest<{ posts: LiukanInboxPost[] }>('/api/liukan/inbox', undefined, controller.signal).then(data => {
      if (Array.isArray(data.posts) && revision === inboxRevision.current) { const rows = uniqueInboxPosts(data.posts); setPosts(rows); setSelectedPostId(previous => rows.some(row => row.id === previous) ? previous : rows[0]?.id || ''); }
    }).catch(error => { if (!controller.signal.aborted) setFeedError(error instanceof Error ? error.message : '已读回答暂时没有读取成功。'); })
      .finally(() => { setInboxReady(true); window.clearTimeout(timeout); });
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, []);

  async function receivePost(payload: LiukanDrop) {
    setOpen(true); setView('reading'); setDropAvailable(false); setDropHover(false);
    if (feedRunning.current) return;
    performLiukanAction('receive-answer');
    feedRunning.current = true; setFeedBusy(true); setFeedError(''); setFailedFeed(null);
    const captureFullAnswer = payload.kind === 'browser' || browserAvailable;
    setFeedStage(captureFullAnswer ? 'capture' : 'save');
    if (captureFullAnswer) window.dispatchEvent(new CustomEvent('redleaf:browser-capture-state', { detail: { pending: true } }));
    try {
      const candidateId = payload.kind === 'browser'
        ? (await inboxRequest<{ id: string }>('/api/zhihu-browser/capture', { postId: payload.postId, frameId: payload.frameId })).id
        : browserAvailable
          ? (await inboxRequest<{ id: string }>('/api/zhihu-browser/capture-candidate', { candidateId: payload.candidateId })).id
          : payload.candidateId;
      setFeedStage('save');
      const result = await inboxRequest<LiukanInboxPost | { post: LiukanInboxPost }>('/api/liukan/inbox', { candidateId });
      const post = 'post' in result ? result.post : result;
      if (!post?.id || !post.candidate?.excerpt) throw new Error('这篇回答没有带回可读的正文。');
      inboxRevision.current++; setPosts(previous => uniqueInboxPosts([post, ...previous])); setSelectedPostId(post.id); performLiukanAction('remember');
    } catch (error) { setFailedFeed(payload); setFeedError(error instanceof Error ? error.message : '这篇回答暂时没有保存成功。'); }
    finally {
      feedRunning.current = false; setFeedBusy(false);
      if (captureFullAnswer) {
        window.dispatchEvent(new CustomEvent('redleaf:browser-capture-state', { detail: { pending: false } }));
        window.dispatchEvent(new Event('redleaf:browser-capture-updated'));
      }
    }
  }
  feedHandler.current = payload => void receivePost(payload);

  useEffect(() => {
    const feed = (event: Event) => { const payload = parseLiukanFeed((event as CustomEvent).detail); if (payload) feedHandler.current(payload); };
    const over = (event: DragEvent) => { if (event.dataTransfer && isLiukanDrag([...event.dataTransfer.types])) setDropAvailable(true); };
    const end = () => { setDropAvailable(false); setDropHover(false); };
    window.addEventListener(LIUKAN_FEED_EVENT, feed); window.addEventListener('dragstart', over); window.addEventListener('dragover', over); window.addEventListener('dragend', end); window.addEventListener('drop', end);
    return () => { window.removeEventListener(LIUKAN_FEED_EVENT, feed); window.removeEventListener('dragstart', over); window.removeEventListener('dragover', over); window.removeEventListener('dragend', end); window.removeEventListener('drop', end); };
  }, []);

  useEffect(() => {
    postPending.current?.abort(); postPending.current = null; setPostMessages([]); setPostQuestion(''); setPostError(''); setPostAnswering(false); setProject(null); setGenerationError('');
    return () => { postPending.current?.abort(); postPending.current = null; };
  }, [selectedPostId]);
  useEffect(() => { if (postMessagesRef.current) postMessagesRef.current.scrollTop = postMessagesRef.current.scrollHeight; }, [postMessages, postAnswering]);
  useEffect(() => { if (progress) setView('journey'); }, [progress?.worldId]);

  const projectId = selectedPost?.projectId;
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false, timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const result = await inboxRequest<WorkshopProject>(`/api/workshop/projects/${encodeURIComponent(projectId!)}`, undefined, controller.signal);
        if (cancelled) return;
        setProject(result);
        if (result.status === 'running') timer = setTimeout(() => void refresh(), 4000);
      } catch (error) { if (!cancelled) setGenerationError(error instanceof Error ? error.message : '生成进度暂时没有读取成功。'); }
    };
    void refresh();
    return () => { cancelled = true; controller.abort(); clearTimeout(timer); };
  }, [projectId, projectRefresh]);

  async function askPost() {
    if (!selectedPost || postPending.current || !postQuestion.trim()) return;
    const controller = new AbortController(); postPending.current = controller;
    const question = postQuestion.trim(), postId = selectedPost.id;
    setPostQuestion(''); setPostError(''); setPostAnswering(true);
    setPostMessages(previous => [...previous, { role: 'user', content: question }]);
    const timer = setTimeout(() => controller.abort(), 65000);
    try {
      const answer = await inboxRequest<LiukanPostAnswer>(`/api/liukan/inbox/${encodeURIComponent(postId)}/chat`, { question, requestId: crypto.randomUUID(), conversation: postMessages.slice(-6) }, controller.signal);
      if (postPending.current !== controller) return;
      if (!['zhihu-zhida', 'relay'].includes(answer.source) || typeof answer.answer !== 'string' || !answer.answer.trim()) throw new Error('看山这次没有收到完整回复。');
      setPostMessages(previous => [...previous, { role: 'assistant', content: answer.answer }]);
    } catch (error) { if (postPending.current === controller) { setPostError(controller.signal.aborted ? '直答这次还没回话，可以再发一次。' : error instanceof Error ? error.message : '这次提问没有完成。'); setPostQuestion(question); } }
    finally { clearTimeout(timer); if (postPending.current === controller) { postPending.current = null; setPostAnswering(false); } }
  }

  async function generatePost() {
    if (!selectedPost || generationRunning.current) return;
    generationRunning.current = true; setGenerating(true); setGenerationError('');
    const postId = selectedPost.id;
    try {
      const result = await inboxRequest<WorkshopProject>(`/api/liukan/inbox/${encodeURIComponent(postId)}/generate`, {});
      setPosts(previous => previous.map(post => post.id === postId ? { ...post, projectId: result.id } : post));
      if (selectedPostRef.current === postId) { setProject(result); setProjectRefresh(previous => previous + 1); }
      onProject?.(result);
    } catch (error) {
      // A failed upstream call is recoverable. Refresh the persisted project so
      // the next click resumes its checkpoints instead of repeating import.
      setGenerationError(error instanceof Error ? `${error.message} 已保留原文，可再次点击重试。` : '游戏暂时没有开始生成，原文已保留，可再次重试。');
      setProjectRefresh(previous => previous + 1);
    }
    finally { generationRunning.current = false; setGenerating(false); }
  }

  useEffect(() => {
    const controller = new AbortController();
    accountFetch(`/api/liukan/memories${progress?.playerId ? `?playerId=${encodeURIComponent(progress.playerId)}` : ''}`, { signal: controller.signal }).then(async response => {
      if (!response.ok) return;
      const data = await response.json() as { memories?: LiukanMemoryRecord[] };
      if (Array.isArray(data.memories)) setMemories(data.memories);
    }).catch(() => {});
    return () => controller.abort();
  }, [progress?.playerId]);
  useEffect(() => {
    pending.current?.abort(); pending.current = null; setAnswering(false); setMessages([]); setQuestion(''); setError(''); setMemoryError('');
    return () => { pending.current?.abort(); pending.current = null; };
  }, [progress?.worldId, progress?.worldVersion]);
  useEffect(() => {
    if (!progress || !isEnding) return;
    const key = JSON.stringify(progress);
    if (rememberKey.current === key) return;
    rememberKey.current = key;
    const controller = new AbortController();
    accountFetch('/api/liukan/remember', { method: 'POST', headers: { 'content-type': 'application/json' }, body: key, signal: controller.signal }).then(async response => {
      const data = await response.json() as { memories?: LiukanMemoryRecord[]; error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message ?? '这次结局还没记下来。');
      if (Array.isArray(data.memories)) setMemories(data.memories);
      setMemoryError('');
    }).catch(error => { if (!controller.signal.aborted) { rememberKey.current = ''; setMemoryError(error instanceof Error ? error.message : '回忆记录暂时没有保存成功。'); } });
    return () => { controller.abort(); if (rememberKey.current === key) rememberKey.current = ''; };
  }, [progress, isEnding, memoryRetry]);
  useEffect(() => { if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight; }, [messages, answering]);

  async function ask(text = question) {
    if (!progress || answering || !text.trim()) return;
    const controller = new AbortController(); pending.current = controller;
    const currentQuestion = text.trim(), conversation = messages.slice(-6);
    setAnswering(true); setError(''); setQuestion('');
    setMessages(previous => [...previous, { role: 'user', content: currentQuestion }]);
    const timer = window.setTimeout(() => controller.abort(), 65000);
    try {
      const response = await accountFetch('/api/liukan/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...progress, question: currentQuestion, requestId: crypto.randomUUID(), conversation }), signal: controller.signal });
      const data = await response.json() as LiukanRecallResponse & { error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message ?? '直答暂时没接上，请稍后再试。');
      if (typeof data.answer !== 'string' || !data.answer.trim() || !['zhihu-zhida', 'relay'].includes(data.source)) throw new Error('看山这次没有收到完整回复。');
      if (pending.current !== controller) return;
      setMessages(previous => [...previous, { role: 'assistant', content: data.answer }]);
      setMemories(data.context.completed);
    } catch (error) {
      if (pending.current === controller) { setError(controller.signal.aborted ? '这次等待超时了，点击发送可以重试。' : error instanceof Error ? error.message : '直答暂时没接上，请稍后再试。'); setQuestion(currentQuestion); }
    } finally { window.clearTimeout(timer); if (pending.current === controller) { pending.current = null; setAnswering(false); } }
  }

  useEffect(() => {
    try { accountLocalStorage.setItem(LIU_KAN_SHAN_POSITION_KEY, JSON.stringify(position)); } catch { /* storage can be unavailable in private browsing */ }
  }, [position]);
  useEffect(() => {
    const onResize = () => { const next = { width: window.innerWidth, height: window.innerHeight }; setViewport(next); setPosition(previous => clampPetPosition(previous, next)); };
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    // A resize may happen between the initial render and effect subscription.
    onResize();
    return () => { window.removeEventListener('resize', onResize); window.visualViewport?.removeEventListener('resize', onResize); };
  }, []);
  useEffect(() => { const media = window.matchMedia('(prefers-reduced-motion: reduce)'); const update = () => setReducedMotion(media.matches); media.addEventListener('change', update); return () => media.removeEventListener('change', update); }, []);
  useEffect(() => {
    try { accountLocalStorage.setItem(LIU_KAN_SHAN_OPEN_KEY, open ? '1' : '0'); } catch { /* optional preference */ }
  }, [open]);

  useLayoutEffect(() => {
    if (!progress || viewport.width > 600 || dragging) return;
    const stage = document.querySelector('.game-stage');
    if (!stage) return;
    let frame = 0;
    const avoidChoices = () => {
      const region = stage.querySelector('.choice-region');
      if (!region?.querySelector('.choice-button, .locked-choice')) return;
      const bounds = region.getBoundingClientRect();
      if (!bounds.width || !bounds.height || bounds.bottom <= 0 || bounds.top >= viewport.height) return;
      setPosition(previous => {
        const next = avoidPetChoices(previous, viewport, bounds);
        return next.x === previous.x && next.y === previous.y ? previous : next;
      });
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(avoidChoices); };
    const mutations = new MutationObserver(schedule);
    const sizes = new ResizeObserver(schedule);
    mutations.observe(stage, { childList: true, subtree: true });
    sizes.observe(stage);
    const region = stage.querySelector('.choice-region');
    if (region) sizes.observe(region);
    window.addEventListener('scroll', schedule, true);
    avoidChoices();
    return () => { mutations.disconnect(); sizes.disconnect(); window.removeEventListener('scroll', schedule, true); cancelAnimationFrame(frame); };
  }, [progress?.worldId, viewport.width, viewport.height, position.x, position.y, dragging]);

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragOffset.current = { x: event.clientX - position.x, y: event.clientY - position.y };
    dragStart.current = { x: event.clientX, y: event.clientY }; didDrag.current = false;
    setDragging(true);
  };
  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    if (Math.hypot(event.clientX - dragStart.current.x, event.clientY - dragStart.current.y) > 5) didDrag.current = true;
    setPosition(clampPetPosition({ x: event.clientX - dragOffset.current.x, y: event.clientY - dragOffset.current.y }, { width: window.innerWidth, height: window.innerHeight }));
  };
  const stopDrag = () => setDragging(false);

  return <aside className={`liukan-pet ${open ? 'is-open' : ''} ${dragging ? 'is-dragging' : ''} ${dropAvailable ? 'is-drop-available' : ''} ${dropHover ? 'is-drop-hover' : ''}`} style={{ left: position.x, top: position.y }} aria-label="刘看山陪伴面板" data-tour="liukan-pet"
    onDragOver={event => { if (isLiukanDrag([...event.dataTransfer.types])) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setDropHover(true); } }}
    onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropHover(false); }}
    onDrop={event => { const payload = parseLiukanDrop(event.dataTransfer); if (!payload) return; event.preventDefault(); event.stopPropagation(); void receivePost(payload); }}>
    {dropAvailable && <span className="liukan-drop-hint" style={{ left: Math.min(Math.max(12, position.x - 40), viewport.width - 152), top: Math.max(12, position.y - 58) }} role="status">{dropHover ? '松手，我收下啦' : '把回答拖给我'}</span>}
    {open && <section className="liukan-panel" style={petPanelPosition(position, viewport)} aria-label="刘看山回忆与提问">
      <header><span><b>刘看山</b><small>已读 {posts.length} 篇 · 同行 {completed} 个结局</small></span><button type="button" onClick={() => setOpen(false)} aria-label="收起刘看山"><X size={15} /></button></header>
      <div className="liukan-quick-tools">{onActivityDesk && <button type="button" onClick={() => { setOpen(false); onActivityDesk(); }}>同行记录</button>}{onReadingDesk && <button type="button" onClick={() => { setOpen(false); onReadingDesk(selectedPostId || undefined); }}>阅读手记</button>}{onStartGuide && <button type="button" onClick={() => { setOpen(false); onStartGuide(); }}>怎么开始</button>}{onCapabilities && <button type="button" onClick={() => { setOpen(false); onCapabilities(); }}>聊天与连接</button>}<button type="button" onClick={() => { setOpen(false); setGalleryOpen(true); }}>动作图鉴</button></div>
      <nav className="liukan-tabs" aria-label="看山的记录"><button type="button" aria-pressed={view === 'reading'} onClick={() => setView('reading')}><Inbox size={13} />一起读</button><button type="button" aria-pressed={view === 'journey'} onClick={() => setView('journey')}><BookOpen size={13} />关卡回忆</button></nav>
      <div className="liukan-panel-body">
      {view === 'reading' ? <div className="liukan-inbox">
        {feedBusy && <p className="liukan-thinking" role="status"><LoaderCircle size={13} />{feedStage === 'capture' ? '正在获取回答全文…' : '正在保存回答…'}</p>}
        {feedError && <p className="liukan-error" role="alert">{feedError}{failedFeed && <button type="button" disabled={feedBusy} onClick={() => void receivePost(failedFeed)}>再交一次</button>}</p>}
        {!inboxReady && !feedError && <p className="liukan-thinking" role="status"><LoaderCircle size={13} />正在打开书袋……</p>}
        {posts.length > 0 && <label className="liukan-post-select"><span>看山的书袋</span><select aria-label="选择已读回答" value={selectedPostId} onChange={event => setSelectedPostId(event.target.value)} disabled={generating}>{posts.map(post => <option key={post.id} value={post.id}>{post.candidate.title}</option>)}</select><ChevronDown size={12} /></label>}
        {selectedPost ? <>
          <article className="liukan-post"><span className="liukan-post-kicker">{selectedPost.candidate.origin.contentScope === 'question-answer-excerpt' ? '知乎回答接口节选 · 已保存' : selectedPost.candidate.origin.contentScope === 'webpage-selection' ? '知乎网页选取 · 已保存' : '知乎搜索节选 · 已保存'}</span><h3>{selectedPost.candidate.title}</h3><p className="liukan-post-author">{selectedPost.candidate.author} · {selectedPost.candidate.characters.toLocaleString()} 字</p>
            <details className="liukan-source-preview"><summary>看看原文<ChevronDown size={12} /></summary><div>{selectedPost.candidate.excerpt}</div></details>
            {onReadPost ? <button type="button" className="liukan-source-link" onClick={() => onReadPost(selectedPost)}><ExternalLink size={12} />打开原文</button> : null}
          </article>
          <p className="liukan-reading-note">这篇已经收好了。下次回来，也能接着聊。</p>{onReadingDesk && <button type="button" className="liukan-reading-desk-entry" onClick={() => { setOpen(false); onReadingDesk(selectedPost.id); }}><BookOpen size={15} /><span><b>和看山细读这篇</b><small>人物、时间线、伏笔与改编点子</small></span></button>}
          <div className="liukan-messages" ref={postMessagesRef} aria-live="polite" aria-label="与刘看山聊原文">{postMessages.map((message, index) => <p className={`liukan-message is-${message.role}`} key={index}><small>{message.role === 'user' ? '你' : '刘看山'}</small>{message.content}</p>)}{postAnswering && <p className="liukan-thinking"><LoaderCircle size={13} />让我翻翻这篇原文……</p>}</div>
          <form className="liukan-post-form" onSubmit={event => { event.preventDefault(); void askPost(); }}><label className="liukan-input-label" htmlFor="liukan-post-question">聊聊这篇故事</label><textarea id="liukan-post-question" rows={2} maxLength={1000} value={postQuestion} placeholder="你觉得这个人物为什么会这样选？" onChange={event => setPostQuestion(event.target.value)} /><button className="liukan-send" type="submit" disabled={postAnswering || !postQuestion.trim()} aria-label="向刘看山提问原文">{postAnswering ? <LoaderCircle size={14} /> : <Send size={14} />}发送</button></form>
          {postError && <p className="liukan-error" role="alert">{postError}</p>}
          <div className="liukan-create-game"><div><b>让这篇故事，变成你的冒险</b><p>保留原文，另外创作可玩的路线与结局。</p></div>
            {project?.status === 'running' ? <p className="liukan-project-progress" role="status"><LoaderCircle size={14} />正在{({ imported: '准备原文', outline: '构思剧情', scenes: '写场景与选择', validation: '检查故事', editorial: '润色剧情', art: '制作插图', ready: '整理游戏' } as const)[project.stage]}{project.completedRoutes > 0 ? ` · ${project.completedRoutes} 条路线已写好` : ''}</p> : <button type="button" className="liukan-generate" onClick={() => project?.playable && onProject ? onProject(project) : void generatePost()} disabled={generating || feedBusy}><Sparkles size={14} />{generating ? '正在启动…' : project?.playable ? '打开生成的游戏' : project?.status === 'failed' || project?.status === 'interrupted' ? '继续制作游戏' : '制作游戏'}</button>}
            {project && <p className="liukan-project-note">{project.playable ? '剧情已经可以游玩' : '生成进度会保留在故事工作台'}{project.art.status !== 'ready' ? ' · 插图尚未齐备' : ' · 插图已完成'}</p>}
            {(generationError || project?.error) && <p className="liukan-error" role="alert">{generationError || project?.error?.message}</p>}
          </div>
        </> : <div className="liukan-inbox-empty"><Inbox size={24} /><h3>看到喜欢的回答，交给我吧</h3><p>把知乎回答拖到小看山身上，或者点“交给看山”。我会收好原文，陪你读，也能把它做成冒险游戏。</p></div>}
      </div> : <>
      <p className="liukan-memory">{title}。想回看哪一段？</p>
      {recentTitles.length ? <ul className="liukan-recent">{recentTitles.slice(0, 2).map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul> : <p className="liukan-empty">走到结局后，我会把这一程收进回忆。</p>}
      {progress ? <div className="liukan-conversation">
        <p className="liukan-current"><BookOpen size={12} /><span>{worldTitle ?? '正在游玩的故事'}</span><small>只聊走过的剧情</small></p>
        <div className="liukan-messages" ref={messagesRef} aria-live="polite" aria-label="与刘看山的对话">{messages.map((message, index) => <p className={`liukan-message is-${message.role}`} key={index}><small>{message.role === 'user' ? '你' : '刘看山'}</small>{message.content}</p>)}{answering && <p className="liukan-thinking"><LoaderCircle size={13} />我翻一下我们走过的那几页……</p>}</div>
        {!messages.length && <div className="liukan-prompts"><button type="button" disabled={answering} onClick={() => void ask('我们刚才经历了什么？')}>刚才发生了什么？</button><button type="button" disabled={answering} onClick={() => void ask('帮我理一理已经发现的线索。')}>陪我理理线索</button></div>}
        <form onSubmit={event => { event.preventDefault(); void ask(); }}><label className="liukan-input-label" htmlFor="liukan-question">跟看山聊聊</label><textarea id="liukan-question" value={question} maxLength={1000} rows={2} placeholder="还记得刚才那个选择吗？" onChange={event => setQuestion(event.target.value)} /><button type="submit" className="liukan-send" disabled={answering || !question.trim()} aria-label="发送给刘看山">{answering ? <LoaderCircle size={14} /> : <Send size={14} />}发送</button></form>
        {error && <p className="liukan-error" role="alert">{error}</p>}
      </div> : <p className="liukan-empty">先挑一篇故事开玩吧。到时候可以问我人物、线索，也可以一起回想前面的选择。</p>}
      {memories.length > 0 && <button className="liukan-memory-toggle" type="button" onClick={() => setShowMemories(previous => !previous)}><BookOpen size={13} />{showMemories ? '收起回忆' : `翻翻我们走过的 ${memories.length} 个结局`}</button>}
      {showMemories && <ul className="liukan-memories">{memories.slice().reverse().map(item => <li key={`${item.worldId}-${item.endingTitle}`}><b>{item.endingTitle}</b><span>{item.title}</span>{item.scenes?.slice(-2).map((scene, index) => <p key={index}>{scene.title}{scene.selectedChoice ? ` · ${scene.selectedChoice}` : ''}</p>)}</li>)}</ul>}
      {memoryError && <p className="liukan-error" role="alert">{memoryError}<button type="button" onClick={() => setMemoryRetry(previous => previous + 1)}>再保存一次</button></p>}
      {children}
      {(onRecall || onAsk) && <div className="liukan-actions">{onRecall && <button type="button" onClick={onRecall}><BookOpen size={14} />回忆关卡</button>}{onAsk && <button type="button" onClick={onAsk}><MessageCircle size={14} />问直答</button>}</div>}
      </>}
      <small className="liukan-provenance"><span>知乎 · 刘看山</span><span>拖动小看山，换个位置</span></small>
      </div>
    </section>}
    {galleryOpen && <div className="liukan-gallery-overlay" onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') setGalleryOpen(false); }}><LiukanActionGallery onAction={action => { setGalleryOpen(false); performLiukanAction(action); }} onClose={() => setGalleryOpen(false)} reducedMotion={reducedMotion || userReducedMotion} /></div>}
    <div className="liukan-bubble" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={stopDrag} onPointerCancel={stopDrag} role="button" tabIndex={0} aria-expanded={open} aria-label={open ? '收起刘看山陪伴面板' : '打开刘看山陪伴面板'} onClick={() => { if (!didDrag.current) setOpen(previous => !previous); didDrag.current = false; }} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setOpen(previous => !previous); } if (event.key === 'Escape') setOpen(false); if (event.key.startsWith('Arrow')) { event.preventDefault(); const delta = event.shiftKey ? 40 : 12; setPosition(previous => clampPetPosition({ x: previous.x + (event.key === 'ArrowRight' ? delta : event.key === 'ArrowLeft' ? -delta : 0), y: previous.y + (event.key === 'ArrowDown' ? delta : event.key === 'ArrowUp' ? -delta : 0) }, viewport)); } }}>
      <span className="liukan-halo" aria-hidden="true" /><LiuKanShanAvatar action={busy || generating ? 'make-game' : answering || postAnswering ? 'think' : feedBusy ? 'read-carefully' : dragging ? 'follow-me' : dropHover ? 'receive-answer' : isEnding ? 'recall-ending' : open ? 'hello' : 'listen'} eventTarget="pet" size={100} reducedMotion={reducedMotion || userReducedMotion} /><span className="liukan-grip" aria-hidden="true"><Grip size={12} /></span><span className="liukan-status" aria-hidden="true" />
    </div>
  </aside>;
}
