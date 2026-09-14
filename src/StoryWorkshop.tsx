import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Check, ChevronDown, ChevronUp, Download, FilePlus2, LoaderCircle, Pause, Play, RefreshCw, Search, Upload } from 'lucide-react';
import type { ArtBatch } from '../shared/production';
import { originalSeed, type ImportedSource, type WorkshopProject } from '../shared/workshop';
import { fetchJson } from './game';
import { findSourceMatches, sourceSegments } from './source-reader';
import { completeImportedSource, defaultGenerationOptions, pasteSourceText, readDroppedSource, sourceWithUrl, type WorkshopGenerationOptions } from './workshop-input';
import { workshopEditorialPresentation } from './workshop-status';
import type { StorySummary } from '../shared/types';
import { sourceScopeLabel } from '../shared/zhihu-source';
import { AuthorIdentity, ZhihuBadge, ZhihuSourcePicker } from './ZhihuSource';
import { ZhihuDiscovery } from './ZhihuDiscovery';
import { SourceLinks } from './SourceLinks';
import { WorkshopQuickImages } from './WorkshopQuickImages';
import { WorkshopGenerationSettings } from './WorkshopGenerationSettings';
import { WorkshopSimpleImages } from './WorkshopSimpleImages';
import type { LiukanTourStep } from './liukan-tour';

