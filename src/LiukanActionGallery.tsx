import { useId, useState } from 'react';
import { ArrowUpRight, Play, RotateCcw, Search, X } from 'lucide-react';
import { LIUKAN_ACTIONS, LIUKAN_ACTION_GROUPS, getLiukanAction, performLiukanAction, type LiukanActionGroup, type LiukanActionId } from './liukan-actions';
import { LiuKanShanAvatar } from './LiuKanShanAvatar';
import './LiukanActionGallery.css';

export interface LiukanActionGalleryProps { onClose?: () => void; onAction?: (action: LiukanActionId) => void; reducedMotion?: boolean }

export function LiukanActionGallery({ onClose, onAction, reducedMotion = false }: LiukanActionGalleryProps) {
  const [selected, setSelected] = useState<LiukanActionId>('hello');
  const [group, setGroup] = useState<LiukanActionGroup | '全部'>('全部');
  const [query, setQuery] = useState('');
  const [playKey, setPlayKey] = useState(0);
  const [stopped, setStopped] = useState(false);
  const [notice, setNotice] = useState('');
  const headingId = useId();
  const current = getLiukanAction(selected);
  const visible = LIUKAN_ACTIONS.filter(item => (group === '全部' || item.group === group) && `${item.label} ${item.description}`.includes(query.trim()));
  const choose = (id: LiukanActionId) => { setSelected(id); setStopped(false); setPlayKey(key => key + 1); setNotice(''); };
  const send = () => { if (onAction) onAction(selected); else performLiukanAction(selected); setNotice(`已经请看山表演「${current.label}」`); };

  return <section className="liukan-gallery" aria-labelledby={headingId} data-testid="liukan-action-gallery">
    <header className="liukan-gallery-heading">
      <div><span className="liukan-gallery-kicker">和看山熟悉一点</span><h2 id={headingId}>他的小动作，你都见过吗？</h2><p>挥爪、带路，或陪你想一会儿，点一个看看。</p></div>
      {onClose && <button className="liukan-gallery-close" type="button" onClick={onClose} aria-label="关闭动作展台"><X size={18} /></button>}
    </header>
    <div className="liukan-gallery-content">
      <div className="liukan-gallery-stage">
        <div className="liukan-gallery-stage-top"><span>{current.group}</span><span>{String(LIUKAN_ACTIONS.findIndex(item => item.id === selected) + 1).padStart(2, '0')} / {LIUKAN_ACTIONS.length}</span></div>
        <div className="liukan-gallery-floor"><LiuKanShanAvatar action={selected} size={224} playKey={playKey} reducedMotion={reducedMotion || stopped} /></div>
        <div className="liukan-gallery-caption"><h3>{current.label}</h3><p>{current.description}</p></div>
        <div className="liukan-gallery-playback">
          <button type="button" onClick={() => choose(selected)}><RotateCcw size={14} />再看一次</button>
          <button type="button" aria-pressed={stopped} onClick={() => { if (stopped) setPlayKey(key => key + 1); setStopped(value => !value); }}>{stopped ? <Play size={14} /> : <span aria-hidden="true">Ⅱ</span>}{stopped ? '播放动作' : '静止观看'}</button>
        </div>
        <button className="liukan-gallery-send" type="button" onClick={send}>让身边的看山表演<ArrowUpRight size={15} /></button>
        <p className="liukan-gallery-notice" role="status">{notice || `6 份原版动画 · ${LIUKAN_ACTIONS.length} 种动作编排`}</p>
      </div>
      <div className="liukan-gallery-catalogue">
        <label className="liukan-gallery-search"><Search size={15} /><input aria-label="搜索看山动作" placeholder="找一个动作，比如：带路" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <div className="liukan-gallery-filters" role="group" aria-label="按动作类型筛选">{(['全部', ...LIUKAN_ACTION_GROUPS] as const).map(item => <button key={item} type="button" aria-pressed={group === item} onClick={() => setGroup(item)}>{item}</button>)}</div>
        <div className="liukan-gallery-list" role="group" aria-label="看山动作目录">
          {visible.map(item => <button className="liukan-gallery-item" key={item.id} type="button" aria-pressed={selected === item.id} onClick={() => choose(item.id)} data-action-id={item.id}>
            <img src={`/assets/liukan/${item.asset}.png`} width="64" height="64" loading="lazy" decoding="async" alt="" />
            <span><b>{item.label}</b><small>{item.group} · {(item.duration / 1000).toFixed(1)} 秒</small></span><span className="liukan-gallery-item-play" aria-hidden="true"><Play size={12} /></span>
          </button>)}
          {visible.length === 0 && <p className="liukan-gallery-no-result">还没有这个名字的动作，换个词找找吧。</p>}
        </div>
      </div>
    </div>
  </section>;
}
