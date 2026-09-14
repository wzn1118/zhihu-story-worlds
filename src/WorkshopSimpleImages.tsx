import { useEffect, useRef, useState } from 'react';
import { ImagePlus, LoaderCircle, RefreshCw } from 'lucide-react';
import { fetchJson } from './game';

type SimpleImages = {
  provider: 'gpt6-svg'; state: 'disabled' | 'idle' | 'generating' | 'ready' | 'partial' | 'failed';
  worldId: string; worldVersion: string; targetedScenes: number; completed: number; failed: number; errorCode?: string;
};

export function WorkshopSimpleImages({ projectId, version }: { projectId: string; version: string }) {
  const [status, setStatus] = useState<SimpleImages | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const scope = `${projectId}/${version}`, currentScope = useRef(scope), sending = useRef(false);
  currentScope.current = scope;
  const endpoint = `/api/workshop/projects/${projectId}/simple-images?version=${encodeURIComponent(version)}`;
  useEffect(() => {
    let stopped = false, timer: ReturnType<typeof setTimeout>;
    setStatus(null); setError('');
    const refresh = async () => {
      try { const next = await fetchJson<SimpleImages>(endpoint); if (!stopped) { setStatus(next); setError(''); } }
      catch (e) { if (!stopped) setError((e as Error).message); }
      finally { if (!stopped) timer = setTimeout(() => void refresh(), 4000); }
    };
    void refresh();
    return () => { stopped = true; clearTimeout(timer); };
  }, [endpoint]);
  const generate = async () => {
    if (sending.current) return;
    sending.current = true; setBusy(true); setError(''); const requestedScope = scope;
    try { const next = await fetchJson<SimpleImages>(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ retry: true }) }); if (currentScope.current === requestedScope) setStatus(next); }
    catch (e) { if (currentScope.current === requestedScope) setError((e as Error).message); }
    finally { sending.current = false; if (currentScope.current === requestedScope) setBusy(false); }
  };
  const active = status?.state === 'generating', ready = status?.state === 'ready';
  return <section className="workshop-quick-images" aria-label="GPT6 简单插图" data-world-version={version}>
    <header><ImagePlus size={22} /><div><h3>{ready ? 'GPT6 简单插图已就绪' : active ? '正在绘制简单插图' : 'GPT6 简单插图'}</h3><p>文字中转生成 SVG 场景，单独保存；现在就可以玩文字游戏。</p></div></header>
    {status && <p className="quick-image-note">关键场景 {status.completed} / {status.targetedScenes}{status.failed > 0 && ` · ${status.failed} 张待重试`}</p>}
    {!ready && <button className="text-button" disabled={busy || active || !status} onClick={() => void generate()}>{busy || active ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}{active ? '后台配图中' : '生成 / 重试简单插图'}</button>}
    {(error || status?.errorCode) && <p className="workshop-error" role="alert">{error || status?.errorCode} · 文字游戏仍可正常游玩</p>}
  </section>;
}
