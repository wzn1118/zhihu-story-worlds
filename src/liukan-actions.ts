export type LiukanAsset = 'greeting' | 'sway' | 'idle' | 'computer' | 'sleep' | 'ball';
export type LiukanActionGroup = '见面' | '带路' | '指向' | '读故事' | '想一想' | '做游戏' | '一起冒险';

export interface LiukanPose {
  offset: number;
  x: number;
  y: number;
  rotate: number;
  scaleX: number;
  scaleY: number;
}

export interface LiukanAction {
  id: string;
  label: string;
  group: LiukanActionGroup;
  description: string;
  asset: LiukanAsset;
  duration: number;
  accent: string;
  frames: readonly LiukanPose[];
}

const p = (offset: number, x = 0, y = 0, rotate = 0, scaleX = 1, scaleY = 1): LiukanPose => ({ offset, x, y, rotate, scaleX, scaleY });
const rest = p(0);
const home = p(1);
function action<const Id extends string>(id: Id, label: string, group: LiukanActionGroup, asset: LiukanAsset, duration: number, accent: string, description: string, ...frames: LiukanPose[]) {
  return { id, label, group, asset, duration, accent, description, frames: [rest, ...frames, home] } as const;
}

// Six supplied character animations are paired with distinct, finite choreography.
// Translations use avatar-relative percentages so the same cue fits pet and guide sizes.
export const LIUKAN_ACTIONS = [
  action('hello', '挥爪打招呼', '见面', 'greeting', 2400, '✦', '抬起身子，向刚来的朋友挥爪。', p(.2, 0, -4, -5), p(.45, 0, -3, 5), p(.7, 0, -2, -3)),
  action('welcome', '迎上来', '见面', 'greeting', 1800, '✦', '往前凑近一点，再站稳迎接你。', p(.2, 0, 1, 0, .9, .9), p(.65, 0, -3, 0, 1.1, 1.1)),
  action('bow', '认真鞠躬', '见面', 'greeting', 2100, '♡', '低头停一会儿，再慢慢直起身。', p(.3, 0, 7, 8, 1.05, .87), p(.7, 0, 7, 8, 1.05, .87)),
  action('peek-left', '左边探个头', '见面', 'idle', 1900, '·', '朝左侧探出脑袋看看你。', p(.35, -13, -2, -13), p(.7, -13, -2, -13)),
  action('peek-right', '右边探个头', '见面', 'idle', 1900, '·', '朝右侧探出脑袋看看你。', p(.35, 13, -2, 13), p(.7, 13, -2, 13)),
  action('happy-hop', '见到你就跳一下', '见面', 'sway', 1400, '✧', '蹲下，轻轻跃起，再落回原位。', p(.18, 0, 4, 0, 1.08, .9), p(.48, 0, -15, -3, .96, 1.04), p(.75, 0, 3, 2, 1.06, .92)),
  action('stretch', '伸个懒腰', '见面', 'sleep', 3000, '☀', '先缩成一团，舒展开身子再精神起来。', p(.2, 0, 3, -4, 1.08, .89), p(.55, 0, -6, 3, .94, 1.1), p(.8, 0, -3, -2)),
  action('goodbye', '回头道别', '见面', 'greeting', 2600, '♡', '向旁边挪一步，回头再挥挥爪。', p(.3, 9, 0, 7), p(.55, 14, -1, -9), p(.8, 8, 0, -5)),

  action('introduce', '轮到我介绍啦', '带路', 'greeting', 2300, '①', '挺起身子，认真介绍眼前这块地方。', p(.3, 0, -4, 0, 1.06, 1.06), p(.65, 0, -3, -5, 1.04, 1.04)),
  action('follow-me', '跟着我走', '带路', 'sway', 2300, '→', '向右迈两小步，停下等你跟上。', p(.2, 6, -3, 5), p(.4, 12, 0, -4), p(.6, 18, -3, 5), p(.8, 18, 0, -6)),
  action('show-workshop', '介绍改编工作台', '带路', 'computer', 3000, '▤', '凑到工作台前，坐稳打开电脑。', p(.2, -6, 1, -4, .96, .96), p(.45, 0, 3, 0, 1.05, .96), p(.82, 0, 3, 0, 1.05, .96)),
  action('show-play', '邀请你玩一局', '带路', 'ball', 2400, '▷', '带着球向前跃一步，邀请你开始冒险。', p(.22, -6, 2, -7), p(.52, 7, -8, 6), p(.76, 4, 1, -2)),
  action('show-reader', '请看这篇原文', '带路', 'idle', 2600, '▥', '稍微侧身，让出视线给眼前的文章。', p(.3, 12, 0, -8, .94, .94), p(.8, 12, 0, -8, .94, .94)),
  action('show-settings', '检查一下设置', '带路', 'computer', 2500, '⚙', '低头看看电脑，抬头等你填好设置。', p(.25, 0, 4, -4, 1.02, .95), p(.5, 0, 4, 4, 1.02, .95), p(.8, 0, -2, 0)),
  action('try-it', '你来试一试', '带路', 'greeting', 2000, '◇', '向后让一步，把操作的位置留给你。', p(.3, -8, 4, -6, .91, .91), p(.75, -8, 4, 4, .91, .91)),
  action('next-step', '接着看下一处', '带路', 'sway', 1700, '→', '点头后轻轻挪向下一步。', p(.2, 0, 3, 0, 1.02, .96), p(.5, 10, -4, 6), p(.75, 12, 0, 0)),

  action('point-left', '看左边', '指向', 'greeting', 1800, '←', '朝左边倾身，把注意力引向那边。', p(.3, -12, -2, -12), p(.75, -12, -2, -12)),
  action('point-right', '看右边', '指向', 'greeting', 1800, '→', '朝右边倾身，把注意力引向那边。', p(.3, 12, -2, 12), p(.75, 12, -2, 12)),
  action('point-up', '看上面', '指向', 'greeting', 1900, '↑', '踮起脚停一下，示意上方的按钮。', p(.35, 0, -12, 0, .98, 1.04), p(.75, 0, -12, 0, .98, 1.04)),
  action('point-down', '看下面', '指向', 'greeting', 1900, '↓', '低下身子，示意下面的内容。', p(.35, 0, 9, 0, 1.05, .9), p(.75, 0, 9, 0, 1.05, .9)),
  action('point-top-left', '看左上方', '指向', 'greeting', 2000, '↖', '向左上方探身，停住给你看清楚。', p(.35, -10, -10, -10, .98, 1.02), p(.75, -10, -10, -10, .98, 1.02)),
  action('point-top-right', '看右上方', '指向', 'greeting', 2000, '↗', '向右上方探身，停住给你看清楚。', p(.35, 10, -10, 10, .98, 1.02), p(.75, 10, -10, 10, .98, 1.02)),
  action('point-bottom-left', '看左下方', '指向', 'idle', 2000, '↙', '弯下身子，指引左下方的区域。', p(.35, -10, 7, -9, 1.04, .94), p(.75, -10, 7, -9, 1.04, .94)),
  action('point-bottom-right', '看右下方', '指向', 'idle', 2000, '↘', '弯下身子，指引右下方的区域。', p(.35, 10, 7, 9, 1.04, .94), p(.75, 10, 7, 9, 1.04, .94)),

  action('curious', '歪头好奇', '读故事', 'idle', 2400, '?', '先歪头看看，再凑近一点。', p(.3, -2, 0, -12), p(.6, 3, -3, 8, 1.05, 1.05), p(.8, 3, -3, 8, 1.05, 1.05)),
  action('look-around', '四处找故事', '读故事', 'sway', 3000, '⌕', '左边看看、右边看看，搜寻值得读的故事。', p(.2, -8, -2, -9), p(.5, 8, -2, 9), p(.8, 0, -4, 0)),
  action('receive-answer', '接住这篇回答', '读故事', 'greeting', 2200, '↓', '伸身迎接，轻轻下沉把回答接稳。', p(.22, 0, -8, 0, 1.04, 1.04), p(.5, 0, 6, 0, 1.1, .9), p(.75, 0, -2, 0, 1.02, 1.02)),
  action('read-carefully', '低头细读', '读故事', 'computer', 3600, '≋', '坐下来读一遍，沿着文字轻轻挪动视线。', p(.2, 0, 4, -3, 1, .96), p(.45, -3, 4, -3, 1, .96), p(.7, 3, 4, 3, 1, .96), p(.85, 0, 2, 0)),
  action('remember', '把这篇记下来', '读故事', 'computer', 2800, '✓', '低头记笔记，记好后抬起头确认。', p(.2, 0, 3, -5, 1.03, .96), p(.45, 0, 3, 5, 1.03, .96), p(.7, 0, -5, 0, 1.05, 1.05)),
  action('compare', '把两处对照一下', '读故事', 'idle', 2800, '⇄', '在两边来回看一眼，比较文章里的细节。', p(.22, -10, 0, -7), p(.48, 10, 0, 7), p(.73, -5, -2, -4)),
  action('quote', '这里有一句原话', '读故事', 'greeting', 2100, '“', '轻轻抬身，停住提示这句话值得留意。', p(.3, 4, -7, -5, 1.04, 1.04), p(.78, 4, -7, -5, 1.04, 1.04)),
  action('share-discovery', '发现一个好故事', '读故事', 'sway', 2100, '✧', '朝你蹦过来，把刚发现的故事拿给你看。', p(.2, -9, 0, -9, .94, .94), p(.48, 0, -10, 0, 1.08, 1.08), p(.76, 4, 0, 5)),

  action('think', '安静想一会儿', '想一想', 'idle', 3200, '…', '慢慢歪头，停一会儿再回过神。', p(.3, 0, -2, -10), p(.78, 0, -2, -10)),
  action('ponder', '换个角度想', '想一想', 'sway', 3200, '?', '先往一边想想，再换到另一边。', p(.25, -4, 1, -11), p(.65, 4, 1, 11), p(.85, 0, -2, 0)),
  action('aha', '我想到啦', '想一想', 'greeting', 1700, '!', '先压低身子，突然抬头想到办法。', p(.28, 0, 5, -4, 1.04, .92), p(.5, 0, -11, 0, 1.1, 1.1), p(.8, 0, -3, 3)),
  action('listen', '听你说完', '想一想', 'idle', 3000, '·', '侧头凑近，留在这里认真听你说。', p(.3, 6, -1, 9, 1.03, 1.03), p(.82, 6, -1, 9, 1.03, 1.03)),
  action('nod', '点头明白了', '想一想', 'idle', 1600, '✓', '稳稳地点两下头，表示已经明白。', p(.2, 0, 4, 0, 1.02, .96), p(.38, 0, -1), p(.6, 0, 3, 0, 1.02, .97), p(.8, 0, -1)),
  action('uncertain', '这里还要确认', '想一想', 'idle', 2300, '?', '稍微退后，带着疑问左右看看。', p(.25, -3, 3, -8, .96, .96), p(.6, 3, 3, 8, .96, .96), p(.8, 0, 2, 0, .98, .98)),
  action('wait', '陪你等一会儿', '想一想', 'sway', 3600, '…', '缓缓把重心从左脚换到右脚。', p(.28, -5, 1, -4, 1, .98), p(.7, 5, 1, 4, 1, .98)),
  action('rest', '趴一会儿', '想一想', 'sleep', 4200, 'z', '慢慢缩下身子打个盹，再轻轻坐起来。', p(.25, 0, 7, -4, 1.08, .87), p(.75, 0, 7, -4, 1.08, .87), p(.9, 0, 3, 0, 1.03, .96)),

  action('make-game', '开始写这场冒险', '做游戏', 'computer', 3300, '✎', '坐稳打开电脑，把文章变成故事的开头。', p(.15, 0, 3, 0, 1.06, .94), p(.35, -2, 2, -3), p(.55, 2, 2, 3), p(.78, 0, -3, 0, 1.04, 1.04)),
  action('plan-routes', '安排几条不同的路', '做游戏', 'computer', 3000, '⑂', '看看左边的路线，再看看右边的路线。', p(.2, -7, 2, -6), p(.45, 7, 2, 6), p(.7, 0, -5, 0)),
  action('write-scene', '写下这一幕', '做游戏', 'computer', 3400, '≋', '低头连写几行，再抬头读一遍。', p(.18, -3, 3, -4, 1, .96), p(.4, 1, 3, 2, 1, .96), p(.62, 4, 3, 4, 1, .96), p(.82, 0, -3, 0)),
  action('check-story', '沿着剧情走一遍', '做游戏', 'computer', 2900, '✓', '分三处检查故事，最后点头确认。', p(.2, -6, 1, -5), p(.4, 0, -4, 0), p(.6, 6, 1, 5), p(.8, 0, 3, 0, 1.02, .97)),
  action('draw-scene', '看看这幕该怎么画', '做游戏', 'computer', 3000, '✧', '抬头看全景，再低头安排画面。', p(.25, 0, -7, -6, 1.04, 1.04), p(.5, 4, -5, 6), p(.78, 0, 4, 0, 1.03, .97)),
  action('game-ready', '游戏准备好啦', '做游戏', 'greeting', 2400, '▷', '先站起来，再向旁边让出开始按钮。', p(.25, 0, -8, 0, 1.08, 1.08), p(.55, 10, -2, 7), p(.8, 10, 0, -5)),
  action('retry', '再试一次', '做游戏', 'computer', 2200, '↻', '退一步缓缓劲，再回来继续处理。', p(.23, -9, 3, -7, .94, .94), p(.48, -4, -5, 5), p(.75, 2, 2, 0)),
  action('error', '这一步卡住了', '做游戏', 'idle', 2400, '!', '轻轻后退摇头，停下来等你看清提示。', p(.25, 0, 4, -7, .94, .94), p(.45, 0, 4, 7, .94, .94), p(.65, 0, 4, -4, .94, .94), p(.84, 0, 4, 0, .94, .94)),

  action('set-off', '一起出发', '一起冒险', 'ball', 2000, '→', '带球小跑两步，准备进入第一幕。', p(.2, -7, -4, -5), p(.42, 0, 2, 3), p(.65, 9, -6, 7), p(.82, 12, 0, 0)),
  action('choose', '到你拿主意了', '一起冒险', 'idle', 2500, '⑂', '先看两边的选项，再回头等你的决定。', p(.23, -6, 0, -10), p(.48, 6, 0, 10), p(.75, 0, -2, 0, 1.04, 1.04)),
  action('found-clue', '找到一条线索', '一起冒险', 'greeting', 2000, '⌕', '压低身子找一找，再把线索举起来。', p(.25, 5, 6, 8, 1.04, .92), p(.52, 0, -10, -5, 1.06, 1.06), p(.78, 0, -6, -5)),
  action('careful', '慢一点再决定', '一起冒险', 'idle', 2400, '!', '往前挡半步，点头提醒你看清眼前的代价。', p(.25, 0, -1, 0, 1.08, 1.08), p(.5, 0, 3, 0, 1.08, 1.02), p(.8, 0, -1, 0, 1.08, 1.08)),
  action('cheer', '给你加把劲', '一起冒险', 'ball', 2100, '✦', '左右各跳一下，为你的选择打气。', p(.2, -7, -8, -8), p(.42, 0, 2, 0, 1.05, .94), p(.67, 7, -8, 8), p(.85, 0, 2, 0, 1.05, .94)),
  action('success', '这次走通啦', '一起冒险', 'greeting', 2600, '✧', '高兴地跃起，落地后认真挥爪庆祝。', p(.18, 0, 4, 0, 1.08, .9), p(.4, 0, -17, -8, .98, 1.04), p(.6, 0, 2, 5, 1.08, .92), p(.8, 0, -3, -5)),
  action('comfort', '我陪你缓一缓', '一起冒险', 'idle', 3400, '♡', '慢慢靠近一些，安静待在你身边。', p(.3, -6, 2, -5, .98, .98), p(.78, -6, 2, -5, .98, .98)),
  action('recall-ending', '还记得那次结局吗', '一起冒险', 'sway', 3200, '↶', '回头想起走过的路，再转回来与你聊聊。', p(.25, -8, -1, -12), p(.55, -8, -1, -12), p(.8, 2, -3, 4, 1.03, 1.03)),
] as const satisfies readonly LiukanAction[];

