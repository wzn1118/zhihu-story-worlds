import { ExternalLink, Search } from 'lucide-react';
import { sourceReadingUrl, sourceSearchUrl, type OriginalSourceReference } from '../shared/zhihu-source';
import './SourceLinks.css';

export function SourceLinks({ source, compact = false }: { source: OriginalSourceReference; compact?: boolean }) {
  const href = sourceReadingUrl(source);
  const favoriteSummary = source.origin?.contentScope === 'favorite-summary';
  return <div className={`original-source-links ${compact ? 'compact' : ''}`}>
    <a className={compact ? 'text-button original-source-link' : 'secondary-button original-source-link'} href={href ?? sourceSearchUrl(source)} rel="noopener noreferrer">
      {href ? <ExternalLink size={15} /> : <Search size={15} />}{href ? favoriteSummary ? '在知乎查看收藏原文' : '前往知乎阅读全文' : '在知乎查找原作'}
    </a>
    {!compact && <p className="source-footnote">{favoriteSummary ? '这里保存的是知乎收藏接口返回的摘要，并非完整原文；可前往知乎核对原内容。' : href ? '在当前页打开知乎原作；返回赤页后，可从自动存档继续。' : '暂未核实原作直达链接，可按作品名和作者在知乎查找。这里保留的正文是节选。'}</p>}
  </div>;
}
