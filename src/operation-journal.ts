import type { JournalStatus } from '../shared/types';
import type { Session } from './game';

export interface JournalView {
  id: string;
  title: string;
  introduction: string;
  status: 'active' | 'paused' | 'closed';
  items: (JournalStatus & { id: string; title: string; evidence: string[] })[];
  cargo?: { capacity: number; remaining: number; used: number; loads: { label: string; slots: number }[]; closed: boolean };
}

function matches(stage: { allClues?: string[]; anyClues?: string[] }, clues: Set<string>): boolean {
  return Boolean(stage.allClues?.length || stage.anyClues?.length)
    && (stage.allClues ?? []).every(clue => clues.has(clue))
    && (!stage.anyClues?.length || stage.anyClues.some(clue => clues.has(clue)));
}

export function operationJournalViews(session: Session): JournalView[] {
  const visited = new Set(session.history.map(entry => entry.nodeId));
  const clues = new Set(session.clues);
  return (session.world.operationJournals ?? []).filter(journal => journal.nodeIds.some(node => visited.has(node))).map(journal => {
    const closed = Boolean(session.node.ending || journal.closedClues?.some(clue => clues.has(clue)));
    const status = closed ? 'closed' : journal.nodeIds.includes(session.node.id) ? 'active' : 'paused';
    const result: JournalView = {
      id: journal.id, title: journal.title, introduction: journal.introduction, status,
      items: journal.items.map(item => {
        const stage = [...item.stages].reverse().find(candidate => matches(candidate, clues));
        const selected = stage ?? item.initial;
        return { id: item.id, title: item.title, label: closed && selected.tone === 'pending' ? '未执行' : selected.label, detail: selected.detail, tone: selected.tone, evidence: stage ? [...new Set([...(stage.allClues ?? []), ...(stage.anyClues ?? [])])].filter(clue => clues.has(clue)) : [] };
      }),
    };
    if (journal.cargo) {
      const resource = session.world.resources?.find(candidate => candidate.id === journal.cargo!.resourceId);
      if (resource) {
        const loads = journal.cargo.loads.filter(load => clues.has(load.clue)).map(({ label, slots }) => ({ label, slots }));
        result.cargo = { capacity: resource.max - resource.min, remaining: session.resources[resource.id] - resource.min,
          used: loads.reduce((total, load) => total + load.slots, 0), loads, closed };
      }
    }
    return result;
  });
}
