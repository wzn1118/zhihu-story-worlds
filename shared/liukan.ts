import type { GameWorld } from './types.ts';

export interface LiukanHistoryChoice { nodeId: string; choiceId: string }
export interface LiukanProgressRequest {
  playerId?: string;
  storyId: string;
  worldId: string;
  worldVersion?: string;
  difficulty?: 'classic' | 'challenge';
  history: LiukanHistoryChoice[];
  /** Zero based last visible paragraph; omitting this reveals only the first current paragraph. */
  currentParagraphIndex?: number;
  /** RedRain iframe progress uses a compact route bridge instead of authored GameWorld nodes. */
  redrain?: { sceneIndex: number; route: number[]; stats: Record<string, number>; mode: string; endingId?: string | null };
}
export interface LiukanRecallRequest extends LiukanProgressRequest {
  question: string;
  requestId?: string;
  model?: 'zhida-fast-1p5' | 'zhida-thinking-1p5' | 'zhida-agent';
  conversation?: Array<{ role: 'user' | 'assistant'; content: string }>;
}
export interface LiukanVisitedScene { nodeId: string; title: string; text: string; selectedChoice?: string; choices: string[]; clues: string[]; resources: Record<string, number> }
export interface LiukanRecallContext { worldId: string; visited: LiukanVisitedScene[]; completed: LiukanMemoryRecord[] }
export interface LiukanRecallResponse { answer: string; model: string; context: LiukanRecallContext; remembered: boolean; source: 'zhihu-zhida' | 'relay'; answeredAt: string }
export interface LiukanMemoryRecord { storyId: string; worldId: string; worldVersion: string; title: string; endingTitle: string; completedAt: string; scenes: Array<{ title: string; text: string; selectedChoice?: string }> }
export interface LiukanMemoryProfile {
  playerId: string;
  storyCount: number;
  endingCount: number;
  sceneCount: number;
  recent?: { title: string; endingTitle: string; completedAt: string };
}
export type LiukanWorldLoader = (storyId: string, version?: string) => Promise<GameWorld> | GameWorld;
