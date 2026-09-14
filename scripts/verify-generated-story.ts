import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { StoryWorkshop, jsonFile, hashSource } from '../server/story-workshop.ts';
import { buildGeneratedWorld } from '../server/workshop-compiler.ts';
import { assertEditorialPass, editorialHash, type EditorialReport } from '../server/workshop-editorial.ts';
import { editorialPolicyHash, readEditorialNotes, workshopEditorialPolicy, type EditorialNotes } from '../server/workshop-editorial-job.ts';
import { playerChoiceStyle, wholeStoryStyle, completeOpeningStyle, repairChoiceStyle } from '../server/workshop-creative.ts';
import { choiceBlockers, type ChoiceState } from '../shared/choice-rules.ts';
import type { Choice, ResourceDefinition, SceneNode } from '../shared/types.ts';
import type { GeneratedDraft } from '../shared/workshop.ts';
import { startSession, choose, encodeSaveFile, parseSaveFile, saveSession, restoreSession } from '../src/game.ts';

export interface PressureCase {
  routeId: string; resourceId: string; minimum: number; value: number; nodeId: string; path: string[];
  kind: 'depleted' | 'unaffordable'; costlyChoiceId: string | null; cost: number | null; requiredValue: number | null;
  exitChoiceId: string; nextNodeId: string;
}
export interface PressureCoverage {
  routeId: string; resourceId: string; minimum: number; minimumObserved: number | null; minimumDecisionObserved: number | null;
  depletedDecisionReachable: boolean; affordabilityPressureReachable: boolean;
  status: 'cases-recorded' | 'no-pressure-reachable'; caseCount: number;
}
export function freeUnconditional(choice: Choice): boolean {
  const requires = choice.requires;
  return !choice.requiresClue && !requires?.allClues?.length && !requires?.anyClues?.length && !requires?.noneClues?.length
    && !Object.keys(requires?.resources ?? {}).length && !requires?.resolve && !requires?.trust
    && Object.values(choice.effects?.resources ?? {}).every(delta => delta >= 0);
}
export function costPressure(choice: Choice, resource: ResourceDefinition, state: ChoiceState, resources: ResourceDefinition[]) {
  const cost = Math.max(0, -(choice.effects?.resources?.[resource.id] ?? 0));
  const requiredValue = resource.min + cost;
  if (!cost || (state.resources[resource.id] ?? resource.initial) >= requiredValue) return null;
  // Ignore only resource requirements/costs; clue and other prerequisites still apply.
  const withoutResourceGates: Choice = { ...choice, requires: { ...choice.requires, resources: undefined },
    effects: { ...choice.effects, resources: {} } };
  return choiceBlockers(withoutResourceGates, state, resources).length ? null : { cost, requiredValue };
}
export function pressureAtState(routeId: string, node: Pick<SceneNode, 'id' | 'choices' | 'ending'>,
  path: string[], state: ChoiceState, resources: ResourceDefinition[]): PressureCase[] {
  if (node.ending) return [];
  const exits = node.choices.filter(choice => freeUnconditional(choice) && !choiceBlockers(choice, state, resources).length);
  const cases: PressureCase[] = [];
  for (const resource of resources) {
    const value = state.resources[resource.id] ?? resource.initial;
    const reasons: Pick<PressureCase, 'kind' | 'costlyChoiceId' | 'cost' | 'requiredValue'>[] = [];
    if (value === resource.min) reasons.push({ kind: 'depleted', costlyChoiceId: null, cost: null, requiredValue: null });
    for (const choice of node.choices) {
      const pressure = costPressure(choice, resource, state, resources);
      if (pressure) reasons.push({ kind: 'unaffordable', costlyChoiceId: choice.id, ...pressure });
    }
    if (reasons.length) assert.ok(exits.length, `${node.id}: resource pressure needs a genuinely free unconditional exit`);
    for (const reason of reasons) for (const exit of exits) cases.push({ routeId, resourceId: resource.id, minimum: resource.min,
      value, nodeId: node.id, path: [...path], ...reason, exitChoiceId: exit.id, nextNodeId: exit.nextNodeId });
  }
  return cases;
}
export function observePressure(prior: PressureCoverage, value: number, ending: boolean, cases: PressureCase[]): PressureCoverage {
  const relevant = cases.filter(item => item.routeId === prior.routeId && item.resourceId === prior.resourceId);
  const depletedDecisionReachable = prior.depletedDecisionReachable || relevant.some(item => item.kind === 'depleted');
  const affordabilityPressureReachable = prior.affordabilityPressureReachable || relevant.some(item => item.kind === 'unaffordable');
  return { ...prior, minimumObserved: Math.min(prior.minimumObserved ?? Infinity, value),
    minimumDecisionObserved: ending ? prior.minimumDecisionObserved : Math.min(prior.minimumDecisionObserved ?? Infinity, value),
    depletedDecisionReachable, affordabilityPressureReachable,
    status: depletedDecisionReachable || affordabilityPressureReachable ? 'cases-recorded' : 'no-pressure-reachable' };
}
export function pressureKey(item: PressureCase): string {
  return JSON.stringify([item.routeId, item.resourceId, item.nodeId, item.kind, item.costlyChoiceId, item.exitChoiceId]);
}

