import { ArrowUpRight, BookOpen, Check, Circle, CircleAlert, Package } from 'lucide-react';
import type { SourcePassage } from '../shared/types';
import type { Session } from './game';
import { operationJournalViews } from './operation-journal';
import { visibleSourcePassages } from './source-reader';

export function OperationJournal({ session, onOpenSource }: { session: Session; onOpenSource: (passage: SourcePassage) => void }) {
  const journals = operationJournalViews(session);
  const passages = visibleSourcePassages(session);
  return <div className="operation-journal">
    <section className="journal-current">
      <p className="journal-caption">{session.node.ending ? '本次结果' : session.node.chapter}</p>
      <h3>{session.node.ending?.title ?? session.node.title}</h3>
      <p>{session.node.ending ? '这条时间线已经收束。' : session.world.objective}</p>
      <dl className="journal-balances">{session.world.resources?.map(resource => <div key={resource.id}><dt>{resource.label}</dt><dd>{session.resources[resource.id]} <span>/ {resource.max}</span></dd></div>)}</dl>
    </section>
    {passages.length > 0 && <section className="journal-sources" aria-label="原作依据"><h3>原作依据</h3>{passages.map(passage => <button key={passage.id} data-source-passage={passage.id} onClick={() => onOpenSource(passage)} aria-label={`查看原作：${passage.label}`}><BookOpen size={16} /><span>{passage.label}</span><ArrowUpRight size={16} /></button>)}</section>}
    {journals.map(journal => <section className="operation-track" key={journal.id} aria-label={journal.title}>
      <header className="operation-heading"><h3>{journal.title}</h3><span>{({ active: '进行中', paused: '已离开', closed: '已收束' })[journal.status]}</span></header>
      <p className="operation-introduction">{journal.introduction}</p>
      {journal.cargo && <div className="cargo-manifest" aria-label="本班配载">
        <div className="cargo-heading"><Package size={16} /><b>{journal.cargo.closed ? '本班装载记录' : '本班已装'}</b><span>{journal.cargo.used} / {journal.cargo.capacity} 格</span></div>
        <div className="cargo-slots" role="img" aria-label={`已装 ${journal.cargo.used} 格，未装 ${journal.cargo.capacity - journal.cargo.used} 格`} style={{ gridTemplateColumns: `repeat(${journal.cargo.capacity}, minmax(0, 1fr))` }}>
          {Array.from({ length: journal.cargo.capacity }, (_, index) => {
            let boundary = 0;
            const load = journal.cargo!.loads.find(candidate => { boundary += candidate.slots; return index < boundary; });
            return <div key={index} className={`cargo-slot ${load ? 'occupied' : ''}`}><small>{String(index + 1).padStart(2, '0')}</small>{load ? <><Package size={18} /><span>{load.label}</span></> : <span>空</span>}</div>;
          })}
        </div>
        <p>{journal.cargo.closed ? `本班已结束，现有货位为 ${journal.cargo.remaining} 格。` : `本班剩余 ${journal.cargo.remaining} 格。封舱后不拆货重配，卸货也不增加本班名额。`}</p>
      </div>}
      <ol className="operation-items">{journal.items.map(item => <li key={item.id} data-tone={item.tone} data-item-id={item.id}>
        <span className="operation-marker" aria-hidden="true">{item.tone === 'recorded' ? <Check size={16} /> : item.tone === 'gap' ? <CircleAlert size={16} /> : <Circle size={14} />}</span>
        <div><div className="operation-item-heading"><h4>{item.title}</h4><span>{item.label}</span></div><p>{item.detail}</p>
          {item.evidence.length > 0 && <details className="operation-evidence"><summary>依据 · {item.evidence.length}</summary><ul>{item.evidence.map(clue => <li key={clue}>{clue}</li>)}</ul></details>}
        </div>
      </li>)}</ol>
    </section>)}
  </div>;
}
