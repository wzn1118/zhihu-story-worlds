import { accountFetch } from './account-storage';
import { accountSessionStorage } from './account-storage';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowUpRight, BookOpen, Check, ChevronRight, Clapperboard, Clock3, Copy, Download, FileText, Flag, GitBranch, HelpCircle, History, Lightbulb, ListTree, LoaderCircle, MessageCircle, PenLine, Search, Send, Sparkles, Users, X } from 'lucide-react';
import type { LiukanInboxPost } from '../shared/liukan-inbox';
import type { LiukanReadingIndex, LiukanReadingNote, LiukanReadingRunInput, LiukanReadingSkillId } from '../shared/liukan-reading';
import type { WorkshopProject } from '../shared/workshop';
import { readingFingerprint, readingNoteMarkdown, sourceScope } from './liukan-reading-view';
import './LiukanReadingDesk.css';

export interface LiukanReadingDeskProps {
  initialPostId?: string;
  onClose: () => void;
  onReadPost?: (post: LiukanInboxPost) => void;
  onProject?: (project: WorkshopProject) => void;
}

const SKILL_ICONS = { recap: BookOpen, characters: Users, timeline: Clock3, clues: Search, motives: Lightbulb, uncertainties: HelpCircle, compare: GitBranch, adaptation: ListTree, dialogue: MessageCircle, 'world-rules': FileText, ask: MessageCircle, 'choice-design': GitBranch, 'ending-design': Flag, storyboard: Clapperboard, pitch: FileText, style: PenLine, relationships: Users, foreshadowing: Search, 'playtest-review': Flag };
const REQUEST_STORE = 'redleaf:liukan-reading-requests:v1';
const focusableSelector = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])';

class ReadingRequestError extends Error {
  constructor(message: string, public code = 'READING_NETWORK') { super(message); }
}

async function request<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await accountFetch(path, { signal, ...(body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) });
  const data = await response.json().catch(() => null) as T & { error?: { message?: string; code?: string } } | null;
  if (!response.ok) throw new ReadingRequestError(data?.error?.message ?? '这次没有接上，稍后可以查看这次结果。', data?.error?.code);
  if (!data) throw new ReadingRequestError('这次收到的内容不完整，稍后可以查看这次结果。');
  return data;
}

function requestIdFor(key: string, memory: Map<string, string>) {
  if (memory.has(key)) return memory.get(key)!;
  try {
    const saved = JSON.parse(accountSessionStorage.getItem(REQUEST_STORE) ?? '[]') as Array<[string, string]>;
    if (Array.isArray(saved)) for (const item of saved.slice(-30)) if (Array.isArray(item) && typeof item[0] === 'string' && typeof item[1] === 'string') memory.set(item[0], item[1]);
  } catch { /* An in-memory ID still protects retries when browser storage is unavailable. */ }
  const id = memory.get(key) ?? crypto.randomUUID();
  memory.set(key, id);
  try { accountSessionStorage.setItem(REQUEST_STORE, JSON.stringify([...memory].slice(-30))); } catch { /* Session storage is optional. */ }
  return id;
}

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '已保存' : date.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
}