export function assertReviewedWorldSnapshot<T extends { nodes: Record<string, Pick<SceneNode, 'id' | 'artBrief'>> }>(published: T, reviewed: T) {
  const expected = JSON.parse(JSON.stringify(reviewed)) as T;
  const expectedBriefs = Object.values(expected.nodes).filter(node => node.artBrief !== undefined).length;
  const publishedBriefs = Object.values(published.nodes).filter(node => node.artBrief !== undefined).length;
  const legacyArtBriefsAbsent = expectedBriefs > 0 && publishedBriefs === 0;
  // artBrief was added as optional production metadata after the first publication.
  // Mixed, altered or newly supplied briefs still require the exact reviewed values.
  if (legacyArtBriefsAbsent) for (const node of Object.values(expected.nodes)) delete node.artBrief;
  assert.ok(isDeepStrictEqual(published, expected), 'Published story data differs from the reviewed draft; only fully absent optional legacy art briefs are compatible');
  return { legacyArtBriefsAbsent, publishedBriefs, reviewedBriefs: expectedBriefs };
}

export function assertReviewedPolicy(prompt: string, hash: string, notes?: EditorialNotes) {
  const value = (key: string) => {
    const lines = prompt.split('\n').filter(line => line.startsWith(`${key}=`));
    assert.equal(lines.length, key === 'REVIEWER_OBSERVATIONS_DATA' && !notes ? 0 : 1, `Expected one recorded ${key}`);
    return lines.length ? JSON.parse(lines[0].slice(key.length + 1)) as unknown : undefined;
  };
  const policy = value('TRUSTED_ADAPTATION_EDITORIAL_REQUIREMENTS');
  assert.equal(typeof policy, 'string');
  assert.ok(isDeepStrictEqual(value('REVIEWER_OBSERVATIONS_DATA'), notes), 'Recorded source-bound observations changed');
  assert.equal(editorialHash(notes ? { policy, notes } : policy), hash, 'Actual creative prompt must match its ledger policy');
  const prefix = [playerChoiceStyle, wholeStoryStyle, completeOpeningStyle].join('\n') + '\n';
  const suffix = '\n' + repairChoiceStyle;
  assert.ok((policy as string).startsWith(prefix) && (policy as string).endsWith(suffix), 'Published review must include current narrative requirements');
  return { publishedPolicyHash: hash, currentPolicyHash: editorialPolicyHash(notes), currentNarrativeRequirements: true,
    artDirectionChanged: policy !== workshopEditorialPolicy };
}

