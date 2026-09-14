import { useEffect, useRef, useState } from 'react';
import { getLiukanAction, LIUKAN_ACTION_EVENT, liukanPoseTransform, parseLiukanActionCue, type LiukanActionId } from './liukan-actions';
import './LiuKanShanAvatar.css';

export interface LiuKanShanAvatarProps {
  action?: LiukanActionId;
  /** Only the mounted pet should subscribe to the shared pet target. */
  eventTarget?: string;
  size?: number;
  reducedMotion?: boolean;
  playKey?: string | number;
  onComplete?: (action: LiukanActionId) => void;
  className?: string;
  label?: string;
  showAccent?: boolean;
}

export function LiuKanShanAvatar({ action = 'listen', eventTarget, size = 100, reducedMotion = false, playKey, onComplete, className = '', label, showAccent = true }: LiuKanShanAvatarProps) {
  const [systemReducedMotion, setSystemReducedMotion] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [playback, setPlayback] = useState({ action, key: 0 });
  const [playing, setPlaying] = useState(false);
  const body = useRef<HTMLSpanElement>(null);
  const completedKey = useRef<number | null>(null);
  const complete = useRef(onComplete);
  complete.current = onComplete;
  const currentId = playback.action;
  const current = getLiukanAction(currentId);
  const staticMode = reducedMotion || systemReducedMotion;

  useEffect(() => {
    setPlayback(previous => ({ action, key: previous.key + 1 }));
  }, [action, playKey]);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setSystemReducedMotion(query.matches);
    change(); query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);

  useEffect(() => {
    if (!eventTarget) return;
    const listener = (event: Event) => {
      const request = parseLiukanActionCue((event as CustomEvent).detail);
      if (request?.target === eventTarget) setPlayback(previous => ({ action: request.action, key: previous.key + 1 }));
    };
    window.addEventListener(LIUKAN_ACTION_EVENT, listener);
    return () => window.removeEventListener(LIUKAN_ACTION_EVENT, listener);
  }, [eventTarget]);

  useEffect(() => {
    if (completedKey.current === playback.key) {
      setPlaying(false);
      return;
    }
    let disposed = false;
    let animation: Animation | undefined;
    const duration = staticMode ? 0 : current.duration;
    setPlaying(!staticMode);
    if (!staticMode && body.current?.animate) {
      animation = body.current.animate(current.frames.map(frame => ({ offset: frame.offset, transform: liukanPoseTransform(frame) })), { duration, easing: 'ease-in-out', fill: 'none' });
    }
    // A finite deadline also covers engines without the Web Animations API and reduced motion.
    const timer = window.setTimeout(() => {
      if (disposed) return;
      completedKey.current = playback.key;
      setPlaying(false);
      complete.current?.(currentId);
    }, duration);
    return () => { disposed = true; window.clearTimeout(timer); animation?.cancel(); };
  }, [currentId, playback.key, staticMode]);

  return <span className={`liukan-avatar ${playing ? 'is-playing' : ''} ${staticMode ? 'is-still' : ''} ${className}`} style={{ width: size, height: size }} role="img" aria-label={label ?? `刘看山：${current.label}`} data-liukan-action={currentId} data-liukan-motion={staticMode ? 'reduced' : 'full'}>
    <span className="liukan-avatar-shadow" aria-hidden="true" />
    <span ref={body} className="liukan-avatar-body" aria-hidden="true">
      <img key={`${current.asset}-${staticMode}-${playback.key}`} src={`/assets/liukan/${current.asset}.${staticMode ? 'png' : 'gif'}`} width="320" height="320" alt="" draggable={false} decoding="async" />
      {showAccent && <span className="liukan-avatar-accent">{current.accent}</span>}
    </span>
  </span>;
}