export function LiukanReadingDesk({ initialPostId, onClose, onReadPost, onProject }: LiukanReadingDeskProps) {
  const headingId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const readerRef = useRef<HTMLElement>(null);
  const paperRef = useRef<HTMLElement>(null);
  const questionRef = useRef<HTMLTextAreaElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const mounted = useRef(true);
  const selectionRevision = useRef(0);
  const activeRun = useRef(false);
  const requestIds = useRef(new Map<string, string>());
  const [posts, setPosts] = useState<LiukanInboxPost[]>([]);
  const [index, setIndex] = useState<LiukanReadingIndex>({ skills: [], notes: [] });
  const [selectedIds, setSelectedIds] = useState<string[]>(initialPostId ? [initialPostId] : []);
  const [skill, setSkill] = useState<LiukanReadingSkillId>('recap');
  const [skillGroup, setSkillGroup] = useState<'reading' | 'writing'>('reading');
  const [parentNoteId, setParentNoteId] = useState<string>();
  const [question, setQuestion] = useState('');
  const [query, setQuery] = useState('');
  const [libraryTab, setLibraryTab] = useState<'sources' | 'notes'>('sources');
  const [mobileTab, setMobileTab] = useState<'write' | 'library'>('write');
  const [currentNote, setCurrentNote] = useState<LiukanReadingNote | null>(null);
  const [sourcePreview, setSourcePreview] = useState<LiukanInboxPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [detailBusy, setDetailBusy] = useState('');
  const [error, setError] = useState<ReadingRequestError | null>(null);
  const [notice, setNotice] = useState('');
  const [showMarkdown, setShowMarkdown] = useState(false);
  const [projectBusy, setProjectBusy] = useState(false);
  const selectedSkill = index.skills.find(item => item.id === skill);
  const groupSkills = index.skills.filter(item => item.invented === (skillGroup === 'writing'));
  const parentNote = index.notes.find(note => note.id === parentNoteId);
  const selectedPosts = posts.filter(post => selectedIds.includes(post.id)).sort((a, b) => a.id.localeCompare(b.id));
  const visiblePosts = useMemo(() => { const term = query.trim().toLocaleLowerCase(); return posts.filter(post => !term || `${post.candidate.title}\n${post.candidate.author}\n${post.candidate.excerpt}`.toLocaleLowerCase().includes(term)); }, [posts, query]);
  const validSelection = Boolean(selectedSkill && selectedIds.length >= selectedSkill.minSources && selectedIds.length <= selectedSkill.maxSources && selectedPosts.length === selectedIds.length);
  const validQuestion = skill !== 'ask' || Boolean(question.trim());
  const allowsMultiple = (selectedSkill?.maxSources ?? 1) > 1;
  const markdown = currentNote ? readingNoteMarkdown(currentNote, index.notes.find(note => note.id === currentNote.parentNoteId)) : '';

  useEffect(() => {
    if (!currentNote) return;
    const frame = requestAnimationFrame(() => {
      paperRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
      paperRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [currentNote?.id]);

  useLayoutEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const siblings = Array.from(document.body.children).filter((element): element is HTMLElement => element instanceof HTMLElement && element !== overlay);
    const previousInert = siblings.map(element => [element, element.inert] as const);
    for (const [element] of previousInert) element.inert = true;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); if (readerRef.current) setSourcePreview(null); else closeRef.current(); return; }
      if (event.key !== 'Tab') return;
      const scope = readerRef.current ?? overlay;
      const available = Array.from(scope.querySelectorAll<HTMLElement>(focusableSelector)).filter(element => element.getClientRects().length && !element.closest('[inert]'));
      const first = available[0], last = available[available.length - 1];
      if (!first) { event.preventDefault(); dialogRef.current?.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current || !scope.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !scope.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    const containFocus = (event: FocusEvent) => {
      const scope = readerRef.current ?? overlay;
      if (event.target instanceof Node && !scope.contains(event.target)) {
        if (readerRef.current) readerRef.current.querySelector<HTMLButtonElement>('button')?.focus();
        else dialogRef.current?.focus();
      }
    };
    document.addEventListener('keydown', trap, true);
    document.addEventListener('focusin', containFocus, true);
    return () => {
      document.removeEventListener('keydown', trap, true); document.removeEventListener('focusin', containFocus, true);
      for (const [element, prior] of previousInert) element.inert = prior;
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected && !previousFocus.closest('[inert]')) previousFocus.focus();
    };
  }, []);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; selectionRevision.current += 1; }; }, []);
  useLayoutEffect(() => {
    if (!sourcePreview) return;
    const prior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    readerRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => { if (prior?.isConnected && !prior.closest('[inert]')) prior.focus(); };
  }, [sourcePreview]);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setLoadError('');
    void Promise.allSettled([
      request<{ posts: LiukanInboxPost[] }>('/api/liukan/inbox', undefined, controller.signal),
      request<LiukanReadingIndex>('/api/liukan/reading', undefined, controller.signal),
    ]).then(results => {
      if (controller.signal.aborted) return;
      const failures: string[] = [];
      if (results[0].status === 'fulfilled') {
        const next = results[0].value.posts; setPosts(next);
        setSelectedIds(previous => { const existing = previous.filter(id => next.some(post => post.id === id)); return existing.length ? existing : next[0] ? [next[0].id] : []; });
      } else failures.push(results[0].reason instanceof Error ? results[0].reason.message : '书袋暂时没有打开。');
      if (results[1].status === 'fulfilled') setIndex(results[1].value);
      else failures.push(results[1].reason instanceof Error ? results[1].reason.message : '手记暂时没有读到。');
      setLoadError([...new Set(failures)].join(' ')); setLoading(false);
    });
    return () => controller.abort();
  }, [reload]);

  const clearResult = () => { selectionRevision.current += 1; setCurrentNote(null); setError(null); setNotice(''); setShowMarkdown(false); setSourcePreview(null); };
  const chooseSource = (postId: string) => {
    const next = allowsMultiple ? selectedIds.includes(postId) ? selectedIds.filter(id => id !== postId) : selectedIds.length < (selectedSkill?.maxSources ?? 1) ? [...selectedIds, postId] : selectedIds : [postId];
    if (next.length === selectedIds.length && next.every(id => selectedIds.includes(id))) return;
    clearResult();
    setParentNoteId(undefined); setSelectedIds(next);
  };
  const chooseSkill = (next: LiukanReadingSkillId) => {
    clearResult(); setSkill(next);
    const definition = index.skills.find(item => item.id === next);
    setSkillGroup(definition?.invented ? 'writing' : 'reading');
    const maxSources = definition?.maxSources ?? 1;
    if (selectedIds.length > maxSources) { setSelectedIds(previous => previous.slice(0, maxSources)); setParentNoteId(undefined); }
  };
  const chooseGroup = (group: 'reading' | 'writing') => {
    if (group === skillGroup) return;
    const first = index.skills.find(item => item.invented === (group === 'writing'));
    if (first) chooseSkill(first.id);
  };
  const clearParent = () => { clearResult(); setParentNoteId(undefined); };

  function continueNote(note: LiukanReadingNote) {
    clearResult(); setParentNoteId(note.id); setSkill('ask'); setSkillGroup('reading');
    setSelectedIds(note.sources.map(source => source.postId)); setQuestion(''); setMobileTab('write');
    requestAnimationFrame(() => { questionRef.current?.scrollIntoView({ block: 'center', behavior: 'instant' }); questionRef.current?.focus({ preventScroll: true }); });
  }

  async function run() {
    if (activeRun.current || !validSelection || !validQuestion || !selectedSkill) return;
    activeRun.current = true; setBusy(true); setCurrentNote(null); setError(null); setNotice(''); setShowMarkdown(false); setMobileTab('write');
    const revision = ++selectionRevision.current;
    const key = readingFingerprint(skill, selectedIds, question, parentNoteId);
    const input: LiukanReadingRunInput = { skill, postIds: [...selectedIds].sort(), ...(question.trim() ? { question: question.trim() } : {}), ...(parentNoteId ? { parentNoteId } : {}), requestId: requestIdFor(key, requestIds.current) };
    try {
      const note = await request<LiukanReadingNote>('/api/liukan/reading/run', input);
      if (!mounted.current) return;
      setIndex(previous => ({ ...previous, notes: [note, ...previous.notes.filter(item => item.id !== note.id)].slice(0, 100) }));
      if (selectionRevision.current === revision) { setCurrentNote(note); setNotice('这页已经收好了，下次回来还在。'); }
    } catch (value) {
      if (mounted.current && selectionRevision.current === revision) setError(value instanceof ReadingRequestError ? value : new ReadingRequestError('连接中断了，这次阅读可能仍在继续。点“查看这次结果”会沿用原来的任务。'));
    } finally { activeRun.current = false; if (mounted.current) setBusy(false); }
  }

  async function openNote(note: Pick<LiukanReadingNote, 'id'>) {
    clearResult(); const revision = selectionRevision.current; setDetailBusy(note.id); setMobileTab('write');
    try {
      const detail = await request<LiukanReadingNote>(`/api/liukan/reading/${encodeURIComponent(note.id)}`);
      if (!mounted.current || selectionRevision.current !== revision) return;
      setCurrentNote(detail); setSkill(detail.skill); setSkillGroup(detail.invented ? 'writing' : 'reading'); setSelectedIds(detail.sources.map(source => source.postId)); setQuestion(detail.question ?? ''); setParentNoteId(detail.parentNoteId);
      setIndex(previous => ({ ...previous, notes: previous.notes.some(item => item.id === detail.id) ? previous.notes.map(item => item.id === detail.id ? detail : item) : [detail, ...previous.notes] }));
      if (detail.parentNoteId && !index.notes.some(item => item.id === detail.parentNoteId)) {
        void request<LiukanReadingNote>(`/api/liukan/reading/${encodeURIComponent(detail.parentNoteId)}`).then(parent => {
          if (mounted.current && selectionRevision.current === revision) setIndex(previous => ({ ...previous, notes: [...previous.notes.filter(item => item.id !== parent.id), parent] }));
        }).catch(() => { if (mounted.current && selectionRevision.current === revision) setNotice('上一页暂时没有打开，这页仍保留续读记录和当时的问题。'); });
      }
    } catch (value) { if (mounted.current && selectionRevision.current === revision) setError(value instanceof ReadingRequestError ? value : new ReadingRequestError('这页手记暂时没有打开，请再试一次。')); }
    finally { if (mounted.current) setDetailBusy(previous => previous === note.id ? '' : previous); }
  }

  function readSource(postId: string) {
    const post = posts.find(item => item.id === postId);
    if (!post) { setNotice('这份原文已经不在书袋里，手记仍保留生成时的引文。'); return; }
    setSourcePreview(post);
  }

  async function copyMarkdown() {
    try { await navigator.clipboard.writeText(markdown); setNotice('手记已复制，贴到哪里都能接着整理。'); }
    catch { setShowMarkdown(true); setNotice('在下面选中文字，就可以复制整页手记。'); }
  }

  function downloadMarkdown() {
    if (!currentNote) return;
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = `${currentNote.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').slice(0, 70) || '看山阅读手记'}.md`;
    anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); setNotice('已交给浏览器下载，原文与引文也在文件里。');
  }

  async function openExistingProject(post: LiukanInboxPost) {
    if (!post.projectId || !onProject || projectBusy) return;
    setProjectBusy(true); setNotice('');
    try {
      const project = await request<WorkshopProject>(`/api/workshop/projects/${encodeURIComponent(post.projectId)}`);
      if (mounted.current) { onClose(); onProject(project); }
    } catch (value) { if (mounted.current) setNotice(value instanceof Error ? value.message : '这个游戏的记录暂时没有打开。'); }
    finally { if (mounted.current) setProjectBusy(false); }
  }

  return createPortal(<div className="lrd-overlay" ref={overlayRef} onKeyDown={event => event.stopPropagation()} data-testid="liukan-reading-overlay">
    <section className="lrd-desk" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={headingId} tabIndex={-1} data-guide="liukan-reading-desk">
      <header className="lrd-header" inert={Boolean(sourcePreview)}>
        <div className="lrd-brand"><span className="lrd-brand-mark" aria-hidden="true">看</span><div><span className="lrd-eyebrow">刘看山 · 和你一起读</span><h2 id={headingId}>阅读手记</h2></div></div>
        <div className="lrd-header-meta"><span><i />{index.notes.length} 页已经收好</span><button type="button" className="lrd-close" onClick={onClose} aria-label="关闭阅读手记"><X size={20} /></button></div>
      </header>
      <nav className="lrd-mobile-nav" aria-label="阅读手记视图" inert={Boolean(sourcePreview)}><button type="button" aria-pressed={mobileTab === 'write'} onClick={() => setMobileTab('write')}><BookOpen size={15} />一起细读</button><button type="button" aria-pressed={mobileTab === 'library'} onClick={() => setMobileTab('library')}><History size={15} />书袋与手记<span>{posts.length}</span></button></nav>
      <div className={`lrd-body is-${mobileTab}`} inert={Boolean(sourcePreview)}>
        <aside className="lrd-library" aria-label="书袋与手记">
          <nav className="lrd-library-tabs" aria-label="阅读资料分类"><button type="button" aria-pressed={libraryTab === 'sources'} onClick={() => setLibraryTab('sources')}>看山的书袋<span>{posts.length}</span></button><button type="button" aria-pressed={libraryTab === 'notes'} onClick={() => setLibraryTab('notes')}>已写手记<span>{index.notes.length}</span></button></nav>
          {libraryTab === 'sources' ? <>
            <label className="lrd-search"><Search size={15} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="找标题、作者或原文里的话" aria-label="搜索已保存原文" /></label>
            <p className="lrd-library-hint">{allowsMultiple ? `选 ${selectedSkill?.minSources}—${selectedSkill?.maxSources} 篇一起读 · 已选 ${selectedIds.length} 篇` : '挑一篇，看山陪你慢慢读。'}</p>
            <div className="lrd-source-list">
              {visiblePosts.map((post, order) => <article className={`lrd-source ${selectedIds.includes(post.id) ? 'is-selected' : ''}`} key={post.id}>
                <button type="button" className="lrd-source-select" aria-pressed={selectedIds.includes(post.id)} onClick={() => chooseSource(post.id)} disabled={allowsMultiple && selectedIds.length >= (selectedSkill?.maxSources ?? 1) && !selectedIds.includes(post.id)}>
                  <span className="lrd-source-order">{selectedIds.includes(post.id) ? <Check size={13} /> : String(order + 1).padStart(2, '0')}</span><span className="lrd-source-copy"><small>{sourceScope(post.candidate.origin.contentScope)}</small><strong>{post.candidate.title}</strong><span>{post.candidate.author || '原文未署名'} · {post.candidate.characters.toLocaleString()} 字</span><p>{post.candidate.excerpt.slice(0, 74)}{post.candidate.excerpt.length > 74 ? '…' : ''}</p></span>
                </button><button className="lrd-source-read" type="button" onClick={() => readSource(post.id)}>翻开原文<ArrowUpRight size={12} /></button>
              </article>)}
              {!loading && !visiblePosts.length && <div className="lrd-library-empty"><BookOpen size={26} /><h3>{posts.length ? '没有找到这句话' : '书袋还空着'}</h3><p>{posts.length ? '试试作者名，或原文里的另一个词。' : '先在知乎页面把喜欢的回答交给看山，回来就能一起细读。'}</p></div>}
            </div>
          </> : <div className="lrd-note-list">{index.notes.map(note => <button type="button" key={note.id} className={`lrd-history-note ${currentNote?.id === note.id ? 'is-current' : ''}`} onClick={() => void openNote(note)} disabled={detailBusy === note.id}><span><small>{dateLabel(note.createdAt)} · {note.invented ? '改编草稿' : '阅读手记'}</small><strong>{note.title}</strong><p>{note.summary}</p></span>{detailBusy === note.id ? <LoaderCircle size={16} className="lrd-spin" /> : <ChevronRight size={16} />}</button>)}{!loading && !index.notes.length && <div className="lrd-library-empty"><FileText size={26} /><h3>第一张空白页</h3><p>选一篇原文和一种读法，完成的手记会留在这里。</p></div>}</div>}
          <div className="lrd-library-footer"><img src="/assets/liukan/computer.png" alt="" width="58" height="58" /><p>读过的话，<br />值得好好收着。</p></div>
        </aside>
        <main className="lrd-main">
          {loadError && <div className="lrd-load-error" role="alert"><span>{loadError}</span><button type="button" disabled={loading} onClick={() => setReload(value => value + 1)}>重新打开</button></div>}
          {loading && <p className="lrd-loading" role="status"><LoaderCircle size={15} className="lrd-spin" />正在翻开书袋和手记……</p>}
          <div className="lrd-workspace">
            <section className="lrd-composer" aria-label="选择阅读能力">
              <div className="lrd-composer-heading"><div><span className="lrd-eyebrow">读懂一点，再想远一点</span><h3>{currentNote ? '下一页，想聊什么？' : '这次，想从哪里读起？'}</h3><p>理清人物与线索，也给自己的故事留一点灵感。</p></div><img src="/assets/liukan/idle.png" alt="看山陪你读书" width="90" height="90" /></div>
              <nav className="lrd-skill-groups" aria-label="看山的能力分类"><button type="button" aria-pressed={skillGroup === 'reading'} onClick={() => chooseGroup('reading')}><BookOpen size={17} /><span>读懂故事<small>人物、线索，还有没想通的事</small></span><b>{index.skills.filter(item => !item.invented).length}</b></button><button type="button" aria-pressed={skillGroup === 'writing'} onClick={() => chooseGroup('writing')}><PenLine size={17} /><span>动笔改编<small>选择、结局，试着写出下一页</small></span><b>{index.skills.filter(item => item.invented).length}</b></button></nav>
              <div className="lrd-skills" role="group" aria-label={skillGroup === 'reading' ? '读懂故事的能力' : '动笔改编的能力'}>{groupSkills.map(item => { const Icon = SKILL_ICONS[item.id] ?? BookOpen; return <button type="button" key={item.id} className={`lrd-skill ${item.invented ? 'is-creative' : ''}`} aria-pressed={skill === item.id} onClick={() => chooseSkill(item.id)} title={item.description}><Icon size={19} /><span>{item.title}</span>{item.invented && <small>创作</small>}</button>; })}</div>
              {selectedSkill && <div className="lrd-skill-detail"><span className="lrd-detail-rule" /><p>{selectedSkill.description}{selectedSkill.invented && <small>新写的情节会单独标成改编草稿，原文原样保留。</small>}</p></div>}
              <div className="lrd-selected-sources"><span>{selectedPosts.length > 1 ? '放在一起读' : '正在读'}</span>{selectedPosts.map((post, position) => <button type="button" key={post.id} onClick={() => readSource(post.id)} title={post.candidate.title}><BookOpen size={12} /><span>{allowsMultiple ? `${position + 1}. ` : ''}{post.candidate.title}</span></button>)}{!selectedPosts.length && <button type="button" className="lrd-pick-source" onClick={() => { setLibraryTab('sources'); setMobileTab('library'); }}>先从书袋挑一篇<ChevronRight size={13} /></button>}{selectedPosts.length < (selectedSkill?.minSources ?? 1) && selectedPosts.length > 0 && <small>还需要再选一篇原文</small>}</div>
              {parentNoteId && <div className="lrd-parent-context"><MessageCircle size={18} /><div><small>接着上一页聊</small><button type="button" onClick={() => void openNote({ id: parentNoteId })}>{parentNote?.title ?? '上一页阅读手记'}<ArrowUpRight size={13} /></button><p>上一页是看山写的手记；这一页仍会核对原文。</p></div><button type="button" className="lrd-detach-parent" onClick={clearParent} aria-label="不接着上一页，独立写一页"><X size={16} /></button></div>}
              <form className="lrd-compose-form" onSubmit={event => { event.preventDefault(); void run(); }}><label htmlFor={`${headingId}-question`}>{skill === 'ask' ? '这次想问什么？' : '想特别留意什么？'}<span>{skill === 'ask' ? '写下你的问题' : '可以留空'}</span></label><textarea ref={questionRef} id={`${headingId}-question`} rows={2} maxLength={1000} required={skill === 'ask'} value={question} onChange={event => { clearResult(); setQuestion(event.target.value); }} placeholder={skill === 'ask' ? parentNoteId ? '比如：上一页提到的那个矛盾，还有哪些解释？' : '比如：他明明已经知道真相，为什么还要回去？' : skill === 'compare' ? '比如：这两篇对同一个人物的看法，差在哪里？' : '比如：那个没有接通的电话，和结尾有什么关系？'} /><div className="lrd-compose-footer"><small>{selectedSkill?.invented ? '将写成一页改编草稿，保留原文出处' : skill === 'ask' && !question.trim() ? '先写下问题，看山再回到原文里找答案' : '每个判断，都尽量回到原文里'}</small><button type="submit" className="lrd-run" disabled={busy || !validSelection || !validQuestion || loading}>{busy ? <LoaderCircle size={15} className="lrd-spin" /> : error ? <History size={15} /> : <Send size={15} />}{busy ? '看山正在细读' : error ? '查看这次结果' : parentNoteId ? '接着这一页问' : selectedSkill?.invented ? '和看山一起写' : '和看山一起读'}</button></div></form>
              {busy && <p className="lrd-running" role="status">正在读原文、整理引文，完成后会把这一页收好。</p>}
              {error && <div className="lrd-error" role="alert"><strong>这页还没有写好</strong><p>{error.message}</p>{parentNoteId && ['READING_PARENT_DEPTH', 'READING_PARENT_CHANGED', 'INVALID_READING_PARENT', 'READING_NOTE_CHANGED', 'READING_NOTE_MISSING'].includes(error.code) ? <><small>可以回到当前原文，重新开始一页独立手记。</small><button type="button" onClick={clearParent}>从原文重新开始</button></> : <small>再次查看会沿用这次任务，保留已有进度。</small>}<button type="button" disabled={loading} onClick={() => { setLibraryTab('notes'); setReload(value => value + 1); setMobileTab('library'); }}>翻翻已完成的手记</button></div>}
            </section>
            {currentNote ? <article className={`lrd-paper ${currentNote.invented ? 'is-draft' : ''}`} ref={paperRef} tabIndex={-1} aria-label="已完成的阅读手记" data-testid="liukan-reading-note">
              <div className="lrd-paper-topline"><span>{currentNote.invented ? <Sparkles size={13} /> : <BookOpen size={13} />}{currentNote.invented ? '看山与你的改编草稿' : '看山与你的阅读手记'}</span><time dateTime={currentNote.createdAt}>{dateLabel(currentNote.createdAt)}</time></div>
              <h3>{currentNote.title}</h3><p className="lrd-note-summary">{currentNote.summary}</p>{currentNote.invented && <p className="lrd-draft-label">以下情节或对白是新创作的改编内容，引用框里才是原文。</p>}
              {(currentNote.question || currentNote.parentNoteId) && <div className="lrd-note-context">{currentNote.parentNoteId && <><button type="button" onClick={() => void openNote({ id: currentNote.parentNoteId! })}><History size={13} /><span>接着《{index.notes.find(note => note.id === currentNote.parentNoteId)?.title ?? '上一页手记'}》</span><ArrowUpRight size={13} /></button><small>前页仅作讨论背景，下面的引用仍来自原文。</small></>}{currentNote.question && <p><span>你问</span>{currentNote.question}</p>}</div>}
              {currentNote.sections.map((section, order) => <section className="lrd-note-section" key={`${order}-${section.heading}`}><div className="lrd-section-heading"><span>{String(order + 1).padStart(2, '0')}</span><h4>{section.heading}</h4></div><p className="lrd-note-body">{section.body}</p>{section.evidence.map((evidence, evidenceOrder) => { const source = currentNote.sources.find(item => item.postId === evidence.postId); return <figure className="lrd-evidence" key={`${evidence.postId}-${evidenceOrder}`}><blockquote>{evidence.quote}</blockquote><figcaption><span>原文 · {source?.author || '未署名'}</span><button type="button" onClick={() => readSource(evidence.postId)}>回到这一篇<ArrowUpRight size={12} /></button></figcaption></figure>; })}</section>)}
              <footer className="lrd-note-footer"><h4>这一页读过的原文</h4>{currentNote.sources.map(source => <div className="lrd-note-source" key={source.postId}><button type="button" onClick={() => readSource(source.postId)}><BookOpen size={14} /><span>{source.title}</span><ArrowUpRight size={12} /></button><small>{sourceScope(source.contentScope)} · {source.complete ? '已读全部保存文字' : '这次只读了部分保存文字'}{!source.current && <b>原文已变更，手记保留当时的引文</b>}</small></div>)}<div className="lrd-note-tools"><small>{currentNote.source === 'relay' ? '当前中转' : '知乎直答'} · {currentNote.model}</small><div><button type="button" onClick={() => void copyMarkdown()}><Copy size={14} />复制</button><button type="button" onClick={downloadMarkdown}><Download size={14} />下载手记</button><button type="button" aria-expanded={showMarkdown} onClick={() => setShowMarkdown(value => !value)}>Markdown</button></div></div>{showMarkdown && <textarea className="lrd-markdown" aria-label="手记 Markdown 全文" readOnly value={markdown} rows={12} onFocus={event => event.currentTarget.select()} />}</footer>
              <div className="lrd-continue-note"><div><MessageCircle size={20} /><span><strong>还有一处没想通？</strong><small>{currentNote.sources.every(source => source.current && posts.some(post => post.id === source.postId)) ? '沿着这一页接着问，原文和前面的讨论都在。' : '这页的原文记录已变化，先重新选取原文再聊。'}</small></span></div><button type="button" disabled={busy || !currentNote.sources.every(source => source.current && posts.some(post => post.id === source.postId))} onClick={() => continueNote(currentNote)}>继续聊这一页<ChevronRight size={15} /></button></div>
            </article> : !busy && !detailBusy && <div className="lrd-blank-page"><span className="lrd-blank-line" /><BookOpen size={24} /><h3>让那些没读懂的地方，慢慢清楚起来。</h3><p>看山会引用读到的原话，陪你理清细节。<br />完成的手记会收在左边，随时回来翻。</p></div>}
            {detailBusy && <p className="lrd-loading" role="status"><LoaderCircle size={15} className="lrd-spin" />正在翻到这一页……</p>}
          </div>
        </main>
      </div>
      {notice && !sourcePreview && <div className="lrd-notice" role="status"><Check size={15} /><span>{notice}</span><button type="button" onClick={() => setNotice('')} aria-label="收起提示"><X size={14} /></button></div>}
      {sourcePreview && <aside className="lrd-source-preview" aria-label="保存的原文" ref={readerRef}><header><button type="button" onClick={() => setSourcePreview(null)}><ArrowLeft size={16} />回到手记</button><span>{sourceScope(sourcePreview.candidate.origin.contentScope)}</span></header><div className="lrd-source-preview-scroll"><small>{sourcePreview.candidate.author} · {sourcePreview.candidate.characters.toLocaleString()} 字</small><h3>{sourcePreview.candidate.title}</h3><p>{sourcePreview.candidate.excerpt}</p></div><footer>{onReadPost && <button type="button" onClick={() => { onClose(); onReadPost(sourcePreview); }}><BookOpen size={15} />在来源阅读器中打开</button>}{sourcePreview.projectId && onProject && <button type="button" disabled={projectBusy} onClick={() => void openExistingProject(sourcePreview)}>{projectBusy ? <LoaderCircle size={15} className="lrd-spin" /> : <ArrowUpRight size={15} />}查看已有游戏进度</button>}</footer></aside>}
    </section>
  </div>, document.body);
}
