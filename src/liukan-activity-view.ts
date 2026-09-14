import type { LiukanMemoryRecord } from '../shared/liukan';
import type { WorkshopProject } from '../shared/workshop';

export type PreflightState = 'ready' | 'attention' | 'waiting';

export interface ProjectPreflightItem {
  id: 'source' | 'playable' | 'structure' | 'art' | 'journey';
  state: PreflightState;
  title: string;
  detail: string;
}

export interface ProjectPreflight {
  project?: WorkshopProject;
  items: ProjectPreflightItem[];
  confirmed: number;
  nextStep: { title: string; detail: string; canOpenProject: boolean };
}

const productionTargets = { scenes: 30, decisions: 30, routes: 3, endings: 6, badEnds: 3 } as const;

export function projectStatusLabel(project: Pick<WorkshopProject, 'status' | 'stage'>) {
  if (project.status === 'ready') return '可以开始玩';
  if (project.status === 'running') return `正在${({ imported: '准备原文', outline: '构思剧情', scenes: '写场景与选择', validation: '检查故事', editorial: '润色剧情', art: '制作插图', ready: '整理游戏' } as const)[project.stage]}`;
  if (project.status === 'failed') return '这次制作停住了';
  if (project.status === 'interrupted') return '制作中断，可继续';
  return '还没开始制作';
}

export function artStatusLabel(project: Pick<WorkshopProject, 'art'>) {
  const art = project.art;
  if (art.status === 'ready') return `插图已审核 ${art.approved}/${art.total || art.approved}`;
  if (art.status === 'in-progress') return `插图制作中 ${art.approved}/${art.total || '待定'}`;
  if (art.status === 'queued') return `插图排队中 ${art.approved}/${art.total || '待定'}`;
  if (art.status === 'failed') return art.message || '插图制作遇到问题';
  if (art.status === 'disabled') return '此版本没有插图';
  return art.total ? `插图待制作 0/${art.total}` : '插图尚未登记';
}

export function memoryMatches(memory: LiukanMemoryRecord, query: string) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  return `${memory.title}\n${memory.endingTitle}\n${memory.worldId}\n${memory.scenes.map(scene => `${scene.title}\n${scene.text}\n${scene.selectedChoice ?? ''}`).join('\n')}`.toLocaleLowerCase().includes(needle);
}

export function memoryMarkdown(memory: LiukanMemoryRecord) {
  const lines = [`# ${memory.endingTitle}`, '', `故事：${memory.title}`, `完成于：${memory.completedAt}`, '', '这是一份实际走过的关卡回忆；只包含当时保存的场景。', ''];
  memory.scenes.forEach((scene, index) => {
    lines.push(`## ${String(index + 1).padStart(2, '0')} · ${scene.title}`, '', scene.text);
    if (scene.selectedChoice) lines.push('', `选择：${scene.selectedChoice}`);
    lines.push('');
  });
  return lines.join('\n');
}

function scopeLabel(project: Pick<WorkshopProject, 'scope'>) {
  if (project.scope === 'zhihu-excerpt') return '知乎节选原文';
  if (project.scope === 'user-import') return '自己带来的原文';
  return '原创种子';
}

/** Pick the most actionable project when the player has not chosen one yet. */
export function preferredPreflightProject(projects: WorkshopProject[]) {
  return projects.find(project => project.playable)
    ?? projects.find(project => project.status === 'running')
    ?? projects.find(project => project.status === 'interrupted' || project.status === 'failed')
    ?? projects[0];
}

/**
 * This is intentionally a local read of persisted production and journey data.
 * It is a checklist, not a model verdict and it never fills in missing progress.
 */
export function projectPreflight(project: WorkshopProject | undefined, memories: LiukanMemoryRecord[]): ProjectPreflight {
  if (!project) {
    return {
      items: [
        { id: 'source', state: 'waiting', title: '先留下一段原文', detail: '把知乎回答或自己的文字交给看山后，这里才会有可核对的制作记录。' },
        { id: 'playable', state: 'waiting', title: '再开始制作', detail: '当前没有已保存的故事项目。' },
      ],
      confirmed: 0,
      nextStep: { title: '先收一篇原文', detail: '从看山书袋或故事工作台开始，之后再回来核对进度。', canOpenProject: false },
    };
  }

  const validation = project.validation;
  const targetEntries = Object.entries(productionTargets) as Array<[keyof typeof productionTargets, number]>;
  const unmet = validation
    ? targetEntries.filter(([key, target]) => validation[key] < target).map(([key, target]) => {
      const labels: Record<keyof typeof productionTargets, string> = { scenes: '场景', decisions: '选择', routes: '路线', endings: '结局', badEnds: '坏结局' };
      return `${labels[key]} ${validation[key]}/${target}`;
    })
    : [];
  const matchingMemories = memories.filter(memory => memory.storyId === project.id || memory.worldId === project.id);
  const items: ProjectPreflightItem[] = [
    { id: 'source', state: 'ready', title: '原文已入册', detail: `${scopeLabel(project)}已单独保存；当前项目编号 ${project.id}。` },
    {
      id: 'playable',
      state: project.playable ? 'ready' : project.status === 'running' ? 'waiting' : 'attention',
      title: project.playable ? '文字路线可以游玩' : project.status === 'running' ? '文字路线还在制作' : '文字路线还不能进入',
      detail: project.playable ? '可直接查看这版故事，插图进度另算。' : project.error?.message ?? project.events.at(-1)?.message ?? '等待下一次制作处理。',
    },
    {
      id: 'structure',
      state: validation && !unmet.length ? 'ready' : project.playable ? 'attention' : 'waiting',
      title: validation && !unmet.length ? '图谱统计已达到当前检查线' : validation ? '图谱统计还要核对' : '还没有图谱统计',
      detail: validation
        ? !unmet.length
          ? `${validation.scenes} 场景、${validation.decisions} 个选择、${validation.routes} 条路线、${validation.endings} 个结局、${validation.badEnds} 个坏结局。`
          : `当前登记：${unmet.join('；')}。`
        : '没有把未登记的场景或结局当作已完成。',
    },
    {
      id: 'art',
      state: project.art.status === 'ready' ? 'ready' : project.art.status === 'failed' ? 'attention' : 'waiting',
      title: project.art.status === 'ready' ? '当前登记插图已审核' : project.art.status === 'failed' ? '插图制作需要处理' : '插图与文字分开准备',
      detail: artStatusLabel(project),
    },
    {
      id: 'journey',
      state: matchingMemories.length ? 'ready' : project.playable ? 'waiting' : 'waiting',
      title: matchingMemories.length ? `已留下 ${matchingMemories.length} 个真实结局` : '还没有这段故事的结局回忆',
      detail: matchingMemories.length ? '这些回忆只会包含实际保存过的场景与选择。' : project.playable ? '玩到一个结局后，看山会把走过的片段收进记录。' : '等文字路线可玩后，才会开始记录真实游玩过程。',
    },
  ];
  const confirmed = items.filter(item => item.state === 'ready').length;
  const nextStep = project.playable
    ? { title: '打开这段故事', detail: project.art.status === 'ready' ? '文字和当前审核通过的插图都已可查看。' : '文字已经能玩，插图仍按自己的进度准备。', canOpenProject: true }
    : { title: '查看制作进度', detail: project.status === 'running' ? '打开工作台查看当前阶段；这里不会启动新的制作任务。' : '打开工作台查看这次停住的位置与后续入口。', canOpenProject: true };
  return { project, items, confirmed, nextStep };
}
