import type { ArtProgress } from './production';

export interface WorkshopImageLaunch {
  id: string;
  projectId: string;
  worldVersion: string;
  state: 'preparing' | 'generating' | 'review' | 'failed' | 'paused' | 'interrupted';
  total: number;
  directed: number;
  batchId?: string;
  progress?: ArtProgress;
  createdAt: string;
  updatedAt: string;
  firstDispatchAt?: string;
  error?: string;
}
