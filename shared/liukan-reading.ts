import type { LiukanAnswerSource } from './liukan-capabilities';

export type LiukanReadingSkillId = 'recap' | 'characters' | 'timeline' | 'clues' | 'motives' | 'uncertainties' | 'compare' | 'adaptation' | 'dialogue' | 'world-rules' | 'ask' | 'choice-design' | 'ending-design' | 'storyboard' | 'pitch' | 'style' | 'relationships' | 'foreshadowing' | 'playtest-review';
export interface LiukanReadingSkill { id: LiukanReadingSkillId; title: string; description: string; minSources: number; maxSources: number; invented: boolean }
export interface LiukanReadingEvidence { postId: string; quote: string }
export interface LiukanReadingSection { heading: string; body: string; evidence: LiukanReadingEvidence[] }
export interface LiukanReadingSource {
  postId: string; title: string; author: string; sourceUrl: string; sourceHash: string;
  contentScope: string;
  /** Whether the complete saved excerpt was supplied to this model call; does not assert the original work is complete. */
  complete: boolean;
  current: boolean;
}
export interface LiukanReadingNote {
  id: string; skill: LiukanReadingSkillId; title: string; summary: string;
  sections: LiukanReadingSection[]; sources: LiukanReadingSource[];
  invented: boolean; model: string; source: LiukanAnswerSource; createdAt: string;
  parentNoteId?: string; question?: string;
}
export interface LiukanReadingRunInput { skill: LiukanReadingSkillId; postIds: string[]; question?: string; requestId: string; parentNoteId?: string }
export interface LiukanReadingIndex { skills: LiukanReadingSkill[]; notes: LiukanReadingNote[] }
