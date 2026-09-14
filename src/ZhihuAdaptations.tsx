import { useEffect, useState } from 'react';
import { ArrowRight, BookOpen, Play } from 'lucide-react';
import type { WorkshopProject } from '../shared/workshop';
import type { ArtBatch } from '../shared/production';
import { AuthorIdentity, ZhihuBadge } from './ZhihuSource';
import { fetchJson } from './game';
import './ZhihuDiscovery.css';

function ArtworkReadiness({ batchId, version }: { batchId?: string; version?: string }) {
  const [progress, setProgress] = useState<ArtBatch['progress'] | null>(null);
  const [failed, setFailed] = useState(false);
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    let live = true;
    setProgress(null); setFailed(false); setWaiting(false);
    if (!batchId) return;
    const refresh = () => fetchJson<ArtBatch>(`/api/art/batches/${encodeURIComponent(batchId)}`)
      .then(batch => { if (live) { setProgress(batch.worldVersion === version ? batch.progress : null); setWaiting(batch.worldVersion !== version); setFailed(false); } }).catch(() => { if (live) { setProgress(null); setFailed(true); } });
    void refresh(); const timer = setInterval(() => void refresh(), 15000);
    return () => { live = false; clearInterval(timer); };
  }, [batchId, version]);
  return <p className="new-adaptation-counts">原生4K画面 · {progress ? `${progress.covered}/${progress.required} 审核通过` : failed ? '进度读取失败' : waiting || !batchId ? '待制作' : '进度读取中'}</p>;
}

export function ZhihuAdaptations({ onProject, onPlay, onRead, preparing }: { onProject: (id: string) => void; onPlay: (id: string) => void; onRead: (id: string) => void; preparing: boolean }) {
  const [projects, setProjects] = useState<WorkshopProject[]>([]), [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    const refresh = () => fetchJson<{ projects: WorkshopProject[] }>('/api/workshop/projects').then(result => {
      if (live) { setProjects(result.projects.filter(project => project.origin?.contentScope === 'search-excerpt')); setError(''); }
    }).catch(e => { if (live) setError((e as Error).message); });
    void refresh(); const timer = setInterval(() => void refresh(), 10000);
    return () => { live = false; clearInterval(timer); };
  }, []);
  if (!projects.length && !error) return null;
  return <section className="zhihu-new-adaptations" aria-label="新接入的知乎故事">
    <header><div><p className="eyebrow">NEW STORIES / 继续写下去</p><h2>新接入的知乎故事</h2></div><ZhihuBadge label="搜索节选改编" /></header>
    {error && <p className="workshop-error" role="alert">制作进度暂未更新：{error}</p>}
    <div className="new-adaptation-list">{projects.map(project => <article key={project.id} data-project-id={project.id}>
      <span className="new-adaptation-state" data-ready={project.playable}>{project.playable ? '文本游戏可玩' : project.status === 'running' ? '正在制作' : project.status === 'idle' ? '原文已保存' : '等待续跑'}</span>
      <h3>{project.title}</h3><AuthorIdentity name={project.author} avatar={project.origin?.authorAvatar} label="原文作者" />
      {project.validation && <p className="new-adaptation-counts">{project.validation.scenes} 场景 / {project.validation.routes} 路线 / {project.validation.endings} 结局</p>}
      {project.playable && <ArtworkReadiness batchId={project.art.batchId} version={project.publishedVersion} />}
      <div className="new-adaptation-actions">{project.playable ? <button className="primary-button" disabled={preparing} onClick={() => onPlay(project.id)}><Play size={14} />开始游戏</button> : <button className="secondary-button" onClick={() => onProject(project.id)}>{project.status === 'idle' ? '制作游戏' : '查看制作'}<ArrowRight size={14} /></button>}<button className="text-button" onClick={() => onRead(project.id)}><BookOpen size={14} />读节选</button></div>
    </article>)}</div>
  </section>;
}
