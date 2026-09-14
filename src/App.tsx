import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  ArrowLeft, ArrowRight, Bookmark, BookOpen, Check, ChevronDown, ChevronRight, CircleHelp, Clock3,
  Compass, Download, FileText, Heart, History, Images, Library, LoaderCircle, Maximize2,
  RefreshCw, RotateCcw, Save, Search, Settings2, Shield, Sparkles, Trash2, Upload, X, LockKeyhole, Undo2,
} from 'lucide-react';
import type { GameWorld, SourcePassage, StoryDetail, StoryListResponse, StorySummary } from '../shared/types';
import { choiceBlockers } from '../shared/choice-rules';
import { isImportedId, worldEndpoint, type ImportedSource, type WorkshopProject } from '../shared/workshop';
import { withReviewedWorkshopCopy } from '../shared/workshop-copy';
import { LiuKanShanPet } from './LiuKanShanPet';
import { performLiukanAction } from './liukan-actions';
const LiukanCapabilities = lazy(() => import('./LiukanCapabilities').then(m => ({ default: m.LiukanCapabilities })));
const LiukanReadingDesk = lazy(() => import('./LiukanReadingDesk').then(m => ({ default: m.LiukanReadingDesk })));
const LiukanActivityDesk = lazy(() => import('./LiukanActivityDesk').then(m => ({ default: m.LiukanActivityDesk })));
import { LiukanTour } from './LiukanTour';
import { shouldShowLiukanTour, type LiukanTourView, type LiukanTourStep } from './liukan-tour';
const ZhihuWorkspace = lazy(() => import('./ZhihuWorkspace').then(m => ({ default: m.ZhihuWorkspace })));
import type { ZhihuCandidate } from '../shared/zhihu-discovery';
import type { LiukanProgressRequest } from '../shared/liukan';
const StoryWorkshop = lazy(() => import('./StoryWorkshop').then(m => ({ default: m.StoryWorkshop })));
const ImportedSourceReader = lazy(() => import('./StoryWorkshop').then(m => ({ default: m.ImportedSourceReader })));
import { mergeStoryLibrary, storyAdaptationStatus } from './story-library';
import { useZhihuProjects } from './use-zhihu-projects';
import { OperationJournal } from './OperationJournal';
import { operationJournalViews } from './operation-journal';
import { SourceReader } from './SourceReader';
import { SourceLinks } from './SourceLinks';
import { AuthorIdentity, EndingSourceBridge, ZhihuBadge } from './ZhihuSource';
import { isZhihuWorld, worldSourceLabel } from '../shared/zhihu-source';
import { visibleSourcePassages, type SourceSearchState } from './source-reader';
import { introMechanicsDescription } from './world-intro';
import { sceneCharacterPresentation } from './scene-character-art';
import { WorldArtOverview } from './WorldArtOverview';
import { BookJacket } from './BookJacket';
import { ThemeSwitch } from './ui-theme';
import { hasSceneArtHold } from './scene-art-holds';
import { withPublishedArt } from './published-art';
import { applySessionArt, ART_REFRESH_INTERVAL, checkArtRevisions, versionedArtUrl, type ArtRevisions } from './live-published-art';
import { clueLabel } from './clue-labels';
import { choiceCostLabels, choiceLockLabels } from './choice-presentation';
import { challengeInitials, CHALLENGE_REWINDS, type DifficultyMode } from './difficulty';
import {
  choose, defaultSettings, encodeSaveFile, fetchJson, MAX_SAVE_FILE_BYTES, parseSaveFile,
  prettyTime, readStorage, restoreSession, rewindSession, saveSession,
  startSession, storageKeys, writeStorage, type EndingRecord, type RuntimeChoice,
  type SavedGame, type Session, type Settings, type ChoiceOutcome,
} from './game';

const RedRainPlayer = lazy(() => import('./RedRainPlayer').then(m => ({ default: m.RedRainPlayer })));
const RedRainSaveTools = lazy(() => import('./RedRainPlayer').then(m => ({ default: m.RedRainSaveTools })));
import { REDRAIN_ID, redrainStory, readRedRainSave, summaryLabel } from './RedRainPlayer';
import type { RedRainSave } from '../shared/redrain-state.mjs';
import { endingRecords as redrainEndingRecords } from '../shared/redrain-state.mjs';

type LibraryView = 'library' | 'endings' | 'workshop';
type ModalName = 'settings' | 'saves' | 'guide' | 'journal' | 'background' | 'rewind' | 'imported-source' | null;
type JournalTab = 'progress' | 'clues' | 'notes' | 'history';
type StoryPanel = 'detail' | 'reader';
type ReaderReturn = { tab: JournalTab; scrollTop: number; passageId: string | null; passageIndex: number };
type SaveImportState =
  | { status: 'idle' }
  | { status: 'loading'; fileName: string }
  | { status: 'error'; message: string }
  | { status: 'preview'; fileName: string; saved: SavedGame; error?: string };
interface ArtworkState {
  requestedSource: string | null;
  source: string | null;
  status: 'loading' | 'ready' | 'unavailable';
  degraded: boolean;
  width?: number;
  height?: number;
}

const artworkLoads = new Map<string, Promise<{ width: number; height: number }>>();
const artworkPreloadQueue: string[] = [];
const artworkPreloadQueued = new Set<string>();
let artworkPreloadActive = 0;
const ARTWORK_PRELOAD_CONCURRENCY = 2;

function loadArtwork(source: string): Promise<{ width: number; height: number }> {
  const cached = artworkLoads.get(source);
  if (cached) return cached;
  const pending = new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => { artworkLoads.delete(source); reject(new Error('ART_LOAD_FAILED')); };
    image.src = source;
  });
  artworkLoads.set(source, pending);
  return pending;
}

function drainArtworkPreloadQueue() {
  while (artworkPreloadActive < ARTWORK_PRELOAD_CONCURRENCY && artworkPreloadQueue.length) {
    const source = artworkPreloadQueue.shift()!;
    artworkPreloadQueued.delete(source);
    artworkPreloadActive += 1;
    void loadArtwork(source).catch(() => undefined).finally(() => {
      artworkPreloadActive -= 1;
      drainArtworkPreloadQueue();
    });
  }
}

function scheduleArtworkPreload(sources: string[]) {
  const uniqueSources = [...new Set(sources.filter(Boolean))];
  uniqueSources.forEach(source => {
    if (artworkLoads.has(source) || artworkPreloadQueued.has(source)) return;
    artworkPreloadQueued.add(source);
    artworkPreloadQueue.push(source);
  });
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(drainArtworkPreloadQueue, { timeout: 1200 });
  } else {
    setTimeout(drainArtworkPreloadQueue, 180);
  }
}

function errorMessage(error: unknown) { return error instanceof Error ? error.message : '发生了意外错误，请重试。'; }
function pad(value: number) { return String(value).padStart(2, '0'); }

function outcomeChanges(outcome: ChoiceOutcome): string[] {
  return [
    ...outcome.resources.map(resource => `${resource.label} ${resource.delta > 0 ? '+' : ''}${resource.delta}`),
    ...(outcome.resolve ? [`决心 ${outcome.resolve > 0 ? '+' : ''}${outcome.resolve}`] : []),
    ...(outcome.trust ? [`信任 ${outcome.trust > 0 ? '+' : ''}${outcome.trust}`] : []),
    ...(outcome.clues.length ? [`线索 +${outcome.clues.length}`] : []),
  ];
}

function Outcome({ outcome, worldId }: { outcome: ChoiceOutcome | null; worldId: string }) {
  if (!outcome) return null;
  const changes = outcomeChanges(outcome);
  const tone = outcome.feedback?.tone ?? 'neutral';
  const label = outcome.feedback ? { success: '已确认', setback: '判断未成立', neutral: '行动反馈' }[tone] : '行动结果';
  return <details className="action-outcome" data-tone={tone} open={Boolean(outcome.feedback)} aria-label="上次行动结果">
    <summary>{tone === 'setback' ? <X size={14} /> : <Check size={14} />}<span><b>{label}</b><small>{changes.join(' · ') || '资源与线索未变'}</small></span><ChevronDown size={14} /></summary>
    <div className="outcome-details"><p className="outcome-choice">你选择了：{outcome.choiceText}</p>{outcome.feedback && <p>{outcome.feedback.text}</p>}{outcome.clues.length > 0 && <p>新线索：{outcome.clues.map(clue => clueLabel(worldId, clue)).join('、')}</p>}</div>
  </details>;
}

function PracticeGuide() {
  const [step, setStep] = useState(0);
  return <section className="practice-guide" aria-label="新手练习"><h3>练习 · 锁住的档案室</h3><p>行动点 {step ? 1 : 2} / 2 · 线索：门牌{step > 0 ? '、值班记录' : ''}</p>
    {step === 0 ? <><p>门牌上的日期需要另一份记录核对。先留出行动点，再调查。</p><button className="secondary-button" onClick={() => setStep(1)}><Search />调查值班记录 · 消耗 1 点</button></>
      : step === 1 ? <><p>两份记录指向同一天，推理已解锁。还剩 1 点，可留给接下来的行动。</p><button className="primary-button" onClick={() => setStep(2)}><Check />用两条线索核对日期</button></>
      : <><p role="status">练习完成。调查、资源与推理会在正式故事中共同影响路线；这次练习不消耗正式资源。</p><button className="text-button" onClick={() => setStep(0)}><RotateCcw />再试一次</button></>}
  </section>;
}

function Brand({ onClick }: { onClick: () => void }) {
  return <button className="brand" onClick={onClick} aria-label="赤页，返回书库">
    <span className="brand-mark" aria-hidden="true" />
    <span className="brand-text"><span className="brand-cn">赤页</span><span className="brand-en">RED LEAF ARCHIVE</span></span>
  </button>;
}

function IconButton({ label, children, className = '', onClick, disabled = false }: {
  label: string; children: ReactNode; className?: string; onClick: () => void; disabled?: boolean;
}) {
  return <button type="button" className={`icon-button ${className}`} title={label} aria-label={label} onClick={onClick} disabled={disabled}>{children}</button>;
}

function Artwork({ src, fallback, fallbacks = [], versions = {}, className, alt, onStateChange, placeholder }: {
  src?: string; fallback?: string; fallbacks?: string[]; className?: string; alt: string;
  versions?: Record<string, string>;
  placeholder?: ReactNode;
  onStateChange?: (state: ArtworkState) => void;
}) {
  const [failed, setFailed] = useState<string[]>([]);
  const [loaded, setLoaded] = useState<{ source: string; width: number; height: number } | null>(null);
  const current = [src, fallback, ...fallbacks].find((candidate) => candidate && !failed.includes(versionedArtUrl(candidate, versions[candidate])));
  const requestSource = current ? versionedArtUrl(current, versions[current]) : undefined;
  const status = !current ? 'unavailable' : loaded?.source === requestSource ? 'ready' : 'loading';
  useEffect(() => {
    if (!requestSource) return;
    let active = true;
    void loadArtwork(requestSource).then(({ width, height }) => {
      if (active) setLoaded({ source: requestSource, width, height });
    }).catch(() => {
      if (active) setFailed((previous) => previous.includes(requestSource) ? previous : [...previous, requestSource]);
    });
    return () => { active = false; };
  }, [requestSource]);
  useEffect(() => {
    onStateChange?.({
      requestedSource: src ?? null,
      source: current ?? null,
      status,
      degraded: Boolean(src && current !== src),
      ...(loaded && loaded.source === requestSource ? { width: loaded.width, height: loaded.height } : {}),
    });
  }, [src, current, requestSource, status, loaded, onStateChange]);
  return <>{status !== 'ready' && placeholder}{current && status === 'ready' ? <img key={requestSource} className={className} src={requestSource} alt={alt} referrerPolicy="no-referrer" data-art-state={status}
    style={{ visibility: 'visible' }}
    onLoad={(event) => setLoaded({ source: requestSource!, width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
    onError={() => setFailed((previous) => [...previous, requestSource!])} /> : null}</>;
}

function Modal({ title, children, footer, onClose, large = false, className = '', focusKey }: {
  title: string; children: ReactNode; footer?: ReactNode; onClose: () => void; large?: boolean;
  className?: string; focusKey?: string;
}) {
  const modalRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const elements = modalRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not([hidden]):not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]');
      if (!elements?.length) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKey);
      previousFocus?.focus();
    };
  }, []);
  useEffect(() => {
    const dialog = modalRef.current;
    (dialog?.querySelector<HTMLElement>('[data-modal-autofocus]') ?? dialog?.querySelector<HTMLButtonElement>('button'))?.focus();
    dialog?.querySelector('.modal-body')?.scrollTo(0, 0);
  }, [focusKey]);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className={`modal ${large ? 'large' : ''} ${className}`} role="dialog" aria-modal="true" aria-label={title} ref={modalRef}>
      <div className="modal-header"><h2>{title}</h2><IconButton label="关闭" onClick={onClose}><X /></IconButton></div>
      <div className="modal-body">{children}</div>
      {footer && <div className="modal-footer">{footer}</div>}
    </div>
  </div>;
}

