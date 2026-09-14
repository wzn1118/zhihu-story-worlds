import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, ExternalLink, FilePlus2, Link2, LoaderCircle, Search } from 'lucide-react';
import type { ZhihuCandidate, ZhihuDiscoveryResult } from '../shared/zhihu-discovery';
import type { WorkshopProject } from '../shared/workshop';
import { AuthorIdentity, ZhihuBadge } from './ZhihuSource';
import { fetchJson } from './game';
import { readZhihuPageSelection, zhihuPageFragment } from './zhihu-page-picker';
import { defaultGenerationOptions, type WorkshopGenerationOptions } from './workshop-input';
import './ZhihuDiscovery.css';

async function post<T>(url: string, value: unknown): Promise<T> {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message ?? `请求失败 ${response.status}`);
  return body;
}

export function ZhihuDiscovery({ projects, onProject, generationOptions = defaultGenerationOptions }: { projects: WorkshopProject[]; onProject: (project: WorkshopProject) => void; generationOptions?: WorkshopGenerationOptions }) {
  const [query, setQuery] = useState('悬疑短篇小说 已完结');
  const [sourceUrl, setSourceUrl] = useState('');
  const [candidates, setCandidates] = useState<ZhihuCandidate[]>([]), [selected, setSelected] = useState<ZhihuCandidate | null>(null);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const active = useRef(false);
  const pageRequest = useRef(0);
  useEffect(() => {
    let live = true;
    const receivePage = () => {
      if (!location.hash.startsWith(zhihuPageFragment)) return;
      const request = ++pageRequest.current;
      try {
        const source = readZhihuPageSelection(location.hash);
        history.replaceState(null, '', `${location.pathname}${location.search}`);
        setError('');
        void post<ZhihuCandidate>('/api/workshop/discovery/page', source).then(candidate => {
          if (request !== pageRequest.current) return;
          setSelected(candidate); setCandidates(previous => [candidate, ...previous.filter(row => row.id !== candidate.id)]);
        }).catch(e => { if (request === pageRequest.current) setError((e as Error).message); });
      } catch (e) { setError((e as Error).message); }
    };
    receivePage();
    window.addEventListener('hashchange', receivePage);
    void fetchJson<ZhihuDiscoveryResult>('/api/workshop/discovery').then(result => { if (live) setCandidates(previous => [...previous, ...result.candidates.filter(row => !previous.some(item => item.id === row.id))]); })
      .catch(e => { if (live) setError((e as Error).message); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; window.removeEventListener('hashchange', receivePage); };
  }, []);
  const act = async (operation: () => Promise<void>) => {
    if (active.current) return; active.current = true; setBusy(true); setError('');
    try { await operation(); } catch (e) { setError((e as Error).message); }
    finally { active.current = false; setBusy(false); }
  };
  const search = () => act(async () => { const result = await post<ZhihuDiscoveryResult>('/api/workshop/discovery', { query }); setCandidates(result.candidates); setSelected(null); });
  const resolveUrl = () => act(async () => {
    const candidate = await post<ZhihuCandidate>('/api/workshop/discovery/url', { sourceUrl: sourceUrl.trim() });
    setCandidates(previous => [candidate, ...previous.filter(item => item.origin.sourceUrl !== candidate.origin.sourceUrl)]);
    setSelected(candidate);
  });
  const save = (generate: boolean) => act(async () => {
    if (!selected) return;
    const project = await post<WorkshopProject>('/api/workshop/discovery/import', { candidateId: selected.id, generate, generationOptions });
    onProject(project);
  });
  const existing = selected && projects.find(project => selected.sourceHash ? project.sourceHash === selected.sourceHash : project.origin?.sourceUrl === selected.origin.sourceUrl);
  return <section className="zhihu-discovery" aria-label="发现更多知乎故事">
    <div className="discovery-heading"><ZhihuBadge label="发现故事" /><span>{candidates.length} 份已保存节选</span></div>
    <form className="discovery-search" onSubmit={e => { e.preventDefault(); void search(); }}>
      <label><Search size={17} /><input aria-label="搜索新的知乎故事" value={query} onChange={e => setQuery(e.target.value)} maxLength={120} placeholder="题材、作品或作者" /></label>
      <button className="primary-button" disabled={loading || busy || query.trim().length < 2}>{busy ? <LoaderCircle className="spin" /> : <Search />}搜索</button>
    </form>
    <form className="discovery-url" onSubmit={e => { e.preventDefault(); void resolveUrl(); }}>
      <label><Link2 size={16} /><input aria-label="粘贴知乎回答或文章链接" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} placeholder="也可以直接粘贴知乎回答 / 文章链接" /></label>
      <button className="text-button" disabled={loading || busy || !sourceUrl.trim()}>{busy ? <LoaderCircle className="spin" size={14} /> : <Link2 size={14} />}读取这篇</button>
    </form>
    {error && <p className="workshop-error" role="alert">{error}</p>}
    {loading ? <p className="discovery-loading" role="status"><LoaderCircle className="spin" size={16} />读取已保存的故事</p> : selected ? <article className="discovered-source" data-candidate-id={selected.id}>
      <button className="text-button" onClick={() => setSelected(null)}><ArrowLeft size={14} />返回搜索结果</button>
      <h3>{selected.title}</h3><AuthorIdentity name={selected.author} avatar={selected.origin.authorAvatar} />
      <div className="discovery-source-meta"><span>{selected.origin.kind === 'zhihu-answer' ? '知乎回答' : '知乎文章'} · {selected.characters} 字符</span><a href={selected.origin.sourceUrl}>查看来源 · 当前标签 <ExternalLink size={12} /></a></div>
      <p className="discovery-scope">{selected.origin.contentScope === 'webpage-selection' ? '以下是你在知乎网页选取的可见正文，按浏览器传来的文字逐字保存；它可能只是原作的一部分。' : '以下为知乎搜索返回的节选，并非完整原作。'}新增游戏剧情与结局另作改编。</p>
      <pre data-testid="discovered-source-text">{selected.excerpt}</pre>
      <div className="discovery-actions">{existing ? <button className="primary-button" onClick={() => onProject(existing)}>查看改编项目 <ArrowRight /></button> : <><button className="primary-button" disabled={busy} onClick={() => void save(true)}><FilePlus2 />生成游戏 <ArrowRight /></button><button className="text-button" disabled={busy} onClick={() => void save(false)}><BookOpen size={14} />先保存原文</button></>}</div>
    </article> : <div className="discovery-results">{candidates.map((candidate, index) => <button key={candidate.id} className="discovery-result" data-candidate-id={candidate.id} onClick={() => setSelected(candidate)}>
      <span className="discovery-number">{String(index + 1).padStart(2, '0')}</span><span className="discovery-result-copy"><b>{candidate.title}</b><small>{candidate.author} / {candidate.origin.kind === 'zhihu-answer' ? '回答节选' : '文章节选'}</small><span>{candidate.excerpt.slice(0, 110)}</span></span><ArrowRight size={16} />
    </button>)}{!candidates.length && !error && <p className="discovery-loading">还没有保存的搜索结果。</p>}</div>}
  </section>;
}
