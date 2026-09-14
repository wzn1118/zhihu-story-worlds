import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import type { DraftScene, GeneratedDraft, ImportedSource, RouteDraft } from '../../shared/workshop.ts';
import { buildGeneratedWorld } from '../../server/workshop-compiler.ts';
import type { runCreative } from '../../server/workshop-creative.ts';
import { reviewAndRepairStory, type CreativeEditorialReview, type EditorialFinding } from '../../server/workshop-editorial.ts';
import { StoryWorkshop, writeJson } from '../../server/story-workshop.ts';

export const testText = 'TEST ONLY deterministic recovery fixture. This text validates persistence, graph edges, and checkpoint integrity; it is never a generated story delivery.';
const quotes = ['TEST source clock is seven seconds late', 'TEST source call is from the same person', 'TEST source battery powers only one device'];
export const recoverySource: ImportedSource = {
  title: 'TEST ONLY recovery source', author: 'TEST fixture', scope: 'user-import',
  text: `${quotes.join('. ')}. ${testText}`,
};
export const recoveryObservations = ['TEST ONLY observation: retain all existing scene and choice IDs while verifying the added transition.'];

export function recoveryDraft(): GeneratedDraft {
  const ids = ['route_a', 'route_b', 'route_c'];
  return { outline: {
    title: 'TEST ONLY recovery draft', subtitle: 'Deterministic isolated fixture', summary: testText, introduction: [testText, testText],
    objective: testText, player: { name: 'TEST actor', role: 'TEST engineer' }, beginnerTip: testText,
    facts: quotes.map(quote => ({ quote, fact: testText })),
    characters: ['engineer', 'witness'].map(id => ({ id, name: `TEST ${id}`, role: 'TEST character', description: testText, motive: testText })),
    resources: [{ id: 'battery', label: 'TEST power', initial: 12, min: 0, max: 12, description: testText }],
    routes: ids.map(id => ({ id, title: `TEST ${id}`, commitment: testText, premise: testText,
      beats: Array.from({ length: 10 }, (_, i) => `${i}: ${testText}`),
      endings: (['good', 'bad'] as const).map(kind => ({ id: `${id}_${kind}`, title: `TEST ${kind}`, kind, resolution: testText, cause: testText })) })),
    opening: { title: 'TEST initial opening', location: 'TEST room', time: 'TEST midnight', text: [testText, testText] },
  }, routes: ids.map(routeId => ({ routeId, entry: `${routeId}_s0`, scenes: [
    ...Array.from({ length: 10 }, (_, i): DraftScene => ({ id: `${routeId}_s${i}`, title: `TEST scene ${i}`, location: 'TEST room', time: 'TEST midnight', speaker: 'TEST narrator',
      text: [testText, testText], purpose: `${i}: ${testText}`, artBrief: testText, ending: null,
      choices: [{ id: 'continue_path', text: 'TEST inspect the next panel', hint: `TEST consume one power unit. ${testText}`, next: i < 9 ? `${routeId}_s${i + 1}` : `${routeId}_good`,
        costs: [{ resource: 'battery', delta: -1 }], gains: i === 0 ? [`${routeId}_evidence`] : [], needs: i === 2 ? [`${routeId}_evidence`] : [], feedback: testText },
      { id: 'exit_path', text: 'TEST return to the exit', hint: testText, next: `${routeId}_bad`, costs: [], gains: [], needs: [], feedback: testText }] })),
    ...(['good', 'bad'] as const).map((kind): DraftScene => ({ id: `${routeId}_${kind}`, title: `TEST ${kind} ending`, location: 'TEST shore', time: 'TEST morning', speaker: 'TEST narrator',
      text: [testText, testText], purpose: `${kind}: ${testText}`, artBrief: testText, choices: [], ending: { kind, title: `TEST ${kind} ending`, resolution: testText } })),
  ] })) };
}

function findings(draft: GeneratedDraft): EditorialFinding[] {
  const route = draft.routes[0], scene = route.scenes[0];
  return [{ id: 'test_opening_transition', severity: 'blocking', category: 'continuity', basis: 'invented_continuation',
    problem: 'TEST ONLY: the opening transition must be included before the first route.', sourceQuotes: [],
    evidence: [{ kind: 'opening', routeId: null, sceneId: null, choiceId: null, path: '/text/0', quote: draft.outline.opening.text[0] }],
    repair: { outlineFields: ['opening'], routeIds: [], instruction: 'TEST ONLY: update the opening transition while preserving all other data.' } },
  { id: 'test_route_transition', severity: 'blocking', category: 'continuity', basis: 'invented_continuation',
    problem: 'TEST ONLY: the first route requires one transition that retains existing scenes.', sourceQuotes: [],
    evidence: [{ kind: 'scene', routeId: route.routeId, sceneId: scene.id, choiceId: null, path: '/text/0', quote: scene.text[0] }],
    repair: { outlineFields: [], routeIds: [route.routeId], instruction: 'TEST ONLY: complete the route transition and retain every prior scene and choice.' } }];
}