async function post<T>(url: string, data: unknown = {}): Promise<T> {
  return fetchJson<T>(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
}
const stageNames = { imported: '保存原文', outline: '构思剧情', scenes: '写作场景', validation: '检查分支', editorial: '审读修改', art: '制作插图', ready: '故事已发布' };
const statusNames = { idle: '等待生成', running: '正在生成', failed: '生成失败', interrupted: '等待续跑', ready: '文本可玩' };
const blank: ImportedSource = { title: '', author: '', text: '', scope: 'user-import' };
const draftKey = 'redleaf.workshop.input.v1';
const optionsKey = 'redleaf.workshop.generation.v1';
function readOptions(): WorkshopGenerationOptions {
  try { const value = JSON.parse(localStorage.getItem(optionsKey) ?? 'null'); if (value && ['fast', 'full'].includes(value.mode) && ['faithful', 'inspiration'].includes(value.adaptation) && ['none', 'image2', 'gpt6'].includes(value.images)) return value; } catch { /* Private browsing can disable storage. */ }
  return defaultGenerationOptions;
}
const imageEndpoint = (id: string) => `/api/workshop/images/${encodeURIComponent(id)}`;
function readInput(): ImportedSource { try { const input = JSON.parse(localStorage.getItem(draftKey) ?? 'null'); if (input && typeof input.title === 'string' && typeof input.author === 'string' && typeof input.text === 'string' && ['user-import', 'original-seed'].includes(input.scope)) return input; } catch { /* private browsing */ } return blank; }

function editorialLabel(editorial: WorkshopProject['editorial']) {
  return editorial?.status === 'passed' ? `r${editorial.revision} 已通过复审`
    : editorial?.status === 'reviewing' ? `正在检查 r${editorial.revision} 的剧情和措辞`
    : editorial?.status === 'failed' ? `r${editorial.revision} 审稿未通过` : '还没审完';
}

function WorkshopEditorialStatus({ project }: { project: WorkshopProject }) {
  const { current, history } = workshopEditorialPresentation(project);
  if (project.generationOptions?.mode === 'fast') return <p className="workshop-editorial-status">{project.playable ? '分支、结局与游玩结构已检查；长篇文学精修可在之后继续。' : '生成后自动检查分支与结局，完成即可游玩。'}</p>;
  const label = project.status === 'interrupted' ? '暂时中断，已写的稿件和检查记录都保留'
    : project.status === 'running' && !current ? `r${project.revision} 正在生成，等待本轮审稿结果` : editorialLabel(current);
  return <>
    <p className="workshop-editorial-status">审稿：{label}。{current?.message}</p>
    {history && <details className="workshop-log"><summary>历史审稿记录 · r{history.revision}</summary><p className="workshop-editorial-status">{editorialLabel(history)}。{history.message}</p></details>}
  </>;
}

export function ImportedSourceReader({ source }: { source: ImportedSource }) {
  const [query, setQuery] = useState(''), [active, setActive] = useState(0);
  const reader = useRef<HTMLElement>(null);
  const matches = useMemo(() => findSourceMatches(source.text, query), [source.text, query]);
  const segments = useMemo(() => sourceSegments({ text: source.text, start: 0, end: source.text.length }, matches), [source.text, matches]);
  const selected = matches.length ? Math.min(active, matches.length - 1) : -1;
  useEffect(() => { reader.current?.querySelector(`[data-import-match="${selected}"]`)?.scrollIntoView({ block: 'center' }); }, [selected, matches]);
  const move = (delta: number) => { if (matches.length) setActive((selected + delta + matches.length) % matches.length); };
  const download = () => { const url = URL.createObjectURL(new Blob([source.text], { type: 'text/plain;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = `${source.title.replace(/[<>:"/\\|?*]/g, '_')}.txt`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  return <article className="imported-reader" ref={reader}>
    <div className="imported-search" role="search"><label><Search size={15} /><input type="search" aria-label="在导入原文中查找" placeholder="查找原文" maxLength={240} value={query} onChange={e => { setQuery(e.target.value); setActive(0); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); move(e.shiftKey ? -1 : 1); } }} /></label><span role="status">{query ? `${selected + 1}/${matches.length}` : ''}</span><button className="icon-button" aria-label="上一个匹配" title="上一个匹配" disabled={!matches.length} onClick={() => move(-1)}><ChevronUp /></button><button className="icon-button" aria-label="下一个匹配" title="下一个匹配" disabled={!matches.length} onClick={() => move(1)}><ChevronDown /></button></div>
    <header>{source.scope === 'zhihu-excerpt' ? <ZhihuBadge label="原作节选" /> : <p className="eyebrow">{sourceScopeLabel(source.scope)}</p>}<h2>{source.title}</h2><AuthorIdentity name={source.author} avatar={source.origin?.authorAvatar} />
      <p>{source.origin?.contentScope === 'webpage-selection' ? '这是你在知乎网页选取的可见正文，按浏览器传来的文字逐字保存，可能只是原作的一部分。' : source.origin?.contentScope === 'search-excerpt' ? '这是知乎官方搜索返回的节选，逐字保存，并非完整原作。' : source.scope === 'zhihu-excerpt' ? '这份知乎原作节选在创建改编项目时逐字保存，并非完整作品。' : source.scope === 'original-seed' ? '这是工作台的原创短篇示例，不是知乎原文。' : '以下是你导入的原文，未作改写，可能只是作品节选。'}游戏中新增的情节与结局属于 AI 改编。</p><button className="text-button" onClick={download}><Download size={13} />下载原文 · UTF-8</button>
      {source.origin && <SourceLinks source={source} />}
    </header><pre data-testid="imported-source-text">{segments.map((segment, index) => segment.matchIndex === undefined ? segment.text : <mark key={index} data-import-match={segment.matchIndex} data-active={selected === segment.matchIndex}>{segment.text}</mark>)}</pre><p className="imported-reader-end">原文到这里结束。</p>
  </article>;
}

export function StoryWorkshop({ onPlay, onRead, stories, onReadZhihu, requestedSource, requestedProjectId, onBrowseZhihu, tourStep }: {
  onPlay: (id: string) => void; onRead: (id: string) => void; stories: StorySummary[];
  onReadZhihu: (story: StorySummary) => void; requestedSource: { story: StorySummary; sequence: number } | null;
  requestedProjectId?: string | null;
  onBrowseZhihu?: () => void;
  tourStep?: LiukanTourStep | null;
}) {
  const [input, setInput] = useState<ImportedSource>(readInput);
  const [generationOptions, setGenerationOptions] = useState<WorkshopGenerationOptions>(readOptions);
  const [sourceUrl, setSourceUrl] = useState(() => readInput().referenceUrl ?? '');
  const [dragging, setDragging] = useState(false);
  const [clockNow, setClockNow] = useState(Date.now());
  const [projects, setProjects] = useState<WorkshopProject[]>([]);
  const [selected, setSelected] = useState<string | null>(requestedProjectId ?? null);
  useEffect(() => { if (requestedProjectId) setSelected(requestedProjectId); }, [requestedProjectId]);
  const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState('');
  const [canRevise, setCanRevise] = useState(false);
  const [canImportZhihu, setCanImportZhihu] = useState(false); const [creativeTransportName, setCreativeTransportName] = useState<'relay' | 'local-cli'>('local-cli');
  const [relay, setRelay] = useState<{ configured: boolean; endpoint?: string; model?: string; protocol?: 'responses' | 'chat-completions'; reasoning?: string }>({ configured: false });
  const [environmentRelay, setEnvironmentRelay] = useState<{ configured: boolean; endpoint?: string; model?: string; protocol?: string; images?: { configured: boolean; endpoint?: string; model?: string } }>({ configured: false });
  const [relayForm, setRelayForm] = useState({ endpoint: '', model: '', apiKey: '', protocol: 'responses' as 'responses' | 'chat-completions', reasoning: 'xhigh' }); const [relayMessage, setRelayMessage] = useState('');
  const [sourceTab, setSourceTab] = useState<'zhihu' | 'paste' | 'discover'>(() => location.hash.startsWith('#zhihu-page=') ? 'discover' : 'paste');
  useEffect(() => { const receiveSource = () => { if (location.hash.startsWith('#zhihu-page=')) setSourceTab('discover'); }; window.addEventListener('hashchange', receiveSource); return () => window.removeEventListener('hashchange', receiveSource); }, []);
  const visibleSourceTab = tourStep && ['import', 'relay', 'generate'].includes(tourStep.id) ? 'paste' : sourceTab;
  const [selectedSource, setSelectedSource] = useState<StorySummary | null>(requestedSource?.story ?? null);
  const [importNotice, setImportNotice] = useState('');
  useEffect(() => { if (requestedSource) { setSelectedSource(requestedSource.story); setSourceTab('zhihu'); } }, [requestedSource]);
  const [busy, setBusy] = useState(false); const [batch, setBatch] = useState<ArtBatch | null>(null);
  const [quickImages, setQuickImages] = useState(false);
  const [reviewer, setReviewer] = useState(''); const [notes, setNotes] = useState('');
  const fileRef = useRef<HTMLInputElement>(null), posting = useRef(false);
  const refreshSequence = useRef(0);
  const project = projects.find(p => p.id === selected) ?? (tourStep && ['progress', 'art'].includes(tourStep.id) ? projects.find(p => p.playable) ?? projects[0] : null) ?? null;
  const projectOptions = project?.generationOptions;
  const fastProject = projectOptions?.mode === 'fast';
  const lastStart = project?.generation?.startedAt ?? project?.events.filter(event => event.stage === 'outline').at(-1)?.at ?? project?.createdAt;
  const elapsedSeconds = project?.generation?.elapsedMs !== undefined ? Math.floor(project.generation.elapsedMs / 1000) : lastStart ? Math.max(0, Math.floor(((project?.generation?.finishedAt ? Date.parse(project.generation.finishedAt) : clockNow) - Date.parse(lastStart)) / 1000)) : 0;
  const artScope = project?.publishedVersion ? `${project.id}/${project.publishedVersion}` : null;
  const activeArtScope = useRef(artScope);
  activeArtScope.current = artScope;
  const ownBatch = batch?.id.startsWith('wart_') && `${batch.storyId}/${batch.worldVersion}` === artScope ? batch : null;
  const acceptBatch = (next: ArtBatch | null, scope: string | null) => {
    if (scope !== activeArtScope.current) return;
    setBatch(next?.id.startsWith('wart_') && `${next.storyId}/${next.worldVersion}` === scope ? next : null);
  };
  const replace = (p: WorkshopProject) => { refreshSequence.current++; setProjects(previous => [p, ...previous.filter(item => item.id !== p.id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt))); };
  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    try {
      const data = await fetchJson<{ projects: WorkshopProject[]; capabilities?: { quickImages?: boolean; revise?: boolean; zhihuImport?: boolean; environmentRelay?: typeof environmentRelay } }>('/api/workshop/projects');
      if (selected) { const detail = await fetchJson<WorkshopProject>(`/api/workshop/projects/${selected}`); data.projects = data.projects.map(p => p.id === selected ? detail : p); }
      if (sequence !== refreshSequence.current) return;
      setQuickImages(data.capabilities?.quickImages === true);
      setProjects(data.projects); setCanRevise(data.capabilities?.revise === true); setCanImportZhihu(data.capabilities?.zhihuImport === true); setCreativeTransportName((data.capabilities as { creativeTransport?: 'relay' | 'local-cli' } | undefined)?.creativeTransport ?? 'local-cli'); setRelay((data.capabilities as { relay?: typeof relay } | undefined)?.relay ?? { configured: false }); setEnvironmentRelay(data.capabilities?.environmentRelay ?? { configured: false }); setConnectionError('');
    } catch (e) { if (sequence === refreshSequence.current) setConnectionError((e as Error).message); }
    finally { if (sequence === refreshSequence.current) setLoading(false); }
  }, [selected]);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => { await refresh(); if (!stopped) timer = setTimeout(() => void poll(), 4000); };
    void poll();
    return () => { stopped = true; clearTimeout(timer); refreshSequence.current++; };
  }, [refresh]);
  useEffect(() => { if (project?.status !== 'running') return; const timer = setInterval(() => setClockNow(Date.now()), 1000); return () => clearInterval(timer); }, [project?.status]);
  useEffect(() => { try { localStorage.setItem(draftKey, JSON.stringify(input)); } catch { /* server preserves imports */ } }, [input]);
  useEffect(() => { try { localStorage.setItem(optionsKey, JSON.stringify(generationOptions)); } catch { /* Project keeps the accepted options. */ } }, [generationOptions]);
  useEffect(() => { setBatch(null); setReviewer(''); setNotes(''); }, [selected, artScope]);
  useEffect(() => {
    if (!ownBatch) return;
    let stopped = false;
    const scope = artScope;
    const timer = setInterval(() => {
      void fetchJson<ArtBatch>(imageEndpoint(ownBatch.id)).then(next => { if (!stopped) acceptBatch(next, scope); }).catch(() => {});
    }, 3000);
    return () => { stopped = true; clearInterval(timer); };
  }, [ownBatch?.id, artScope]);
  const act = async (fn: () => Promise<void>) => {
    if (posting.current) return; posting.current = true; setBusy(true); setError('');
    try { await fn(); } catch (e) { setError((e as Error).message); }
    finally { posting.current = false; setBusy(false); }
  };
  const submit = (generate: boolean) => act(async () => {
    const source = completeImportedSource(sourceWithUrl(input, sourceUrl));
    const imported = await post<WorkshopProject>('/api/workshop/projects', { ...source, generationOptions });
    replace(imported); setSelected(imported.id);
    if (generate) {
      // Show the imported project immediately. Starting the detached worker can
      // take longer than the short UI request timeout; polling will hydrate the
      // running/ready state without making the new answer disappear on timeout.
      void post<WorkshopProject>(`/api/workshop/projects/${imported.id}/generate`, { mode: 'resume', generationOptions })
        .then(next => replace(next))
        .catch(error => setError((error as Error).message));
    }
  });
  const saveRelay = () => act(async () => {
    const response = await post<{ creativeTransport: 'relay' | 'local-cli'; relay: typeof relay }>('/api/workshop/creative-config', relayForm);
    setCreativeTransportName(response.creativeTransport); setRelay(response.relay); setRelayMessage('中转站配置已保存，新的生成会使用它。'); setRelayForm(previous => ({ ...previous, apiKey: '' }));
  });
  const useEnvironmentRelay = () => act(async () => {
    const response = await post<{ creativeTransport: 'relay' | 'local-cli'; relay: typeof relay }>('/api/workshop/creative-config', { useEnvironment: true });
    setCreativeTransportName(response.creativeTransport); setRelay(response.relay); setRelayMessage('已接入当前文字中转。插图使用单独配置的生图服务。');
  });
  const clearRelay = () => act(async () => {
    const response = await post<{ creativeTransport: 'relay' | 'local-cli'; relay: typeof relay }>('/api/workshop/creative-config', { clear: true });
    setCreativeTransportName(response.creativeTransport); setRelay(response.relay); setRelayMessage('已清除中转站配置，未启动本地生成。');
  });
  const generate = (mode: 'resume' | 'regenerate' | 'revise', options?: WorkshopGenerationOptions) => act(async () => { if (project) replace(await post<WorkshopProject>(`/api/workshop/projects/${project.id}/generate`, { mode, generationOptions: options ?? (mode === 'revise' ? projectOptions : generationOptions) ?? projectOptions })); });
  const importZhihu = (storyId: string) => act(async () => {
    const imported = await post<WorkshopProject>('/api/workshop/from-zhihu', { storyId, generationOptions });
    replace(imported); setSelected(imported.id);
    setImportNotice(`《${imported.title}》已加入改编项目，原作节选已保留。`);
    requestAnimationFrame(() => document.querySelector('.workshop-detail')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  });
  const art = () => act(async () => {
    if (!project?.publishedVersion) return;
    const scope = artScope;
    const endpoint = `/api/workshop/projects/${project.id}/art?version=${encodeURIComponent(project.publishedVersion)}`;
    const existing = await fetchJson<ArtBatch | null>(endpoint);
    if (scope !== activeArtScope.current) return;
    // A missing list is prepared once; viewing an existing list never changes its jobs.
    if (existing) { acceptBatch(existing, scope); return; }
    const current = await post<WorkshopProject>(`/api/workshop/projects/${project.id}/art`);
    replace(current);
    if (scope === activeArtScope.current) acceptBatch(await fetchJson<ArtBatch | null>(endpoint), scope);
  });
  const artRun = (action: 'run' | 'pause', recoverOnly = false) => act(async () => {
    if (ownBatch) { const scope = artScope; acceptBatch(await post<ArtBatch>(`${imageEndpoint(ownBatch.id)}/${action}`, { maxJobs: 40, concurrency: 8, recoverOnly }), scope); }
  });
  const review = (jobId: string, decision: 'approved' | 'rejected') => act(async () => {
    if (ownBatch) { const scope = artScope; acceptBatch(await post<ArtBatch>(`${imageEndpoint(ownBatch.id)}/jobs/${jobId}/review`, { decision, reviewer, notes }), scope); }
  });
  const change = (key: 'title' | 'author' | 'text', value: string) => setInput(previous => ({ ...previous, [key]: value, scope: 'user-import' }));
  const importFile = (file: File) => act(async () => {
    if (file.size > 480000) throw new Error('文本文件最多480KB。请选择 UTF-8 文本。');
    if (!/\.(txt|md|html?|json)$/i.test(file.name)) throw new Error('支持 TXT、Markdown、HTML 和 JSON 文件，请先导出回答正文。');
    let text: string;
    try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await file.arrayBuffer()); } catch { throw new Error('文件编码不是 UTF-8。请转换后再导入，以免文字乱码。'); }
    const source = readDroppedSource(text, file.name, file.type);
    setInput(source); setSourceUrl(source.referenceUrl ?? ''); setSourceTab('paste');
    setImportNotice(`已读入《${source.title}》· ${source.text.length.toLocaleString()} 字符，选择创作方式后即可生成。`);
  });
  const dropSource = (event: React.DragEvent) => {
    event.preventDefault(); setDragging(false);
    if (busy) return;
    const files = event.dataTransfer.files;
    if (files.length > 1) { setError('一次拖入一篇回答即可，请选择一个文件。'); return; }
    if (files[0]) { void importFile(files[0]); return; }
    const plain = event.dataTransfer.getData('text/plain'), html = event.dataTransfer.getData('text/html');
    if (!plain && !html) return;
    void act(async () => { const source = readDroppedSource(plain || html, '', plain ? 'text/plain' : 'text/html'); setInput(source); setSourceUrl(''); setSourceTab('paste'); });
  };
  return <section className={`story-workshop ${dragging ? 'workshop-dragging' : ''}`} aria-label="新故事生成工作台" onDragOver={event => { if (event.dataTransfer.types.some(type => ['Files', 'text/plain', 'text/html'].includes(type))) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setDragging(true); } }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }} onDrop={dropSource}>
    <header className="workshop-heading" data-tour="workshop-heading"><div><p className="eyebrow">RED LEAF / STORY WORKSHOP</p><h1>新故事工作台<span className="heading-punctuation">。</span></h1><p>拖入一篇回答，让原来的问题长出新的选择与结局。</p></div>{onBrowseZhihu ? <button className="zhw-open-button" data-tour="workshop-zhihu-browser" onClick={onBrowseZhihu}><span>知乎</span>去知乎选故事 <ArrowRight size={16} /></button> : <span className="workshop-edition"><span>赤页</span><b>改编工房</b><small>STORY WORKSHOP</small></span>}</header>
    <div className="workshop-layout"><div className="workshop-source-column">
      <WorkshopGenerationSettings value={generationOptions} onChange={setGenerationOptions} disabled={busy} />
      <div className="source-mode-tabs" role="tablist" aria-label="原文来源">{([{ id: 'discover', label: '发现新故事' }, { id: 'zhihu', label: '从知乎选篇' }, { id: 'paste', label: '粘贴或上传' }] as const).map((tab, index, tabs) => <button key={tab.id} type="button" id={`source-tab-${tab.id}`} role="tab" aria-selected={visibleSourceTab === tab.id} aria-controls={`source-panel-${tab.id}`} tabIndex={visibleSourceTab === tab.id ? 0 : -1} onClick={() => setSourceTab(tab.id)} onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const next = tabs[event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length].id; setSourceTab(next); document.getElementById(`source-tab-${next}`)?.focus(); } }}>{tab.id === 'discover' ? <Search size={16} /> : tab.id === 'zhihu' ? <BookOpen size={16} /> : <Upload size={16} />}{tab.label}</button>)}</div>
      {visibleSourceTab === 'discover' ? <div id="source-panel-discover" role="tabpanel" aria-labelledby="source-tab-discover"><ZhihuDiscovery generationOptions={generationOptions} projects={projects} onProject={p => { replace(p); setSelected(p.id); requestAnimationFrame(() => document.querySelector('.workshop-detail')?.scrollIntoView({ block: 'center', behavior: 'smooth' })); }} /></div> : visibleSourceTab === 'zhihu' ? <div id="source-panel-zhihu" role="tabpanel" aria-labelledby="source-tab-zhihu"><ZhihuSourcePicker stories={stories} selected={selectedSource} onSelect={setSelectedSource} onRead={onReadZhihu} onImport={story => void importZhihu(story.id)} busy={busy} available={canImportZhihu} /></div> : <form id="source-panel-paste" role="tabpanel" aria-labelledby="source-tab-paste" className="workshop-form" data-tour="workshop-source-input" onSubmit={event => { event.preventDefault(); void submit(true); }}>
      <div className="workshop-section-title"><span>01 / SOURCE</span><h2>原文</h2></div>
      <button className="workshop-dropzone" type="button" disabled={busy} onClick={() => fileRef.current?.click()}><Upload size={24} /><b>{dragging ? '松开，带入这篇回答' : '拖入回答文件，或点击选择'}</b><span>TXT、Markdown、HTML、JSON · 也可拖入选中文字</span></button>
      <div className="workshop-source-fields"><label>回答标题 · 可留空<input maxLength={120} value={input.title} onChange={e => change('title', e.target.value)} placeholder="未填写时使用正文首行" /></label>
      <label>原文作者 · 可留空<input maxLength={120} value={input.author} onChange={e => change('author', e.target.value)} placeholder="按原作署名填写" /></label></div>
      <div className="workshop-input-meta"><span>{input.scope === 'original-seed' ? '原创示例，不是知乎原文' : '用户提供的原文或节选'}</span><button type="button" className="text-button" onClick={() => fileRef.current?.click()} disabled={busy}><Upload size={13} />导入文本</button></div>
      <input ref={fileRef} type="file" hidden accept=".txt,.md,.html,.htm,.json,text/plain,text/markdown,text/html,application/json" aria-label="导入故事文本文件" onChange={e => { if (e.target.files?.[0]) void importFile(e.target.files[0]); e.target.value = ''; }} />
      <label>回答正文 / 节选<textarea required minLength={80} maxLength={120000} value={input.text} onChange={e => change('text', e.target.value)} onPaste={e => { const pasted = e.clipboardData.getData('text/plain'); if (pasted) { e.preventDefault(); change('text', pasteSourceText(input.text, e.currentTarget.selectionStart, e.currentTarget.selectionEnd, pasted)); } }} placeholder="粘贴一篇回答（至少 80 字），观点、经历、故事都能成为灵感；原文单独保存。" /></label>
      <label>知乎来源链接 · 可选<input type="url" value={sourceUrl} onChange={event => setSourceUrl(event.target.value)} placeholder="https://www.zhihu.com/question/…/answer/…" /></label>
      <div className="workshop-input-meta"><span>{input.text.length.toLocaleString()} / 120,000 字符</span><button className="text-button" type="button" onClick={() => { setInput({ ...originalSeed }); setSourceUrl(''); }} disabled={busy}>填入原创悬疑种子</button></div>
      <p className="workshop-disclosure">{generationOptions.mode === 'fast' ? '快速冒险以 5 分钟内可玩为目标，自动检查剧情分支与结局；配图单独处理。' : '长篇精修包含完整创作与多轮审校，可能持续数小时。'}关闭页面后继续生成，已完成的内容会保存。</p>
      <details className="relay-config" open={tourStep ? tourStep.id === 'relay' : undefined}><summary data-tour={tourStep?.id === 'relay' ? undefined : 'workshop-relay'}>配置创作中转站</summary><div data-tour="workshop-relay"><p>可直接接入当前服务已配置的文字与生图中转，也可以填写新的 OpenAI-compatible 通道。密钥只保存在服务端，不会显示在项目列表或浏览器响应里。</p>{environmentRelay.configured && <div className="relay-env-card"><b>检测到当前服务配置</b><span>文字：{environmentRelay.model} · {environmentRelay.protocol}</span><span>生图：{environmentRelay.images?.configured ? `${environmentRelay.images.model} · ${environmentRelay.images.endpoint}` : '未检测到生图通道'}</span><button className="secondary-button" type="button" disabled={busy} onClick={() => void useEnvironmentRelay()}>接入当前配置</button></div>}<label>中转站地址<input value={relayForm.endpoint} onChange={e => setRelayForm({ ...relayForm, endpoint: e.target.value })} placeholder="https://relay.example/v1" /></label><label>协议<select value={relayForm.protocol} onChange={e => setRelayForm({ ...relayForm, protocol: e.target.value as typeof relayForm.protocol })}><option value="responses">Responses</option><option value="chat-completions">Chat Completions</option></select></label><label>模型名<input value={relayForm.model} onChange={e => setRelayForm({ ...relayForm, model: e.target.value })} placeholder="模型名称" /></label><label>推理强度<select value={relayForm.reasoning} onChange={e => setRelayForm({ ...relayForm, reasoning: e.target.value })}><option>none</option><option>low</option><option>medium</option><option>high</option><option>xhigh</option></select></label><label>API 密钥<input type="password" value={relayForm.apiKey} onChange={e => setRelayForm({ ...relayForm, apiKey: e.target.value })} placeholder={relay.configured ? '已配置，重新填写可替换' : '仅在此处输入'} autoComplete="off" /></label><div className="workshop-form-actions"><button className="secondary-button" type="button" disabled={busy || !relayForm.endpoint.trim() || !relayForm.model.trim() || !relayForm.apiKey.trim()} onClick={() => void saveRelay()}>保存中转站</button>{relay.configured && <button className="text-button" type="button" disabled={busy} onClick={() => void clearRelay()}>清除配置</button>}</div>{relay.configured && <small className="relay-configured">当前：{relay.model} · {relay.endpoint} · {relay.protocol}</small>}{relayMessage && <small className="relay-configured" role="status">{relayMessage}</small>}</div></details>
      <div className="workshop-form-actions"><button className="primary-button" data-tour="workshop-generate" type="submit" disabled={busy || input.text.trim().length < 80 || input.text.length > 120000}>{busy ? <LoaderCircle className="spin" /> : <FilePlus2 />}{generationOptions.mode === 'fast' ? '生成分支冒险 · 5 分钟目标' : '生成长篇游戏'} <ArrowRight /></button><button className="text-button" type="button" disabled={busy || input.text.trim().length < 80 || input.text.length > 120000} onClick={() => void submit(false)}>仅保存原文</button></div>
      <p className="workshop-disclosure">{generationOptions.images === 'none' ? '当前为纯文字冒险，生成后即可开始选择。' : generationOptions.images === 'gpt6' ? '简单配图通过文字中转生成，不调用 image2；配图失败仍可游玩。' : 'image2 通过第三方通道生成，费用与耗时另计；配图完成前可先玩文字版。'}</p>
    </form>}</div><div className="workshop-productions"><div className="workshop-section-title"><span>02 / MY ADAPTATIONS</span><h2>我的改编 <small>{projects.length}</small></h2><button className="text-button" onClick={() => void refresh()} aria-label="刷新生成项目"><RefreshCw size={14} /></button></div>
      {error && <div className="workshop-error" role="alert">{error}</div>}
      {importNotice && <p className="workshop-import-notice" role="status"><Check size={16} />{importNotice}</p>}
      {connectionError && <div className="workshop-error" role="alert">暂时未能更新进度：{connectionError}<p>后台任务可能仍在运行，页面会自动重连。</p><button className="text-button" onClick={() => void refresh()}>立即重连</button></div>}
      {loading ? <p role="status"><LoaderCircle className="spin" size={16} /> 正在读取故事</p> : !projects.length && <div className="workshop-empty"><span>还没有导入故事。</span></div>}
      <div className="workshop-project-list" data-tour="workshop-projects">{projects.map(p => <button key={p.id} className={`workshop-project ${selected === p.id ? 'selected' : ''}`} onClick={() => setSelected(p.id)} aria-pressed={selected === p.id}><span className={`production-dot ${p.status}`} /><span><b>{p.title}</b><small>{p.scope === 'zhihu-excerpt' && <ZhihuBadge compact label="" />}{sourceScopeLabel(p.scope)} / {p.author}</small></span><em>{statusNames[p.status]}</em></button>)}</div>
      {!loading && !project && <div className="workshop-empty"><p data-tour="workshop-progress">选择一个改编项目后，这里显示制作阶段和续跑进度。</p><p data-tour="workshop-art">场景插图随项目保存；选中已有项目后，可以在这里查看插图状态。</p></div>}
      {project && <article className="workshop-detail" aria-live="polite"><div data-tour="workshop-progress"><header><p className="eyebrow">{project.id} / {project.revision ? `当前稿 r${project.revision}` : '尚未建稿'} / {project.publishedVersion ? `已发布 ${project.publishedVersion}` : '尚未发布'}</p><h2>{project.title}</h2><p>{statusNames[project.status]} · {stageNames[project.stage]}{project.status === 'running' && ' · 作业在后台运行'}</p></header>
        {projectOptions && <p className="workshop-project-mode">{fastProject ? '快速冒险' : '长篇精修'} · {projectOptions.adaptation === 'inspiration' ? '基于回答灵感' : '保留原作设定'} · {projectOptions.images === 'none' ? '纯文字' : projectOptions.images === 'gpt6' ? 'GPT6 简单插图' : 'image2 配图'}</p>}
        {fastProject && project.status !== 'idle' && <div className="workshop-fast-progress" aria-live="off"><div><span>{project.status === 'running' ? '正在把回答写成可玩的选择' : project.playable ? '文字冒险已可玩' : '本次生成已保留进度'}</span><b>{Math.floor(elapsedSeconds / 60)}:{String(elapsedSeconds % 60).padStart(2, '0')} <small>/ 5:00 目标</small></b></div>{project.status === 'running' && <progress value={Math.min(elapsedSeconds, 300)} max={300} aria-label="距离五分钟生成目标的耗时" />}<p>{project.status === 'running' ? (elapsedSeconds >= 300 ? '已超过目标时间，正在同步后台结果；可点击刷新查看当前状态。' : '可以离开页面；完成后会保存在故事书库，配图单独继续。') : project.playable ? '现在就能进入故事，探索不同路线和结局。' : '检查下方原因后重试，原文和已有版本仍然保留。'}</p></div>}
        <ol className={`production-steps ${fastProject ? 'production-steps-fast' : ''}`}>{(fastProject ? ['outline', 'scenes', 'validation'] as const : ['outline', 'scenes', 'validation', 'editorial', 'art'] as const).map((stage, i) => <li key={stage} data-current={project.stage === stage}><b>0{i + 1}</b><span>{stageNames[stage]}{stage === 'scenes' && <small>{project.completedRoutes} / 3 路线</small>}{stage === 'art' && <small>{project.art.approved} / {project.art.total || '—'} 已审核</small>}</span></li>)}</ol></div>
        {project.error && <div className="workshop-error" role="alert"><b>{project.error.code} · {stageNames[project.error.stage]}</b><p>{project.error.message}</p><small>续跑会接着已完成的稿件写。重新生成则另起一版，原文和旧版游戏都保留。</small></div>}
        {project.validation && <><p className="workshop-proof-label">{project.publishedVersion ?? '当前已验证稿'} / 已通过的结构检查</p><div className="workshop-proof"><b>{project.validation.decisions}<small>决策场景</small></b><b>{project.validation.routes}<small>独立路线</small></b><b>{project.validation.endings}<small>完整结局</small></b><b>{project.validation.badEnds}<small>Bad Ends</small></b></div></>}
        <WorkshopEditorialStatus project={project} />
        <div data-tour="workshop-art">
        {project.status !== 'running' && quickImages && project.playable && project.publishedVersion && (!projectOptions || projectOptions.images === 'image2') && <WorkshopQuickImages key={`${project.id}/${project.publishedVersion}`} projectId={project.id} version={project.publishedVersion} total={project.validation?.scenes ?? 40} />}
        {project.status !== 'running' && project.playable && project.publishedVersion && projectOptions?.images === 'gpt6' && <WorkshopSimpleImages key={`${project.id}/${project.publishedVersion}`} projectId={project.id} version={project.publishedVersion} />}
        {canRevise && !fastProject && project.status !== 'running' && project.playable && <button className="text-button" disabled={busy} onClick={() => void generate('revise')}>校订生成稿 · 保留旧版</button>}
        <p className="workshop-art-status">插图：{project.art.status === 'disabled' || projectOptions?.images === 'none' ? '纯文字模式，无需等待插图。' : project.art.status === 'ready' ? '场景插图已可用。' : project.art.status === 'failed' ? '本次配图未完成，文字游戏仍可游玩。' : '配图单独处理中，文字游戏完成后即可游玩。'}{projectOptions?.images !== 'none' && project.art.message}</p></div>
        {project.status !== 'running' && <div className="workshop-switch-generation">{!fastProject ? <button className="secondary-button" disabled={busy} onClick={() => void generate('regenerate', { ...defaultGenerationOptions })}>用这篇回答快速生成 · 5 分钟目标 <ArrowRight size={15} /></button> : <button className="text-button" disabled={busy} onClick={() => void generate('regenerate', { ...projectOptions!, mode: 'full' })}>继续创作长篇精修版 · 保留当前游戏</button>}</div>}
        <div className="workshop-actions"><button className="secondary-button" onClick={() => onRead(project.id)}><BookOpen />读导入原文</button>{project.playable && <button className="primary-button" onClick={() => onPlay(project.id)}>游玩 {project.publishedVersion} <Play /></button>}{project.status !== 'running' && project.status !== 'ready' && <button className="primary-button" disabled={busy} onClick={() => void generate('resume')}><RefreshCw />{project.status === 'idle' ? '开始生成' : '从完成阶段续跑'}</button>}{project.status !== 'running' && project.revision > 0 && <button className="text-button" disabled={busy} onClick={() => void generate('regenerate')}>重新生成新版本</button>}{project.playable && <button className="text-button" disabled={busy} onClick={() => void art()}>场景美术制作</button>}</div>
        <details className="workshop-log"><summary>制作日志 · {project.events.length} 条</summary><ol>{project.events.map((event, i) => <li key={i}><time>{new Date(event.at).toLocaleTimeString()}</time>{event.message}</li>)}</ol></details>
        {ownBatch && <section className="workshop-art-panel" data-project-id={ownBatch.storyId} data-world-version={ownBatch.worldVersion}><h3>{ownBatch.worldTitle} · {ownBatch.worldVersion} 插图清单</h3><p>总计 {ownBatch.progress.current} · 已生成 {ownBatch.progress.generated} · 原生4K {ownBatch.progress.native4k} · 已审核覆盖 {ownBatch.progress.covered} · 未确认 {ownBatch.progress.unknownOutcome} · 失败 {ownBatch.progress.failed}</p>{ownBatch.circuitBreaker && <p>服务已暂停：{ownBatch.circuitBreaker.code}</p>}<div className="workshop-actions"><button className="secondary-button" disabled={busy || ownBatch.state === 'running' || !!ownBatch.circuitBreaker || !ownBatch.progress.queued} onClick={() => void artRun('run')}><Play />生成场景插图{ownBatch.progress.queued > 0 ? ` · ${Math.min(40, ownBatch.progress.queued)} 张` : ''}</button><button className="text-button" disabled={busy || ownBatch.state !== 'running'} onClick={() => void artRun('pause')}><Pause />暂停排队</button><button className="text-button" disabled={busy || ownBatch.state === 'running' || (!ownBatch.progress.recoverable && !ownBatch.progress.unknownOutcome)} onClick={() => void artRun('run', true)}>恢复已返回图片</button></div>
          <details><summary>逐场景状态与人工审核</summary><label>审核人<input value={reviewer} onChange={e => setReviewer(e.target.value)} /></label><label>具体观察<textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="核对人物一致性、场景内容、硬边面部阴影、背景与原生尺寸" /></label><div className="art-review-grid">{ownBatch.jobs.filter(j => !j.stale).map(j => <article key={j.id}><h4>{j.sceneTitle}</h4><p>{j.state} / {j.review?.decision ?? '未审核'}{j.errorCode ? ` / ${j.errorCode}` : ''}</p>{j.asset && /^\/generated-art\/workshop\/wscene_[a-f0-9]+\.png$/.test(j.asset.url) && <><a href={j.asset.url} rel="noreferrer"><img src={j.asset.url} alt={`${j.sceneTitle} · ${j.review?.decision === 'approved' ? '审核通过' : j.review?.decision === 'rejected' ? '已退回' : '待审核'}`} loading="lazy" /></a><p>{j.asset.width} × {j.asset.height} · {j.asset.native4k ? '原生4K候选' : '实际返回尺寸'}</p><button className="text-button" disabled={busy || !reviewer.trim() || !notes.trim() || (!j.asset.native4k && ownBatch.qualityPolicy !== 'style-first')} onClick={() => void review(j.id, 'approved')}><Check />通过</button><button className="text-button" disabled={busy || !reviewer.trim() || !notes.trim()} onClick={() => void review(j.id, 'rejected')}>退回</button></>}</article>)}</div></details>
        </section>}
      </article>}
    </div></div>
  </section>;
}



