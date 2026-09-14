import { useSyncExternalStore } from 'react';
import { Palette } from 'lucide-react';

const key = 'redleaf.ui-theme';
type Theme = 'archive' | 'zhihu';
function readTheme(): Theme {
  try { return localStorage.getItem(key) === 'zhihu' ? 'zhihu' : 'archive'; }
  catch { return 'archive'; }
}
let current = readTheme();
const listeners = new Set<() => void>();
function applyTheme(theme: Theme) {
  current = theme;
  document.documentElement.dataset.uiTheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'zhihu' ? '#ffffff' : '#120d0e');
  listeners.forEach(listener => listener());
}
// Apply before React mounts so a saved light theme does not flash dark.
applyTheme(current);
window.addEventListener('storage', event => {
  if (event.key === key || event.key === null) applyTheme(readTheme());
});
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function ThemeSwitch() {
  const theme = useSyncExternalStore(subscribe, () => current);
  const blue = theme === 'zhihu';
  return <button type="button" className="theme-switch" aria-label={blue ? '切换到赤页深色' : '切换到知乎蓝白'}
    aria-pressed={blue} title={blue ? '当前：知乎蓝白 · 点击切换赤页深色' : '当前：赤页深色 · 点击切换知乎蓝白'}
    onClick={() => {
      const next = blue ? 'archive' : 'zhihu';
      try { localStorage.setItem(key, next); } catch { /* Switching still works when storage is unavailable. */ }
      applyTheme(next);
    }}><Palette size={15} /><span>{blue ? '赤页深色' : '知乎蓝白'}</span></button>;
}
