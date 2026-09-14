/** Inert rendering of the current authenticated page. No remote scripts run in the app. */
export interface ZhihuPageDocument {
  id: string;
  html: string;
  scrollY: number;
  width: number;
  height: number;
}

export interface ZhihuElementAction {
  kind: 'element';
  documentId: string;
  elementId: string;
  event: 'click' | 'fill';
  text?: string;
}
