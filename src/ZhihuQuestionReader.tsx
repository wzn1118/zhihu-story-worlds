import { useEffect, useRef, useState, type DragEvent as ReactDragEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowLeft, ArrowUpRight, Grip, LoaderCircle, RefreshCw, Send } from 'lucide-react';
import { LIUKAN_POST_MIME } from '../shared/liukan-inbox';
import type { ZhihuCandidate } from '../shared/zhihu-discovery';
import type { ZhihuHotQuestionsResult, ZhihuQuestionAnswersResult } from '../shared/zhihu-questions';
import { requestZhihuJson } from './zhihu-request';
import './ZhihuQuestionReader.css';

interface Props {
  questionUrl: string | null;
  questionTitle?: string;
  onQuestion: (url: string | null, title?: string) => void;
  onBack: () => void;
  onOriginal: (url: string) => void;
  active: boolean;
}

function transferFor(candidateId: string) {
  const transfer = new DataTransfer();
  transfer.setData(LIUKAN_POST_MIME, JSON.stringify({ candidateId }));
  transfer.effectAllowed = 'copy';
  return transfer;
}

function AnswerCard({ candidate, index, onOriginal }: { candidate: ZhihuCandidate; index: number; onOriginal: (url: string) => void }) {
  const pointer = useRef<{ id: number; x: number; y: number; handle: HTMLButtonElement; moved: boolean; transfer: DataTransfer; hovered: Element | null } | null>(null);
  const suppressClick = useRef(0);
  const [preview, setPreview] = useState<{ x: number; y: number } | null>(null);
  const end = () => {
    const current = pointer.current;
    if (current?.handle.hasPointerCapture(current.id)) current.handle.releasePointerCapture(current.id);
    if (current?.hovered) current.hovered.dispatchEvent(new DragEvent('dragleave', { bubbles: true, dataTransfer: current.transfer }));
    pointer.current = null; setPreview(null);
    window.dispatchEvent(new Event('dragend'));
  };
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => { if (event.key === 'Escape' && pointer.current) { suppressClick.current = performance.now() + 350; end(); } };
    window.addEventListener('keydown', cancel);
    return () => { window.removeEventListener('keydown', cancel); end(); };
  }, []);
  const feed = () => {
    if (performance.now() < suppressClick.current) return;
    window.dispatchEvent(new CustomEvent('redleaf:feed-post', { detail: { candidateId: candidate.id } }));
  };
  const drag = (event: ReactDragEvent) => {
    event.dataTransfer.setData(LIUKAN_POST_MIME, JSON.stringify({ candidateId: candidate.id }));
    event.dataTransfer.effectAllowed = 'copy';
    window.dispatchEvent(new Event('redleaf:post-drag-start'));
  };
  const pointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !event.isPrimary || pointer.current) return;
    pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY, handle: event.currentTarget, moved: false, transfer: transferFor(candidate.id), hovered: null };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  const pointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = pointer.current;
    if (!current || current.id !== event.pointerId) return;
    if (!current.moved && Math.hypot(event.clientX - current.x, event.clientY - current.y) < 6) return;
    if (!current.moved) {
      current.moved = true;
      window.dispatchEvent(new DragEvent('dragstart', { dataTransfer: current.transfer }));
    }
    setPreview({ x: event.clientX, y: event.clientY });
    const hovered = document.elementFromPoint(event.clientX, event.clientY)?.closest('.liukan-pet') ?? null;
    if (current.hovered && current.hovered !== hovered) current.hovered.dispatchEvent(new DragEvent('dragleave', { bubbles: true, dataTransfer: current.transfer }));
    hovered?.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: current.transfer }));
    current.hovered = hovered;
  };
  const pointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = pointer.current;
    if (!current || current.id !== event.pointerId) return;
    if (current.moved) {
      suppressClick.current = performance.now() + 350;
      document.elementFromPoint(event.clientX, event.clientY)?.closest('.liukan-pet')?.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: current.transfer }));
    }
    end();
  };
  return <article className="zhq-answer" draggable onDragStart={drag} onDragEnd={() => window.dispatchEvent(new Event('dragend'))} data-candidate-id={candidate.id}>
    <header><span className="zhq-answer-index">回答 {index + 1}</span><span className="zhq-author">{candidate.author || '接口未提供作者信息'}</span><button type="button" className="zhq-text-button" onClick={() => onOriginal(candidate.origin.sourceUrl)} aria-label={`打开第 ${index + 1} 条回答原文`}>原文 <ArrowUpRight size={14} /></button></header>
    <p className="zhq-answer-text">{candidate.excerpt}</p>
    <footer><small>官方回答节选（非全文） · {candidate.characters.toLocaleString()} 字</small><button type="button" className="zhq-feed" draggable onDragStart={drag} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={end} onClick={feed} aria-label={`把第 ${index + 1} 条回答交给刘看山`} title="拖动这条回答，或点击交给刘看山"><Grip size={15} /><span>拖给刘看山</span><Send size={13} /></button></footer>
    {preview && <div className="zhq-drag-preview" style={{ left: Math.max(8, Math.min(innerWidth - 220, preview.x - 100)), top: Math.max(8, preview.y - 72) }}><strong>交给刘看山</strong><span>第 {index + 1} 条回答</span></div>}
  </article>;
}

