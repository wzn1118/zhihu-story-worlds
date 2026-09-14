import { Artwork } from './Artwork';
import { useEffect, useState } from 'react';
import { ArrowRight, BookOpen, Check, FilePlus2, LoaderCircle, Search, X } from 'lucide-react';
import type { GameWorld, StoryDetail, StorySummary } from '../shared/types';
import { isZhihuWorld, worldSourceLabel, zhihuImage } from '../shared/zhihu-source';
import { fetchJson } from './game';
import { SourceLinks } from './SourceLinks';

export function ZhihuBadge({ label = '原作', compact = false }: { label?: string; compact?: boolean }) {
  return <span className={`zhihu-badge ${compact ? 'compact' : ''}`}><span className="zhihu-wordmark">知乎</span>{label && <span className="zhihu-badge-label">{label}</span>}</span>;
}

export function AuthorIdentity({ name, avatar, label = '原作作者' }: { name?: string; avatar?: string; label?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [avatar]);
  const src = zhihuImage(avatar);
  return <span className="author-identity"><span className="author-avatar">{src && !failed ? <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : (name ?? '作')[0]}</span><span><b>{name ?? '署名待读取'}</b>{label && <small>{label}</small>}</span></span>;
}

export function ZhihuSourcePicker({ stories, selected, onSelect, onRead, onImport, busy, available }: {
  stories: StorySummary[]; selected: StorySummary | null; onSelect: (story: StorySummary | null) => void;
  onRead: (story: StorySummary) => void; onImport: (story: StoryDetail) => void; busy: boolean; available: boolean;
}) {
  const [query, setQuery] = useState('');
  const [detail, setDetail] = useState<StoryDetail | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    setDetail(null); setError('');
    if (selected) void fetchJson<StoryDetail>(`/api/stories/${encodeURIComponent(selected.id)}`).then(value => { if (current) setDetail(value); }).catch(error => { if (current) setError((error as Error).message); });
    return () => { current = false; };
  }, [selected?.id, attempt]);
  const filtered = stories.filter(story => `${story.title} ${story.author ?? ''} ${story.labels.join(' ')}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="zhihu-source-picker">
    {!selected ? <>
      <div className="picker-heading"><ZhihuBadge label="故事书库" /><span>{stories.length} 篇原作</span></div>
      <label className="picker-search"><Search size={17} /><input aria-label="查找要改编的知乎故事" placeholder="找一本故事，或一位作者" value={query} onChange={e => setQuery(e.target.value)} />{query && <button type="button" aria-label="清除书库搜索" title="清除搜索" onClick={() => setQuery('')}><X size={15} /></button>}</label>
      <div className="picker-books">{filtered.map(story => <button type="button" key={story.id} className="picker-book" onClick={() => onSelect(story)}>
        <span className="picker-book-cover">{(story.sourceCover || story.cover) && <Artwork src={story.sourceCover || story.cover} alt="" />}</span>
        <span className="picker-book-copy"><b>{story.title}</b><small>{story.author ?? '作者署名待读取'}</small><span>{story.labels.slice(0, 2).join(' / ')}</span></span><ArrowRight size={16} />
      </button>)}</div>
      {!filtered.length && <p className="picker-empty">{stories.length ? '没有找到这篇故事，换个关键词试试。' : '故事书库还在连接中。'}</p>}
    </> : <div className="selected-source" data-testid="selected-zhihu-source">
      <div className="picker-heading"><ZhihuBadge label="原作节选" /><button type="button" className="text-button" onClick={() => onSelect(null)} disabled={busy}>换一篇 <X size={14} /></button></div>
      <div className="selected-source-heading"><div className="selected-source-cover">{(selected.sourceCover || selected.cover) && <Artwork src={selected.sourceCover || selected.cover} alt={`${selected.title}原作封面`} />}</div><div><span className="source-edition">原作 / SOURCE</span><h3>{detail?.title ?? selected.title}</h3><AuthorIdentity name={detail?.author ?? selected.author} avatar={detail?.authorAvatar ?? selected.authorAvatar} /></div></div>
      {error ? <div className="workshop-error" role="alert"><p>{error}</p><button className="text-button" type="button" onClick={() => setAttempt(a => a + 1)}>重新读取</button></div> : !detail ? <p className="picker-loading" role="status"><LoaderCircle className="spin" size={16} /> 正在读取知乎原文</p> : <>
        <div className="selected-source-excerpt"><span className="source-edition">节选预览</span><p>{detail.content.slice(0, 460)}{detail.content.length > 460 ? '…' : ''}</p></div>
        <div className="selected-source-meta"><span><Check size={13} /> 保留原作者与原文</span><span>{detail.content.length.toLocaleString()} 字符 · 公开节选</span></div>
        {detail.warning && <p className="picker-warning" role="status">{detail.warning}</p>}
        <div className="selected-source-actions"><button type="button" className="primary-button" disabled={busy || !available} onClick={() => onImport(detail)}>{busy ? <LoaderCircle className="spin" /> : <FilePlus2 />}加入改编项目 <ArrowRight /></button><button type="button" className="text-button" onClick={() => onRead(detail)}><BookOpen />读完整节选</button></div>
        {!available && <p className="picker-warning" role="status">当前服务尚未加载知乎导入接口，原作仍可阅读。</p>}
        <SourceLinks source={detail ?? selected} />
        <p className="source-footnote">这是原作的公开节选。新的剧情与结局会另存为赤页改编。</p>
      </>}
    </div>}
  </div>;
}

export function EndingSourceBridge({ world, endingTitle, choices, onRead, onHistory }: { world: GameWorld; endingTitle: string; choices: number; onRead: () => void; onHistory: () => void }) {
  const zhihu = isZhihuWorld(world);
  return <section className="ending-source-bridge" aria-label="原作与这次改编">
    <header><span className="source-edition">故事之外</span><h2>再翻回原作看看</h2></header>
    <div className="source-bridge-columns"><div className="source-bridge-original">
      {zhihu ? <ZhihuBadge label="原作节选" /> : <span className="source-edition">{worldSourceLabel(world)}</span>}
      <h3>《{world.source.title}》</h3><AuthorIdentity name={world.source.author} avatar={world.source.origin?.authorAvatar} label={zhihu ? '知乎原作作者' : '原文署名'} />
      <button className="text-button" onClick={onRead}><BookOpen />{zhihu ? '阅读知乎原作节选' : '查看导入原文'}<ArrowRight /></button>
    </div><div className="source-bridge-adaptation"><span className="adaptation-label">赤页 · 互动改编</span><h3>{endingTitle}</h3><p>{choices} 次选择 · 这次走到的结局</p><p className="source-footnote">新增情节与结局属于改编，原文另行保留。</p><button className="text-button" onClick={onHistory}>回看我的选择 <ArrowRight /></button></div></div>
    {zhihu && <SourceLinks source={world.source} />}
  </section>;
}
