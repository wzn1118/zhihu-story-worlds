export function BookJacket({ title, author, className = '' }: { title: string; author?: string; className?: string }) {
  const tone = [...title].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % 5;
  return <div className={`book-jacket ${className}`} data-tone={tone} role="img" aria-label={`${title} · 排印封面`}>
    <span className="book-jacket-series">赤页 · 故事档案</span><span className="book-jacket-orbit" aria-hidden="true" />
    <strong>{title}</strong>{author && <small>{author}</small>}
  </div>;
}
