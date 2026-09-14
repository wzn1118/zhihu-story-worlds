import { accountLocalStorage } from './account-storage';
import type { LiukanActionId } from './liukan-actions';

export type LiukanTourView = 'library' | 'story-intro' | 'source' | 'workshop' | 'saves' | 'settings' | 'endings' | 'zhihu';
export type LiukanTourAction = LiukanActionId;
export type LiukanTourDismissal = 'complete' | 'later';

export interface LiukanTourStep {
  id: string;
  chapter: string;
  title: string;
  body: string;
  hint: string;
  target: string;
  view: LiukanTourView;
  action: LiukanTourAction;
}

export const LIUKAN_TOUR_STORAGE_KEY = 'redleaf.liukan.introduction.v1';

export const liukanTourSteps: readonly LiukanTourStep[] = [
  { id: 'hello', chapter: '见个面', title: '你好，我是刘看山。', body: '我陪你读故事，也陪你走进故事。先带你认认路：想马上玩，去书库；想把喜欢的回答变成冒险，去工作台。', hint: '跟着我看看，随时都能停下来。', target: 'liukan-pet', view: 'library', action: 'hello' },
  { id: 'library', chapter: '先玩一篇', title: '先挑一个让你想点开的故事。', body: '书库保留了故事标题、作者和原文入口。打开一篇后，先看简介；有可玩版本的故事，就能进入冒险。', hint: '游戏里的新情节和结局属于改编，原文单独保留。', target: 'library-games', view: 'library', action: 'look-around' },
  { id: 'play', chapter: '先玩一篇', title: '每个选择，都要算一算。', body: '这是这篇故事真正的开场说明。先看看自己的身份、目标和资源，再决定怎么开始；进入故事后，调查和选择会影响后面的路。', hint: '开场会介绍这篇故事的具体规则。', target: 'story-intro', view: 'story-intro', action: 'show-play' },
  { id: 'source', chapter: '先玩一篇', title: '想核对故事，就回去读原文。', body: '原文阅读器里可以查找文字、看作者和来源。游戏走到别的结局时，原作者写下的那一段仍然原样留着。', hint: '节选只代表读到的这一部分，不会冒充完整原作。', target: 'story-source', view: 'source', action: 'show-reader' },
  { id: 'workshop', chapter: '做自己的游戏', title: '现在，来写你的另一种结局。', body: '故事改编工作台把原文、生成中的稿件、可玩版本和插图放在一起。你带来故事，后面的制作进展都在这里看。', hint: '每个新故事都有自己的项目和美术清单。', target: 'workshop-heading', view: 'workshop', action: 'show-workshop' },
  { id: 'zhihu', chapter: '做自己的游戏', title: '这里可以直接逛知乎。', body: '这就是工作台里的知乎子页面，仍在当前标签里。上面可以切换真实网页和内容阅读；看到想读的回答，可以拖给我，也可以点“交给看山”。', hint: '我会保存实际读到的正文和来源，你还可以继续问我这篇写了什么。', target: 'zhihu-reader', view: 'zhihu', action: 'receive-answer' },
  { id: 'import', chapter: '做自己的游戏', title: '自己的故事，也能带进来。', body: '切到“粘贴或上传”，填好标题、作者和正文，也可以导入文本文件。原文会逐字保存；先保存素材，或者准备好后开始改编。', hint: '不用先写完所有分支，把你已经写好的内容交进来就行。', target: 'workshop-source-input', view: 'workshop', action: 'read-carefully' },
  { id: 'relay', chapter: '做自己的游戏', title: '先接好你想用的模型。', body: '这里填写文字中转地址和密钥，会自动获取模型并检测连接，通过后就能保存配置。故事生成和生图各用各的服务；看山聊天也有自己的连接设置。', hint: '模型从检测结果中选择，推理强度使用模型默认设置；保存配置后，再开始制作。', target: 'workshop-relay', view: 'workshop', action: 'show-settings' },
  { id: 'generate', chapter: '做自己的游戏', title: '准备好了，再按开始。', body: '选好原文后点生成，工作台会写出路线、场景和结局，再检查选择能不能走通。交给我读过的回答，也能在我的面板里发起改编。', hint: '这一段介绍只带你认按钮，正式生成由你点击开始。', target: 'workshop-generate', view: 'workshop', action: 'make-game' },
  { id: 'progress', chapter: '做自己的游戏', title: '写到哪一步，这里都有记录。', body: '选中项目，就能看到当前阶段和实际进展。中断的任务可以续跑，失败原因也会留下；出现“开始游戏”后就可以进入已发布版本。', hint: '正在生成时不用反复点开始，已有稿件会继续保留。', target: 'workshop-progress', view: 'workshop', action: 'check-story' },
  { id: 'art', chapter: '做自己的游戏', title: '插图也有自己的进度。', body: '文本能玩以后，插图可能还在制作。到美术区域查看完成数和图片，再决定是否补图；每篇故事只显示自己的那一份清单。', hint: '有图、有审核结果、能在游戏里显示，是分开记录的。', target: 'workshop-art', view: 'workshop', action: 'draw-scene' },
  { id: 'saves', chapter: '带着回忆继续', title: '先歇一会儿也没关系。', body: '我的存档里可以继续上次的旅程，也可以保存、导出或导入进度。换一条路线之前留个存档，回来时就不用重走一遍。', hint: '看山记住的通关回忆，和游戏存档分别保存。', target: 'save-manager', view: 'saves', action: 'remember' },
  { id: 'endings', chapter: '带着回忆继续', title: '走过的结局，会留下来。', body: '结局档案收着你已经解锁的结果。我也能和你聊走过的场景、做过的决定，陪你想想下一回要不要换个选法。', hint: '没走到的剧情，不会当作你的回忆讲给你听。', target: 'ending-archive', view: 'endings', action: 'recall-ending' },
  { id: 'settings', chapter: '带着回忆继续', title: '把阅读调成舒服的样子。', body: '设置里可以调整文字、阅读节奏和动效。想重新认一遍这些入口，随时点“怎么开始”，我会再陪你走一遍。', hint: '准备好了，去挑一篇故事吧。', target: 'reading-settings', view: 'settings', action: 'try-it' },
];