function App() {
  const [account, setAccount] = useState<{ id: string; email: string; name: string } | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authName, setAuthName] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  useEffect(() => { void fetch('/api/auth/me').then(response => response.json()).then(data => setAccount(data.user)).catch(() => undefined).finally(() => setAuthReady(true)); }, []);
  const submitAuth = async (event: import('react').FormEvent) => {
    event.preventDefault(); setAuthBusy(true); setAuthError('');
    try { const response = await fetch(`/api/auth/${authMode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: authEmail, name: authName, password: authPassword }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error?.message ?? '账号操作失败。'); setAccount(data.user); setAuthPassword(''); }
    catch (error) { setAuthError(error instanceof Error ? error.message : '账号操作失败。'); } finally { setAuthBusy(false); }
  };
  if (!authReady) return <div className="fetch-status"><h2>正在检查账号状态</h2></div>;
  if (!account && process.env.NODE_ENV === 'production') return <div className="auth-gate"><form className="auth-panel" onSubmit={submitAuth}><p className="eyebrow">RED LEAF ACCOUNT</p><h1>{authMode === 'login' ? '登录赤页' : '创建赤页账号'}</h1><p>账号用于隔离你的故事工作台和进度。</p>{authMode === 'register' && <input value={authName} onChange={event => setAuthName(event.target.value)} placeholder="昵称" autoComplete="name" required /> }<input value={authEmail} onChange={event => setAuthEmail(event.target.value)} placeholder="邮箱" type="email" autoComplete="email" required /><input value={authPassword} onChange={event => setAuthPassword(event.target.value)} placeholder="密码（至少 8 位）" type="password" autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} required minLength={8} />{authError && <p role="alert" className="auth-error">{authError}</p>}<button className="primary-button" disabled={authBusy}>{authBusy ? '处理中…' : authMode === 'login' ? '登录' : '注册'}</button><button type="button" className="text-button" onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setAuthError(''); }}>{authMode === 'login' ? '创建新账号' : '已有账号，去登录'}</button></form></div>;
  return <AppWorkspace />;
}

function AppWorkspace() {
  const [capabilitiesOpen, setCapabilitiesOpen] = useState(false);
  const [readingDesk, setReadingDesk] = useState<{ postId?: string } | null>(null);
  const [activityDeskOpen, setActivityDeskOpen] = useState(false);
  const [zhihuWorkspaceUrl, setZhihuWorkspaceUrl] = useState<string | undefined>();
  const [tourOpen, setTourOpen] = useState(() => shouldShowLiukanTour());
  const [tourStep, setTourStep] = useState<LiukanTourStep | null>(null);
  const tourNavigation = useRef(0);
  const tourReturn = useRef<null | (() => void)>(null);
  const [library, setLibrary] = useState<StoryListResponse | null>(null);
  const [libraryError, setLibraryError] = useState('');
  const [fetching, setFetching] = useState(true);
  const [view, setView] = useState<LibraryView>(() => location.hash.startsWith('#zhihu-page=') ? 'workshop' : 'library');
  useEffect(() => {
    const onPageSelection = () => { if (location.hash.startsWith('#zhihu-page=')) setView('workshop'); };
    window.addEventListener('hashchange', onPageSelection);
    return () => window.removeEventListener('hashchange', onPageSelection);
  }, []);
  const [zhihuWorkspaceOpen, setZhihuWorkspaceOpen] = useState(false);
  const [zhihuReadingPost, setZhihuReadingPost] = useState<ZhihuCandidate | null>(null);
  const [workshopProjectId, setWorkshopProjectId] = useState<string | null>(null);
  const [importedSource, setImportedSource] = useState<ImportedSource | null>(null);
  const [importedSourceError, setImportedSourceError] = useState('');
  const [importedSourceId, setImportedSourceId] = useState('');
  const [workshopSource, setWorkshopSource] = useState<{ story: StorySummary; sequence: number } | null>(null);
  const importedReaderRequest = useRef(0);
  const [category, setCategory] = useState('全部故事');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('recommended');
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [selectedStory, setSelectedStory] = useState<StorySummary | null>(null);
  const [storyPanel, setStoryPanel] = useState<StoryPanel>('detail');
  const [sourceTarget, setSourceTarget] = useState<SourcePassage | null>(null);
  const [sourceSearch, setSourceSearch] = useState<SourceSearchState>({ query: '', count: 0, activeIndex: -1, anchorStatus: null });
  const [readerReturn, setReaderReturn] = useState<ReaderReturn | null>(null);
  const journalRestoreRef = useRef<ReaderReturn | null>(null);
  const [detail, setDetail] = useState<StoryDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [preparing, setPreparing] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const { projects: zhihuProjects, error: projectsError, refresh: refreshProjects } = useZhihuProjects(view === 'library' && !session);
  const stories = useMemo(() => mergeStoryLibrary([redrainStory, ...(library?.stories ?? [])], zhihuProjects), [library, zhihuProjects]);
  useEffect(() => {
    if (view !== 'library' || session) return;
    // Warm only the first visible covers during idle time; the queue keeps image
    // decoding off the critical render path and caps concurrent work.
    scheduleArtworkPreload(stories.slice(0, 10).flatMap(story => [story.cover, story.sourceCover].filter((source): source is string => Boolean(source))));
  }, [stories, view, session]);
  const selectedLibraryStory = selectedStory ? stories.find(story => story.id === selectedStory.id) ?? selectedStory : null;
  const [pendingWorld, setPendingWorld] = useState<GameWorld | null>(null);
  const [pendingDifficulty, setPendingDifficulty] = useState<DifficultyMode>('challenge');
  const [modal, setModal] = useState<ModalName>(null);
  const [journalTab, setJournalTab] = useState<JournalTab>('clues');
  const [rewindTarget, setRewindTarget] = useState<{ index: number; session: Session } | null>(null);
  const [settings, setSettings] = useState<Settings>(() => ({ ...defaultSettings, ...readStorage<Partial<Settings>>(storageKeys.settings, {}) }));
  const [favorites, setFavorites] = useState<string[]>(() => readStorage(storageKeys.favorites, []));
  const [manualSaves, setManualSaves] = useState<(SavedGame | null)[]>(() => readStorage(storageKeys.saves, [null, null, null]));
  const [autoSave, setAutoSave] = useState<SavedGame | null>(() => readStorage(storageKeys.auto, null));
  const [redrainActive, setRedrainActive] = useState(false);
  const [redrainDetail, setRedrainDetail] = useState(false);
  const [redrainSave, setRedrainSave] = useState<RedRainSave | null>(() => readRedRainSave());
  const openRedRain = () => { sessionRef.current = null; setSession(null); setModal(null); setSelectedStory(null); setRedrainDetail(false); setRedrainActive(true); };
  const [endings, setEndings] = useState<EndingRecord[]>(() => readStorage(storageKeys.endings, []));
  const [notes, setNotes] = useState<Record<string, string>>(() => readStorage(storageKeys.notes, {}));
  const [skipGuide, setSkipGuide] = useState(true);
  const [toast, setToast] = useState('');
  const [visibleCharacters, setVisibleCharacters] = useState(0);
  const [gameError, setGameError] = useState('');
  const [loadingSave, setLoadingSave] = useState(false);
  const [saveImport, setSaveImport] = useState<SaveImportState>({ status: 'idle' });
  const [importTarget, setImportTarget] = useState<number | null>(null);
  const [portraitState, setPortraitState] = useState<ArtworkState>({ requestedSource: null, source: null, status: 'unavailable', degraded: false });
  const [backgroundState, setBackgroundState] = useState<ArtworkState>({ requestedSource: null, source: null, status: 'unavailable', degraded: false });
  const [sceneArtSelection, setSceneArtSelection] = useState<Record<string, string>>({});
  const [artAttempt, setArtAttempt] = useState(0);
  const audioRef = useRef<AudioContext | null>(null);
  const detailRequest = useRef(0);
  const importRequest = useRef(0);
  const importInput = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const sessionRef = useRef(session);
  const liukanSceneRef = useRef<{ worldId: string; nodeId: string; clues: number } | null>(null);
  const artOnlySessionRef = useRef<Session | null>(null);
  const choiceRegionRef = useRef<HTMLDivElement>(null);
  const gameShellRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef(modal);
  const tourOpenRef = useRef(tourOpen); tourOpenRef.current = tourOpen;
  const selectedStoryRef = useRef(selectedStory);
  const visibleRef = useRef(visibleCharacters);
  const settingsRef = useRef(settings);
  sessionRef.current = session;
  modalRef.current = modal;
  selectedStoryRef.current = selectedStory;
  visibleRef.current = visibleCharacters;
  settingsRef.current = settings;

  useEffect(() => {
    if (!session?.engine) return;
    let stopped = false, checking = false, revisions: ArtRevisions = {};
    const engine = session.engine;
    const check = async () => {
      const active = sessionRef.current;
      if (stopped || checking || document.visibilityState !== 'visible' || modalRef.current || selectedStoryRef.current
        || !active || active.engine !== engine) return;
      checking = true;
      try {
        const imported = isImportedId(active.world.storyId);
        const next = imported ? { changed: true, revisions } : await checkArtRevisions(revisions);
        if (stopped || !next.changed) return;
        const world = imported
          ? await fetchJson<GameWorld>(worldEndpoint(active.world.storyId, active.world.version))
          : await withPublishedArt(active.world);
        if (stopped || document.visibilityState !== 'visible' || modalRef.current || selectedStoryRef.current) return;
        const updated = applySessionArt(sessionRef.current, active, world);
        if (updated && updated !== sessionRef.current) {
          // Artwork publication must not create an autosave or reset an Ink timeline.
          artOnlySessionRef.current = updated;
          sessionRef.current = updated;
          setSession(updated);
          revisions = next.revisions;
        }
      } catch { /* A later visible interval retries unavailable publication metadata. */ }
      finally { checking = false; }
    };
    const timer = window.setInterval(() => { void check(); }, ART_REFRESH_INTERVAL);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [session?.engine]);

  useEffect(() => { choiceRegionRef.current?.scrollTo(0, 0); }, [session?.world.id, session?.choiceCount]);
  useEffect(() => {
    gameShellRef.current?.querySelector('.text-reading .game-stage')?.scrollTo(0, 0);
  }, [session?.world.id, session?.choiceCount, session?.paragraphIndex]);
  useEffect(() => {
    if (modal !== 'journal' || selectedStory || !journalRestoreRef.current) return;
    const handle = requestAnimationFrame(() => {
      const restore = journalRestoreRef.current;
      const body = document.querySelector('.journal-modal .modal-body');
      if (!restore || !body) return;
      body.scrollTop = restore.scrollTop;
      if (restore.passageId) body.querySelectorAll<HTMLElement>(`[data-source-passage="${CSS.escape(restore.passageId)}"]`)[restore.passageIndex]?.focus({ preventScroll: true });
      journalRestoreRef.current = null;
    });
    return () => cancelAnimationFrame(handle);
  }, [modal, selectedStory, journalTab]);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 3200);
  }, []);

  const playSound = useCallback((kind: 'page' | 'choice') => {
    if (!settingsRef.current.sound) return;
    try {
      const context = audioRef.current ?? new AudioContext();
      audioRef.current = context;
      void context.resume();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(kind === 'choice' ? 440 : 650, context.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(kind === 'choice' ? 220 : 300, context.currentTime + .08);
      gain.gain.setValueAtTime(.025, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .09);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + .1);
    } catch { /* Sound is optional when browser audio is unavailable. */ }
  }, []);

  const loadLibrary = useCallback(async () => {
    setFetching(true);
    setLibraryError('');
    try { setLibrary(await fetchJson<StoryListResponse>('/api/stories')); }
    catch (error) { setLibraryError(errorMessage(error)); }
    finally { setFetching(false); }
  }, []);

  useEffect(() => { void loadLibrary(); }, [loadLibrary]);
  useEffect(() => { writeStorage(storageKeys.settings, settings); }, [settings]);
  useEffect(() => { writeStorage(storageKeys.favorites, favorites); }, [favorites]);
  useEffect(() => { writeStorage(storageKeys.notes, notes); }, [notes]);
  useEffect(() => {
    if (modal !== 'saves') {
      setSaveImport({ status: 'idle' });
      setImportTarget(null);
    }
    return () => { ++importRequest.current; };
  }, [modal]);
  useEffect(() => {
    if (!session) return;
    if (artOnlySessionRef.current === session) return;
    const saved = saveSession(session);
    setAutoSave(saved);
    if (!writeStorage(storageKeys.auto, saved)) notify('浏览器存储空间不足，自动存档未写入。');
    if (session.node.ending) {
      setEndings((previous) => {
        if (previous.some((ending) => ending.worldId === session.world.id && ending.nodeId === session.node.id)) return previous;
        const updated = [...previous, {
          storyId: session.world.storyId, worldId: session.world.id, worldTitle: session.world.title,
          nodeId: session.node.id, title: session.node.ending!.title, cover: session.world.cover, unlockedAt: Date.now(),
        }];
        writeStorage(storageKeys.endings, updated);
        return updated;
      });
    }
  }, [session, notify]);

  const currentText = session?.node.ending ? session.paragraphs.join('\n\n') : session?.paragraphs[session.paragraphIndex] ?? '';
  const textComplete = visibleCharacters >= currentText.length;
  const lastParagraph = session ? session.paragraphIndex === session.paragraphs.length - 1 : false;
  const publishedBackgroundSource = session?.node.background || session?.world.background;
  const sceneArtKey = session ? `${session.world.id}:${session.node.id}` : '';
  const sceneArtSources = session ? [...new Set([publishedBackgroundSource, ...(session.node.artSceneVariants ?? []).map(variant => variant.url)]
    .filter((source): source is string => Boolean(source && !hasSceneArtHold(session.world.id, session.node.id, source))))] : [];
  const selectedSceneArt = sceneArtSelection[sceneArtKey];
  const selectedBackgroundSource = selectedSceneArt && sceneArtSources.includes(selectedSceneArt) ? selectedSceneArt : publishedBackgroundSource;
  const backgroundHeld = Boolean(session && hasSceneArtHold(session.world.id, session.node.id, selectedBackgroundSource));
  const backgroundSource = backgroundHeld ? undefined : selectedBackgroundSource;
  const selectedArtKind = session?.node.artSceneVariants?.find(variant => variant.url === backgroundSource)?.kind ?? session?.node.backgroundArtKind;
  const displayNode = session ? { ...session.node, background: backgroundSource ?? '', backgroundArtKind: selectedArtKind } : undefined;
  const sceneDisplay = session && displayNode && !backgroundHeld ? sceneCharacterPresentation(session.world, displayNode, currentText) : null;
  const canSwitchSceneArt = sceneArtSources.length > 1;
  const cycleSceneArt = () => {
    if (!session || !sceneArtSources.length) return;
    const active = sceneArtSources.indexOf(backgroundSource ?? '');
    setSceneArtSelection(previous => ({ ...previous, [sceneArtKey]: sceneArtSources[(active + 1) % sceneArtSources.length] }));
  };
  const sceneCharacter = sceneDisplay?.character;
  const characterExpression = sceneDisplay?.expression ?? 'main';
  const characterPosition = sceneDisplay?.position ?? 'center';
  const portraitSources = sceneDisplay?.sources ?? [];
  const portraitVersions = Object.fromEntries(Object.values(sceneCharacter?.stagePortraits ?? {}).map(portrait => [portrait.url, portrait.sha256]));
  const portraitRevision = portraitSources.map(url => portraitVersions[url] ?? '').join(':');
  const hasCharacterLayer = Boolean(sceneCharacter && portraitSources.length && !session?.node.ending);
  const currentPortraitState = portraitState.requestedSource !== (portraitSources[0] ?? null)
    ? { requestedSource: portraitSources[0] ?? null, source: portraitSources[0] ?? null, status: 'loading' as const, degraded: false } : portraitState;
  const currentBackgroundState = backgroundState.requestedSource !== (backgroundSource ?? null)
    ? { requestedSource: backgroundSource ?? null, source: backgroundSource ?? null, status: 'loading' as const, degraded: false } : backgroundState;
  const canRetryArt = Boolean(backgroundSource && (currentBackgroundState.degraded || currentBackgroundState.status === 'unavailable'))
    || (hasCharacterLayer && (currentPortraitState.degraded || currentPortraitState.status === 'unavailable'));

  useEffect(() => {
    setVisibleCharacters(settings.reducedMotion || settings.textSpeed >= 100 ? currentText.length : 0);
  }, [session?.node.id, session?.paragraphIndex, currentText, settings.reducedMotion, settings.textSpeed]);

  useEffect(() => {
    if (!session || tourOpen) return;
    const previous = liukanSceneRef.current;
    const current = { worldId: session.world.id, nodeId: session.node.id, clues: session.clues.length };
    liukanSceneRef.current = current;
    if (!previous || previous.worldId !== current.worldId) performLiukanAction('set-off');
    else if (previous.nodeId !== current.nodeId) performLiukanAction(session.node.ending ? 'success' : 'choose');
    else if (current.clues > previous.clues) performLiukanAction('found-clue');
  }, [session?.world.id, session?.node.id, session?.clues.length, session?.node.ending, tourOpen]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [session?.world.id, session?.node.id]);

  useEffect(() => {
    if (!session || modal || selectedStory || textComplete || settings.reducedMotion) return;
    const timer = window.setInterval(() => setVisibleCharacters((value) => Math.min(currentText.length, value + 1)), Math.max(8, 75 - settings.textSpeed * .65));
    return () => window.clearInterval(timer);
  }, [session, modal, selectedStory, textComplete, currentText, settings]);

  const nextParagraph = useCallback(() => {
    const active = sessionRef.current;
    if (!active || modalRef.current || selectedStoryRef.current || active.node.ending) return;
    const text = active.paragraphs[active.paragraphIndex] ?? '';
    if (visibleRef.current < text.length) { setVisibleCharacters(text.length); return; }
    if (active.paragraphIndex < active.paragraphs.length - 1) {
      playSound('page');
      const next = { ...active, paragraphIndex: active.paragraphIndex + 1 };
      sessionRef.current = next;
      setSession(next);
    }
  }, [playSound]);

  const makeChoice = useCallback((choice: RuntimeChoice) => {
    const active = sessionRef.current;
    if (!active || modalRef.current || selectedStoryRef.current) return;
    try {
      const next = choose(active, choice);
      sessionRef.current = next;
      setSession(next);
      setToast('');
      playSound('choice');
      performLiukanAction('cheer');
    } catch (error) { setGameError(errorMessage(error)); }
  }, [playSound]);

  const requestRewind = (index: number) => {
    const active = sessionRef.current;
    if (!active || index < 0 || index >= active.history.length - 1) return;
    if (active.difficulty === 'challenge' && active.rewindsRemaining === 0) { notify('本局的回溯次数已用完。'); return; }
    setRewindTarget({ index, session: active });
    setModal('rewind');
  };

  const confirmRewind = () => {
    if (!rewindTarget) return;
    try {
      if (sessionRef.current !== rewindTarget.session) throw new Error('当前进度已经改变，请重新选择回溯位置。');
      const next = rewindSession(rewindTarget.session, rewindTarget.index);
      sessionRef.current = next;
      setSession(next);
      setRewindTarget(null);
      setModal(null);
      setToast('');
      playSound('page');
    } catch (error) { setGameError(errorMessage(error)); }
  };

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => notify('无法退出全屏。'));
    else void document.documentElement.requestFullscreen().catch(() => notify('当前浏览器不支持全屏。'));
  }, [notify]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (tourOpenRef.current || (event.target as HTMLElement).closest('.liukan-pet, .zhihu-workspace, .liukan-capabilities-overlay, .lrd-overlay, [data-liukan-activity]') || (event.target as HTMLElement).matches('input, textarea, select')) return;
      if (event.key.toLowerCase() === 'f' && !modalRef.current && !selectedStoryRef.current) { event.preventDefault(); toggleFullscreen(); }
      if (!sessionRef.current || modalRef.current || selectedStoryRef.current) return;
      if ((event.key === ' ' || event.key === 'Enter') && !(event.target as HTMLElement).closest('button, a')) { event.preventDefault(); nextParagraph(); }
      if (event.key === 'Escape') setModal('settings');
      if (['1', '2', '3', '4'].includes(event.key)) {
        const active = sessionRef.current;
        if (active.paragraphIndex !== active.paragraphs.length - 1 || visibleRef.current < (active.paragraphs[active.paragraphIndex] ?? '').length) return;
        const selected = active.choices[Number(event.key) - 1];
        if (selected) makeChoice(selected);
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [makeChoice, nextParagraph, toggleFullscreen]);

  useEffect(() => {
    if (redrainActive) return;
    window.render_game_to_text = () => JSON.stringify(modal === 'imported-source' ? { mode: 'imported-source-reader', source: importedSource, error: importedSourceError, gamePaused: Boolean(session) } : selectedStory && storyPanel === 'reader' ? {
      mode: 'source-reader', storyId: selectedStory.id, title: selectedStory.title,
      author: detail?.author ?? selectedStory.author ?? null, contentScope: 'api-excerpt',
      loading: detailLoading, error: detailError, text: detail?.content ?? '',
      sourceUrl: selectedStory.sourceUrl, playable: selectedStory.playable,
      returnTo: readerReturn ? 'journal' : 'story-detail', gamePaused: Boolean(session),
      search: sourceSearch, target: sourceTarget ? { id: sourceTarget.id, label: sourceTarget.label, note: sourceTarget.note } : null,
    } : session ? {
      mode: session.node.ending ? 'ending' : 'playing', modal, world: session.world.title,
      worldId: session.world.id, nodeId: session.node.id, chapter: session.node.chapter,
      location: session.node.location, speaker: session.node.speaker ?? '旁白',
      time: session.timeLabel,
      paragraph: session.node.ending ? 1 : session.paragraphIndex + 1, paragraphCount: session.node.ending ? 1 : session.paragraphs.length,
      text: currentText, textComplete, choices: lastParagraph && textComplete ? session.choices.map((choice, index) => ({ key: index + 1, id: choice.id, text: choice.text, cost: choiceCostLabels(choice, session.world.resources ?? []) })) : [],
      difficulty: session.difficulty, rewindsRemaining: session.difficulty === 'challenge' ? session.rewindsRemaining : null,
      resolve: session.resolve, trust: session.trust, clues: session.clues, resources: session.resources,
      lastOutcome: session.lastOutcome, history: session.history.map(entry => ({ nodeId: entry.nodeId, choiceId: entry.choiceId, choice: entry.choice })),
      outcomes: modal === 'journal' ? session.outcomes : undefined,
      operationJournals: modal === 'journal' && journalTab === 'progress' ? operationJournalViews(session) : undefined,
      sourcePassages: modal === 'journal' ? visibleSourcePassages(session).map(passage => ({ id: passage.id, label: passage.label })) : undefined,
      journalTab: modal === 'journal' ? journalTab : undefined,
      challenge: session.node.challenge ? { kind: session.node.challenge.kind, prompt: session.node.challenge.prompt, ...(session.difficulty === 'classic' ? { hint: session.node.challenge.hint } : {}) } : null,
      lockedChoices: session.node.choices.filter(choice => choiceBlockers(choice, session, session.world.resources).length).map(choice => ({ id: choice.id, reasons: choiceLockLabels(choice, session, session.world.resources ?? [], session.difficulty === 'challenge', clue => clueLabel(session.world.id, clue)) })),
      choiceCount: session.choiceCount, ending: session.node.ending ?? null,
      visuals: {
        background: backgroundSource,
        backgroundVariants: session.node.artSceneVariants?.map(variant => ({ url: variant.url, kind: variant.kind })) ?? [],
        backgroundState: currentBackgroundState,
        backgroundHold: backgroundHeld ? { source: publishedBackgroundSource, reason: 'pending-scene-review' } : null,
        backgroundFallback: null,
        authoredCharacter: session.node.character ?? null,
        character: hasCharacterLayer ? {
          id: sceneCharacter!.id, name: sceneCharacter!.name, expression: characterExpression,
          position: characterPosition, ...currentPortraitState,
          resolvedExpression: currentPortraitState.source === sceneCharacter!.stagePortraits?.[characterExpression]?.url ? characterExpression
            : currentPortraitState.source === sceneCharacter!.stagePortraits?.main?.url ? 'main'
            : currentPortraitState.source === sceneCharacter!.stagePortraits?.reaction?.url ? 'reaction'
            : currentPortraitState.source === sceneCharacter!.portraits?.[characterExpression] ? characterExpression
            : currentPortraitState.source === sceneCharacter!.portraits?.main ? 'main'
            : currentPortraitState.source === sceneCharacter!.portrait ? 'legacy' : null,
        } : null,
      },
      source: session.world.source, coordinateSystem: 'DOM layout, top-left origin; no spatial game controls',
    } : {
      mode: 'library', view, modal, loading: fetching, error: libraryError || detailError,
      category, search, selectedStory: selectedStory?.id ?? null,
      stories: stories.map((story) => ({ id: story.id, title: story.title, playable: story.playable, author: story.author })) ?? [],
      source: library?.source, savedGame: autoSave?.title ?? null,
      coordinateSystem: 'DOM layout, top-left origin; select a story to enter',
    });
    window.advanceTime = (ms: number) => {
      const text = sessionRef.current?.paragraphs[sessionRef.current.paragraphIndex] ?? '';
      setVisibleCharacters((previous) => Math.min(text.length, previous + Math.ceil(ms / Math.max(8, 75 - settingsRef.current.textSpeed * .65))));
    };
    return () => { delete window.render_game_to_text; delete window.advanceTime; };
  }, [redrainActive, session, modal, journalTab, currentText, textComplete, lastParagraph, view, fetching, libraryError, detailError, detailLoading, detail, category, search, selectedStory, storyPanel, library, autoSave, portraitState, backgroundState, sceneArtSelection, readerReturn, sourceSearch, sourceTarget, importedSource, importedSourceError]);

  const readImportedSource = async (id: string) => {
    const request = ++importedReaderRequest.current;
    setImportedSourceId(id);
    setImportedSource(null); setImportedSourceError(''); setModal('imported-source');
    try { const source = await fetchJson<ImportedSource>(`/api/workshop/projects/${id}/source`); if (request === importedReaderRequest.current) setImportedSource(source); }
    catch (error) { if (request === importedReaderRequest.current) setImportedSourceError(errorMessage(error)); }
  };

  const loadStoryDetail = async (story: StorySummary, refresh = false) => {
    const request = ++detailRequest.current;
    setDetail(null);
    setDetailError('');
    setDetailLoading(true);
    try {
      const result = await fetchJson<StoryDetail>(`/api/stories/${encodeURIComponent(story.id)}${refresh ? '?refresh=1' : ''}`);
      if (request === detailRequest.current) {
        setDetail(result);
        setLibrary(previous => previous ? { ...previous, stories: previous.stories.map(item => item.id === result.id ? { ...item, author: result.author, authorAvatar: result.authorAvatar } : item) } : previous);
      }
    } catch (error) { if (request === detailRequest.current) setDetailError(errorMessage(error)); }
    finally { if (request === detailRequest.current) setDetailLoading(false); }
  };

  const openStory = async (story: StorySummary, panel: StoryPanel = 'detail', target: SourcePassage | null = null) => {
    if (story.id === REDRAIN_ID) { setRedrainDetail(true); return; }
    if (isImportedId(story.id)) { await readImportedSource(story.id); return; }
    setSourceTarget(target);
    setSourceSearch({ query: target?.quote ?? '', count: 0, activeIndex: -1, anchorStatus: null });
    setSelectedStory(story);
    setStoryPanel(panel);
    await loadStoryDetail(story);
  };

  const openSourceAt = (passage: SourcePassage | null) => {
    if (!session) return;
    if (isImportedId(session.world.storyId)) { void readImportedSource(session.world.storyId); return; }
    if (modal === 'journal') {
      const body = document.querySelector('.journal-modal .modal-body');
      const links = passage ? Array.from(body?.querySelectorAll(`[data-source-passage="${CSS.escape(passage.id)}"]`) ?? []) : [];
      setReaderReturn({ tab: journalTab, scrollTop: body?.scrollTop ?? 0, passageId: passage?.id ?? null, passageIndex: Math.max(0, links.indexOf(document.activeElement!)) });
      setModal(null);
    } else setReaderReturn(null);
    const story = library?.stories.find((entry) => entry.id === session.world.storyId) ?? {
      id: session.world.storyId, title: session.world.source.title, author: session.world.source.author,
      sourceUrl: session.world.source.url, cover: session.world.cover,
      description: '', labels: [], playable: true,
    };
    void openStory(story, 'reader', passage);
  };
  const openSessionSource = () => openSourceAt(session?.world.sourcePassages?.find(passage => passage.nodeIds.includes(session.node.id)) ?? null);

  const closeStory = () => {
    if (preparing) return;
    ++detailRequest.current;
    setSelectedStory(null);
    setStoryPanel('detail');
    setDetail(null);
    setDetailError('');
    setSourceTarget(null);
    if (readerReturn) {
      journalRestoreRef.current = readerReturn;
      setJournalTab(readerReturn.tab);
      setModal('journal');
      setReaderReturn(null);
    }
  };

  const adaptStory = (story: StorySummary) => {
    const current = stories.find(entry => entry.id === story.id);
    if (story.playable || current?.playable) return;
    const project = current?.project;
    ++detailRequest.current;
    setSelectedStory(null); setDetail(null); setModal(null);
    setWorkshopProjectId(project?.id ?? null);
    setWorkshopSource(previous => project ? null : ({ story, sequence: (previous?.sequence ?? 0) + 1 }));
    setView('workshop');
    window.scrollTo(0, 0);
  };

  const prepareWorld = async (storyId: string) => {
    if (storyId === REDRAIN_ID) { openRedRain(); return; }
    setPreparing(true);
    setDetailError('');
    try {
      const world = await fetchJson<GameWorld>(worldEndpoint(stories.find(story => story.id === storyId)?.playableId ?? storyId));
      setSelectedStory(null);
      setDetail(null);
      setPendingWorld(world.generated?.editorial ? world : withReviewedWorkshopCopy(world));
      setModal(readStorage(storageKeys.onboarding, false) ? 'background' : 'guide');
    } catch (error) { setDetailError(errorMessage(error)); notify(errorMessage(error)); }
    finally { setPreparing(false); }
  };

  const beginWorld = () => {
    if (!pendingWorld) return;
    try {
      const next = startSession(pendingWorld, { difficulty: pendingDifficulty });
      sessionRef.current = next;
      setSession(next);
      setPendingWorld(null);
      setModal(null);
      setGameError('');
    } catch (error) { setGameError(errorMessage(error)); setModal(null); }
  };

  const loadSave = async (saved: SavedGame) => {
    setLoadingSave(true);
    try {
      const world = await fetchJson<GameWorld>(worldEndpoint(saved.storyId, saved.worldVersion));
      const next = restoreSession(world, saved);
      sessionRef.current = next;
      setSession(next);
      setModal(null);
      setSelectedStory(null);
      notify('已回到上次停下的那一页。');
    } catch (error) { notify(errorMessage(error)); }
    finally { setLoadingSave(false); }
  };

  const writeSave = (index: number) => {
    if (!session) return;
    const updated = [...manualSaves];
    updated[index] = saveSession(session);
    if (writeStorage(storageKeys.saves, updated)) { setManualSaves(updated); notify(`已写入存档 ${pad(index + 1)}。`); }
    else notify('浏览器存储空间不足，存档未写入。');
  };

  const deleteSave = (index: number) => {
    const updated = [...manualSaves];
    updated[index] = null;
    if (writeStorage(storageKeys.saves, updated)) { setManualSaves(updated); notify('已删除这个存档。'); }
  };

  const exportSave = (saved: SavedGame) => {
    try {
      const text = encodeSaveFile(saved);
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `redleaf-${saved.worldId}-${saved.savedAt}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify('存档文件已导出。');
    } catch (error) { notify(errorMessage(error)); }
  };

  const cancelSaveImport = () => {
    ++importRequest.current;
    setSaveImport({ status: 'idle' });
    setImportTarget(null);
    if (importInput.current) importInput.current.value = '';
  };

  const closeSaves = () => { cancelSaveImport(); setModal(null); };

  const chooseImportFile = () => {
    cancelSaveImport();
    importInput.current?.click();
  };

  const importSaveFile = async (file: File) => {
    const request = ++importRequest.current;
    const isCurrent = () => request === importRequest.current && modalRef.current === 'saves';
    setToast('');
    setSaveImport({ status: 'loading', fileName: file.name });
    setImportTarget(null);
    try {
      if (file.size > MAX_SAVE_FILE_BYTES) throw new Error('存档文件超过 1 MB 上限。');
      const text = await file.text();
      if (!isCurrent()) return;
      const imported = parseSaveFile(text);
      const world = await fetchJson<GameWorld>(worldEndpoint(imported.storyId, imported.worldVersion));
      if (!isCurrent()) return;
      const canonical = saveSession(restoreSession(world, imported));
      if (Number.isNaN(new Date(imported.savedAt).getTime())) throw new Error('存档时间无效，无法导入。');
      const saved = { ...canonical, savedAt: imported.savedAt };
      if (isCurrent()) setSaveImport({ status: 'preview', fileName: file.name, saved });
    } catch (error) {
      if (isCurrent()) setSaveImport({ status: 'error', message: errorMessage(error) });
    }
  };

  const confirmSaveImport = () => {
    if (saveImport.status !== 'preview' || importTarget === null || !Number.isInteger(importTarget) || importTarget < 0 || importTarget > 2) return;
    const updated = [...manualSaves];
    updated[importTarget] = saveImport.saved;
    if (!writeStorage(storageKeys.saves, updated)) {
      setSaveImport({ ...saveImport, error: '浏览器存储空间不足，存档未写入。' });
      return;
    }
    setManualSaves(updated);
    notify(`已导入存档 ${pad(importTarget + 1)}。`);
    cancelSaveImport();
  };

  const closeTour = () => {
    ++tourNavigation.current;
    ++detailRequest.current;
    setTourOpen(false); setTourStep(null);
    tourReturn.current?.(); tourReturn.current = null;
  };
  const navigateTour = async (destination: LiukanTourView, step: LiukanTourStep) => {
    const ticket = ++tourNavigation.current;
    if (!tourReturn.current) {
      const scrollTop = window.scrollY;
      tourReturn.current = () => {
        setView(view); setModal(modal); setSelectedStory(selectedStory); setStoryPanel(storyPanel);
        setDetail(detail); setDetailError(detailError); setPendingWorld(pendingWorld);
        setRedrainDetail(redrainDetail); setCapabilitiesOpen(capabilitiesOpen);
        setZhihuWorkspaceOpen(zhihuWorkspaceOpen); setZhihuReadingPost(zhihuReadingPost);
        requestAnimationFrame(() => window.scrollTo(0, scrollTop));
      };
    }
    setTourStep(step); setCapabilitiesOpen(false); setSelectedStory(null); setRedrainDetail(false);
    setModal(null); setZhihuWorkspaceOpen(false);
    if (destination === 'saves' || destination === 'settings') { setModal(destination); return; }
    if (destination === 'zhihu') { setView('workshop'); setZhihuReadingPost(null); setZhihuWorkspaceOpen(true); return; }
    if (destination === 'story-intro' || destination === 'source') {
      setView('library');
      const available = library?.stories.length ? library.stories : (await fetchJson<StoryListResponse>('/api/stories')).stories;
      const story = available.find(item => !isImportedId(item.id) && item.id !== REDRAIN_ID && (destination === 'source' || item.playable));
      if (ticket !== tourNavigation.current) return;
      if (!story) throw new Error('书库暂时没有可展示的故事，请稍后重试。');
      if (destination === 'story-intro') {
        const response = await fetch(worldEndpoint(story.id), { signal: AbortSignal.timeout(60_000) });
        if (!response.ok) throw new Error('这篇故事的序章暂时无法读取。');
        const world: GameWorld = await response.json();
        if (ticket !== tourNavigation.current) return;
        setPendingWorld(world); setModal('background');
      } else {
        const response = await fetch(`/api/stories/${encodeURIComponent(story.id)}`, { signal: AbortSignal.timeout(35_000) });
        if (!response.ok) throw new Error('这篇故事的原文暂时无法读取。');
        const source: StoryDetail = await response.json();
        if (ticket !== tourNavigation.current) return;
        setSourceTarget(null); setSelectedStory(story); setStoryPanel('reader');
        setDetail(source); setDetailLoading(false); setDetailError('');
      }
      return;
    }
    setView(destination);
  };
  const returnToLibrary = () => { setRedrainActive(false); sessionRef.current = null; setSession(null); setModal(null); setPendingWorld(null); setView('library'); };
  const toggleFavorite = (id: string) => setFavorites((previous) => previous.includes(id) ? previous.filter((entry) => entry !== id) : [...previous, id]);
  const playableStories = stories.filter((story) => story.playable);
  const featuredPool = (playableStories.length ? playableStories : stories).slice(0, 4);
  const featured = featuredPool[featuredIndex % Math.max(1, featuredPool.length)];
  const primaryCategories = Array.from(new Set(playableStories.flatMap((story) => story.labels))).slice(0, 3);
  const categories = ['全部故事', ...new Set([...primaryCategories, ...(stories.some((story) => story.labels.includes('科幻')) ? ['科幻'] : [])]), '已收藏'];
  const filteredStories = stories.filter((story) => {
    const inCategory = category === '全部故事' || (category === '已收藏' ? favorites.includes(story.id) : story.labels.includes(category));
    const query = search.trim().toLowerCase();
    return inCategory && (!query || `${story.title} ${story.author ?? ''} ${story.description} ${story.labels.join(' ')}`.toLowerCase().includes(query));
  }).sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title, 'zh-CN') : Number(b.playable) - Number(a.playable));
  const redrainEndings = redrainSave ? redrainEndingRecords(redrainSave) : [];
  const allEndingCount = endings.length + redrainEndings.length;
  const worldForBackground = pendingWorld ?? session?.world;
  const mechanicsDescription = worldForBackground && introMechanicsDescription(worldForBackground);
  const introDifficulty = pendingWorld ? pendingDifficulty : session?.difficulty ?? 'classic';
  const introResources = worldForBackground && introDifficulty === 'challenge' ? challengeInitials(worldForBackground) : null;

  const companionProgress = useMemo<LiukanProgressRequest | undefined>(() => {
    const active = session;
    if (!active) return undefined;
    return { storyId: active.world.storyId, worldId: active.world.id, worldVersion: active.world.version, difficulty: active.difficulty,
      history: active.history.flatMap(entry => {
        if (!entry.choice && !entry.choiceId) return [];
        const choice = active.world.nodes[entry.nodeId]?.choices.find(item => item.id === entry.choiceId || item.text === entry.choice || item.legacyTexts?.includes(entry.choice ?? ''));
        return choice ? [{ nodeId: entry.nodeId, choiceId: choice.id }] : [];
      }), currentParagraphIndex: active.paragraphIndex };
  }, [session?.world.id, session?.world.version, session?.history, session?.paragraphIndex, session?.difficulty]);

  const showCompanionProject = (project: WorkshopProject) => {
    setActivityDeskOpen(false); setReadingDesk(null); setCapabilitiesOpen(false);
    returnToLibrary(); setSelectedStory(null); setWorkshopProjectId(project.id); setView('workshop'); setZhihuWorkspaceOpen(false);
  };

  return <Suspense fallback={<div className="app-loading" role="status">正在打开赤页…</div>}><div className={`app ${settings.reducedMotion ? 'reduced-motion' : ''}`} style={{ '--reading-size': `${settings.textSize}px` } as CSSProperties}>
    {redrainActive && !tourOpen ? <RedRainPlayer initialSave={redrainSave} settings={settings} paused={Boolean(modal)} onSaved={setRedrainSave} onExit={returnToLibrary} onSettings={() => setModal('settings')} /> : !session || tourOpen ? <div className="library-shell">
      <aside className="side-rail">
        <Brand onClick={() => setView('library')} />
        <div className="rail-source"><ZhihuBadge label="故事" /><span>原作在这里，下一步由你。</span></div>
        <nav className="primary-nav" aria-label="主导航">
          <button title="知乎故事书库" aria-label="知乎故事书库" aria-current={view === 'library' ? 'page' : undefined} className={`nav-link ${view === 'library' ? 'active' : ''}`} onClick={() => setView('library')}><Library size={17} /><span>知乎故事书库</span><small>01</small></button>
          <button title="新故事工作台" data-tour="workshop-entry" aria-label="新故事工作台" aria-current={view === 'workshop' ? 'page' : undefined} className={`nav-link ${view === 'workshop' ? 'active' : ''}`} onClick={() => setView('workshop')}><Sparkles size={17} /><span>新故事工作台</span><small>NEW</small></button>
          <button title="我的存档" data-tour="game-saves" aria-label="我的存档" className="nav-link" onClick={() => setModal('saves')}><Bookmark size={17} /><span>我的存档</span><small>{pad(manualSaves.filter(Boolean).length)}</small></button>
          <button title="结局档案" data-tour="game-endings" aria-label="结局档案" aria-current={view === 'endings' ? 'page' : undefined} className={`nav-link ${view === 'endings' ? 'active' : ''}`} onClick={() => setView('endings')}><Compass size={17} /><span>结局档案</span><small>{pad(allEndingCount)}</small></button>
        </nav>
        {redrainSave && <div className="rail-bookmark"><p className="eyebrow">重生周 · 上次读到</p><button className="current-world" onClick={openRedRain}><Artwork src={redrainStory.cover} alt="" /><span>{redrainStory.title}<small>{summaryLabel(redrainSave)} · 继续阅读</small></span></button></div>}
        {autoSave && <div className="rail-bookmark"><p className="eyebrow">LAST OPENED</p><button className="current-world" onClick={() => void loadSave(autoSave)} disabled={loadingSave}>
          <Artwork src={autoSave.cover} alt="" /><span>{autoSave.title}<small>{autoSave.chapter} · 继续阅读 <ChevronRight size={9} /></small></span>
        </button></div>}
        <div className="rail-bottom"><div className="rail-clock"><span className="status-dot" />{library?.source === 'live' ? '知乎书库已连接' : library ? '知乎书库 · 本地缓存' : '正在连接知乎书库'}</div><div className="rail-theme-switch"><ThemeSwitch /></div><IconButton label="阅读设置" onClick={() => setModal('settings')}><Settings2 /></IconButton></div>
      </aside>
      <main className="library-main">
        <header className="top-bar"><div className="breadcrumb"><span>赤页</span><ChevronRight size={10} /><strong>{view === 'workshop' ? '新故事工作台' : view === 'library' ? '知乎故事书库' : '结局档案'}</strong></div><div className="top-controls"><ThemeSwitch /><button className="text-button liukan-help-entry" onClick={() => setTourOpen(true)}>怎么开始</button><span className="volume-caption">原作阅读 / 互动改编</span><IconButton label="阅读引导" onClick={() => setModal('guide')}><CircleHelp /></IconButton><IconButton label="刷新故事" onClick={() => { void loadLibrary(); void refreshProjects(); }} disabled={fetching}><RefreshCw className={fetching ? 'spin' : ''} /></IconButton></div></header>
        <div className="library-content">
          {view === 'workshop' ? <StoryWorkshop tourStep={tourStep} onBrowseZhihu={() => { setZhihuReadingPost(null); setZhihuWorkspaceOpen(true); }} stories={library?.stories ?? []} requestedSource={workshopSource} requestedProjectId={workshopProjectId} onReadZhihu={story => void openStory(story, 'reader')} onPlay={id => void prepareWorld(id)} onRead={id => void readImportedSource(id)} /> : <>
          <div className="section-heading"><div><p className="page-kicker">{view === 'library' ? 'ZHIHU STORIES / RED LEAF EDITION' : 'YOUR ENDINGS'}</p><h1 className="page-title">{view === 'library' ? '知乎故事书库' : '结局档案'}<span className="heading-punctuation">。</span></h1></div><div className="archive-number"><b>{pad(view === 'library' ? stories.length : allEndingCount)}</b><span>{view === 'library' ? '篇原作' : '个已解锁结局'}</span></div></div>
          {view === 'library' ? <>
            {library?.warning && <div className="library-notice"><Clock3 size={14} /><span>{library.warning}</span></div>}
            {libraryError && <div className="library-notice"><CircleHelp size={15} /><span>{libraryError} <button className="text-button" onClick={() => void loadLibrary()}>重新连接 <RefreshCw size={12} /></button></span></div>}
            {featured ? <section className="featured-story" aria-label="本期精选故事">
              <Artwork src={featured.cover || featured.sourceCover} fallback={featured.sourceCover} className="featured-image" alt={`${featured.title}的故事封面`} placeholder={<BookJacket title={featured.title} author={featured.author} className="featured-image" />} />
              <div className="feature-copy"><div className="issue-tag"><ZhihuBadge label="原作精选" /><span>本期夜读</span></div><h2 className="feature-title">{featured.title}</h2><p className="feature-excerpt">{featured.description}</p><AuthorIdentity name={featured.author} avatar={featured.authorAvatar} label="知乎原作作者" /><div className="feature-actions"><button id="start-btn" data-tour="library-play" className="primary-button" onClick={() => void openStory(featured)}>翻开这个故事 <ArrowRight /></button>{!featured.playable && <button className="secondary-button feature-adapt" onClick={() => adaptStory(featured)}><Sparkles size={15} />{featured.project ? '查看改编' : '改编这篇'}</button>}</div></div>
              <span className="feature-stamp">原作 / {featured.labels.slice(0, 2).join(' · ')}</span><div className="feature-bottom">{featuredPool.map((story, index) => <button className={`feature-index ${featured.id === story.id ? 'active' : ''}`} key={story.id} aria-label={`精选故事 ${index + 1}：${story.title}`} onClick={() => setFeaturedIndex(index)}>{pad(index + 1)}</button>)}</div>
            </section> : fetching ? <div className="fetch-status" role="status"><p className="eyebrow">RED LEAF / ARCHIVE CONNECTION</p><h2>正在打开知乎故事书库</h2><div className="fetch-line" /><p>读取真实故事、原作作者与书目。</p></div> : <div className="empty-state"><BookOpen size={27} /><h2>书库暂时无法打开</h2><p>{libraryError || '当前没有可用的故事。'}</p><button className="secondary-button" onClick={() => void loadLibrary()}><RefreshCw />重新连接</button></div>}
            <div className="library-paths"><button data-tour="library-source" onClick={() => document.querySelector('.collection-toolbar')?.scrollIntoView({ behavior: settings.reducedMotion ? 'instant' : 'smooth', block: 'start' })}><BookOpen size={20} /><span><b>先读原作</b><small>故事、作者与原文节选</small></span><ArrowRight size={17} /></button><button onClick={() => { setWorkshopSource(null); setView('workshop'); }}><Sparkles size={20} /><span><b>写我的另一种结局</b><small>从知乎选篇，或带来自己的故事</small></span><ArrowRight size={17} /></button></div>
            {projectsError && <div className="library-notice" role="alert"><CircleHelp size={15} /><span>新故事进度暂未更新：{projectsError} <button className="text-button" onClick={() => void refreshProjects()}>重试 <RefreshCw size={12} /></button></span></div>}
            <div className="collection-toolbar"><div className="category-tabs" role="tablist" aria-label="故事分类">{categories.map((item) => <button role="tab" aria-selected={category === item} className={`category-tab ${category === item ? 'active' : ''}`} key={item} onClick={() => setCategory(item)}>{item}{item === '全部故事' && <small>{pad(stories.length)}</small>}</button>)}</div><label className="search-field"><Search /><input aria-label="搜索标题、作者或关键词" placeholder="搜索标题、作者或关键词" value={search} onChange={(event) => setSearch(event.target.value)} /></label></div>
            <div className="collection-meta"><span><strong>{pad(filteredStories.length)}</strong> 个故事 · {category}</span><select className="sort-select" aria-label="故事排序" value={sort} onChange={(event) => setSort(event.target.value)}><option value="recommended">可游玩优先</option><option value="title">按故事名称</option></select></div>
            <div className="story-grid" data-tour="library-games">{filteredStories.map((story, index) => <article className="story-card" key={story.id} data-story-id={story.id} data-project-id={story.project?.id}>
              <button className="story-card-open" onClick={() => void openStory(story)}><div className="story-cover"><Artwork src={story.sourceCover || story.cover} alt={`${story.title}原作封面`} placeholder={<BookJacket title={story.title} author={story.author} />} /><span className="cover-shade" /><span className="cover-number">{pad(index + 1)} / 知乎原作</span><span className="cover-category">{story.labels[0] ?? '故事'}</span></div><div className="card-source-line"><ZhihuBadge compact label={story.addedFromWorkshop ? '原作节选' : '原作'} /><span className="story-adaptation-status" data-status={storyAdaptationStatus(story).tone}>{story.addedFromWorkshop && '新增 · '}{storyAdaptationStatus(story).label}</span></div><h3>{story.title}</h3><p className="story-card-excerpt">{story.description}</p></button>
              <div className="story-card-meta"><AuthorIdentity name={story.author} avatar={story.authorAvatar} label="原作作者" /><button className={`story-save ${favorites.includes(story.id) ? 'saved' : ''}`} title={favorites.includes(story.id) ? '移除书签' : '加入书签'} aria-label={`${favorites.includes(story.id) ? '移除' : '收藏'}${story.title}`} onClick={() => toggleFavorite(story.id)}>{favorites.includes(story.id) ? <Bookmark fill="currentColor" /> : <Bookmark />}</button></div>
              <div className="story-entry-actions"><button onClick={() => void openStory(story, 'reader')}><BookOpen />{story.addedFromWorkshop ? '读节选' : '读原作'}</button>{story.playable ? <button onClick={() => void prepareWorld(story.id)} disabled={preparing}><Compass />玩改编</button> : <button title={`${story.project ? '查看' : '改编'}《${story.title}》`} onClick={() => adaptStory(story)}><Sparkles />{story.project ? '查看改编' : '改编这篇'}</button>}</div>
            </article>)}</div>
            {!filteredStories.length && !fetching && stories.length > 0 && <div className="empty-state"><Search size={25} /><h2>{category === '已收藏' ? '还没有收藏故事' : '没有找到这个故事'}</h2>{category !== '已收藏' && <p>试试另一个标题、作者或关键词。</p>}</div>}
          </> : allEndingCount ? <div className="timeline-list" data-tour="ending-archive">{endings.map((ending) => <article className="timeline-item" key={`${ending.worldId}-${ending.nodeId}`}><Artwork src={ending.cover} alt="" /><div><p className="eyebrow">{prettyTime(ending.unlockedAt)}</p><h3>{ending.title}</h3><p>{ending.worldTitle}</p><button className="secondary-button" onClick={() => void prepareWorld(ending.storyId)} disabled={preparing}><RotateCcw />重新进入故事</button></div></article>)}{redrainEndings.length > 0 && <section className="redrain-ending-list"><h2>{redrainStory.title}</h2>{redrainEndings.map(ending => <article key={ending.id}><h3>{ending.title}</h3><p>{ending.kind === 'bad' ? '失败结局' : '常规结局'} · {ending.id}</p></article>)}<button className="secondary-button" onClick={openRedRain}><BookOpen size={15} />继续重生周</button></section>}</div> : <div className="empty-state" data-tour="ending-archive"><Compass size={30} /><h2>还没有解锁的结局</h2><button className="primary-button" onClick={() => setView('library')}>回到故事书库 <ArrowRight /></button></div>}
          <footer className="library-footer"><span>故事书库原作来自知乎；工作台导入文本单独存放。新增分支与结局为独立改编。</span><span>{library?.source === 'live' ? 'LIVE SOURCE' : 'LOCAL ARCHIVE'} / RED LEAF © 2026</span></footer>
          </>}
        </div>
      </main>
    </div> : <div className={`game-shell ${session.world.generated && !backgroundSource ? 'text-reading' : ''}`} ref={gameShellRef}>
      <header className="game-topbar"><div className="game-ident"><Brand onClick={returnToLibrary} /><span className="game-story-title">{session.world.title}</span></div><div className="game-tools"><ThemeSwitch />
        {canRetryArt && <IconButton label="重新加载插画" className="art-retry" onClick={() => setArtAttempt(value => value + 1)}><RefreshCw /></IconButton>}
        {canSwitchSceneArt && <IconButton label="切换本节点已审场景图" onClick={cycleSceneArt}><Images /></IconButton>}
        <IconButton label="故事背景" className="optional-tool" onClick={() => setModal('background')}><BookOpen /></IconButton>
        <IconButton label="线索与手记" onClick={() => { setJournalTab('progress'); setModal('journal'); }}><FileText /></IconButton>
        <IconButton label={session.difficulty === 'challenge' ? `重选上一步 · 剩余 ${session.rewindsRemaining} 次` : '重选上一步'} disabled={session.history.length < 2 || session.rewindsRemaining === 0} onClick={() => requestRewind(session.history.length - 2)}><Undo2 /></IconButton>
        <IconButton label="回看剧情" className="hide-on-mobile" onClick={() => { setJournalTab('history'); setModal('journal'); }}><History /></IconButton><span className="tool-separator" />
        <IconButton label="保存与载入" onClick={() => setModal('saves')}><Save /></IconButton>
        <IconButton label="全屏" className="optional-tool" onClick={toggleFullscreen}><Maximize2 /></IconButton>
        <IconButton label="阅读设置" onClick={() => setModal('settings')}><Settings2 /></IconButton>
        <IconButton label="返回书库" onClick={returnToLibrary}><Library /></IconButton>
      </div></header>
      {session.world.generated && !session.world.generated.artReady && <div className="generated-art-pending" role="status">改编故事 · 插图尚未完成，当前可阅读和游玩</div>}
      {toast && !modal && !selectedStory && <div className="game-status" role="status"><Check size={14} />{toast}</div>}
      {session.node.ending && <div className="ending-outcome"><Outcome outcome={session.lastOutcome} worldId={session.world.id} /></div>}
      {session.node.ending ? <main className="ending-view"><Artwork key={`${session.world.id}:${session.node.id}:${artAttempt}`} src={backgroundSource} className="scene-image" alt="故事结局场景" onStateChange={setBackgroundState} /><div className="ending-content"><p className="ending-index">END OF THIS TIMELINE / {session.node.ending.tone.toUpperCase()}</p><h1>{session.node.ending.title}</h1><div className="ending-divider" /><p className="ending-prose">{currentText}</p><div className="ending-stats"><div><b>{pad(session.choiceCount)}</b><span>次选择</span></div><div><b>{pad(session.clues.length)}</b><span>条线索</span></div><div><b>{pad(endings.filter((ending) => ending.worldId === session.world.id).length)}</b><span>个已解锁结局</span></div></div><div className="ending-actions"><button className="primary-button" onClick={() => { setPendingWorld(session.world); setModal('background'); }}>重新开始 <RotateCcw /></button><button className="secondary-button" onClick={() => { setJournalTab('history'); setModal('journal'); }}><History />回看剧情</button><button className="secondary-button" onClick={returnToLibrary}><Library />返回书库</button></div><EndingSourceBridge world={session.world} endingTitle={session.node.ending.title} choices={session.choiceCount} onRead={openSessionSource} onHistory={() => { setJournalTab('history'); setModal('journal'); }} /></div></main> : <main className="game-stage">
        <Artwork key={`${session.world.id}:${session.node.id}:${artAttempt}`} src={backgroundSource} className="scene-image" alt={`${session.node.location}场景`} onStateChange={setBackgroundState} /><div className="scene-wash" />
        <div className={`scene-frame ${hasCharacterLayer ? 'has-character' : ''}`} data-character-position={hasCharacterLayer ? characterPosition : undefined}>
          <div className="scene-topline"><div className="chapter-mark"><div><p className="chapter-number">{session.node.chapter} / {session.timeLabel}</p><h2>{session.node.location}</h2></div></div><div className="scene-stats" aria-label="当前状态">{!session.world.generated && <><span className="scene-stat"><Shield />决心 <b>{session.resolve}</b></span><span className="scene-stat"><Heart />信任 <b>{session.trust}</b></span></>}<span className="scene-stat"><FileText />线索 <b>{pad(session.clues.length)}</b></span></div></div>
          <div className="run-difficulty" data-mode={session.difficulty}><Shield size={12} /><span>{session.difficulty === 'challenge' ? `挑战模式 · 回溯剩余 ${session.rewindsRemaining} 次` : '经典模式 · 自由回溯'}</span></div>
          {!!session.world.resources?.length && <div className="resource-strip" aria-label="行动资源">{session.world.resources.map(resource => <div className="resource-meter" key={resource.id} title={resource.description}><span>{resource.label}</span><b>{session.resources[resource.id]} / {resource.max}</b><meter min={resource.min} max={resource.max} value={session.resources[resource.id]} aria-label={resource.label} /></div>)}</div>}
          <span className="scene-annotation">{session.node.title}</span>
          {hasCharacterLayer && <div className="character-layer" data-character-id={sceneCharacter!.id} data-position={characterPosition} data-art-state={currentPortraitState.status}>
            <Artwork key={`${sceneCharacter!.id}:${characterExpression}:${artAttempt}:${portraitRevision}`} src={portraitSources[0]} fallbacks={portraitSources.slice(1)} versions={portraitVersions}
              className="character-portrait" alt={sceneCharacter!.name} onStateChange={setPortraitState} />
          </div>}
          {hasCharacterLayer && <div className="character-clearance" aria-hidden="true" />}
          <div className="choice-region" aria-label="剧情选择" ref={choiceRegionRef}><Outcome key={`${session.world.id}:${session.choiceCount}:${session.node.id}`} outcome={session.lastOutcome} worldId={session.world.id} />{lastParagraph && textComplete && <>
            {session.node.challenge && (session.difficulty === 'challenge'
              ? <div className="challenge-box challenge-prompt"><CircleHelp /><p>{session.node.challenge.prompt}</p><small>从当前剧情和已收集的线索判断。</small></div>
              : <details className="challenge-box" key={`${session.world.id}:${session.node.id}`}><summary><CircleHelp /><span>{session.node.challenge.prompt}</span></summary><p>{session.node.challenge.hint}</p></details>)}
            {session.choices.map((choice, index) => <button className="choice-button" key={choice.id} style={{ '--choice-index': index } as CSSProperties} onFocus={() => performLiukanAction(choiceBlockers(choice, session, session.world.resources).length ? 'careful' : 'choose')} onClick={() => makeChoice(choice)}><span className="choice-number">{pad(index + 1)}</span><span className="choice-copy"><span className="choice-action">{choice.text}</span>{choiceCostLabels(choice, session.world.resources ?? []).length > 0 && <small className="choice-cost">{choiceCostLabels(choice, session.world.resources ?? []).join(' · ')}</small>}</span><ArrowRight /></button>)}
            {session.node.choices.filter(choice => choiceBlockers(choice, session, session.world.resources).length).map(choice => <div className="locked-choice" key={choice.id} aria-disabled="true"><LockKeyhole /><div>{choice.text}<small>{choiceLockLabels(choice, session, session.world.resources ?? [], session.difficulty === 'challenge', clue => clueLabel(session.world.id, clue)).join('；')}</small></div></div>)}
          </>}</div>
        </div>
        <section className="dialogue-panel" key={`${session.world.id}:${session.node.id}:${session.paragraphIndex}`} aria-label="当前剧情"><div className="speaker-line"><span className="speaker-name">{session.node.speaker ?? '旁白'}</span><span className="scene-time">{session.world.generated ? `改编 ${session.world.version}` : session.world.id.toUpperCase()} / {pad(session.history.length)}</span></div><p className="dialogue-text" onClick={nextParagraph}>{currentText.slice(0, visibleCharacters)}</p>{(!lastParagraph || !textComplete) ? <button className="dialogue-next" onClick={nextParagraph}>{textComplete ? '继续' : '显示全文'}<ChevronDown /></button> : <div className="dialogue-next"><span>{session.choices.length ? '接下来怎么做？' : '暂时没有可用选项'}</span><Sparkles size={11} /></div>}</section>
      </main>}
      <footer className="game-bottomline"><span className="source-credit">{worldSourceLabel(session.world)} / <button className="source-reader-link" onClick={openSessionSource} title={isZhihuWorld(session.world) ? '查看原作节选' : '查看导入原文'}>{session.world.source.author} · {session.world.source.title}</button> / 互动改编</span><span className="page-indicator">{session.node.ending ? 'END' : `${pad(session.paragraphIndex + 1)} / ${pad(session.paragraphs.length)}`} · AUTO SAVED</span></footer>
    </div>}

    {modal === 'imported-source' && <Modal title={importedSource?.scope === 'zhihu-excerpt' ? '知乎原作节选' : '导入原文'} large className="reader-modal" onClose={() => { ++importedReaderRequest.current; setModal(null); }} footer={<button className="primary-button" onClick={() => { ++importedReaderRequest.current; setModal(null); }}>{session ? '继续当前故事' : view === 'workshop' ? '返回工作台' : '返回书库'} <ArrowRight /></button>}>{importedSource ? <ImportedSourceReader source={importedSource} /> : importedSourceError ? <div role="alert"><p>{importedSourceError}</p><button className="secondary-button" onClick={() => void readImportedSource(importedSourceId)}><RefreshCw />重读原文</button></div> : <p role="status">正在读取独立保存的原文…</p>}</Modal>}
    {redrainDetail && <Modal title={redrainStory.title} onClose={() => setRedrainDetail(false)} footer={<><button className="secondary-button" onClick={() => setRedrainDetail(false)}>返回书库</button><button id="redrain-start" className="primary-button" onClick={openRedRain}>{redrainSave ? '继续重生周' : '进入重生周'} <ArrowRight /></button></>}><div className="redrain-intro"><img src={redrainStory.cover} alt="重生周序幕场景" /><p>你是屠亦娆，醒来时距离记忆中的灾变还有七天。囤积物资、核实预知、决定相信谁，每一次选择都会留下不同的后续。</p><p>完整文字分支冒险 · 50 个决策位置 · 20 个常规结局 / 8 个失败结局</p>{redrainSave && <p>上次读到：{summaryLabel(redrainSave)}</p>}<div className="redrain-source"><p>原作：y甜酱不闲《末日的45度角躺平》<br />本作保留主线剧情与分支玩法，新增分支和结局属于互动改编。</p><a className="text-button" href={redrainStory.originalUrl} target="_blank" rel="noreferrer"><BookOpen size={15} />打开知乎原作</a></div></div></Modal>}

    {selectedStory && <Modal
      title={storyPanel === 'reader' ? '原作节选' : '故事档案'} large
      className={storyPanel === 'reader' ? 'reader-modal' : ''} focusKey={storyPanel}
      onClose={closeStory}
      footer={<>
        {preparing ? <div className="prepare-status" role="status"><LoaderCircle className="spin" size={18} /><span>正在打开这个故事的世界……</span></div> : <>
          {storyPanel === 'reader'
            ? <button className="secondary-button" onClick={() => setStoryPanel('detail')}><ArrowLeft />返回故事档案</button>
            : <button className="text-button" data-modal-autofocus onClick={() => setStoryPanel('reader')}><BookOpen />阅读原作节选</button>}
          <div className="story-footer-spacer" />
          {!session && !selectedLibraryStory?.playable && <button className="secondary-button source-adapt-button" onClick={() => adaptStory(detail ?? selectedStory)}><Sparkles />{stories.find(story => story.id === selectedStory.id)?.project ? '查看改编' : '改编这篇'}</button>}
          {storyPanel === 'detail' && <button className="secondary-button" onClick={closeStory}>{session ? '返回故事' : view === 'workshop' ? '返回工作台' : '返回书库'}</button>}
          {session?.world.storyId === selectedStory.id
            ? <button className="primary-button" onClick={closeStory}>{readerReturn ? '返回随身手记' : '继续当前故事'} <ArrowRight /></button>
            : selectedLibraryStory?.playable && <button className="primary-button" onClick={() => void prepareWorld(selectedStory.id)}>进入故事世界 <ArrowRight /></button>}
        </>}
      </>}
    >{storyPanel === 'reader' ? <SourceReader key={`${selectedStory.id}:${sourceTarget?.id ?? 'reader'}`} story={selectedStory} detail={detail} loading={detailLoading} error={detailError} target={sourceTarget} onRetry={() => void loadStoryDetail(selectedStory, true)} onSearchState={setSourceSearch} /> : <>
      <div className="detail-layout"><div className="detail-art"><Artwork src={selectedStory.sourceCover || selectedStory.cover} className="detail-cover" alt={`${selectedStory.title}原作封面`} placeholder={<BookJacket title={selectedStory.title} author={selectedStory.author} className="detail-cover" />} /></div><div>
        <div className="detail-source-heading"><ZhihuBadge label="原作" /><span>{selectedLibraryStory?.playable ? '已有赤页互动改编' : '公开节选'}</span></div>
        <h3 className="detail-title">{selectedStory.title}</h3>
        <AuthorIdentity name={detail?.author ?? selectedStory.author ?? (detailLoading ? '正在读取署名' : '署名暂未读取')} avatar={detail?.authorAvatar ?? selectedStory.authorAvatar} label="知乎原作作者" />
        <p className="detail-excerpt">{detail?.introduction || selectedStory.description}</p>
        {detailLoading && <p className="prepare-status" style={{ marginTop: 15 }} role="status"><LoaderCircle className="spin" size={13} />正在读取原作节选</p>}
        <div className="detail-tags">{selectedStory.labels.map((label) => <span key={label}>{label}</span>)}</div>
        {detailError && <div className="detail-error" role="alert"><p>{detailError}</p><button className="text-button" onClick={() => void loadStoryDetail(selectedStory, true)}><RefreshCw />重新读取节选</button></div>}
      </div></div>
      <div className="source-line"><p>{selectedLibraryStory?.playable ? '本游戏基于知乎公开接口提供的原作节选构建世界；后续分支、人物对白与结局为独立互动改编，不代表原作完整内容或结局。' : '这篇故事已收录原作书目，互动世界尚未开放。现在可以在这里阅读公开节选。'}</p><SourceLinks source={detail ?? selectedStory} /></div>
    </>}</Modal>}

    {modal === 'guide' && <Modal title="翻开第一页之前" onClose={() => setModal(pendingWorld ? 'background' : null)} footer={<><label className="checkbox-line"><input type="checkbox" checked={skipGuide} onChange={(event) => setSkipGuide(event.target.checked)} />之后不再显示</label><button className="primary-button" onClick={() => { writeStorage(storageKeys.onboarding, skipGuide); setModal(pendingWorld ? 'background' : null); }}>{pendingWorld ? '认识这个世界' : '开始阅读'}<ArrowRight /></button></>}>
      <div className="intro-steps"><div className="intro-step"><div><h3>先认识自己的处境</h3><p>世界序章会给出你的身份、目标与本局资源，也可以选择挑战或经典模式。原作节选随时可以打开，关闭后会回到当前进度。</p></div></div><div className="intro-step"><div><h3>为下一步留一点余地</h3><p>阅读到分岔处再行动。调查消耗资源，组合线索解锁推理；灰色路线会说明所需资源。经典模式可以展开提示，挑战模式需要自己判断还缺哪些线索。</p></div></div><div className="intro-step"><div><h3>结局之后还有另一条路</h3><p>行动结果会显示实际得失。工具栏和手记都能返回之前的选择，挑战模式每局限回溯 3 次。回溯会更新自动进度，三个手动存档与已收集结局保留。</p></div></div></div><PracticeGuide />
    </Modal>}

    {modal === 'background' && worldForBackground && <Modal title="世界序章" onClose={() => { setModal(null); setPendingWorld(null); }} footer={<><button className="secondary-button" onClick={() => { setModal(null); setPendingWorld(null); }}>{pendingWorld ? '稍后再来' : '返回故事'}</button>{pendingWorld && <button className="primary-button" onClick={beginWorld}>开始故事 <ArrowRight /></button>}</>}><div className="world-intro" data-tour="story-intro"><p className="detail-kicker">{worldForBackground.subtitle}</p><h3>{worldForBackground.title}</h3>{worldForBackground.introduction.map((paragraph, index) => <p key={index} style={{ marginBottom: 12 }}>{paragraph}</p>)}<p style={{ marginTop: 17, color: '#d6b59d' }}>你的身份：{worldForBackground.player.name} · {worldForBackground.player.role}<br />此刻的目标：{worldForBackground.objective}</p>
      {pendingWorld ? <fieldset className="difficulty-picker"><legend>本局难度</legend><div className="difficulty-options"><label data-selected={pendingDifficulty === 'challenge'}><input type="radio" name="difficulty" value="challenge" checked={pendingDifficulty === 'challenge'} onChange={() => setPendingDifficulty('challenge')} /><span><strong>挑战模式</strong><small>收紧行动资源，回溯限 {CHALLENGE_REWINDS} 次，线索需要自己判断。</small></span></label><label data-selected={pendingDifficulty === 'classic'}><input type="radio" name="difficulty" value="classic" checked={pendingDifficulty === 'classic'} onChange={() => setPendingDifficulty('classic')} /><span><strong>经典模式</strong><small>原有资源，可展开提示，自由回溯。</small></span></label></div><p>难度随本局存档保留，开始后固定。</p></fieldset>
        : <p className="difficulty-description">{introDifficulty === 'challenge' ? `本局为挑战模式，回溯剩余 ${session?.rewindsRemaining ?? CHALLENGE_REWINDS} 次。` : '本局为经典模式，可自由回溯。'}</p>}
      {worldForBackground.mechanics && <section className="world-mechanics"><h4>{worldForBackground.mechanics.title}</h4>{mechanicsDescription && <p>{mechanicsDescription}</p>}<dl>{worldForBackground.resources?.map(resource => <div key={resource.id}><dt>{resource.label} · 初始 {introResources?.[resource.id] ?? resource.initial} / {resource.max}</dt><dd>{resource.description}</dd></div>)}</dl>{introDifficulty === 'classic' && <p className="beginner-tip">{worldForBackground.mechanics.beginnerTip}</p>}</section>}
      <WorldArtOverview world={worldForBackground} /><div className="source-line"><p>{worldSourceLabel(worldForBackground)} / {worldForBackground.source.author} · 《{worldForBackground.source.title}》<br />后续剧情与结局属于游戏改编，原文另行保留。</p><details><summary>改编说明（含剧情透露）</summary><p>{worldForBackground.adaptation.note}</p></details></div></div></Modal>}

    {modal === 'settings' && <Modal title="阅读设置" onClose={() => setModal(null)} footer={<><button className="text-button" onClick={() => { setSettings(defaultSettings); notify('已恢复默认阅读设置。'); }}><RotateCcw />恢复默认</button><div style={{ flex: 1 }} /><button className="primary-button" onClick={() => setModal(null)}>完成 <Check /></button></>}><div className="settings-row"><label>界面风格<small>一键切换，自动记住你的选择</small></label><ThemeSwitch /></div><div className="settings-row" data-tour="reading-settings"><label htmlFor="text-size">正文字号<small>故事阅读区的文字大小</small></label><div className="range-control"><input id="text-size" type="range" min="15" max="23" value={settings.textSize} onChange={(event) => setSettings({ ...settings, textSize: Number(event.target.value) })} /><output>{settings.textSize}</output></div></div><div className="settings-row"><label htmlFor="text-speed">文字速度<small>调至 100 时立即显示全文</small></label><div className="range-control"><input id="text-speed" type="range" min="15" max="100" value={settings.textSpeed} onChange={(event) => setSettings({ ...settings, textSpeed: Number(event.target.value) })} /><output>{settings.textSpeed}</output></div></div><div className="settings-row"><label htmlFor="sound">交互音效<small>翻页与选择的轻声提示</small></label><input className="toggle" id="sound" type="checkbox" checked={settings.sound} onChange={(event) => setSettings({ ...settings, sound: event.target.checked })} /></div><div className="settings-row"><label htmlFor="reduced-motion">减少动态效果<small>关闭逐字呈现与过渡动画</small></label><input className="toggle" id="reduced-motion" type="checkbox" checked={settings.reducedMotion} onChange={(event) => setSettings({ ...settings, reducedMotion: event.target.checked })} /></div></Modal>}

    {modal === 'saves' && <Modal title={saveImport.status === 'preview' ? '导入存档' : '保存与载入'} onClose={closeSaves}
      className="saves-modal" focusKey={saveImport.status === 'preview' ? 'import-preview' : 'save-slots'}
      footer={saveImport.status === 'preview' && <>
        <button className="secondary-button" onClick={cancelSaveImport}>取消</button>
        <button className="primary-button" disabled={importTarget === null} onClick={confirmSaveImport}><Check />{importTarget === null ? '确认导入' : `${manualSaves[importTarget] ? '覆盖' : '导入到'}存档 ${pad(importTarget + 1)}`}</button>
      </>}>
      <input ref={importInput} type="file" accept=".json,application/json" aria-label="选择存档文件" hidden onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = '';
        if (file) void importSaveFile(file);
      }} />
      <RedRainSaveTools save={redrainSave} onLoad={openRedRain} onSaved={setRedrainSave} />
      <div className="saves-toolbar"><span>{saveImport.status === 'preview' ? '已校验剧情进度' : '本机存档'}</span><button className="secondary-button" onClick={chooseImportFile} data-modal-autofocus={saveImport.status !== 'preview' || undefined}><Upload />{saveImport.status === 'preview' || saveImport.status === 'loading' ? '重新选择' : '导入存档'}</button></div>
      {toast && <p className="saves-feedback" role="status">{toast}</p>}
      {saveImport.status === 'loading' && <p className="save-transfer-status" role="status"><LoaderCircle className="spin" /><span>正在校验存档<span className="save-file-name">{saveImport.fileName}</span></span></p>}
      {saveImport.status === 'error' && <p className="save-transfer-error" role="alert">{saveImport.message}</p>}
      {saveImport.status === 'preview' ? <section className="save-import-preview" data-tour="save-manager">
        <h3 tabIndex={-1} data-modal-autofocus>{saveImport.saved.title}</h3>
        <p className="save-file-name">{saveImport.fileName}</p>
        <dl className="save-import-details">
          <div><dt>章节</dt><dd>{saveImport.saved.chapter}</dd></div>
          <div><dt>地点</dt><dd>{saveImport.saved.location}</dd></div>
          <div><dt>阅读进度</dt><dd>第 {saveImport.saved.paragraphIndex + 1} / {saveImport.saved.paragraphs.length} 页</dd></div>
          <div><dt>已做选择</dt><dd>{saveImport.saved.choiceCount} 次</dd></div>
          <div><dt>已获线索</dt><dd>{saveImport.saved.clues.length} 条</dd></div>
          <div><dt>保存时间</dt><dd>{prettyTime(saveImport.saved.savedAt)}</dd></div>
        </dl>
        <label className="save-import-target" htmlFor="import-save-slot">导入位置<select id="import-save-slot" value={importTarget ?? ''} onChange={(event) => setImportTarget(event.target.value === '' ? null : Number(event.target.value))}>
          <option value="">选择手动存档位置</option>
          {[0, 1, 2].map((index) => <option value={index} key={index}>存档 {pad(index + 1)} · {manualSaves[index]?.title ?? '空白'}</option>)}
        </select></label>
        {importTarget !== null && manualSaves[importTarget] && <p className="save-overwrite-notice">确认后将覆盖存档 {pad(importTarget + 1)}《{manualSaves[importTarget]!.title}》，原进度无法撤回。</p>}
        {saveImport.error && <p className="save-transfer-error" role="alert">{saveImport.error}</p>}
      </section> : <div className="save-slots" data-tour="save-manager">
        <SaveSlot label="A" saved={autoSave} isAuto loading={loadingSave} onLoad={() => autoSave && void loadSave(autoSave)} onExport={() => autoSave && exportSave(autoSave)} />
        {[0, 1, 2].map((index) => <SaveSlot key={index} label={pad(index + 1)} saved={manualSaves[index]} loading={loadingSave} canSave={Boolean(session)} onLoad={() => manualSaves[index] && void loadSave(manualSaves[index]!)} onSave={() => writeSave(index)} onDelete={() => deleteSave(index)} onExport={() => manualSaves[index] && exportSave(manualSaves[index]!)} />)}
      </div>}
    </Modal>}

    {modal === 'journal' && session && <Modal title="随身手记" onClose={() => setModal(null)} large className="journal-modal">
      <div className="journal-tabs" role="tablist" aria-label="手记栏目" onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
        const index = tabs.indexOf(event.target as HTMLButtonElement);
        if (index < 0) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        tabs[next].click(); tabs[next].focus();
      }}>
        {([{ id: 'progress', label: '行动台账' }, { id: 'clues', label: `线索 / ${pad(session.clues.length)}` }, { id: 'notes', label: '我的笔记' }, { id: 'history', label: '剧情回看' }] as const).map(tab => <button key={tab.id} id={`journal-tab-${tab.id}`} role="tab" aria-selected={journalTab === tab.id} aria-controls="journal-panel" tabIndex={journalTab === tab.id ? 0 : -1} className={journalTab === tab.id ? 'active' : ''} onClick={event => { setJournalTab(tab.id); event.currentTarget.closest('.modal-body')?.scrollTo(0, 0); }}>{tab.label}</button>)}
      </div>
      <div className="journal-panel" id="journal-panel" role="tabpanel" aria-labelledby={`journal-tab-${journalTab}`} tabIndex={0}>
      {journalTab === 'progress' ? <OperationJournal session={session} onOpenSource={openSourceAt} /> : journalTab === 'clues' ? session.clues.length ? <div className="clue-list">{session.clues.map((clue, index) => <article className="clue-entry" key={clue}><FileText size={18} /><div><h3>{clueLabel(session.world.id, clue)}</h3><p>线索 {pad(index + 1)} · 已收入这条时间线</p>{session.world.sourcePassages?.filter(passage => passage.clues?.includes(clue)).map(passage => <button key={passage.id} className="text-button clue-source-link" data-source-passage={passage.id} aria-label={`查看原作：${passage.label}`} onClick={() => openSourceAt(passage)}><BookOpen size={14} />{passage.label}</button>)}</div></article>)}</div>
        : <div className="empty-state"><Search size={25} /><h2>尚未发现线索</h2><p>有些答案藏在看似无关紧要的细节里。</p></div>
        : journalTab === 'notes' ? <textarea className="notes-input" aria-label="当前故事的个人笔记" placeholder="把值得记住的事写在这里……" value={notes[session.world.id] ?? ''} onChange={(event) => setNotes({ ...notes, [session.world.id]: event.target.value })} />
        : <div>{session.history.map((entry, index) => <article className="history-entry" key={`${entry.nodeId}-${index}`}>
          <h3>{pad(index + 1)} / {entry.title} · {entry.speaker}</h3><p>{entry.text}</p>
          {entry.choice && <div className="history-decision"><small>你选择了：{entry.choice}</small><button className="text-button" disabled={session.rewindsRemaining === 0} onClick={() => requestRewind(index)}><Undo2 />{session.rewindsRemaining === 0 ? '回溯次数已用完' : '从这里重选'}</button></div>}
          {session.outcomes[index] && <div className="history-outcome"><small>{outcomeChanges(session.outcomes[index]).join(' · ') || '资源与线索未变'}</small>{session.outcomes[index].feedback && <p>{session.outcomes[index].feedback!.text}</p>}{session.outcomes[index].clues.length > 0 && <small>获得：{session.outcomes[index].clues.map(clue => clueLabel(session.world.id, clue)).join('、')}</small>}</div>}
        </article>)}</div>}
      </div>
    </Modal>}

    {modal === 'rewind' && rewindTarget && <Modal title="返回这次选择" onClose={() => { setModal(null); setRewindTarget(null); }} footer={<><button className="secondary-button" onClick={() => { setModal(null); setRewindTarget(null); }}>取消</button><button className="primary-button" onClick={confirmRewind}><Undo2 />返回选择</button></>}><div className="rewind-preview"><h3>{rewindTarget.session.history[rewindTarget.index].title}</h3><p>此前选择：{rewindTarget.session.history[rewindTarget.index].choice}</p>{rewindTarget.session.difficulty === 'challenge' && <p className="rewind-cost">本次消耗 1 次回溯，之后剩余 {Math.max(0, rewindTarget.session.rewindsRemaining - 1)} 次。</p>}<p>将返回这次行动之前。之后获得的资源和线索会随这段进度撤回，当前自动存档会更新；手动存档与已收集结局保留。</p></div></Modal>}

    <div className={capabilitiesOpen ? 'liukan-capabilities-overlay' : undefined} onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') setCapabilitiesOpen(false); }}>{capabilitiesOpen && <LiukanCapabilities onActivityDesk={() => { setCapabilitiesOpen(false); setActivityDeskOpen(true); }} onReadingDesk={() => { setCapabilitiesOpen(false); setReadingDesk({}); }} onClose={() => setCapabilitiesOpen(false)} onOpenSource={url => { setCapabilitiesOpen(false); setZhihuReadingPost(null); setZhihuWorkspaceUrl(url); setZhihuWorkspaceOpen(true); }} />}</div>
    {activityDeskOpen && <LiukanActivityDesk playerId={companionProgress?.playerId ?? 'local-player'} onClose={() => setActivityDeskOpen(false)} onProject={showCompanionProject} onOpenMemories={() => { setActivityDeskOpen(false); returnToLibrary(); setView('endings'); }} onReadPost={post => { setActivityDeskOpen(false); setZhihuReadingPost(post.candidate); setZhihuWorkspaceOpen(true); }} />}
    {readingDesk && <LiukanReadingDesk onProject={showCompanionProject} initialPostId={readingDesk.postId} onClose={() => setReadingDesk(null)} onReadPost={post => { setReadingDesk(null); setZhihuReadingPost(post.candidate); setZhihuWorkspaceOpen(true); }} />}
    <LiukanTour open={tourOpen} onClose={closeTour} onNavigate={navigateTour} reducedMotion={settings.reducedMotion} />
    {gameError && <Modal title="这一页暂时无法继续" onClose={() => setGameError('')} footer={<button className="primary-button" onClick={() => { setGameError(''); returnToLibrary(); }}>回到书库 <Library size={14} /></button>}><p className="inline-error" role="alert">{gameError}</p></Modal>}
    {zhihuWorkspaceOpen && <ZhihuWorkspace initialUrl={zhihuWorkspaceUrl} onClose={() => setZhihuWorkspaceOpen(false)} initialPost={zhihuReadingPost} />}
    {((!redrainDetail && !modal) || tourOpen) && <LiuKanShanPet memory={{ completedLevels: redrainEndings.length + endings.length, recentTitles: [...endings.slice(-1).map(item => item.title), ...redrainEndings.slice(-1).map(item => item.title)] }} onActivityDesk={() => { setCapabilitiesOpen(false); setReadingDesk(null); setActivityDeskOpen(true); }} onReadingDesk={postId => { setCapabilitiesOpen(false); setReadingDesk({ postId }); }} onCapabilities={() => setCapabilitiesOpen(true)} onStartGuide={() => setTourOpen(true)} onReadPost={post => { setZhihuReadingPost(post.candidate); setZhihuWorkspaceOpen(true); }} onProject={showCompanionProject} progress={companionProgress} worldTitle={session?.world.title ?? (redrainActive ? redrainStory.title : undefined)} isEnding={Boolean(session?.node.ending)} reducedMotion={settings.reducedMotion} />}
    {toast && !session && !modal && !selectedStory && <div className="toast" role="status"><Check size={15} />{toast}</div>}
  </div></Suspense>;
}

