import { accountLocalStorage } from './account-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, Download, Maximize2, RotateCcw, Save, Settings2, Upload } from 'lucide-react';
import type { Settings } from './game';
import { normalizeSave, summarizeSave, endingRecords, parseTransfer, mergeSaveEndings, MAX_SAVE_BYTES } from '../shared/redrain-state.mjs';
import type { RedRainSave } from '../shared/redrain-state.mjs';
import './redrain.css';

export const REDRAIN_ID = 'redrain-rebirth-week';
export const REDRAIN_KEY = 'redleaf.redrain.v1';
export const REDRAIN_CHANNEL = 'redleaf:redrain:v1';
export const redrainStory = {
  id: REDRAIN_ID, title: '末日的45度角躺平：重生周', author: 'y甜酱不闲',
  description: '重回灾变前七天，你能否留住身边的人？阅读剧情、选择分支，走向属于你的结局。',
  labels: ['科幻', '末日', '文字冒险'], playable: true,
  sourceUrl: 'https://www.zhihu.com/question/540354406/answer/2588140006',
  originalUrl: 'https://www.zhihu.com/question/540354406/answer/2588140006',
  cover: '/games/redrain/public/assets/v6/retro-anime/prologue/01.png',
};
export function readRedRainSave(): RedRainSave | null {
  try { const text = accountLocalStorage.getItem(REDRAIN_KEY); return text ? normalizeSave(JSON.parse(text)) : null; }
  catch { return null; }
}
export function storeRedRainSave(save: unknown, replaceUnreadable = false): RedRainSave {
  const text = accountLocalStorage.getItem(REDRAIN_KEY);
  // A damaged or newer save must remain available for recovery instead of being overwritten by a fresh session.
  let previous: RedRainSave | null = null;
  try { previous = text ? normalizeSave(JSON.parse(text)) : null; }
  catch { if (!replaceUnreadable) throw new Error('本机原存档无法读取，已保留原文件；可在存档页确认导入备份。'); }
  const merged = mergeSaveEndings(save, previous);
  accountLocalStorage.setItem(REDRAIN_KEY, JSON.stringify(merged));
  return merged;
}
export function redRainSummary(save: RedRainSave) {
  const summary = summarizeSave(save);
  return summary;
}
export function redRainEndings(save: RedRainSave | null) { return save ? endingRecords(save) : []; }
export function downloadRedRain(save: RedRainSave) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(normalizeSave(save), null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = '赤页-重生周-存档.json';
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function RedRainBackup({ save }: { save: RedRainSave }) {
  const [copied, setCopied] = useState('');
  const text = JSON.stringify(normalizeSave(save), null, 2);
  return <details className="redrain-backup"><summary>复制存档备份</summary>
    <p>可以复制下方全文，保存为 .json 文件后导入。</p>
    <textarea aria-label="重生周存档备份文本" readOnly value={text} onFocus={event => event.currentTarget.select()} />
    <button className="secondary-button" onClick={() => { void navigator.clipboard.writeText(text).then(() => setCopied('存档文本已复制。')).catch(() => setCopied('请选中上方全文，使用浏览器的复制功能。')); }}>复制全文</button>
    {copied && <p role="status">{copied}</p>}
  </details>;
}
export function RedRainSaveTools({ save, onLoad, onSaved }: {
  save: RedRainSave | null; onLoad: () => void; onSaved: (save: RedRainSave) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const importRequest = useRef(0);
  const [preview, setPreview] = useState<RedRainSave | null>(null);
  const [error, setError] = useState('');
  const importFile = async (file: File) => {
    const request = ++importRequest.current;
    setError(''); setPreview(null);
    try {
      if (file.size > MAX_SAVE_BYTES) throw new Error('存档文件过大。');
      const imported = parseTransfer(await file.text());
      if (request === importRequest.current) setPreview(imported);
    } catch (e) { if (request === importRequest.current) setError(e instanceof Error ? e.message : '存档无法读取。'); }
  };
  useEffect(() => () => { importRequest.current++; }, []);
  return <section className="redrain-save-tools" aria-label="重生周存档">
    <h3>{redrainStory.title}</h3>
    <p>{save ? summaryLabel(save) : '本作独立保存进度，不占用其他故事的存档。'}</p>
    <div className="redrain-actions">
      {save && <button className="secondary-button" onClick={onLoad}><BookOpen size={15} />继续重生周</button>}
      {save && <button className="secondary-button" onClick={() => downloadRedRain(save)}><Download size={15} />导出重生周存档</button>}
      <button className="secondary-button" onClick={() => input.current?.click()}><Upload size={15} />导入重生周存档</button>
      <input type="file" hidden accept=".json,application/json" aria-label="选择重生周存档" ref={input} onChange={e => { const file = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (file) void importFile(file); }} />
    </div>
    <p>迁移旧版进度：在原游戏的浏览器和实际游玩端口打开 /public/migrate-redleaf.html，导出文件后在这里导入。</p>
    {save && <RedRainBackup save={save} />}
    {preview && <div className="redrain-import-preview"><p>{summaryLabel(preview)} · 确认后替换本作当前进度，已有结局保留。</p>
      <button className="primary-button" onClick={() => { try { onSaved(storeRedRainSave(preview, true)); setPreview(null); } catch { setError('浏览器未能保存，当前进度没有被替换。'); } }}>确认导入重生周</button>
      <button className="text-button" onClick={() => { importRequest.current++; setPreview(null); }}>取消</button>
    </div>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
export function summaryLabel(save: RedRainSave): string {
  const summary = summarizeSave(save);
  return typeof summary === 'string' ? summary : [summary.chapter, summary.title, summary.location].filter(Boolean).join(' · ');
}
export function RedRainPlayer({ initialSave, settings, paused, onSaved, onExit, onSettings }: {
  initialSave: RedRainSave | null; settings: Settings; paused: boolean;
  onSaved: (save: RedRainSave) => void; onExit: () => void; onSettings: () => void;
}) {
  const [sessionId] = useState(() => crypto.randomUUID());
  const frame = useRef<HTMLIFrameElement>(null);
  const latest = useRef(initialSave);
  const initial = useRef(initialSave);
  const settingsRef = useRef(settings);
  const callbacks = useRef({ onSaved, onExit });
  const pending = useRef(new Map<string, RedRainSave>());
  const [ready, setReady] = useState(false);
  const unsaved = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [retry, setRetry] = useState(0);
  settingsRef.current = settings;
  callbacks.current = { onSaved, onExit };
  const send = useCallback((type: string, payload: Record<string, unknown> = {}) => {
    frame.current?.contentWindow?.postMessage({ channel: REDRAIN_CHANNEL, sessionId, type, ...payload }, location.origin);
  }, [sessionId]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      const message = event.data;
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow ||
          message?.channel !== REDRAIN_CHANNEL || message.sessionId !== sessionId) return;
      if (message.type === 'ready') { send('restore', { save: initial.current, settings: settingsRef.current }); return; }
      if (message.type === 'restored') { setReady(true); if (!unsaved.current) setError(''); return; }
      if (message.type === 'error') { setError(typeof message.message === 'string' ? message.message : '游戏暂时无法读取进度。'); return; }
      if (message.type === 'checkpoint') {
        if (typeof message.requestId !== 'string' || message.requestId.length > 100) return;
        pending.current.delete(message.requestId);
        try {
          // Keep valid live progress available for export and reload even if browser storage is full.
          const current = mergeSaveEndings(message.save, latest.current);
          latest.current = current; initial.current = current; unsaved.current = true;
          const save = storeRedRainSave(current);
          latest.current = save; initial.current = save;
          unsaved.current = false;
          callbacks.current.onSaved(save);
          pending.current.set(message.requestId, save);
          if (pending.current.size > 12) pending.current.delete(pending.current.keys().next().value!);
          send('saved', { requestId: message.requestId, ok: true });
          setReady(true); setError(''); setNotice('进度已保存');
        } catch (e) {
          const detail = e instanceof Error ? e.message : '浏览器未能保存进度。';
          send('saved', { requestId: message.requestId, ok: false, error: detail });
          setError(`${detail} 当前进度仍保留在本页，可以先导出备份。`);
        }
      }
      if (message.type === 'exit' && pending.current.has(message.requestId)) {
        pending.current.delete(message.requestId);
        callbacks.current.onExit();
      }
      if (message.type === 'request-source') window.open(redrainStory.originalUrl, '_blank', 'noopener,noreferrer');
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [send, sessionId]);
  useEffect(() => { if (ready) send('settings', { settings, paused }); }, [ready, settings, paused, send]);
  useEffect(() => {
    if (ready) return;
    const timer = setTimeout(() => setError('主线尚未完成加载，可重新加载；已有存档会保留。'), 15000);
    return () => clearTimeout(timer);
  }, [ready, retry]);
  useEffect(() => {
    window.render_game_to_text = () => {
      try { return frame.current?.contentWindow?.render_game_to_text?.() ?? JSON.stringify({ mode: 'redrain-loading' }); }
      catch { return JSON.stringify({ mode: 'redrain-loading' }); }
    };
    window.advanceTime = (ms: number) => frame.current?.contentWindow?.advanceTime?.(ms);
    return () => { try { send('settings', { settings: settingsRef.current, paused: true }); } catch {} };
  }, [send]);
  useEffect(() => {
    const persistBeforeUnload = () => {
      try {
        const child = frame.current?.contentWindow as (Window & { get_redleaf_snapshot?: () => RedRainSave | null }) | null;
        const snapshot = child?.get_redleaf_snapshot?.();
        if (snapshot) storeRedRainSave(snapshot);
      } catch { /* The live page already reports storage failures and offers export. */ }
    };
    window.addEventListener('pagehide', persistBeforeUnload);
    return () => window.removeEventListener('pagehide', persistBeforeUnload);
  }, []);
  const requestExit = () => {
    if (!ready) {
      if (unsaved.current) { setError('最新进度尚未保存，请先导出备份或等待重新加载完成。'); return; }
      onExit(); return;
    }
    setNotice('正在保存并返回…');
    send('command', { command: 'exit' });
  };
  return <section className="redrain-player" aria-label="重生周文字冒险">
    <header className="redrain-topbar">
      <button className="text-button" onClick={requestExit}><ArrowLeft size={16} />返回书库</button>
      <div className="redrain-player-title"><b>{redrainStory.title}</b><small>{notice || '文字冒险 · 互动改编'}</small></div>
      <nav className="redrain-actions" aria-label="重生周工具栏">
        <a className="text-button" href={redrainStory.originalUrl} target="_blank" rel="noreferrer"><BookOpen size={17} />原作</a>
        <button className="text-button" onClick={() => { send('snapshot'); setNotice('正在保存…'); }} disabled={!ready} aria-label="保存重生周"><Save size={17} /></button>
        <button className="text-button" onClick={() => latest.current && downloadRedRain(latest.current)} disabled={!latest.current} aria-label="导出重生周存档"><Download size={17} /></button>
        <button className="text-button" onClick={onSettings} aria-label="阅读设置"><Settings2 size={17} /></button>
        <button className="text-button" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void frame.current?.parentElement?.requestFullscreen().catch(() => setError('当前浏览器无法进入全屏。')); }} aria-label="全屏"><Maximize2 size={17} /></button>
      </nav>
    </header>
    {error && <div className="redrain-error" role="alert">{error}<button className="text-button" onClick={() => { pending.current.clear(); setReady(false); setError(''); setRetry(x => x + 1); }}><RotateCcw size={15} />重新加载</button>{latest.current && <button className="text-button" onClick={() => downloadRedRain(latest.current!)}>导出当前进度</button>}{latest.current && <RedRainBackup save={latest.current} />}</div>}
    {!ready && !error && <p className="redrain-loading" role="status">正在翻开重生周…</p>}
    <iframe key={retry} ref={frame} title="末日的45度角躺平：重生周" src={`/games/redrain/index.html?embedded=1&session=${sessionId}`} allow="fullscreen" />
  </section>;
}
