import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorkshopProject } from '../shared/workshop';
import { fetchJson } from './game';

export function useZhihuProjects(enabled: boolean) {
  const [projects, setProjects] = useState<WorkshopProject[]>([]);
  const [error, setError] = useState('');
  const request = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++request.current;
    try {
      const result = await fetchJson<{ projects: WorkshopProject[] }>('/api/workshop/projects');
      if (current === request.current) { setProjects(result.projects); setError(''); }
    } catch (cause) {
      if (current === request.current) setError(cause instanceof Error ? cause.message : '请稍后重试');
    }
  }, []);
  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 10000);
    return () => { window.clearInterval(timer); ++request.current; };
  }, [enabled, refresh]);
  return { projects, error, refresh };
}