async function main() {
  const id = process.argv[2];
  if (!id) throw new Error('Usage: node --import tsx scripts/verify-generated-story.ts import-UUID');
  const service = new StoryWorkshop();
  const project = await service.get(id), source = await service.source(id), world = await service.world(id);
  const draft = await jsonFile<GeneratedDraft>(join(service.dir(id), world.version, 'draft.json'));
  const built = buildGeneratedWorld(id, world.generated!.revision, source, draft);
  assert.deepEqual(built.world.ink, world.ink, 'Published Ink must match the validated draft');
  if (world.generated?.editorial) built.world.generated!.editorial = world.generated.editorial;
  const snapshotCompatibility = assertReviewedWorldSnapshot(world, built.world);
  let policyCompatibility: ReturnType<typeof assertReviewedPolicy> | undefined;
  if (process.argv.includes('--require-editorial')) {
    assert.ok(world.generated?.editorial, 'The published revision must have an independent editorial pass');
    assert.equal(world.generated.editorial.draftHash, editorialHash(draft), 'Editorial approval must belong to these exact draft contents');
    const directory = join(service.dir(id), world.version);
    const report = await jsonFile<EditorialReport>(join(directory, 'editorial-report.json'));
    assertEditorialPass(source, draft, report);
    const ledger = await jsonFile<{ series: number; policyHash: string; status: string }>(join(directory, 'editorial-run.json'));
    assert.equal(ledger.status, 'passed');
    assert.ok(Number.isSafeInteger(ledger.series) && ledger.series >= 1 && /^[a-f0-9]{64}$/.test(ledger.policyHash));
    const final = report.rounds.at(-1)!, label = final.reviewCheckpoint;
    assert.ok(/^review-r\d+-[a-f0-9]{24}-a[12]$/.test(label));
    const run = join(directory, 'editorial', `run-${ledger.series}-${ledger.policyHash.slice(0, 12)}`, `${report.protocol}-${report.runId.slice(0, 24)}`);
    const accepted = await jsonFile<{ inputHash: string; outputHash: string; data: unknown }>(join(run, `${label}.accepted.json`));
    const input = await jsonFile<{ draftHash: string; sourceHash: string }>(join(run, `${label.replace(/-a[12]$/, '')}.input.json`));
    const request = await jsonFile<{ inputHash: string; prompt: string }>(join(run, `${label}.request.json`));
    assert.equal(accepted.inputHash, editorialHash(input)); assert.equal(request.inputHash, accepted.inputHash);
    assert.equal(input.draftHash, editorialHash(draft)); assert.equal(input.sourceHash, editorialHash(source));
    assert.equal(accepted.outputHash, editorialHash(accepted.data)); assert.ok(isDeepStrictEqual(accepted.data, final.review));
    const prompt = await readFile(join(run, 'creative', `${label}.prompt.txt`), 'utf8');
    assert.ok(prompt.startsWith(request.prompt + '\nTRUSTED_ADAPTATION_EDITORIAL_REQUIREMENTS='));
    policyCompatibility = assertReviewedPolicy(prompt, ledger.policyHash, await readEditorialNotes(directory, source));
    const receipt = await jsonFile<{ engine: string; model: string; reasoning: string; catalogOverride: boolean; exitCode: number }>(join(run, 'creative', `${label}.receipt.json`));
    assert.equal(receipt.engine, 'configured-local-cli'); assert.equal(receipt.model, 'inherited'); assert.equal(receipt.reasoning, 'inherited');
    assert.equal(receipt.catalogOverride, true); assert.equal(receipt.exitCode, 0);
  }
  assert.equal(project.sourceHash, hashSource(source));
  const output = resolve('output/workshop-sample', `${id}-${world.version}-${Date.now()}`);
  await mkdir(output, { recursive: true });
  const stateKeys = new Set<string>(), nodes = new Set<string>(), edges = new Set<string>();
  const queue: string[][] = [[]], endings = new Map<string, string[]>();
  const pressureCases = new Map<string, PressureCase>();
  const pressureCoverage = new Map<string, PressureCoverage>(draft.routes.flatMap(route => (world.resources ?? []).map(resource => [
    `${route.routeId}/${resource.id}`, { routeId: route.routeId, resourceId: resource.id, minimum: resource.min,
      minimumObserved: null, minimumDecisionObserved: null, depletedDecisionReachable: false,
      affordabilityPressureReachable: false, status: 'no-pressure-reachable', caseCount: 0 },
  ])));
  for (let index = 0; index < queue.length; index++) {
    let session = startSession(world);
    const path = queue[index];
    for (const choiceId of path) {
      const c = session.choices.find(c => c.id === choiceId);
      assert.ok(c, `Ink path must be enabled: ${path.join('/')}`);
      session = choose(session, c);
    }
    const stateKey = JSON.stringify([session.node.id, [...session.clues].sort(), session.resources]);
    if (stateKeys.has(stateKey)) continue;
    stateKeys.add(stateKey); nodes.add(session.node.id);
    assert.ok(stateKeys.size <= 150000, 'Finite verification budget');
    const expected = session.node.choices.filter(c => !choiceBlockers(c, session, world.resources).length).map(c => c.id).sort();
    assert.deepEqual(session.choices.map(c => c.id).sort(), expected, 'Runtime Ink and UI gating agree');
    assert.deepEqual(session.paragraphs, session.node.text, 'Prose is inert JSON data, not interpreted Ink');
    // Regression captured from the actual sample's independent review, not a
    // generation template: repaired evidence must not still be called missing.
    if (id === 'import-6febc2f6-3a12-41ac-bae5-6d05ebc68c10' && session.node.id === 'let_the_record_speak_11_seal_the_record') {
      for (const [clue, suffix] of [['命令链', 'without_order'], ['身份链', 'without_identity'], ['完整证言', 'without_testimony']]) {
        if (session.clues.includes(clue)) assert.ok(!session.choices.some(c => c.id?.endsWith(suffix)), `已取得${clue}后仍出现缺项封尾，属于过期标记：${path.join('/')}`);
      }
    }
    if (id === 'import-0b3ce5e1-1f96-474d-871d-5e2a2a541713' && session.node.ending && session.node.id.startsWith('return_with_luoli_')) {
      assert.ok(session.clues.includes('return_with_luoli_home_words'), `The homecoming explanation requires the actual recorded words on every ending path: ${path.join('/')}`);
    }
    const restored = restoreSession(world, parseSaveFile(encodeSaveFile(saveSession(session))));
    assert.equal(restored.node.id, session.node.id);
    assert.deepEqual(restored.resources, session.resources);
    assert.deepEqual(restored.clues, session.clues);
    assert.deepEqual(restored.choices, session.choices);
    const route = draft.routes.find(r => r.scenes.some(s => s.id === session.node.id));
    const currentPressure = route ? pressureAtState(route.routeId, session.node, path, session, world.resources ?? []) : [];
    for (const item of currentPressure) {
      const key = pressureKey(item), prior = pressureCases.get(key);
      if (!prior || item.value < prior.value) pressureCases.set(key, item);
    }
    if (route) for (const resource of world.resources ?? []) {
      const key = `${route.routeId}/${resource.id}`;
      pressureCoverage.set(key, observePressure(pressureCoverage.get(key)!, session.resources[resource.id], Boolean(session.node.ending), currentPressure));
    }
    if (session.node.ending) { if (!endings.has(session.node.id)) endings.set(session.node.id, path); continue; }
    assert.ok(session.choices.length, `No dead end at ${session.node.id}`);
    for (const c of session.choices) { edges.add(`${session.node.id}/${c.id}`); queue.push([...path, c.id]); }
  }
  assert.equal(nodes.size, Object.keys(world.nodes).length);
  assert.equal(edges.size, Object.values(world.nodes).reduce((sum, node) => sum + node.choices.length, 0));
  assert.equal(endings.size, Object.values(world.nodes).filter(n => n.ending).length);
  const report = { at: new Date().toISOString(), projectId: id, worldId: world.id, version: world.version, title: world.title, sourceScope: source.scope, sourceIdentitySha256: project.sourceHash, sourceEnvelopeSha256: createHash('sha256').update(JSON.stringify(source), 'utf8').digest('hex'), sourceTextSha256: createHash('sha256').update(source.text, 'utf8').digest('hex'), validation: built.validation, inkRuntimeStates: stateKeys.size, allNodes: nodes.size, allChoices: edges.size, everyStateSaveRoundtrip: true, artReady: world.generated!.artReady, editorial: world.generated!.editorial ?? null, endings: [...endings].map(([id, path]) => ({ id, title: world.nodes[id].ending!.title, tone: world.nodes[id].ending!.tone, path })) };
  Object.assign(report, { snapshotCompatibility, policyCompatibility, pressureCases: [...pressureCases.values()], pressureCoverage: [...pressureCoverage.values()].map(entry => ({ ...entry,
    caseCount: [...pressureCases.values()].filter(item => item.routeId === entry.routeId && item.resourceId === entry.resourceId).length,
  })) });
  await writeFile(join(output, 'acceptance.json'), JSON.stringify(report, null, 2));
  const reading = [`# ${world.title} · 生成稿验读`, '', `来源类型：${source.scope}。新增人物、对白、路线与结局均为改编。`, '', '## 引导', ...world.introduction, '', world.mechanics!.beginnerTip,
    ...Object.values(world.nodes).flatMap(node => ['', `## ${node.id} / ${node.title}`, `${node.chapter} · ${node.location} · ${node.time}`, ...node.text,
      ...node.choices.map(c => `- ${c.text} → ${c.nextNodeId}；${c.hint}；资源 ${JSON.stringify(c.effects?.resources ?? {})}；门槛 ${JSON.stringify(c.requires?.allClues ?? [])}`),
      ...(node.ending ? [`**结局：${node.ending.title} / ${node.ending.tone}**`] : [])])].join('\n\n');
  await writeFile(join(output, 'reading-draft.md'), reading, 'utf8');
  console.log(JSON.stringify({ output, ...report }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
