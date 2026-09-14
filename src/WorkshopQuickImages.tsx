import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ImagePlus, LoaderCircle, Pause, RefreshCw } from 'lucide-react';
import type { WorkshopImageLaunch } from '../shared/workshop-image-launch';
import { fetchJson } from './game';

export function WorkshopQuickImages({ projectId, version, total }: { projectId: string; version: string; total: number }) {
  const [job, setJob] = useState<WorkshopImageLaunch | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [loaded, setLoaded] = useState(false);
  const scope = `${projectId}/${version}`, current = useRef(scope), sending = useRef(false);
  current.current = scope;
  const endpoint = `/api/workshop/projects/${projectId}/image-launch?version=${encodeURIComponent(version)}`;
  const own = job?.projectId === projectId && job.worldVersion === version ? job : null;
  useEffect(() => {
    let stopped = false, checking = false;
    setJob(null); setError(''); setLoaded(false);
    const refresh = async () => {
      if (checking) return; checking = true;
      try { const next = await fetchJson<WorkshopImageLaunch | null>(endpoint); if (!stopped) { setJob(next); setError(''); } }
      catch (e) { if (!stopped) setError((e as Error).message); }
      finally { checking = false; if (!stopped) setLoaded(true); }
    };
    void refresh(); const timer = setInterval(() => void refresh(), 2000);
    return () => { stopped = true; clearInterval(timer); };
  }, [endpoint]);
  const action = async (pause = false) => {
    if (sending.current) return;
    sending.current = true; setBusy(true); setError(''); const requestedScope = scope;
    try {
      if (pause && own?.batchId) await fetchJson(`/api/workshop/images/${own.batchId}/pause`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      else {
        const next = await fetchJson<WorkshopImageLaunch>(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        if (current.current === requestedScope) setJob(next);
      }
    } catch (e) { if (current.current === requestedScope) setError((e as Error).message); }
    finally { sending.current = false; setBusy(false); }
  };
  const active = own?.state === 'preparing' || own?.state === 'generating';
  const delivered = own?.progress?.generated ?? 0, count = own?.total ?? total;
  const retry = own && ['failed', 'interrupted', 'paused'].includes(own.state);
  const complete = own?.state === 'review' && delivered >= count;
  const label = complete ? own.progress?.rejected ? `图片已返回，${own.progress.rejected}张需要调整` : '图片已返回，等待审核' : own?.state === 'generating' ? '场景正在绘制' : own?.state === 'preparing' ? '正在准备场景分镜' : own?.state === 'paused' ? '已暂停排队' : retry ? '接着上次的进度制作' : '让故事里的场景出现';
  return <section className="workshop-quick-images" data-project-id={projectId} data-world-version={version} aria-label="快速生成插图">
    <header><ImagePlus size={22}/><div><h3>{label}</h3><p>分镜写好一组，就开始画一组，关闭页面也会继续。</p></div></header>
    {own && <><div className="quick-image-counts"><span>分镜 <b>{own.directed}/{count}</b></span><span>图片 <b>{delivered}/{count}</b></span><span>同时绘制 <b>{own.progress?.inFlight ?? 0}/8</b></span></div><progress value={delivered} max={Math.max(1,count)} aria-label="已返回插图"/><p className="quick-image-note">{own.progress?.approved ?? 0} 张通过 · {own.progress?.rejected ?? 0} 张需调整 · {own.progress?.native4k ?? 0} 张原生4K · {own.progress?.queued ?? 0} 张排队中</p></>}
    <div className="workshop-actions"><button type="button" className="primary-button" disabled={!loaded || busy || active || complete} onClick={() => void action()}>{!loaded || busy || active ? <LoaderCircle className="spin" size={17}/> : retry ? <RefreshCw size={17}/> : <ImagePlus size={17}/>} {!loaded ? '读取制作进度' : active ? '后台制作中' : complete ? '本批图片已返回' : retry ? '继续制作插图' : `一键生图 · ${count} 张`}{loaded && !active && !complete && <ArrowRight size={16}/>}</button>{active && own?.batchId && <button className="text-button" type="button" disabled={busy} onClick={() => void action(true)}><Pause size={15}/>暂停排队</button>}</div>
    {!own && <p className="quick-image-note">沿用已配置的生图中转，每张单独绘制；已有图片会复用。</p>}
    {(error || own?.error) && <p className="workshop-error" role="alert">{error || own?.error}</p>}
    {!!own?.progress?.unknownOutcome && <p className="quick-image-note">有 {own.progress.unknownOutcome} 项请求结果待确认，系统会保留记录，不重复提交。</p>}
  </section>;
}
