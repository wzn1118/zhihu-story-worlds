export type SourceMode = 'live' | 'cache';

export interface ZhihuOrigin {
  kind: 'zhihu-story' | 'zhihu-answer' | 'zhihu-article';
  contentScope?: 'search-excerpt' | 'webpage-selection' | 'favorite-summary' | 'question-answer-excerpt';
  /** Browser-observed page state; expanded does not claim the entire original work. */
  webpageScope?: 'excerpt' | 'expanded';
  workId: string;
  sourceUrl: string;
  originalUrl?: string;
  fetchedAt: string;
  authorAvatar?: string;
  cover?: string;
}

export interface StorySummary {
  id: string;
  title: string;
  description: string;
  labels: string[];
  author?: string;
  authorAvatar?: string;
  sourceCover?: string;
  sourceUrl: string;
  originalUrl?: string;
  cover?: string;
  playable: boolean;
}

export type Story = StorySummary;

export interface StoryListResponse {
  stories: StorySummary[];
  source: SourceMode;
  fetchedAt: string;
  warning?: string;
}

export interface StoryDetail extends StorySummary {
  content: string;
  introduction: string;
  author: string;
  source: SourceMode;
  fetchedAt: string;
  warning?: string;
  contentScope: 'api-excerpt';
}

export interface StagePortrait {
  url: string;
  sha256: string;
  jobId: string;
  sourceHash: string;
  sourceSha256: string;
  width: number;
  height: number;
  review: 'approved';
}

export interface Character {
  id: string;
  name: string;
  role: string;
  description: string;
  portrait?: string;
  portraits?: Partial<Record<'main' | 'reaction', string>>;
  /** Approved transparent derivatives; portrait/portraits remain source references. */
  stagePortraits?: Partial<Record<'main' | 'reaction', StagePortrait>>;
  color?: string;
}

export interface ChoiceEffects {
  resolve?: number;
  trust?: number;
  clues?: string[];
  resources?: Record<string, number>;
}

export interface ResourceDefinition {
  id: string;
  label: string;
  initial: number;
  min: number;
  max: number;
  description: string;
}

export interface ChoiceRequirements {
  allClues?: string[];
  anyClues?: string[];
  noneClues?: string[];
  resources?: Record<string, { min?: number; max?: number }>;
  resolve?: { min?: number; max?: number };
  trust?: { min?: number; max?: number };
}

export interface Choice {
  id: string;
  text: string;
  hint?: string;
  legacyTexts?: string[];
  repeatable?: boolean;
  nextNodeId: string;
  effects?: ChoiceEffects;
  requiresClue?: string;
  requires?: ChoiceRequirements;
  feedback?: { tone: 'success' | 'setback' | 'neutral'; text: string };
}

export interface SceneNode {
  id: string;
  chapter: string;
  title: string;
  location: string;
  time: string;
  clock?: { minuteOfDay: number; notBeforeDay?: number };
  background: string;
  /** Runtime classification; only empty generated environments may receive a cutout. */
  backgroundArtKind?: 'scene' | 'environment';
  /** All approved real background variants for this node, including the selected one. */
  artSceneVariants?: Array<{ url: string; sha256: string; width?: number; height?: number; native4k?: boolean; kind: 'scene' | 'environment' }>;
  speaker?: string;
  /** Production metadata, never Ink code or player-facing prose. */
  artBrief?: string;
  character?: { id: string; expression?: 'main' | 'reaction'; position?: 'left' | 'right' };
  /** Runtime placement from current source-book membership, outside story hashes. */
  stageCharacter?: { id: string; expression?: 'main' | 'reaction'; position?: 'left' | 'right' };
  challenge?: { kind: 'investigation' | 'deduction' | 'negotiation' | 'resource'; prompt: string; hint: string };
  text: string[];
  choices: Choice[];
  ending?: { title: string; text: string; tone: 'hopeful' | 'uneasy' | 'dark' };
}

export interface JournalStatus {
  label: string;
  detail: string;
  tone: 'pending' | 'recorded' | 'gap';
}

export interface OperationJournal {
  id: string;
  title: string;
  introduction: string;
  nodeIds: string[];
  closedClues?: string[];
  items: {
    id: string;
    title: string;
    initial: JournalStatus;
    // Later matching stages supersede earlier records.
    stages: (JournalStatus & { allClues?: string[]; anyClues?: string[] })[];
  }[];
  cargo?: {
    resourceId: string;
    loads: { label: string; slots: number; clue: string }[];
  };
}

export interface SourcePassage {
  id: string;
  label: string;
  quote: string;
  nodeIds: string[];
  clues?: string[];
  note: string;
}

export interface GameWorld {
  id: string;
  storyId: string;
  title: string;
  subtitle: string;
  introduction: string[];
  player: { name: string; role: string };
  objective: string;
  startNodeId: string;
  nodes: Record<string, SceneNode>;
  characters: Character[];
  /** Source-book supporting cast used only for verified artwork, outside authored story hashes. */
  artCharacters?: Character[];
  source: { title: string; author: string; url: string; origin?: ZhihuOrigin };
  version: string;
  compatibleSaveVersions?: string[];
  calendar?: { firstWeekday: 0 | 1 | 2 | 3 | 4 | 5 | 6 };
  resources?: ResourceDefinition[];
  mechanics?: { title: string; description: string; beginnerTip: string };
  operationJournals?: OperationJournal[];
  sourcePassages?: SourcePassage[];
  cover: string;
  background: string;
  summary: string;
  ink: Record<string, unknown>;
  clueVariables: Record<string, string>;
  adaptation: { scope: 'based-on-api-excerpt' | 'based-on-favorite-summary' | 'based-on-imported-source' | 'original-seed'; adultCast: true; note: string };
  generated?: { projectId: string; revision: number; artReady: boolean; mode?: 'fast' | 'full'; illustrationMode?: 'none' | 'image2' | 'gpt6'; editorial?: { draftHash: string; reviewedAt: string } };
}

export type World = GameWorld;

export interface ApiError {
  error: { code: string; message: string; status: number };
}