function SaveSlot({ label, saved, isAuto = false, canSave = false, loading, onLoad, onSave, onDelete, onExport }: {
  label: string; saved?: SavedGame | null; isAuto?: boolean; canSave?: boolean; loading: boolean;
  onLoad: () => void; onSave?: () => void; onDelete?: () => void; onExport: () => void;
}) {
  return <article className="save-slot"><span className="save-slot-number">{label}</span><div><h3>{saved?.title ?? (isAuto ? '还没有自动存档' : '空白存档')}</h3><p>{saved ? `${saved.chapter} · ${saved.location}` : isAuto ? '进入故事后自动记录进度' : '这一页等待写下新的选择'}{saved && <><br />{prettyTime(saved.savedAt)} · {saved.choiceCount} 次选择{isAuto ? ' · 自动保存' : ''}</>}</p></div><div className="save-slot-actions">{saved && <button className="secondary-button" onClick={onLoad} disabled={loading}>{loading ? <LoaderCircle className="spin" /> : <BookOpen />}载入</button>}{canSave && <button className="secondary-button" onClick={onSave}><Save />保存</button>}{saved && <IconButton label={isAuto ? '导出自动存档' : `导出存档 ${label}`} onClick={onExport}><Download /></IconButton>}{saved && !isAuto && <IconButton label={`删除存档 ${label}`} onClick={onDelete!}><Trash2 /></IconButton>}</div></article>;
}

declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => void;
  }
}

export default App;
