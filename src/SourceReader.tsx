import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp, CircleHelp, LoaderCircle, RefreshCw, Search, X } from 'lucide-react';
import type { SourcePassage, StoryDetail, StorySummary } from '../shared/types';
import { findSourceMatches, sourceAnchorStatus, sourceParagraphs, sourceSegments, type SourceSearchState } from './source-reader';
import { AuthorIdentity, ZhihuBadge } from './ZhihuSource';
import { SourceLinks } from './SourceLinks';

export function SourceReader({ story, detail, loading, error, target, onRetry, onSearchState }: {
  story: StorySummary; detail: StoryDetail | null; loading: boolean; error: string;
  target: SourcePassage | null; onRetry: () => void; onSearchState: (state: SourceSearchState) => void;
}) {
  const [query, setQuery] = useState(target?.quote ?? '');
  const [activeIndex, setActiveIndex] = useState(0);
  const articleRef = useRef<HTMLElement>(null);
  const content = detail?.content ?? '';
  const paragraphs = useMemo(() => sourceParagraphs(content), [content]);
  const matches = useMemo(() => findSourceMatches(content, query), [content, query]);
  const anchorStatus = target && query === target.quote && !loading && !error && detail ? sourceAnchorStatus(content, target.quote) : null;
  const selected = matches.length ? Math.min(activeIndex, matches.length - 1) : -1;
  useEffect(() => { setActiveIndex(0); }, [content, query]);
  useEffect(() => { onSearchState({ query, count: matches.length, activeIndex: selected, anchorStatus }); }, [query, matches.length, selected, anchorStatus, onSearchState]);
  useEffect(() => {
    if (selected < 0 || loading || error) return;
    const handle = requestAnimationFrame(() => articleRef.current?.querySelector(`[data-source-match="${selected}"]`)?.scrollIntoView({ block: 'center' }));
    return () => cancelAnimationFrame(handle);
  }, [selected, matches, loading, error]);
  const move = (direction: number) => { if (matches.length) setActiveIndex((selected + direction + matches.length) % matches.length); };
  return <article className="source-reader" aria-busy={loading} ref={articleRef}>
    <div className="source-reader-tools" data-tour="story-source">
    <div className="source-search" role="search" aria-label="原文查找">
      <label className="source-search-field"><Search size={16} /><input type="search" aria-label="在原作节选中查找" placeholder="查找原文" maxLength={240} value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); move(event.shiftKey ? -1 : 1); } }} /></label>
      <span className="source-match-count" role="status">{query.trim() ? `${selected + 1} / ${matches.length}` : ''}</span>
      <button type="button" className="icon-button" title="上一个匹配" aria-label="上一个匹配" disabled={!matches.length} onClick={() => move(-1)}><ChevronUp /></button>
      <button type="button" className="icon-button" title="下一个匹配" aria-label="下一个匹配" disabled={!matches.length} onClick={() => move(1)}><ChevronDown /></button>
      <button type="button" className="icon-button" title="清除查找" aria-label="清除查找" disabled={!query} onClick={() => setQuery('')}><X /></button>
    </div>
    {target && <aside className="source-context"><h4>{target.label}</h4><p>{target.note}</p>
      {anchorStatus === 'missing' && <p className="source-anchor-warning" role="status">当前节选中没有找到这段原文。<button className="text-button" onClick={onRetry}><RefreshCw />重新读取节选</button></p>}
      {anchorStatus === 'ambiguous' && <p className="source-anchor-warning" role="status">原文有多处相同文字，请结合前后文核对。</p>}
    </aside>}
    </div>
    <header className="source-reader-heading">
      <ZhihuBadge label="原作节选" />
      <h3 className="source-reader-title" tabIndex={-1} data-modal-autofocus>{story.title}</h3>
      <AuthorIdentity name={detail?.author ?? story.author ?? (loading ? '正在读取署名' : '署名暂未读取')} avatar={detail?.authorAvatar ?? story.authorAvatar} />
      <p className="source-reader-scope">以下为知乎公开接口提供的原作节选，并非完整作品。互动世界的新增分支与结局不属于原作。</p>
      <SourceLinks source={detail ?? story} />
    </header>
    {loading ? <div className="reader-status" role="status"><LoaderCircle className="spin" size={22} /><p>正在读取原作节选</p></div>
      : error ? <div className="reader-status reader-error" role="alert"><CircleHelp size={25} /><h4>原作节选暂时无法打开</h4><p>{error}</p><button className="secondary-button" onClick={onRetry}><RefreshCw />重新读取节选</button></div>
      : !paragraphs.length ? <div className="reader-status" role="status"><BookOpen size={25} /><h4>当前没有可读的正文</h4><p>来源接口尚未返回这篇故事的节选内容。</p><button className="secondary-button" onClick={onRetry}><RefreshCw />重新读取节选</button></div>
      : <>
        {detail?.warning && <p className="reader-warning" role="status">{detail.warning}</p>}
        <div className="source-reader-prose">{paragraphs.map((paragraph, index) => {
          const text = sourceSegments(paragraph, matches).map((segment, part) => segment.matchIndex === undefined ? segment.text : <mark key={part} data-source-match={segment.matchIndex} data-active={segment.matchIndex === selected}>{segment.text}</mark>);
          return /^\d{1,3}$/.test(paragraph.text) ? <h4 key={index} className="source-reader-chapter">{text}</h4> : <p key={index}>{text}</p>;
        })}</div>
        <p className="source-reader-end">公开节选到此；这不是原作结局。</p>
      </>}
  </article>;
}
