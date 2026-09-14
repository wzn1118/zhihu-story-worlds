import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import './OpeningVideo.css';

const seenKey = 'redleaf-opening-v1';

export function OpeningVideo({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(() => {
    try { return sessionStorage.getItem(seenKey) !== 'seen'; } catch { return true; }
  });
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const skipRef = useRef<HTMLButtonElement>(null);
  const finish = useCallback(() => {
    try { sessionStorage.setItem(seenKey, 'seen'); } catch { /* Storage is optional. */ }
    setVisible(false);
  }, []);

  useEffect(() => {
    if (!visible) return;
    skipRef.current?.focus();
    const video = videoRef.current;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) setPaused(true);
    else void video?.play().catch(() => setPaused(true));
    const handleKey = (event: KeyboardEvent) => { if (event.key === 'Escape') finish(); };
    window.addEventListener('keydown', handleKey);
    // A failed or stalled download must never prevent entry to the site.
    const timeout = window.setTimeout(() => { if (video && video.readyState < 2) finish(); }, 15000);
    return () => { window.removeEventListener('keydown', handleKey); window.clearTimeout(timeout); };
  }, [visible, finish]);

  if (!visible) return children;
  return <main className="opening-video" aria-label="赤页开篇视频">
    <video ref={videoRef} src="/assets/video/opening.mp4" poster="/assets/video/opening-poster.jpg"
      muted={muted} playsInline preload="auto" aria-label="赤页开篇短片"
      onEnded={finish} onError={finish} onPlay={() => setPaused(false)} onPause={() => setPaused(true)} />
    <div className="opening-video-top"><span>赤页 <small>RED LEAF</small></span>
      <button ref={skipRef} type="button" onClick={finish}>跳过开篇 ↗</button>
    </div>
    <div className="opening-video-bottom"><span>故事，从这里开始</span><div>
      <button type="button" onClick={() => {
        const video = videoRef.current;
        if (!video) return;
        if (video.paused) void video.play().catch(() => setPaused(true)); else video.pause();
      }}>{paused ? '播放' : '暂停'}</button>
      <button type="button" aria-pressed={!muted} onClick={() => setMuted(value => !value)}>{muted ? '开启声音' : '静音'}</button>
    </div></div>
  </main>;
}
