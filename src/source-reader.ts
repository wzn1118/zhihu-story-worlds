import type { SourcePassage } from '../shared/types';
import type { Session } from './game';

export interface SourceMatch { start: number; end: number }
export interface SourceParagraph { text: string; start: number; end: number }
export interface SourceSearchState {
  query: string;
  count: number;
  activeIndex: number;
  anchorStatus: 'found' | 'missing' | 'ambiguous' | null;
}

export function sourceParagraphs(content: string): SourceParagraph[] {
  return [...content.matchAll(/[^\r\n]+/g)].flatMap(match => {
    const text = match[0].trim();
    if (!text) return [];
    const start = match.index! + match[0].indexOf(text);
    return [{ text, start, end: start + text.length }];
  });
}

export function findSourceMatches(content: string, query: string): SourceMatch[] {
  const term = query.trim();
  if (!term) return [];
  const literal = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...content.matchAll(new RegExp(literal, 'giu'))].map(match => ({ start: match.index!, end: match.index! + match[0].length }));
}

export function sourceSegments(paragraph: SourceParagraph, matches: SourceMatch[]) {
  const segments: { text: string; matchIndex?: number }[] = [];
  let cursor = paragraph.start;
  for (const [index, match] of matches.entries()) {
    const start = Math.max(paragraph.start, match.start), end = Math.min(paragraph.end, match.end);
    if (start >= end) continue;
    if (start > cursor) segments.push({ text: paragraph.text.slice(cursor - paragraph.start, start - paragraph.start) });
    segments.push({ text: paragraph.text.slice(start - paragraph.start, end - paragraph.start), matchIndex: index });
    cursor = end;
  }
  if (cursor < paragraph.end) segments.push({ text: paragraph.text.slice(cursor - paragraph.start) });
  return segments;
}

export function sourceAnchorStatus(content: string, quote: string): SourceSearchState['anchorStatus'] {
  if (!quote.trim()) return 'missing';
  const index = content.indexOf(quote);
  if (index < 0) return 'missing';
  return content.indexOf(quote, index + 1) < 0 ? 'found' : 'ambiguous';
}

export function visibleSourcePassages(session: Session): SourcePassage[] {
  const visited = new Set(session.history.map(entry => entry.nodeId));
  return (session.world.sourcePassages ?? []).filter(passage => passage.nodeIds.some(node => visited.has(node)) || passage.clues?.some(clue => session.clues.includes(clue)));
}