interface TourStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }

export function shouldShowLiukanTour(storage?: Pick<TourStorage, 'getItem'>): boolean {
  try {
    const source = storage ?? accountLocalStorage;
    if (!source) return false;
    const value = source.getItem(LIUKAN_TOUR_STORAGE_KEY);
    if (!value) return true;
    const record: unknown = JSON.parse(value);
    return !(record && typeof record === 'object' && 'seen' in record && record.seen === true);
  } catch { return false; }
}

export function rememberLiukanTour(reason: LiukanTourDismissal, storage?: Pick<TourStorage, 'setItem'>): void {
  try { (storage ?? accountLocalStorage).setItem(LIUKAN_TOUR_STORAGE_KEY, JSON.stringify({ seen: true, reason, at: new Date().toISOString() })); }
  catch { /* Explicit replay remains available when storage is disabled. */ }
}

export interface TourRect { left: number; top: number; width: number; height: number }
export interface TourViewport { width: number; height: number }

export function clipTourTarget(rect: TourRect, viewport: TourViewport): TourRect | null {
  const left = Math.max(8, rect.left - 7), top = Math.max(8, rect.top - 7);
  const right = Math.min(viewport.width - 8, rect.left + rect.width + 7);
  const bottom = Math.min(viewport.height - 8, rect.top + rect.height + 7, top + viewport.height * .42);
  return right > left && bottom > top ? { left, top, width: right - left, height: bottom - top } : null;
}

function overlap(a: TourRect, b: TourRect): number {
  return Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left))
    * Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));
}

/** Find a visible card position, preferring a clear view of the control being explained. */
export function placeTourCard(target: TourRect | null, viewport: TourViewport, card: { width: number; height: number }): TourRect {
  const margin = viewport.width < 600 ? 12 : 24;
  const width = Math.max(0, Math.min(card.width, viewport.width - margin * 2));
  const height = Math.max(0, Math.min(card.height, viewport.height - margin * 2));
  const clamp = (left: number, top: number): TourRect => ({
    left: Math.max(margin, Math.min(left, viewport.width - width - margin)),
    top: Math.max(margin, Math.min(top, viewport.height - height - margin)), width, height,
  });
  if (!target) return clamp((viewport.width - width) / 2, (viewport.height - height) / 2);
  const right = target.left + target.width, bottom = target.top + target.height;
  const candidates = [
    clamp(right + 24, target.top + target.height / 2 - height / 2),
    clamp(target.left - width - 24, target.top + target.height / 2 - height / 2),
    clamp(target.left + target.width / 2 - width / 2, bottom + 24),
    clamp(target.left + target.width / 2 - width / 2, target.top - height - 24),
    clamp(viewport.width - width - margin, viewport.height - height - margin),
    clamp(margin, margin),
  ];
  return candidates.sort((a, b) => overlap(a, target) - overlap(b, target))[0];
}