export type LiukanActionId = (typeof LIUKAN_ACTIONS)[number]['id'];
export const LIUKAN_ACTION_GROUPS: readonly LiukanActionGroup[] = ['见面', '带路', '指向', '读故事', '想一想', '做游戏', '一起冒险'];
export const LIUKAN_ACTION_EVENT = 'liukan:action';
const catalogue = new Map<string, LiukanAction>(LIUKAN_ACTIONS.map(item => [item.id, item]));
export function isLiukanActionId(value: unknown): value is LiukanActionId { return typeof value === 'string' && catalogue.has(value); }
export function getLiukanAction(id: LiukanActionId): LiukanAction { return catalogue.get(id) ?? LIUKAN_ACTIONS[0]; }
export function liukanPoseTransform(pose: LiukanPose): string { return `translate(${pose.x}%, ${pose.y}%) rotate(${pose.rotate}deg) scale(${pose.scaleX}, ${pose.scaleY})`; }

export interface LiukanActionCue { action: LiukanActionId; target: string }
export function parseLiukanActionCue(value: unknown): LiukanActionCue | null {
  if (!value || typeof value !== 'object') return null;
  const cue = value as Partial<LiukanActionCue>;
  return isLiukanActionId(cue.action) && typeof cue.target === 'string' && cue.target.length > 0 && cue.target.length <= 64 ? { action: cue.action, target: cue.target } : null;
}
export function performLiukanAction(action: LiukanActionId, target = 'pet'): boolean {
  if (typeof window === 'undefined' || !isLiukanActionId(action)) return false;
  window.dispatchEvent(new CustomEvent<LiukanActionCue>(LIUKAN_ACTION_EVENT, { detail: { action, target } }));
  return true;
}
