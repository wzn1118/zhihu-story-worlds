import type { ImportedSource } from '../shared/workshop';
export { defaultGenerationOptions } from '../shared/workshop';
export type { GenerationOptions as WorkshopGenerationOptions } from '../shared/workshop';

export function completeImportedSource(source: ImportedSource): ImportedSource {
  if (source.text.length > 120000) throw new Error('原文最多 120,000 字符，请缩短后再导入。');
  return { ...source, title: source.title.trim() || source.text.trim().split(/\r?\n/)[0].slice(0, 60) || '未命名回答', author: source.author.trim() || '作者未提供' };
}

function sourceReference(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('来源链接需要填写完整的知乎回答或文章地址。'); }
  if (url.protocol !== 'https:' || !['www.zhihu.com', 'zhihu.com', 'zhuanlan.zhihu.com'].includes(url.hostname)) throw new Error('来源链接仅支持 HTTPS 知乎回答或文章地址。');
  const answer = url.pathname.match(/\/answer\/(\d+)/), article = url.pathname.match(/^\/p\/(\d+)/);
  if (!answer && !article) throw new Error('请提供具体回答或文章链接，问题页无法标识这篇回答。');
  url.search = ''; url.hash = '';
  return url.href;
}

export function sourceWithUrl(source: ImportedSource, raw: string): ImportedSource {
  const referenceUrl = sourceReference(raw);
  return referenceUrl ? { ...source, referenceUrl } : source;
}

// Imported files remain data: HTML is parsed off-document and scripts never run.
export function readDroppedSource(raw: string, filename = '', mime = ''): ImportedSource {
  const isJson = /\.json$/i.test(filename) || mime === 'application/json';
  const isHtml = /\.html?$/i.test(filename) || mime === 'text/html';
  let text = raw, title = filename.replace(/\.(txt|md|html?|json)$/i, ''), author = '', referenceUrl: string | undefined;
  if (isJson) {
    let value: Record<string, unknown>;
    try { value = JSON.parse(raw); } catch { throw new Error('JSON 没有读完整，请检查文件内容。'); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('JSON 需要包含一篇回答的 text 或 content 字段。');
    const content = value.text ?? value.content ?? value.excerpt;
    if (typeof content !== 'string') throw new Error('JSON 需要包含文字类型的 text、content 或 excerpt 字段。');
    text = content;
    title = typeof value.title === 'string' ? value.title : title;
    author = typeof value.author === 'string' ? value.author : '';
    const origin = value.origin && typeof value.origin === 'object' ? value.origin as Record<string, unknown> : undefined;
    referenceUrl = sourceReference(value.sourceUrl ?? value.url ?? origin?.sourceUrl);
  } else if (isHtml) {
    const document = new DOMParser().parseFromString(raw, 'text/html');
    document.querySelectorAll('script,style,noscript,iframe,object,template').forEach(node => node.remove());
    title = document.querySelector('h1')?.textContent?.trim() || document.title || title;
    author = document.querySelector('meta[name="author"]')?.getAttribute('content') ?? '';
    referenceUrl = sourceReference(document.querySelector('link[rel="canonical"]')?.getAttribute('href'));
    const body = document.querySelector('.RichContent-inner .RichText') ?? document.querySelector('article') ?? document.querySelector('main') ?? document.body;
    body.querySelectorAll('br').forEach(node => node.replaceWith('\n'));
    body.querySelectorAll('p,div,section,li,h1,h2,h3,blockquote,tr').forEach(node => node.append('\n'));
    text = body.textContent ?? '';
  }
  return completeImportedSource({ title, author, text, scope: 'user-import', ...(referenceUrl ? { referenceUrl } : {}) });
}

// Textarea selections count CRLF as one code unit. Map those offsets back to the
// preserved source before replacing a pasted selection, retaining untouched bytes.
export function pasteSourceText(source: string, start: number, end: number, pasted: string): string {
  const rawOffset = (offset: number) => {
    let raw = 0, normalized = 0;
    while (raw < source.length && normalized < offset) {
      raw += source[raw] === '\r' && source[raw + 1] === '\n' ? 2 : 1;
      normalized++;
    }
    return raw;
  };
  return source.slice(0, rawOffset(start)) + pasted + source.slice(rawOffset(end));
}
