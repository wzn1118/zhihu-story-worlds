import type { StorySummary } from '../shared/types';
import type { WorkshopProject } from '../shared/workshop';

export interface LibraryStory extends StorySummary {
  project?: WorkshopProject;
  addedFromWorkshop?: boolean;
  playableId?: string;
}

export function mergeStoryLibrary(stories: StorySummary[], projects: WorkshopProject[]): LibraryStory[] {
  const entries: LibraryStory[] = stories.map(story => ({ ...story }));
  const bySource = new Map(entries.map(story => [`zhihu-story:${story.id}`, story]));
  // Keep one card per original work, preferring an available game over an unfinished revision.
  const candidates = projects.filter(project => project.scope === 'zhihu-excerpt' && project.origin)
    .sort((a, b) => Number(b.playable) - Number(a.playable) || b.updatedAt.localeCompare(a.updatedAt));
  for (const project of candidates) {
    const origin = project.origin!;
    const key = `${origin.kind}:${origin.workId}`;
    const existing = bySource.get(key);
    if (existing) {
      if (!existing.project) {
        existing.project = project;
        if (!existing.playable && project.playable) {
          existing.playable = true;
          existing.playableId = project.id;
        }
      }
      continue;
    }
    const entry: LibraryStory = {
      id: project.id, title: project.title, author: project.author,
      authorAvatar: origin.authorAvatar, sourceCover: origin.cover,
      sourceUrl: origin.sourceUrl, originalUrl: origin.originalUrl,
      description: project.validation
        ? `基于知乎原作节选改编 · ${project.validation.scenes} 个场景 · ${project.validation.routes} 条路线 · ${project.validation.endings} 个结局`
        : '知乎原作节选已保存，可先阅读原文，查看改编进度。',
      labels: ['故事'], playable: project.playable, playableId: project.id,
      project, addedFromWorkshop: true,
    };
    entries.push(entry);
    bySource.set(key, entry);
  }
  return entries;
}

export function storyAdaptationStatus(story: LibraryStory) {
  if (story.playable) return { label: '已改编', tone: 'ready' } as const;
  if (story.project?.status === 'running') return { label: '改编中', tone: 'running' } as const;
  if (story.project?.status === 'failed') return { label: '改编失败', tone: 'failed' } as const;
  if (story.project?.status === 'interrupted') return { label: '待继续', tone: 'pending' } as const;
  return { label: '待改编', tone: 'pending' } as const;
}
