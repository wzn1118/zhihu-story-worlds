/** A compact, complete game. All story choices are available without hidden gates. */
export interface FastStoryChoice {
  id: string;
  text: string;
  hint: string;
  next: string;
  feedback: string;
  gains: string[];
}

export interface FastStoryScene {
  id: string;
  title: string;
  location: string;
  time: string;
  text: string[];
  /** Author-only prerequisites. Every incoming path must have acquired these gains. */
  requires?: string[];
  choices: FastStoryChoice[];
  ending: null | { title: string; resolution: string; tone: 'hopeful' | 'uneasy' | 'dark' };
}

export interface FastStoryDraft {
  /** Written before scenes in the same request; never shown as character dialogue. */
  narrative?: { desire: string; stakes: string; relationship: string; voice: string };
  title: string;
  subtitle: string;
  summary: string;
  introduction: string[];
  player: { name: string; role: string };
  objective: string;
  /** Production notes record the question and separate preserved facts from invention. */
  premise: { question: string; preserved: string; expansion: string };
  characters: { id: string; name: string; role: string; description: string }[];
  facts: { quote: string; fact: string; sceneIds: string[] }[];
  start: string;
  scenes: FastStoryScene[];
}

export interface FastStoryProgress {
  stage: 'outline' | 'scenes' | 'validation';
  message: string;
  elapsedMs: number;
  remainingMs: number;
  attempt: number;
  characters?: number;
}

export const FAST_STORY_BUDGET_MS = 285_000;
