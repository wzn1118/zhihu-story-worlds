import { accountFetch } from './account-storage';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Check, ChevronRight, Download, ExternalLink, FileClock, FolderOpen, History, LoaderCircle, Search, X } from 'lucide-react';
import type { LiukanMemoryProfile, LiukanMemoryRecord } from '../shared/liukan';
import type { LiukanInboxPost } from '../shared/liukan-inbox';
import type { WorkshopProject } from '../shared/workshop';
import { LiuKanShanAvatar } from './LiuKanShanAvatar';
import { artStatusLabel, memoryMarkdown, memoryMatches, preferredPreflightProject, projectPreflight, projectStatusLabel } from './liukan-activity-view';
import './LiukanActivityDesk.css';
import './LiukanPreflight.css';

export interface LiukanActivityDeskProps {
  playerId?: string;
  onClose: () => void;
  onProject: (project: WorkshopProject) => void;
  onOpenMemories?: () => void;
  onReadPost?: (post: LiukanInboxPost) => void;
}

type Tab = 'projects' | 'preflight' | 'memories';
const focusableSelector = 'button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],[tabindex]:not([tabindex="-1"])';

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await accountFetch(path, { signal });
  const data = await response.json().catch(() => null) as T & { error?: { message?: string } } | null;
  if (!response.ok) throw new Error(data?.error?.message || '这一页暂时没有读到。');
  return data as T;
}

function formatDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '时间未记录' : parsed.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function LiukanActivityDesk({ playerId, onClose, onProject, onOpenMemories, onReadPost }: LiukanActivityDeskProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const [tab, setTab] = useState<Tab>('projects');
  const [projects, setProjects] = useState<WorkshopProject[]>([]);
  const [memories, setMemories] = useState<LiukanMemoryRecord[]>([]);
  const [memoryProfile, setMemoryProfile] = useState<LiukanMemoryProfile | null>(null);
  const [posts, setPosts] = useState<LiukanInboxPost[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | WorkshopProject['status']>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [mobileTab, setMobileTab] = useState<Tab>('projects');
  const [preflightProjectId, setPreflightProjectId] = useState('');

  const load = async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    setError('');
    const controller = new AbortController();
    try {
      const requests: Array<Promise<unknown>> = [getJson<{ projects: WorkshopProject[] }>('/api/workshop/projects', controller.signal)];
      if (playerId) requests.push(getJson<{ memories: LiukanMemoryRecord[] }>(`/api/liukan/memories?playerId=${encodeURIComponent(playerId)}`, controller.signal));
      if (onReadPost) requests.push(getJson<{ posts: LiukanInboxPost[] }>('/api/liukan/inbox', controller.signal));
      const results = await Promise.allSettled(requests);
      const failures: string[] = [];
      const projectResult = results[0];
      if (projectResult.status === 'fulfilled') setProjects((projectResult.value as { projects?: WorkshopProject[] }).projects ?? []);
      else failures.push(projectResult.reason instanceof Error ? projectResult.reason.message : '故事制作记录暂时读不到。');
      let index = 1;
      if (playerId) {
        const memoryResult = results[index++];
        if (memoryResult.status === 'fulfilled') { const payload = memoryResult.value as { memories?: LiukanMemoryRecord[]; profile?: LiukanMemoryProfile }; setMemories(payload.memories ?? []); setMemoryProfile(payload.profile ?? null); }
        else failures.push(memoryResult.reason instanceof Error ? memoryResult.reason.message : '关卡回忆暂时读不到。');
      } else { setMemories([]); setMemoryProfile(null); }
      if (onReadPost) {
        const postResult = results[index];
        if (postResult.status === 'fulfilled') setPosts((postResult.value as { posts?: LiukanInboxPost[] }).posts ?? []);
        else failures.push(postResult.reason instanceof Error ? postResult.reason.message : '原文书袋暂时读不到。');
      } else setPosts([]);
      if (failures.length) setError([...new Set(failures)].join(' '));
    } finally {
      controller.abort();
      if (!silent) setLoading(false); else setRefreshing(false);
    }
  };

  const canReadPost = Boolean(onReadPost);
  useEffect(() => { void load(); return () => undefined; }, [playerId, canReadPost]);
  useEffect(() => {
    const actionable = projects.some(project => project.status === 'running');
    if (!actionable || document.visibilityState !== 'visible') return;
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(true); }, 8000);
    return () => window.clearInterval(timer);
  }, [projects, playerId, canReadPost]);
  useLayoutEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const prior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    const siblings = Array.from(document.body.children).filter((node): node is HTMLElement => node instanceof HTMLElement && node !== overlay);
    const inert = siblings.map(node => [node, node.inert] as const);
    inert.forEach(([node]) => { node.inert = true; });
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); return; }
      if (event.key !== 'Tab') return;
      const nodes = Array.from(overlay.querySelectorAll<HTMLElement>(focusableSelector)).filter(node => node.getClientRects().length && !node.closest('[inert]'));
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (!first) { event.preventDefault(); dialogRef.current?.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !overlay.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !overlay.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown, true);
    return () => { document.removeEventListener('keydown', keydown, true); inert.forEach(([node, value]) => { node.inert = value; }); document.body.style.overflow = overflow; if (prior?.isConnected && !prior.closest('[inert]')) prior.focus(); };
  }, []);

  const visibleProjects = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return projects.filter(project => (status === 'all' || project.status === status) && (!needle || `${project.title}\n${project.author}\n${project.id}`.toLocaleLowerCase().includes(needle)));
  }, [projects, query, status]);
  const visibleMemories = useMemo(() => memories.filter(memory => memoryMatches(memory, query)), [memories, query]);
  useEffect(() => {
    const fallback = preferredPreflightProject(projects);
    setPreflightProjectId(current => current && projects.some(project => project.id === current) ? current : fallback?.id ?? '');
  }, [projects]);
  const selectedPreflightProject = projects.find(project => project.id === preflightProjectId) ?? preferredPreflightProject(projects);
  const preflight = useMemo(() => projectPreflight(selectedPreflightProject, memories), [selectedPreflightProject, memories]);

  function switchTab(next: Tab) { setTab(next); setMobileTab(next); }

  function memoryKey(memory: LiukanMemoryRecord) { return `${memory.storyId}/${memory.worldId}/${memory.worldVersion}/${memory.endingTitle}`; }
  function exportMemory(memory: LiukanMemoryRecord) {
    const blob = new Blob([memoryMarkdown(memory)], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${memory.endingTitle.replace(/[\\/:*?"<>|]/g, '-').slice(0, 60) || '关卡回忆'}.md`; anchor.click(); URL.revokeObjectURL(url);
  }

  return <div className="lad-overlay" ref={overlayRef} role="presentation">
    <section className="lad-desk" ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="刘看山活动记录">
      <header className="lad-header"><div className="lad-heading"><div className="lad-avatar"><LiuKanShanAvatar action={tab === 'memories' ? 'recall-ending' : 'make-game'} size={58} reducedMotion /></div><div><p>刘看山 · 活动记录</p><h2>你留下的故事，和走过的路</h2></div></div><button type="button" className="lad-close" onClick={onClose} aria-label="关闭活动记录"><X size={18} /></button></header>
      <nav className="lad-tabs" aria-label="活动记录分类"><button type="button" aria-pressed={tab === 'projects'} onClick={() => switchTab('projects')}><FolderOpen size={15} />制作中的故事<span>{projects.length}</span></button><button type="button" aria-pressed={tab === 'preflight'} onClick={() => switchTab('preflight')}><Check size={15} />开工检查<span>{preflight.confirmed}/5</span></button><button type="button" aria-pressed={tab === 'memories'} onClick={() => switchTab('memories')}><History size={15} />走过的关卡<span>{playerId ? memories.length : '—'}</span></button></nav>
      <div className="lad-mobile-tabs"><button type="button" aria-pressed={mobileTab === 'projects'} onClick={() => switchTab('projects')}>故事进度</button><button type="button" aria-pressed={mobileTab === 'preflight'} onClick={() => switchTab('preflight')}>开工检查</button><button type="button" aria-pressed={mobileTab === 'memories'} onClick={() => switchTab('memories')}>关卡回忆</button></div>
      <div className={`lad-body is-${mobileTab}`}>
        <aside className="lad-sidebar"><div className="lad-side-intro"><span>看山的书桌</span><strong>{tab === 'projects' ? '每一段制作都算数' : tab === 'preflight' ? '先看清，再出发' : '只记得真正走过的路'}</strong><p>{tab === 'projects' ? '文字、选择和插图各有自己的进度。' : tab === 'preflight' ? '只核对已保存的制作与游玩记录。' : '打开一条回忆，看看当时的选择。'}</p></div>{tab !== 'preflight' && <div className="lad-search"><Search size={15} /><input aria-label="搜索活动记录" value={query} onChange={event => setQuery(event.target.value)} placeholder={tab === 'projects' ? '搜故事标题或编号' : '搜结局、场景或选择'} /></div>}{tab === 'projects' && <label className="lad-filter">显示状态<select value={status} onChange={event => setStatus(event.target.value as typeof status)}><option value="all">全部故事</option><option value="running">正在制作</option><option value="ready">可以开始玩</option><option value="failed">制作停住</option><option value="interrupted">制作中断</option><option value="idle">尚未开始</option></select></label>}<p className="lad-side-count">{tab === 'projects' ? `${visibleProjects.length} 个故事` : tab === 'preflight' ? `${preflight.confirmed}/${preflight.items.length} 项可确认` : `${playerId ? visibleMemories.length : 0} 段回忆`}</p></aside>
        <main className="lad-main" aria-live="polite"><div className="lad-main-top"><div><span className="lad-kicker">{tab === 'projects' ? 'WORKSHOP LOG' : tab === 'preflight' ? 'START CHECK' : 'PLAY MEMORY'}</span><h3>{tab === 'projects' ? '故事制作进度' : tab === 'preflight' ? '开工前，先看这五件事' : '我们真的走过的关卡'}</h3></div><div className="lad-main-actions">{onOpenMemories && tab === 'memories' && <button type="button" className="lad-text-button" onClick={onOpenMemories}><BookOpen size={14} />回到游戏回忆</button>}<button type="button" className="lad-refresh" onClick={() => void load(true)} disabled={refreshing} aria-label="刷新活动记录" title="刷新活动记录">{refreshing ? <LoaderCircle className="lad-spin" size={15} /> : <FileClock size={15} />}</button></div></div>{error && <div className="lad-error" role="alert">{error}<button type="button" onClick={() => void load()}>{loading ? '正在读取' : '再读一次'}</button></div>}
          {loading ? <div className="lad-empty"><LoaderCircle className="lad-spin" size={23} /><p>看山正在翻这本记录……</p></div> : tab === 'projects' ? visibleProjects.length ? <div className="lad-project-grid">{visibleProjects.map(project => <article className={`lad-project-card is-${project.status}`} key={project.id}><div className="lad-project-top"><span className="lad-project-status"><i />{projectStatusLabel(project)}</span><time>{formatDate(project.updatedAt)}</time></div><h4>{project.title}</h4><p className="lad-project-author">{project.author} · {project.scope === 'zhihu-excerpt' ? '知乎节选改编' : project.scope === 'user-import' ? '自己带来的原文' : '原创种子'}</p>{project.validation && <div className="lad-stats"><span><b>{project.validation.scenes}</b>场景</span><span><b>{project.validation.routes}</b>路线</span><span><b>{project.validation.endings}</b>结局</span></div>}<div className="lad-progress-row"><span>文字</span><span>{project.playable ? '已可玩' : project.status === 'running' ? project.events.at(-1)?.message ?? '后台制作中' : project.error?.message ?? '等待开始'}</span></div><div className="lad-art-row"><span>美术</span><span className={`is-art-${project.art.status}`}>{artStatusLabel(project)}</span></div>{project.error && <p className="lad-project-error">{project.error.message}</p>}<div className="lad-project-footer"><small>{project.playable && project.art.status !== 'ready' ? '文字可以先玩，插图仍在单独准备。' : project.playable ? '文字和当前登记的美术均可查看。' : '完成后这里会出现进入游戏。'}</small>{project.playable && <button type="button" onClick={() => onProject(project)}>进入游戏<ChevronRight size={14} /></button>}</div></article>)}</div> : <div className="lad-empty"><FolderOpen size={25} /><h4>{projects.length ? '没有符合条件的故事' : '还没有制作中的故事'}</h4><p>{projects.length ? '换个标题或状态再找找。' : '从知乎回答或自己的原文开始，故事会在这里留下进度。'}</p></div> : tab === 'preflight' ? <section className="lad-preflight" aria-label="故事开工检查"><div className="lad-preflight-intro"><div><span>这份清单只读取当前已保存的项目与结局回忆。</span><p>它不会代替制作检查，也不会启动新的生成任务。</p></div>{projects.length > 1 && <label>检查哪一段故事<select aria-label="选择检查的故事" value={selectedPreflightProject?.id ?? ''} onChange={event => setPreflightProjectId(event.target.value)}>{projects.map(project => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label>}</div>{preflight.project ? <><div className="lad-preflight-project"><div><span>当前检查</span><h4>{preflight.project.title}</h4><p>{preflight.project.author} · {preflight.project.scope === 'zhihu-excerpt' ? '知乎节选改编' : preflight.project.scope === 'user-import' ? '自己带来的原文' : '原创种子'}</p></div><strong>{preflight.confirmed}/{preflight.items.length}<small> 项可确认</small></strong></div><ol className="lad-preflight-list">{preflight.items.map(item => <li className={`is-${item.state}`} key={item.id}><span className="lad-preflight-state" aria-hidden="true"><Check size={13} /></span><div><h4>{item.title}</h4><p>{item.detail}</p></div></li>)}</ol><div className="lad-preflight-next"><div><span>建议从这里开始</span><h4>{preflight.nextStep.title}</h4><p>{preflight.nextStep.detail}</p></div>{preflight.nextStep.canOpenProject && <button type="button" onClick={() => onProject(preflight.project!)}>{preflight.nextStep.title}<ChevronRight size={14} /></button>}</div></> : <div className="lad-empty"><Check size={25} /><h4>还没有可检查的故事</h4><p>先让看山收下一段原文，项目出现后再回来核对。</p></div>}</section> : !playerId ? <div className="lad-empty"><History size={25} /><h4>还没有当前玩家记录</h4><p>进入一个故事并走到结局后，看山才会把真实走过的场景收进这里。</p></div> : visibleMemories.length ? <div className="lad-memory-list">{visibleMemories.map(memory => { const key = memoryKey(memory); const open = expanded === key; return <article className={`lad-memory-card ${open ? 'is-open' : ''}`} key={key}><button type="button" className="lad-memory-summary" onClick={() => setExpanded(open ? null : key)} aria-expanded={open}><span className="lad-memory-index">{String(memories.indexOf(memory) + 1).padStart(2, '0')}</span><span className="lad-memory-copy"><strong>{memory.endingTitle}</strong><small>{memory.title} · {formatDate(memory.completedAt)} · {memory.scenes.length} 个已保存场景</small></span><ChevronRight size={17} /></button>{open && <div className="lad-memory-detail"><p className="lad-memory-note">这里显示的是实际保存的游玩片段，不会补写没走过的场景。</p>{memory.scenes.map((scene, index) => <div className="lad-scene" key={`${scene.title}-${index}`}><span>{String(index + 1).padStart(2, '0')}</span><div><h5>{scene.title}</h5><p>{scene.text}</p>{scene.selectedChoice && <small>你的选择：{scene.selectedChoice}</small>}</div></div>)}<div className="lad-memory-actions"><button type="button" onClick={() => exportMemory(memory)}><Download size={14} />下载这段回忆</button></div></div>}</article>; })}</div> : <div className="lad-empty"><History size={25} /><h4>{memories.length ? '没有符合条件的回忆' : '还没有走到结局'}</h4><p>{memories.length ? '试试搜结局标题、场景名或当时的选择。' : '走完一个结局，看山会把真正发生过的片段收好。'}</p></div>}
          {tab === 'projects' && onReadPost && posts.length > 0 && <p className="lad-source-note"><ExternalLink size={13} />书袋里有 {posts.length} 篇已保存原文，可从阅读手记继续细读。</p>}
        </main>
      </div>
      <div className="lad-check"><Check size={13} />只展示本机实际保存的进度与回忆</div>
    </section>
  </div>;
}
