import type { AgentPlot, CharacterNotes, GameplayPlan } from '../../server/workshop-agent-contract.ts';
import { routeGraphOf } from '../../server/workshop-route-generation.ts';
import type { DraftScene, ImportedSource, RouteDraft } from '../../shared/workshop.ts';

export const agentFixtureProse = 'Explicit synthetic test fixture only. The adult operator checks the station record, hears the adult witness describe the damaged cable, and keeps the evidence before moving to the next room.';
/** Synthetic provider output only; never a generated or published game. */
export function workshopAgentFixture() {
  const prose = agentFixtureProse;
  const source: ImportedSource = { title: 'Synthetic agent test', author: 'Automated test', scope: 'user-import', text: '\uFEFFThe operator keeps the evidence.\r\nThe cable is damaged.  The witness returns the key.' };
  const plot: AgentPlot = {
    outline: {
      title: source.title, subtitle: 'Fixture only', summary: prose, introduction: [prose, prose], objective: prose,
      player: { name: 'Operator', role: 'Adult station operator' }, beginnerTip: prose,
      facts: ['The operator keeps the evidence.', 'The cable is damaged.', 'The witness returns the key.'].map(quote => ({ quote, fact: prose })),
      characters: ['operator', 'witness'].map(id => ({ id, name: id === 'operator' ? 'Operator' : 'Witness', role: 'Adult test character', description: prose, motive: prose })),
      resources: [{ id: 'battery', label: 'Battery', initial: 12, min: 0, max: 12, description: prose }],
      routes: ['route_a', 'route_b', 'route_c'].map(id => ({ id, title: `Inspect ${id}`, commitment: prose, premise: prose,
        beats: Array.from({ length: 10 }, (_, i) => `${i}: ${prose}`),
        endings: (['good', 'bad'] as const).map(kind => ({ id: `${id}_${kind}`, title: `Test ${kind}`, kind, resolution: prose, cause: prose })),
      })),
      opening: { title: 'Opening', location: 'Station', time: 'Before departure', text: [prose, prose] },
    },
    canon: {
      cast: [{ id: 'operator', name: 'Operator', count: 1 }, { id: 'witness', name: 'Witness', count: 1 }],
      rules: ['All test characters are adults; evidence remains available after collection.'],
      truth: 'AUTHOR_ONLY_TRUTH: The damaged cable was installed deliberately by the witness to postpone departure and keep the original station records available.',
      reveals: ['route_a', 'route_b', 'route_c'].map(routeId => ({ routeId, endingId: `${routeId}_good`, evidence: 'The cable record and matching key prove who installed the damaged cable and explain the delayed departure.' })),
    },
  };
  const notes: CharacterNotes = { characters: plot.outline.characters.map(character => ({ id: character.id,
    desire: 'Keep the original record private until departure.', relationship: 'The witness owes the operator one explanation.', voice: 'Speaks in brief replies and never repeats a question.', taboo: 'Will not accuse a colleague without the original record.',
  })) };
  const routes: RouteDraft[] = plot.outline.routes.map(route => ({ routeId: route.id, entry: `${route.id}_s0`, scenes: [
    ...Array.from({ length: 10 }, (_, i): DraftScene => ({ id: `${route.id}_s${i}`, title: `Test scene ${i}`, location: 'Station', time: 'Before departure', speaker: 'Narrator', text: [prose, `${prose} ${i}`], purpose: `${i}: Check the corresponding cable and preserve the original test evidence.`, artBrief: prose, ending: null,
      choices: [{ id: 'continue_path', text: 'Inspect the next station record', hint: prose.slice(0, 120), next: i < 9 ? `${route.id}_s${i + 1}` : `${route.id}_good`, costs: [{ resource: 'battery', delta: -1 }], gains: i === 0 ? ['cable_evidence'] : [], needs: [2, 3].includes(i) ? ['cable_evidence'] : [], feedback: prose },
        { id: 'exit_path', text: 'Leave through the marked exit', hint: prose.slice(0, 120), next: `${route.id}_bad`, costs: [], gains: [], needs: [], feedback: prose }],
    })),
    ...route.endings.map(ending => ({ id: ending.id, title: ending.title, location: 'Shore', time: 'After departure', speaker: 'Narrator', text: [prose, `${prose} ${ending.kind}`], purpose: `Record the ${ending.kind} outcome and return all surviving operators to shore.`, artBrief: prose, choices: [], ending: { kind: ending.kind, title: ending.title, resolution: prose } })),
  ] }));
  const plans: GameplayPlan[] = routes.map(route => ({ routeId: route.routeId, graph: routeGraphOf(route), scenes: route.scenes.map(scene => ({
    id: scene.id, castIds: ['operator', 'witness'], requires: scene.id.endsWith('_s0') || scene.ending?.kind === 'bad' ? [] : ['cable_evidence'],
    change: `Complete the ${scene.id} event and establish its immediate consequence.`,
  })) }));
  return { source, plot, notes, plans, routes };
}