export function ZhihuQuestionReader({ questionUrl, questionTitle, onQuestion, onBack, onOriginal, active }: Props) {
  const answersCache = useRef(new Map<string, ZhihuQuestionAnswersResult>());
  const hotCache = useRef<ZhihuHotQuestionsResult | null>(null);
  const [hotlist, setHotlist] = useState<ZhihuHotQuestionsResult | null>(null);
  const [answers, setAnswers] = useState<ZhihuQuestionAnswersResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [failedOffset, setFailedOffset] = useState(0);
  const generation = useRef(0);
  const pending = useRef(false);
  const autoOffset = useRef<string | null>(null);
  const readingPositions = useRef(new Map<string, number>());
  const scroll = useRef<HTMLDivElement>(null);
  const latest = useRef({ questionUrl, active }); latest.current = { questionUrl, active };

  const load = async (offset = 0) => {
    if (pending.current || !latest.current.active) return;
    const url = latest.current.questionUrl, current = generation.current;
    pending.current = true; setBusy(true); setError(''); setFailedOffset(offset);
    try {
      if (url) {
        const result = await requestZhihuJson<ZhihuQuestionAnswersResult>(`/api/zhihu/questions/answers?url=${encodeURIComponent(url)}&offset=${offset}`);
        if (current !== generation.current || latest.current.questionUrl !== url) return;
        const previous = offset > 0 ? answersCache.current.get(url) : undefined;
        const bySource = new Map<string, ZhihuCandidate>();
        for (const candidate of [...(previous?.candidates || []), ...result.candidates]) bySource.set(candidate.origin.sourceUrl, candidate);
        const merged = { ...result, candidates: [...bySource.values()] };
        answersCache.current.delete(url); answersCache.current.set(url, merged);
        while (answersCache.current.size > 8) answersCache.current.delete(answersCache.current.keys().next().value!);
        setAnswers(merged);
      } else {
        const result = await requestZhihuJson<ZhihuHotQuestionsResult>('/api/zhihu/questions/hotlist');
        if (current !== generation.current || latest.current.questionUrl !== null) return;
        hotCache.current = result; setHotlist(result);
      }
    } catch (reason) {
      if (current === generation.current) setError(reason instanceof Error ? reason.message : '内容暂时没有加载成功，请重试。');
    } finally {
      if (current === generation.current) { pending.current = false; setBusy(false); }
    }
  };
  useEffect(() => {
    generation.current++; pending.current = false; setBusy(false); setError(''); autoOffset.current = null;
    const cached = questionUrl ? answersCache.current.get(questionUrl) : hotCache.current;
    setAnswers(questionUrl ? answersCache.current.get(questionUrl) ?? null : null);
    setHotlist(hotCache.current);
    const restore = requestAnimationFrame(() => scroll.current?.scrollTo(0, readingPositions.current.get(questionUrl || 'hot') || 0));
    if (active && !cached) void load();
    return () => { cancelAnimationFrame(restore); generation.current++; pending.current = false; };
  }, [questionUrl, active]);

  const nextOffset = answers?.paging.nextOffset;
  const canLoadMore = Boolean(questionUrl && answers && !answers.paging.isEnd && nextOffset !== undefined);
  const loadMore = () => { if (canLoadMore && nextOffset !== undefined) void load(nextOffset); };
  const onScroll = () => {
    const element = scroll.current;
    if (element && active) readingPositions.current.set(questionUrl || 'hot', element.scrollTop);
    if (!element || !active || pending.current || error || !canLoadMore || nextOffset === undefined) return;
    const key = `${questionUrl}:${nextOffset}`;
    if (element.scrollHeight > element.clientHeight + 40 && element.scrollHeight - element.scrollTop - element.clientHeight < 280 && autoOffset.current !== key) {
      autoOffset.current = key; loadMore();
    }
  };
  const displayed = questionUrl ? answers : hotlist;
  const fetchedAt = displayed?.fetchedAt && Number.isFinite(Date.parse(displayed.fetchedAt)) ? new Date(displayed.fetchedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  return <section className="zhq-reader" hidden={!active} aria-label={questionUrl ? '知乎问题回答列表' : '知乎热榜问题列表'}>
    <div className="zhq-toolbar"><button type="button" className="zhq-text-button" onClick={questionUrl ? () => onQuestion(null) : onBack}><ArrowLeft size={16} />{questionUrl ? '返回热榜' : '返回知乎网页'}</button><span>知乎官方内容{displayed?.cached && fetchedAt && <small className="zhq-cache-time">缓存 · 更新于 {fetchedAt}</small>}</span><button type="button" className="zhq-text-button" disabled={busy} onClick={() => void load(0)}><RefreshCw size={14} className={busy ? 'zhq-spin' : ''} />刷新</button></div>
    <div className="zhq-scroll" ref={scroll} onScroll={onScroll}>
      <div className="zhq-content">
        <header className="zhq-heading"><p>{questionUrl ? '一起读回答' : '今天，大家在讨论什么'}</p><h2>{questionUrl ? questionTitle || answers?.title || '正在打开问题…' : '知乎热榜'}</h2><div>{questionUrl ? <><span>已加载 {answers?.candidates.length ?? 0} 条回答，每条都可以拖给刘看山</span><button type="button" className="zhq-text-button" onClick={() => onOriginal(questionUrl)}>在知乎查看 <ArrowUpRight size={14} /></button></> : <span>点开问题，读一读每个人的回答</span>}</div></header>
        {error && <div className="zhq-error" role="alert"><span>{error}</span>{!questionUrl && <button type="button" onClick={() => onOriginal('https://www.zhihu.com/hot')}>打开知乎热榜</button>}<button type="button" disabled={busy} onClick={() => void load(failedOffset)}>重试</button></div>}
        {questionUrl ? <>
          {answers?.warning && <p className="zhq-source-note">{answers.warning}</p>}
          <div className="zhq-answers">{answers?.candidates.map((candidate, index) => <AnswerCard key={candidate.origin.sourceUrl} candidate={candidate} index={index} onOriginal={onOriginal} />)}</div>
          {answers && answers.candidates.length === 0 && !busy && !error && <div className="zhq-empty">这个问题暂时没有可读取的官方回答节选。<button type="button" onClick={() => onOriginal(questionUrl)}>在知乎查看问题</button></div>}
          <div className="zhq-pagination" aria-live="polite">{busy ? <span><LoaderCircle size={16} className="zhq-spin" />正在加载回答…</span> : canLoadMore ? <button type="button" onClick={loadMore}>继续加载回答</button> : answers && answers.candidates.length > 0 ? <span>已展示接口当前可提供的回答</span> : null}</div>
        </> : <>
          <div className="zhq-hotlist">{hotlist?.items.map((question, index) => <button type="button" className="zhq-hot-question" key={question.url} onClick={() => /^https:\/\/(?:www\.)?zhihu\.com\/question\/\d+(?:[/?#]|$)/.test(question.url) ? onQuestion(question.url, question.title) : onOriginal(question.url)}><span className={`zhq-rank${index < 3 ? ' is-top' : ''}`}>{String(index + 1).padStart(2, '0')}</span><span className="zhq-hot-copy"><strong>{question.title}</strong>{question.summary && <small>{question.summary}</small>}</span>{question.thumbnailUrl && <img src={question.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />}<ArrowUpRight size={18} className="zhq-hot-arrow" /></button>)}</div>
          {busy && <div className="zhq-pagination" role="status"><span><LoaderCircle size={16} className="zhq-spin" />正在加载热榜…</span></div>}
          {hotlist && hotlist.items.length === 0 && !busy && !error && <div className="zhq-empty">热榜暂时没有内容，请稍后刷新。</div>}
        </>}
      </div>
    </div>
  </section>;
}
