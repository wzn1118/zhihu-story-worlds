import { useEffect, useRef, useState } from 'react';
import { BookmarkPlus, Check, ExternalLink, MousePointer2 } from 'lucide-react';
import { zhihuPageBookmarklet } from './zhihu-page-picker';

export function ZhihuPagePicker() {
  const bookmark = useRef<HTMLAnchorElement>(null), [copied, setCopied] = useState(false), [copyError, setCopyError] = useState('');
  useEffect(() => { bookmark.current?.setAttribute('href', zhihuPageBookmarklet(location.origin)); }, []);
  return <section className="zhihu-page-picker" aria-label="从知乎网页选故事">
    <div className="page-picker-heading"><span><MousePointer2 size={18} />从真实网页挑一篇</span><a href="https://www.zhihu.com/search?type=content&q=%E6%82%AC%E7%96%91%E7%9F%AD%E7%AF%87%E5%B7%B2%E5%AE%8C%E7%BB%93">去知乎选篇 · 同页往返 <ExternalLink size={13} /></a></div>
    <p>在知乎展开喜欢的回答，点一下书签，就会在当前标签回到赤页，先预览眼前这段故事。</p>
    <div className="page-picker-actions"><a ref={bookmark} draggable className="page-picker-bookmark" onClick={event => { event.preventDefault(); }}> <BookmarkPlus size={16} />带回赤页</a><span>把左边按钮拖到浏览器书签栏</span></div>
    <details><summary>手机或书签栏未显示</summary><p>复制选篇工具，在浏览器新建书签，把内容粘贴到网址栏；然后在知乎原页面点这个书签。</p><button className="text-button" onClick={() => { setCopyError(''); void navigator.clipboard.writeText(zhihuPageBookmarklet(location.origin)).then(() => setCopied(true)).catch(() => setCopyError('浏览器未允许复制，请把上方“带回赤页”按钮拖到书签栏。')); }}>{copied ? <Check size={14} /> : <BookmarkPlus size={14} />}{copied ? '工具已复制' : '复制选篇工具'}</button>{copyError && <p role="alert">{copyError}</p>}</details>
  </section>;
}
