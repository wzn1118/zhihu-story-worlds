import type { GameWorld, SceneNode } from '../../shared/types.ts';

export const REDRAIN_WORLD_ID = 'redrain-rebirth-week';
export const REDRAIN_VERSION = '20260910';

export function createRedrainWorld(): GameWorld {
  const nodes: Record<string, SceneNode> = {};
  for (let index = 0; index <= 50; index += 1) {
    const id = `redrain-${index}`;
    const choices = index < 50 ? [0, 1, 2].map(choice => ({
      id: `c${choice}`,
      text: `第 ${index + 1} 个决策：路线 ${choice + 1}`,
      nextNodeId: `redrain-${index + 1}`,
    })) : [];
    nodes[id] = {
      id, chapter: `重生周 · 决策 ${String(Math.min(index + 1, 50)).padStart(2, '0')}`,
      title: index === 0 ? '重生周序幕' : `第 ${index} 个选择`,
      location: '重生周时间线', time: `D-${Math.max(0, 7 - Math.floor(index / 7))}`,
      background: '', text: ['这是一段来自《重生周》当前路线的已保存回忆。'], choices,
      ...(index === 50 ? { ending: { title: '重生周结局', text: '这条路线已经抵达终点。', tone: 'hopeful' as const } } : {}),
    };
  }
  return {
    id: REDRAIN_WORLD_ID, storyId: REDRAIN_WORLD_ID, title: '末日的45度角躺平：重生周',
    subtitle: 'iframe 生存路线回忆', introduction: ['来自真实游戏存档的同行上下文。'],
    player: { name: '屠亦娆', role: '重生者' }, objective: '沿路线走到结局', startNodeId: 'redrain-0', nodes,
    characters: [], source: { title: '末日的45度角躺平', author: 'y甜酱不闲', url: 'https://www.zhihu.com/question/540354406/answer/2588140006' },
    version: REDRAIN_VERSION, cover: '', background: '', summary: '重生周游戏路线', ink: {}, clueVariables: {},
    adaptation: { scope: 'based-on-api-excerpt', adultCast: true, note: '游戏内路线回忆桥接。' },
  };
}
