import { ExternalLink, Search } from 'lucide-react';
import { sourceReadingUrl, sourceSearchUrl, type OriginalSourceReference } from '../shared/zhihu-source';
import './SourceLinks.css';

export function SourceLinks({ source, compact = false }: { source: OriginalSourceReference; compact?: boolean }) {
  const href = sourceReadingUrl(source);
  return <div className={`original-source-links ${compact ? 'compact' : ''}`}>
    <a className={compact ? 'text-button original-source-link' : 'secondary-button original-source-link'} href={href ?? sourceSearchUrl(source)} rel="noopener noreferrer">
      {href ? <ExternalLink size={15} /> : <Search size={15} />}{href ? '前往知乎阅读全文' : '在知乎查找原作'}
    </a>
    {!compact && <p className="source-footnote">{href ? '在当前页打开知乎原作；返回赤页后，可从自动存档继续。' : '暂未核实原作直达链接，可按作品名和作者在知乎查找。这里保留的正文是节选。'}</p>}
  </div>;
}
