import type { ZhihuCandidate } from './zhihu-discovery';

export interface ZhihuHotQuestion {
  title: string;
  url: string;
  summary: string;
  thumbnailUrl?: string;
}

export interface ZhihuHotQuestionsResult {
  items: ZhihuHotQuestion[];
  fetchedAt: string;
  cached: boolean;
}

export interface ZhihuQuestionAnswersResult {
  title: string;
  questionUrl: string;
  candidates: ZhihuCandidate[];
  paging: { isEnd: boolean; nextOffset?: number; totals?: number };
  warning?: string;
  fetchedAt: string;
  cached: boolean;
}
