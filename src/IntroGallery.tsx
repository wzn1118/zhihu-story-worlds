import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize2, X, ZoomIn, ZoomOut } from 'lucide-react';
import './IntroGallery.css';

export default function IntroGallery({ shots, label }: { shots: string[]; label: string }) {
  const [index, setIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const flip = (offset: number) => { setIndex(current => (current + offset + shots.length) % shots.length); setZoomed(false); };

  useEffect(() => {
    if (!expanded) return;
    dialog.current?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { dialog.current?.close(); document.body.style.overflow = previousOverflow; };
  }, [expanded]);

  useEffect(() => { if (viewport.current) viewport.current.scrollTo(0, 0); }, [index, zoomed]);

  const gestures = {
    onTouchStart: (event: React.TouchEvent) => { const point = event.touches[0]; touch.current = { x: point.clientX, y: point.clientY }; },
    onTouchEnd: (event: React.TouchEvent) => {
      const start = touch.current;
      touch.current = null;
      if (!start || zoomed) return;
      const point = event.changedTouches[0];
      const distance = point.clientX - start.x;
      if (Math.abs(distance) > 50 && Math.abs(distance) > Math.abs(point.clientY - start.y)) flip(distance < 0 ? 1 : -1);
    },
  };

  const controls = <div className="intro-gallery-controls">
    <button type="button" onClick={() => flip(-1)} aria-label="上一张" title="上一张"><ChevronLeft size={20} /></button>
    <div className="intro-gallery-dots">{shots.map((shot, position) => <button type="button" key={shot} aria-label={`第 ${position + 1} 张`} aria-current={position === index ? 'true' : undefined} onClick={() => { setIndex(position); setZoomed(false); }}><i /></button>)}</div>
    <span className="intro-gallery-count" aria-live="polite">{index + 1} / {shots.length}</span>
    <button type="button" onClick={() => flip(1)} aria-label="下一张" title="下一张"><ChevronRight size={20} /></button>
  </div>;

  return <div className="intro-gallery" role="region" aria-label={`${label}图集`} onKeyDown={event => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); flip(-1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); flip(1); }
  }}>
    <button className="intro-gallery-frame" type="button" aria-label={`放大${label}截图`} onClick={() => { setExpanded(true); setZoomed(false); }} {...gestures}>
      <img key={shots[index]} src={shots[index]} alt={`${label}，第 ${index + 1} 张画面`} loading="lazy" draggable={false} />
      <span className="intro-gallery-expand"><Maximize2 size={19} /></span>
    </button>
    {controls}
    <dialog ref={dialog} className="intro-gallery-dialog" aria-label={`${label}截图预览`} onCancel={() => setExpanded(false)} onClick={event => { if (event.target === event.currentTarget) setExpanded(false); }}>
      {expanded && <div className="intro-gallery-viewer">
        <header><span>{label}</span><button type="button" onClick={() => setZoomed(value => !value)} aria-label={zoomed ? '适应窗口' : '原尺寸放大'} title={zoomed ? '适应窗口' : '原尺寸放大'}>{zoomed ? <ZoomOut size={22} /> : <ZoomIn size={22} />}</button><button type="button" onClick={() => setExpanded(false)} aria-label="关闭预览" title="关闭预览"><X size={22} /></button></header>
        <div ref={viewport} className={`intro-gallery-viewport ${zoomed ? 'is-zoomed' : ''}`} {...gestures}>
          <img src={shots[index]} alt={`${label}，第 ${index + 1} 张画面`} draggable={false} />
        </div>
        {controls}
      </div>}
    </dialog>
  </div>;
}
