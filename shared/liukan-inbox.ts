import type { ZhihuCandidate } from './zhihu-discovery';
import type { WorkshopProject } from './workshop';
export const LIUKAN_POST_MIME = 'application/x-redleaf-zhihu-candidate';
export interface LiukanInboxPost { id: string; candidate: ZhihuCandidate; learnedAt: string; projectId?: string }
export interface LiukanPostAnswer { answer: string; source: 'zhihu-zhida' | 'relay'; model: string; postId: string; answeredAt: string }
export type LiukanPostGeneration = WorkshopProject;
