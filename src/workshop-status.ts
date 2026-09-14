import type { WorkshopProject } from '../shared/workshop';

export function workshopEditorialPresentation(project: Pick<WorkshopProject, 'status' | 'revision' | 'editorial'>) {
  const editorial = project.editorial;
  const historical = editorial && (editorial.revision !== project.revision
    || (project.status === 'running' && editorial.status === 'failed'));
  return {
    current: historical ? undefined : editorial,
    history: historical ? editorial : undefined,
  };
}