function line<T>(prompt: string, name: string): T {
  const value = prompt.split('\n').find(value => value.startsWith(`${name}=`));
  assert.ok(value, `TEST generator expected ${name}`);
  return JSON.parse(value.slice(name.length + 1)) as T;
}

export function extendedRoute(route: RouteDraft): RouteDraft {
  const next = structuredClone(route), extra = structuredClone(next.scenes[1]);
  extra.id = `${route.routeId}_test_bridge`;
  extra.title = 'TEST added transition';
  extra.purpose = `TEST added bridge purpose: ${testText}`;
  extra.choices[0].next = `${route.routeId}_s1`;
  next.scenes[0].choices[0].next = extra.id;
  next.scenes.splice(1, 0, extra);
  return next;
}

export type RecoveryFixtureMode = 'extension' | 'replace-scene' | 'remove-choice' | 'unrelated-rejection' | 'accepted';

/** This explicit callback is the only generator used by recovery tests. */
function testGenerator(mode: RecoveryFixtureMode): typeof runCreative {
  return async <T>(_directory: string, label: string, _schema: unknown, prompt: string): Promise<T> => {
    const source = line<ImportedSource>(prompt, 'USER_SOURCE_DATA'), draft = line<GeneratedDraft>(prompt, 'DRAFT_DATA');
    assert.deepEqual(source, recoverySource);
    let value: unknown;
    if (label.startsWith('review-')) {
      value = { summary: 'TEST ONLY deterministic independent checkpoint response.',
        coverage: { opening: 'reviewed', outline: 'reviewed', routes: draft.routes.map(r => ({ routeId: r.routeId, sceneIds: r.scenes.map(s => s.id) })) },
        findings: draft.outline.opening.title === 'TEST initial opening' ? findings(draft) : [],
      } satisfies CreativeEditorialReview;
    } else if (label.startsWith('outline-repair-')) {
      assert.deepEqual(line(prompt, 'REPAIR_TARGET_DATA'), { outlineFields: ['opening'], routeIds: [] });
      value = { opening: { ...draft.outline.opening, title: 'TEST repaired opening' } };
    } else {
      assert.ok(label.startsWith('route-repair-'));
      assert.deepEqual(line(prompt, 'REPAIR_TARGET_DATA'), { outlineFields: [], routeIds: ['route_a'] });
      const route = structuredClone(draft.routes[0]);
      if (mode === 'extension') value = extendedRoute(route);
      else if (mode === 'replace-scene') { route.scenes[1].id = 'route_a_test_replacement'; value = route; }
      else if (mode === 'remove-choice') { route.scenes[0].choices.pop(); value = route; }
      else if (mode === 'unrelated-rejection') { route.entry = 'route_a_s1'; value = route; }
      else { route.scenes[0].text[0] = `TEST accepted repair. ${testText}`; value = route; }
    }
    return structuredClone(value) as T;
  };
}

export async function recoveryFixture(context: TestContext, mode: RecoveryFixtureMode = 'extension') {
  const root = await mkdtemp(join(tmpdir(), 'workshop-recovery-test-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const service = new StoryWorkshop(root), project = await service.import(recoverySource), draft = recoveryDraft();
  project.revision = 2; project.status = 'failed'; project.stage = 'editorial'; project.jobId = 'test-interrupted-owner';
  project.publishedVersion = 'r1'; project.playable = true;
  await service.save(project);
  const directory = join(service.dir(project.id), 'r2'), published = join(service.dir(project.id), 'r1');
  await mkdir(directory); await mkdir(published);
  const publishedWorld = buildGeneratedWorld(project.id, 1, recoverySource, draft).world;
  await writeJson(join(published, 'world.json'), publishedWorld);
  await writeJson(join(published, 'draft.json'), draft);
  await writeJson(join(directory, 'draft.json'), draft);
  await writeJson(join(directory, 'outline.json'), draft.outline);
  for (const route of draft.routes) await writeJson(join(directory, `route-${route.routeId}.json`), route);
  const editorial = join(directory, 'editorial');
  const run = reviewAndRepairStory(recoverySource, draft, { directory: editorial, generate: testGenerator(mode) });
  if (mode === 'accepted') await run;
  else await assert.rejects(run, /Editorial output rejected/);
  const [name] = await readdir(editorial), runDirectory = join(editorial, name), files = await readdir(runDirectory);
  const snapshot = join(runDirectory, 'round-0.draft.json');
  const acceptedReview = join(runDirectory, files.find(name => name.startsWith('review-r0-') && name.endsWith('.accepted.json'))!);
  const outlineRepair = join(runDirectory, files.find(name => name.startsWith('outline-repair-r0-') && name.endsWith('.accepted.json'))!);
  const routeRepair = join(runDirectory, files.find(name => name.startsWith('route-repair-r0-') && /\.(accepted|rejected)\.json$/.test(name))!);
  return { root, service, project, draft, directory, published, runDirectory, snapshot, acceptedReview, outlineRepair, routeRepair, repairs: [outlineRepair, routeRepair] };
}
