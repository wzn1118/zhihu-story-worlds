import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Bookmark, ExternalLink, FilePlus2, FolderOpen, LoaderCircle, RefreshCw } from 'lucide-react';
import type { ZhihuFavoriteItem, ZhihuFavoriteItemsResult, ZhihuFavoriteList, ZhihuFavoriteListsResult } from '../shared/zhihu-favorites';
import type { ImportedSource, WorkshopProject } from '../shared/workshop';
import { canonicalZhihuSource } from '../shared/zhihu-discovery';
import { subscribeAccountStorage } from './account-storage';
import { ApiError, fetchJson } from './game';
import { AuthorIdentity, ZhihuBadge } from './ZhihuSource';
import type { WorkshopGenerationOptions } from './workshop-input';
import './ZhihuFavorites.css';

type OAuthStatus = { configured: boolean; authorized: boolean; identityVerified: boolean; userDataConfigured: boolean };
type FavoriteView = { kind: 'recent' } | { kind: 'lists' } | { kind: 'folder'; folder: ZhihuFavoriteList };
const contentNames: Record<string, string> = { answer: '回答', article: '文章', question: '问题', pin: '想法', zvideo: '视频' };

export function ZhihuFavorites({ projects, generationOptions, onProject, onCompleteSource }: {
  projects: WorkshopProject[];
  generationOptions: WorkshopGenerationOptions;
  onProject: (project: WorkshopProject) => void;
  onCompleteSource: (source: ImportedSource) => void;
}) {
  const [oauth, setOAuth] = useState<OAuthStatus | null>(null);
  const [view, setView] = useState<FavoriteView>({ kind: 'recent' });
  const [items, setItems] = useState<ZhihuFavoriteItem[]>([]);
  const [lists, setLists] = useState<ZhihuFavoriteList[]>([]);
  const [nextOffset, setNextOffset] = useState<string>();
  const [selected, setSelected] = useState<ZhihuFavoriteItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [accessError, setAccessError] = useState(false);
  const sequence = useRef(0), posting = useRef(false);
  const clearContent = useCallback(() => { setItems([]); setLists([]); setSelected(null); setNextOffset(undefined); }, []);
  const fail = useCallback((cause: unknown) => {
    setError(cause instanceof Error ? cause.message : '暂时无法读取收藏，请稍后重试。');
    if (cause instanceof ApiError && cause.code === 'FAVORITE_NOT_FOUND') {
      setSelected(null); setItems([]); setNextOffset(undefined);
    }
    if (cause instanceof ApiError && [401, 403, 409].includes(cause.status)) {
      clearContent(); setAccessError(true);
    }
  }, [clearContent]);

  const load = useCallback(async (target: FavoriteView, offset?: string) => {
    const requestId = ++sequence.current;
    setLoading(true); setError(''); setView(target); setSelected(null);
    if (offset === undefined) { setItems([]); setNextOffset(undefined); }
    try {
      if (target.kind === 'lists') {
        setLists([]);
        const result = await fetchJson<ZhihuFavoriteListsResult>('/api/workshop/favorites/lists');
        if (requestId === sequence.current) setLists(result.lists);
      } else {
        const path = target.kind === 'recent' ? '/api/workshop/favorites/recent'
          : `/api/workshop/favorites/lists/${encodeURIComponent(target.folder.id)}/items${offset === undefined ? '' : `?offset=${encodeURIComponent(offset)}`}`;
        const result = await fetchJson<ZhihuFavoriteItemsResult>(path);
        if (requestId !== sequence.current) return;
        setItems(previous => offset === undefined ? result.items : [...previous, ...result.items.filter(item => !previous.some(row => row.id === item.id || (row.url && row.url === item.url)))]);
        setNextOffset(target.kind === 'folder' && result.nextOffset !== offset ? result.nextOffset : undefined);
      }
    } catch (cause) { if (requestId === sequence.current) fail(cause); }
    finally { if (requestId === sequence.current) setLoading(false); }
  }, [fail]);

  const initialize = useCallback(async () => {
    const requestId = ++sequence.current;
    setLoading(true); setError(''); setAccessError(false); clearContent(); setOAuth(null);
    try {
      const status = await fetchJson<OAuthStatus>('/api/oauth/status');
      if (requestId !== sequence.current) return;
      setOAuth(status);
      if (status.configured && status.authorized && status.identityVerified && status.userDataConfigured) await load({ kind: 'recent' });
    } catch (cause) { if (requestId === sequence.current) fail(cause); }
    finally { if (requestId === sequence.current) setLoading(false); }
  }, [clearContent, fail, load]);

  useEffect(() => {
    void initialize();
    const unsubscribe = subscribeAccountStorage(() => { sequence.current++; clearContent(); setAccessError(true); setLoading(false); setError('登录账号已变化，请刷新页面后查看收藏。'); });
    return () => { sequence.current++; unsubscribe(); };
  }, [initialize, clearContent]);

  const save = async (generate: boolean) => {
    if (!selected?.importable || posting.current) return;
    posting.current = true; setImporting(true); setError('');
    const requestId = sequence.current;
    try {
      const project = await fetchJson<WorkshopProject>('/api/workshop/favorites/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: selected.id, generate, generationOptions }),
      });
      if (requestId === sequence.current) onProject(project);
    } catch (cause) { if (requestId === sequence.current) fail(cause); }
    finally { posting.current = false; if (requestId === sequence.current) setImporting(false); }
  };
  const existing = selected && projects.find(project => project.origin?.contentScope === 'favorite-summary' && project.origin.sourceUrl === selected.url);
  let canComplete = false;
  try { if (selected && ['answer', 'article'].includes(selected.contentType)) { canonicalZhihuSource(selected.url); canComplete = true; } } catch { /* Unsupported source links remain readable only. */ }
  const enabled = oauth?.configured && oauth.authorized && oauth.identityVerified && oauth.userDataConfigured && !accessError;
  const busy = loading || importing;
  const sectionName = view.kind === 'folder' ? view.folder.title : view.kind === 'lists' ? '我的收藏夹' : '近期收藏';

  return <section className="zhihu-favorites" aria-label="我的知乎收藏">
    <header className="favorites-heading"><ZhihuBadge label="我的收藏" /><span>把收藏里的灵感，变成可玩的故事</span></header>
    <p className="favorites-note">通过知乎授权读取当前账号可访问的公开收藏。选中回答或文章后，可将摘要作为新故事素材。</p>
    {error && <div className="workshop-error" role="alert"><p>{error}</p>{accessError ? <button className="text-button" onClick={() => location.reload()}>刷新登录状态</button> : <button className="text-button" disabled={busy} onClick={() => void (enabled ? load(view) : initialize())}>重试 <RefreshCw size={13} /></button>}</div>}
    {!enabled ? loading ? <p className="favorites-loading" role="status"><LoaderCircle className="spin" size={16} />正在确认知乎授权</p>
      : !accessError && oauth && <div className="favorites-empty">
        <Bookmark size={25} />
        {!oauth.configured ? <p>知乎登录尚未配置，暂时无法读取个人收藏。</p>
          : !oauth.authorized || !oauth.identityVerified ? <><p>用你的知乎账号授权后，即可在这里查看收藏。</p><a className="primary-button" href="/api/oauth/start">授权知乎并查看收藏 <ArrowRight size={16} /></a></>
          : <p>当前服务尚未开通收藏读取，请联系管理员完成配置后重试。</p>}
      </div>
      : <>
        <div className="favorites-navigation" aria-label="收藏浏览方式">
          <button type="button" aria-pressed={view.kind === 'recent'} disabled={busy} onClick={() => void load({ kind: 'recent' })}><Bookmark size={15} />近期收藏</button>
          <button type="button" aria-pressed={view.kind !== 'recent'} disabled={busy} onClick={() => void load({ kind: 'lists' })}><FolderOpen size={15} />我的收藏夹</button>
          <button type="button" className="text-button" aria-label="刷新知乎收藏" disabled={busy} onClick={() => void load(view)}><RefreshCw size={14} /></button>
        </div>
        {view.kind === 'folder' && <div className="favorites-folder-heading"><button className="text-button" disabled={busy} onClick={() => void load({ kind: 'lists' })}><ArrowLeft size={14} />返回收藏夹</button><h3>{view.folder.title}</h3></div>}
        <p className="favorites-note">{view.kind === 'recent' ? '近期收藏只显示最近一批内容。更早的收藏可进入收藏夹查看。' : view.kind === 'lists' ? '这里显示平台返回的公开收藏夹，可能不包含全部收藏夹。' : '收藏夹里的摘要可逐页查看，原作链接和作者会随选中的素材保存。'}</p>
        {loading && <p className="favorites-loading" role="status"><LoaderCircle className="spin" size={16} />正在读取{sectionName}</p>}
        {selected ? <article className="favorite-preview">
          <button className="text-button" disabled={importing} onClick={() => { setSelected(null); setError(''); }}><ArrowLeft size={14} />返回收藏内容</button>
          <h3>{selected.title}</h3><AuthorIdentity name={selected.author} />
          <div className="favorite-meta"><span>{contentNames[selected.contentType] ?? '收藏内容'} · 摘要 {selected.characters.toLocaleString()} 字符</span>{selected.url && <a href={selected.url} target="_blank" rel="noopener noreferrer">查看知乎原文 <ExternalLink size={12} /></a>}</div>
          <p className="favorites-scope">以下为知乎收藏接口提供的摘要，并非完整原作。生成的角色、剧情与结局属于 AI 改编。</p>
          <pre data-testid="favorite-summary">{selected.summary || '这条收藏暂时没有可读取的摘要。'}</pre>
          {!selected.importable && <p className="favorites-note">{selected.unavailableReason ?? '这条收藏暂时不能直接用于生成。'}</p>}
          <div className="favorites-actions">
            <button className="primary-button" disabled={importing || !selected.importable} onClick={() => void save(true)}>{importing ? <LoaderCircle className="spin" size={16} /> : <FilePlus2 size={16} />}{generationOptions.mode === 'fast' ? '用这条收藏生成故事' : '用这条收藏生成长篇'}</button>
            <button className="text-button" disabled={importing || !selected.importable} onClick={() => void save(false)}>仅保存收藏素材</button>
          {existing && <button className="text-button" disabled={importing} onClick={() => onProject(existing)}>查看改编项目 <ArrowRight size={16} /></button>}{!selected.importable && canComplete && <button className="text-button" disabled={importing} onClick={() => onCompleteSource({ title: selected.title, author: selected.author, text: selected.summary, referenceUrl: selected.url, scope: 'user-import' })}>补充正文后使用 <ArrowRight size={14} /></button>}</div>
        </article> : view.kind === 'lists' ? <div className="favorites-results">
          {lists.map(folder => <button className="favorite-row" key={folder.id} disabled={busy} onClick={() => void load({ kind: 'folder', folder })}><FolderOpen size={19} /><span><b>{folder.title}</b><small>{folder.description || '进入收藏夹查看内容'}</small></span><ArrowRight size={15} /></button>)}
          {!loading && !error && !lists.length && <p className="favorites-empty">暂时没有可读取的公开收藏夹。</p>}
        </div> : <>
          <div className="favorites-results">{items.map(item => <button className="favorite-row" key={item.id} disabled={busy} onClick={() => { setSelected(item); setError(''); }}><Bookmark size={18} /><span><b>{item.title}</b><small>{item.author} · {contentNames[item.contentType] ?? '收藏内容'}</small><span>{item.summary || '暂无摘要'}</span>{!item.importable && <small>{item.unavailableReason}</small>}</span><ArrowRight size={15} /></button>)}
            {!loading && !error && !items.length && <p className="favorites-empty">{view.kind === 'recent' ? '近期没有可读取的收藏，可以去“我的收藏夹”看看。' : '这个收藏夹暂无可读取的公开内容。'}</p>}
          </div>
          {nextOffset !== undefined && <button className="text-button favorites-more" disabled={busy} onClick={() => void load(view, nextOffset)}>加载更多收藏 <ArrowRight size={14} /></button>}
        </>}
      </>}
  </section>;
}
