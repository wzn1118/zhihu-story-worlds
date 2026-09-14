import type { ZhihuCandidate } from './zhihu-discovery.ts';
import type { ZhihuElementAction, ZhihuPageDocument } from './zhihu-page-document.ts';

export const ZHIHU_BROWSER_POST_MIME = 'application/x-redleaf-zhihu-browser-post';
export type ZhihuBrowserChannel = 'chromium' | 'chrome' | 'msedge';
export interface ZhihuBrowserPost { id: string; title: string; author: string; sourceUrl: string; excerpt: string; characters: number; elementId?: string; /** Visible page content only; expanded does not claim a complete work. */ visibleScope?: 'excerpt' | 'expanded' }
export interface ZhihuBrowserFrame {
  status: 'closed' | 'ready' | 'login-required' | 'blocked' | 'error';
  frameId: string;
  url: string;
  title: string;
  width: number;
  height: number;
  /** Real browser screenshot; never interpreted as local HTML. */
  screenshot?: string;
  document?: ZhihuPageDocument;
  posts: ZhihuBrowserPost[];
  channel?: ZhihuBrowserChannel;
  httpStatus?: number;
  accessIssue?: { kind: 'request-denied' | 'verification'; code?: number };
  message?: string;
  /** Input capabilities only; field values and account credentials stay in the browser. */
  focusedInput?: { type: string; inputMode?: string };
  inputs?: Array<{ type: string; inputMode?: string; x: number; y: number; width: number; height: number }>;
  capturedAt: string;
}
export interface ZhihuBrowserOpen { url?: string; width?: number; height?: number; channel?: ZhihuBrowserChannel }
export type ZhihuBrowserAction =
  | ZhihuElementAction
  | { kind: 'navigate'; url: string }
  | { kind: 'link'; url: string; documentId?: string; elementId?: string }
  | { kind: 'back' | 'reload' | 'load-more' }
  | { kind: 'click'; frameId: string; x: number; y: number }
  | { kind: 'drag'; frameId: string; points: Array<{ x: number; y: number }>; durationMs?: number }
  | { kind: 'scroll'; deltaX?: number; deltaY: number }
  | { kind: 'text'; text: string }
  | { kind: 'key'; key: 'Enter' | 'Backspace' | 'Tab' | 'Escape' | 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'Control+A' };
export interface ZhihuBrowserCapture { postId: string; frameId: string }
export type ZhihuBrowserCaptureResult = ZhihuCandidate;
