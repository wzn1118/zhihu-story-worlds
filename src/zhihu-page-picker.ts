export interface ZhihuPageSelection { title: string; author: string; text: string; sourceUrl: string }
export const zhihuPageFragment = '#zhihu-page=';

export function readZhihuPageSelection(fragment: string): ZhihuPageSelection | null {
  if (!fragment.startsWith(zhihuPageFragment)) return null;
  if (fragment.length > 1500000) throw new Error('这次网页选文太长，请选取120000字以内的内容。');
  try {
    const value = JSON.parse(decodeURIComponent(fragment.slice(zhihuPageFragment.length))) as ZhihuPageSelection;
    if (!value || typeof value.title !== 'string' || typeof value.author !== 'string' || typeof value.text !== 'string' || typeof value.sourceUrl !== 'string') throw new Error();
    return value;
  } catch { throw new Error('网页传来的选文没有读完整，请回原页面重新选择。'); }
}

// This function becomes a user-clicked bookmark. Keep it self-contained: it reads
// visible answer text and navigates to a preview, without cookies or page scripts.
export function pickZhihuPage(workshopOrigin: string) {
  if (!['www.zhihu.com', 'zhuanlan.zhihu.com'].includes(location.hostname)) { alert('请在知乎回答或文章页面使用“带回赤页”。'); return; }
  document.getElementById('redleaf-page-picker')?.remove();
  const selection = window.getSelection(), selectedText = selection?.toString() ?? '';
  const anchor = selection?.anchorNode;
  const selectedRoot = (anchor instanceof Element ? anchor : anchor?.parentElement)?.closest('.AnswerItem, article, .Post-Main');
  const roots = selectedText.trim().length >= 80 && selectedRoot ? [selectedRoot] : Array.from(document.querySelectorAll('.AnswerItem'));
  if (!roots.length && document.querySelector('.Post-RichTextContainer')) roots.push(document.querySelector('.Post-Main') ?? document.body);
  const rows = roots.flatMap(root => {
    const richText = root.querySelector<HTMLElement>('.RichContent-inner .RichText, .RichContent-inner .RichContent, .RichText, .Post-RichTextContainer');
    const text = selectedText.trim().length >= 80 && (root === selectedRoot || roots.length === 1) ? selectedText : richText?.innerText ?? '';
    const rawUrl = root.querySelector<HTMLMetaElement>('meta[itemprop="url"]')?.content || root.querySelector<HTMLAnchorElement>('a[href*="/answer/"]')?.href || location.href;
    let sourceUrl = ''; try { const u = new URL(rawUrl, location.href); sourceUrl = u.origin + u.pathname.replace(/\/$/, ''); } catch { return []; }
    if (!/^https:\/\/(?:www\.zhihu\.com\/question\/\d{5,24}\/answer\/\d{5,24}|zhuanlan\.zhihu\.com\/p\/\d{5,24})$/.test(sourceUrl)) return [];
    const title = (document.querySelector<HTMLElement>('.QuestionHeader-title, .Post-Title, h1')?.innerText || document.title.replace(/\s*[-–]\s*知乎$/, '')).trim();
    const author = (root.querySelector<HTMLElement>('.AuthorInfo-name, .UserLink-link, [itemprop="author"] [itemprop="name"]')?.innerText || root.querySelector<HTMLMetaElement>('meta[itemprop="name"]')?.content || '页面未显示作者').trim();
    return text.trim().length >= 80 ? [{ title, author, text, sourceUrl }] : [];
  });
  const shell = document.createElement('section'); shell.id = 'redleaf-page-picker'; shell.setAttribute('role', 'dialog'); shell.setAttribute('aria-label', '选择带回赤页的故事');
  shell.style.cssText = 'position:fixed;inset:20px 20px auto auto;z-index:2147483647;width:min(440px,calc(100vw - 40px));max-height:calc(100vh - 40px);overflow:auto;background:#101b2d;color:#f5f8ff;border:1px solid #4d75a8;box-shadow:0 24px 90px #0009;border-radius:20px;padding:24px;box-sizing:border-box;font:14px/1.7 system-ui;text-align:left;';
  const header = document.createElement('header'); header.style.cssText = 'display:flex;justify-content:space-between;gap:16px;align-items:center;margin-bottom:10px';
  const title = document.createElement('strong'); title.textContent = '把这一页，带回赤页'; title.style.cssText = 'font-size:20px;letter-spacing:.03em';
  const close = document.createElement('button'); close.textContent = '×'; close.setAttribute('aria-label', '关闭选篇'); close.style.cssText = 'background:none;border:0;color:white;font-size:24px;cursor:pointer'; close.onclick = () => shell.remove(); header.append(title, close); shell.append(header);
  const note = document.createElement('p'); note.textContent = rows.length ? '选择当前已展开的回答；带回后会先显示原文预览。' : '请展开一篇回答或文章，或先选中至少80字正文，再点一次书签。'; note.style.color = '#afc7e6'; shell.append(note);
  for (const row of rows) {
    const button = document.createElement('button'); button.style.cssText = 'display:block;width:100%;text-align:left;background:#1a2e49;border:1px solid #315478;color:#f5f8ff;border-radius:12px;padding:16px;margin-top:12px;cursor:pointer;font:inherit;';
    const heading = document.createElement('strong'); heading.textContent = row.author; const detail = document.createElement('div'); detail.textContent = `${row.text.length.toLocaleString()} 字 · ${row.text.slice(0, 74)}`; detail.style.cssText = 'margin-top:6px;color:#bdcfe5;font-size:12px'; button.append(heading, detail);
    button.onclick = () => { if (row.text.length > 120000 || row.title.length > 120 || row.author.length > 120) { alert('这篇内容超过导入上限，请选取120000字以内的正文再试。'); return; } location.assign(`${workshopOrigin}/#zhihu-page=${encodeURIComponent(JSON.stringify(row))}`); }; shell.append(button);
  }
  document.body.append(shell);
}

export function zhihuPageBookmarklet(origin: string) {
  const url = new URL(origin);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !['http:', 'https:'].includes(url.protocol)) throw new Error('网页选篇只发送到本机工作台。');
  return `javascript:(${pickZhihuPage.toString()})(${JSON.stringify(url.origin)})`;
}
