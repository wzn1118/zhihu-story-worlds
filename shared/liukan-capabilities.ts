export type LiukanTransport = 'zhihu' | 'relay';
export type LiukanAnswerSource = 'zhihu-zhida' | 'relay';
export interface LiukanPublicConfig {
  transport: LiukanTransport;
  model: string;
  configured: boolean;
  relay?: { endpoint: string; model: string; protocol: 'responses' | 'chat-completions'; reasoning?: string; hasKey: boolean };
}
export interface LiukanConfigInput {
  transport: LiukanTransport;
  model?: string;
  relay?: { endpoint: string; model: string; protocol: 'responses' | 'chat-completions'; reasoning?: string; apiKey?: string };
  useWorkshopRelay?: boolean;
}
export const LIUKAN_ABILITIES = [
  { id: 'search-zhihu', title: '找知乎回答', description: '检索社区观点，保留作者和原文链接', input: 'query', private: false },
  { id: 'search-global', title: '查外部资料', description: '从全网查找资料和出处', input: 'query', private: false },
  { id: 'hot', title: '看看热榜', description: '看看大家此刻在讨论什么', input: 'none', private: false },
  { id: 'answer', title: '请直答查一查', description: '调用知乎直答，整理这个问题', input: 'query', private: false },
  { id: 'my-contents', title: '我的创作', description: '读取本机已配置知乎账号的标题与摘要', input: 'none', private: true },
  { id: 'my-followees', title: '我的关注', description: '读取本机已配置账号的关注列表', input: 'none', private: true },
  { id: 'favorites-recent', title: '近期收藏', description: '看看本机已配置账号最近收藏的内容', input: 'none', private: true },
  { id: 'favorites-lists', title: '我的收藏夹', description: '列出收藏夹，再选择一个查看', input: 'none', private: true },
  { id: 'favorites-items', title: '翻一翻收藏夹', description: '读取所选收藏夹的一页内容', input: 'collection', private: true },
  { id: 'knowledge-bases', title: '我的知识库', description: '列出当前账号可访问的知识库', input: 'none', private: true },
  { id: 'knowledge-items', title: '知识库目录', description: '读取所选知识库的一页内容', input: 'base', private: true },
  { id: 'knowledge-search', title: '在知识库里找', description: '检索所选知识库的相关段落', input: 'knowledge', private: true },
  { id: 'quota', title: '查看 API 额度', description: '仅此刻查询一次当日用量', input: 'none', private: true },
] as const;
export type LiukanAbilityId = typeof LIUKAN_ABILITIES[number]['id'];
export interface LiukanAbilityRequest {
  ability: LiukanAbilityId;
  query?: string;
  limit?: number;
  offset?: number;
  cursor?: string;
  baseId?: string;
  collectionId?: string;
  scope?: 'personal' | 'subscription' | 'public';
  confirmPrivateAccess?: boolean;
  requestId?: string;
}
export interface LiukanAbilityItem {
  id?: string;
  title: string;
  text: string;
  url?: string;
  author?: string;
  kind?: 'collection' | 'knowledge-base';
}
export interface LiukanAbilityResult {
  ability: LiukanAbilityId;
  source: 'zhihu-cli';
  fetchedAt: string;
  scope: 'public-search-excerpt' | 'current-hot-list' | 'generated-answer' | 'configured-account' | 'knowledge-excerpt' | 'quota';
  items: LiukanAbilityItem[];
  nextOffset?: number;
  nextCursor?: string;
  note: string;
}
export interface LiukanGeneralChatRequest {
  question: string;
  requestId?: string;
  conversation?: Array<{ role: 'user' | 'assistant'; content: string }>;
}
export interface LiukanGeneralChatResponse {
  answer: string;
  model: string;
  source: LiukanAnswerSource;
  answeredAt: string;
}
