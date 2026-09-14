import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';
import { LiuKanShanAvatar } from './LiuKanShanAvatar';
import {
  clipTourTarget, liukanTourSteps, placeTourCard, rememberLiukanTour,
  type LiukanTourDismissal, type LiukanTourStep, type LiukanTourView, type TourRect,
} from './liukan-tour';
import './LiukanTour.css';

export const LIUKAN_TOUR_STEP_EVENT = 'redleaf:liukan-tour-step';

export interface LiukanTourProps {
  open: boolean;
  onClose: (reason: LiukanTourDismissal) => void;
  onNavigate: (view: LiukanTourView, step: LiukanTourStep) => void | Promise<void>;
  onStepChange?: (step: LiukanTourStep) => void;
  reducedMotion?: boolean;
}

function visibleTarget(step: LiukanTourStep): HTMLElement | null {
    const elements = document.querySelectorAll<HTMLElement>(`[data-tour="${step.target}"]`);
    for (const element of elements) {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (element.closest('[hidden]') || element.closest('details:not([open])') || !element.getClientRects().length) continue;
      if (rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none') return element;
    }
  return null;
}

function TourSession({ onClose, onNavigate, onStepChange, reducedMotion: requestedReducedMotion = false }: Omit<LiukanTourProps, 'open'>) {
  const [index, setIndex] = useState(0);
  const [target, setTarget] = useState<TourRect | null>(null);
  const [matchedTarget, setMatchedTarget] = useState('');
  const [navigationError, setNavigationError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [cardSize, setCardSize] = useState({ width: 384, height: 400 });
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const cardRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const readyRef = useRef(false); readyRef.current = Boolean(target);
  const onNavigateRef = useRef(onNavigate), onCloseRef = useRef(onClose), onStepChangeRef = useRef(onStepChange);
  onNavigateRef.current = onNavigate; onCloseRef.current = onClose; onStepChangeRef.current = onStepChange;
  const step = liukanTourSteps[index];
  const isLast = index === liukanTourSteps.length - 1;
  const motionOff = reducedMotion || requestedReducedMotion;
  const margin = viewport.width < 600 ? 12 : 24;
  const width = Math.min(384, viewport.width - margin * 2);
  const beside = target && Math.max(target.left - margin, viewport.width - target.left - target.width - margin) >= width + 24;
  const cardMaxHeight = target && !beside ? Math.max(160, Math.max(target.top - margin - 20, viewport.height - target.top - target.height - margin - 20)) : viewport.height - margin * 2;
  const position = placeTourCard(target, viewport, cardSize);

  function close(reason: LiukanTourDismissal) {
    rememberLiukanTour(reason);
    window.dispatchEvent(new CustomEvent(LIUKAN_TOUR_STEP_EVENT, { detail: null }));
    onCloseRef.current(reason);
  }

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const application = document.getElementById('root');
    const wasInert = application?.inert ?? false;
    // The guide lives in a portal: keep background controls visible but out of focus order.
    if (application) application.inert = true;
    const containFocus = (event: FocusEvent) => {
      const dialog = cardRef.current;
      if (dialog && event.target instanceof Node && !dialog.contains(event.target)) titleRef.current?.focus({ preventScroll: true });
    };
    const keydown = (event: KeyboardEvent) => {
      const dialog = cardRef.current;
      if (!dialog) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close('later'); return; }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault(); event.stopImmediatePropagation();
        if (event.key === 'ArrowRight' && !readyRef.current) return;
        setIndex(current => Math.max(0, Math.min(liukanTourSteps.length - 1, current + (event.key === 'ArrowRight' ? 1 : -1))));
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
      const first = elements[0], last = elements.at(-1);
      if (!first || !last) return;
      const current = document.activeElement;
      if (!elements.includes(current as HTMLButtonElement) || (event.shiftKey && current === first) || (!event.shiftKey && current === last)) {
        event.preventDefault(); event.stopImmediatePropagation();
        (event.shiftKey ? last : first).focus();
      }
    };
    document.addEventListener('keydown', keydown, true);
    document.addEventListener('focusin', containFocus, true);
    return () => {
      document.removeEventListener('keydown', keydown, true);
      document.removeEventListener('focusin', containFocus, true);
      if (application) application.inert = wasInert;
      window.dispatchEvent(new CustomEvent(LIUKAN_TOUR_STEP_EVENT, { detail: null }));
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    let prepared = false;
    let frame = 0;
    let lastElement: HTMLElement | null = null;
    let scrolledElement: HTMLElement | null = null;
    let alive = true;
    setTarget(null); setMatchedTarget(''); setNavigationError('');
    const measure = () => {
      if (!alive) return;
      const currentViewport = { width: window.innerWidth, height: window.innerHeight };
      setViewport(previous => previous.width === currentViewport.width && previous.height === currentViewport.height ? previous : currentViewport);
      const element = prepared ? visibleTarget(step) : null;
      if (element !== lastElement) {
        if (lastElement) resizeObserver.unobserve(lastElement);
        lastElement = element;
        if (element) resizeObserver.observe(element);
      }
      if (element && element !== scrolledElement) {
        scrolledElement = element;
        const rect = element.getBoundingClientRect();
        if (rect.top < 24 || rect.top > currentViewport.height * .4 || rect.bottom > currentViewport.height - 24) element.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'instant' });
      }
      const rect = element?.getBoundingClientRect();
      const next = rect ? clipTourTarget(rect, currentViewport) : null;
      setTarget(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
      setMatchedTarget(element?.dataset.tour ?? '');
      const card = cardRef.current;
      if (card) {
        const nextSize = { width: card.offsetWidth, height: card.offsetHeight };
        setCardSize(previous => previous.width === nextSize.width && previous.height === nextSize.height ? previous : nextSize);
      }
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const observer = new MutationObserver(schedule);
    const application = document.getElementById('root');
    if (application) observer.observe(application, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'open', 'style', 'data-tour'] });
    const resizeObserver = new ResizeObserver(schedule);
    if (cardRef.current) resizeObserver.observe(cardRef.current);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    schedule();
    // Route and subpanel preparation must finish before measuring; a parent
    // navigation button cannot stand in for an unavailable child module.
    void Promise.resolve().then(() => alive ? onNavigateRef.current(step.view, step) : undefined).then(() => {
      if (!alive) return;
      prepared = true;
      onStepChangeRef.current?.(step);
      window.dispatchEvent(new CustomEvent(LIUKAN_TOUR_STEP_EVENT, { detail: step }));
      schedule();
    }).catch(error => { if (alive) setNavigationError(error instanceof Error ? error.message : '这个页面暂时没有打开。'); });
    const focusFrame = requestAnimationFrame(() => titleRef.current?.focus({ preventScroll: true }));
    return () => {
      alive = false; cancelAnimationFrame(frame); cancelAnimationFrame(focusFrame);
      observer.disconnect(); resizeObserver.disconnect();
      window.removeEventListener('resize', schedule); window.removeEventListener('scroll', schedule, true);
    };
  }, [step, attempt]);

  const targetStyle: CSSProperties = target ? { left: target.left, top: target.top, width: target.width, height: target.height } : {};
  return <div className={`liukan-tour ${motionOff ? 'liukan-tour-reduced' : ''}`} data-step={step.id} data-target={matchedTarget} data-ready={Boolean(target)}>
    <div className={`liukan-tour-shade ${target ? 'has-target' : ''}`} aria-hidden="true" />
    {target && <div className="liukan-tour-spotlight" style={targetStyle} aria-hidden="true"><span className="liukan-tour-pin">{String(index + 1).padStart(2, '0')}</span></div>}
    <section className={`liukan-tour-card ${cardMaxHeight < 390 ? 'is-compact' : ''}`} style={{ left: position.left, top: position.top, maxHeight: cardMaxHeight }} role="dialog" aria-modal="true" aria-labelledby="liukan-tour-title" aria-describedby="liukan-tour-description" ref={cardRef}>
      <header className="liukan-tour-header"><span className="liukan-tour-signature">刘看山 · 带你认认路</span><button type="button" className="liukan-tour-close" onClick={() => close('later')} aria-label="稍后再看引导"><X size={18} /></button></header>
      <div className="liukan-tour-stage" aria-hidden="true"><span className="liukan-tour-orbit" /><LiuKanShanAvatar action={step.action} playKey={step.id} size={136} reducedMotion={motionOff} showAccent /><span className="liukan-tour-chapter">{step.chapter}</span></div>
      <div className="liukan-tour-copy" key={step.id} aria-live="polite" aria-atomic="true"><h2 id="liukan-tour-title" ref={titleRef} tabIndex={-1}>{step.title}</h2><p id="liukan-tour-description">{step.body}</p><p className="liukan-tour-hint">{step.hint}</p></div>
      {!target && <p className="liukan-tour-loading" role="status">{navigationError || '正在打开这一页的对应模块…'}{navigationError && <button onClick={() => setAttempt(value => value + 1)}>重新打开</button>}</p>}
      <div className="liukan-tour-progress" aria-label={`第 ${index + 1} 步，共 ${liukanTourSteps.length} 步`}><span>{String(index + 1).padStart(2, '0')} <i>/ {liukanTourSteps.length}</i></span><div aria-hidden="true"><span style={{ width: `${(index + 1) / liukanTourSteps.length * 100}%` }} /></div></div>
      <footer className="liukan-tour-footer"><button type="button" className="liukan-tour-previous" disabled={index === 0} onClick={() => setIndex(value => value - 1)}><ArrowLeft size={15} />上一步</button><button type="button" className="liukan-tour-next" disabled={!target} onClick={() => isLast ? close('complete') : setIndex(value => value + 1)}>{isLast ? '我知道怎么开始了' : index === 0 ? '带我看看' : '继续看看'}{isLast ? <Check size={16} /> : <ArrowRight size={16} />}</button></footer>
      <button type="button" className="liukan-tour-later" onClick={() => close('later')}>我先自己逛逛</button>
    </section>
  </div>;
}

export function LiukanTour({ open, ...props }: LiukanTourProps) {
  return open ? createPortal(<TourSession {...props} />, document.body) : null;
}
