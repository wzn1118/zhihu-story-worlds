import type { GameWorld, ResourceDefinition, ZhihuOrigin } from './types';

export const isImportedId = (id: string) => /^import-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id);
export const worldEndpoint = (id: string, version?: string) => isImportedId(id)
  ? `/api/workshop/projects/${id}/world${version ? `?version=${encodeURIComponent(version)}` : ''}`
  : `/api/worlds/${encodeURIComponent(id)}`;
export type SourceScope = 'user-import' | 'original-seed' | 'zhihu-excerpt';
export interface GenerationOptions { mode: 'fast' | 'full'; adaptation: 'faithful' | 'inspiration'; images: 'none' | 'image2' | 'gpt6' }
export const defaultGenerationOptions: GenerationOptions = { mode: 'fast', adaptation: 'inspiration', images: 'none' };
export interface ImportedSource { title: string; author: string; text: string; scope: SourceScope; origin?: ZhihuOrigin; referenceUrl?: string }
export type ProductionStage = 'imported' | 'outline' | 'scenes' | 'validation' | 'editorial' | 'art' | 'ready';
export interface WorkshopProject {
  ownerId?: string;
  generationOptions?: GenerationOptions;
  generation?: { startedAt: string; deadlineAt?: string; finishedAt?: string; elapsedMs?: number; model?: string; attempts?: number };
  id: string; title: string; author: string; scope: SourceScope; sourceHash: string;
  origin?: ZhihuOrigin;
  createdAt: string; updatedAt: string; revision: number; publishedVersion?: string;
  status: 'idle' | 'running' | 'failed' | 'interrupted' | 'ready'; stage: ProductionStage;
  completedRoutes: number; playable: boolean; jobId?: string; attempts: number;
  basedOnVersion?: string;
  editorial?: { status: 'pending' | 'reviewing' | 'passed' | 'failed'; revision: number; checkedAt?: string; draftHash?: string; message?: string; kind?: 'structural' | 'independent' };
  error?: { code: string; message: string; stage: ProductionStage };
  validation?: { scenes: number; decisions: number; endings: number; badEnds: number; routes: number; states: number };
  art: { status: 'pending' | 'queued' | 'in-progress' | 'ready' | 'failed' | 'disabled'; batchId?: string; approved: number; total: number; message?: string; provider?: 'image2' | 'gpt6' | 'none' };
  events: { at: string; stage: ProductionStage; message: string }[];
}
export interface PlotRoute { id: string; title: string; commitment: string; premise: string; beats: string[]; endings: { id: string; title: string; kind: 'good' | 'bad'; resolution: string; cause: string }[] }
export interface StoryOutline {
  title: string; subtitle: string; summary: string; introduction: string[]; objective: string;
  player: { name: string; role: string }; beginnerTip: string;
  facts: { quote: string; fact: string }[];
  characters: { id: string; name: string; role: string; description: string; motive: string }[];
  resources: ResourceDefinition[]; routes: PlotRoute[];
  opening: { title: string; location: string; time: string; text: string[] };
}
export interface DraftChoice { id: string; text: string; hint: string; next: string; costs: { resource: string; delta: number }[]; gains: string[]; needs: string[]; feedback: string }
export interface DraftScene { id: string; title: string; location: string; time: string; speaker: string; text: string[]; purpose: string; artBrief: string; choices: DraftChoice[]; ending: null | { kind: 'good' | 'bad'; title: string; resolution: string } }
export interface RouteDraft { routeId: string; entry: string; scenes: DraftScene[] }
export interface GeneratedDraft { outline: StoryOutline; routes: RouteDraft[] }
export type GeneratedWorld = GameWorld;

// Original seed supplied by this workbench, never represented as a source-platform work.
export const originalSeed: ImportedSource = {
  title: '第七秒的来电', author: '赤页工作台 · 原创种子', scope: 'original-seed',
  text: '海底中继站的值班钟每天慢七秒。陆遥一直以为是盐雾腐蚀，直到撤站前夜，她接到自己的电话。\n\n电话里的她先报出手背上刚被烙铁烫出的水泡，又说：“别让韩工把白色线轴带上船。里面不是电缆。”\n\n玻璃外，最后一艘接驳艇亮着红灯。韩砚抱着线轴站在闸门边，问她有没有听见哭声。他的女儿三年前死在这座站里，死亡证明却是明天的日期。\n\n陆遥拔掉电话线。听筒里的声音没有停。她听到七秒之后，一声枪响。备用电池只够维持闸门和录音台中的一个。桌上有一张被海水浸透的乘员表，原本写着六个人，现在多了第七个名字——她自己的字迹。',
};
