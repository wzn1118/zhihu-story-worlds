/**
 * Compare two real Catalog A server captures. Prose may change between captures,
 * but graph, source attribution, save-facing choice contracts, and all reachable
 * state transitions must remain stable.
 *
 * Run: npx tsx tests/catalog-a-live-delta.ts [previousCapture] [currentCapture]
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Choice, GameWorld, SceneNode } from '../shared/types.ts';
import { enumerateA, replayA } from './catalog-a-graph.ts';

type ManifestWorld = { worldId: string; storyId: string; version: string; sha256: string; bytes: number; file: string };
type ManifestRoute = { worldId: string; storyId: string; failed: string; avoided: string; path: string[]; alternative: string[] };
type Manifest = { worlds: ManifestWorld[]; paths: ManifestRoute[] };

const previousDirectory = resolve(process.argv[2] ?? 'output/playwright/catalog-a-live/2026-09-06T04-13-44-426Z');
const currentDirectory = resolve(process.argv[3] ?? 'output/playwright/catalog-a-live/2026-09-06T19-44-16-346Z');
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const json = async <T>(file: string) => JSON.parse(await readFile(file, 'utf8')) as T;
const sorted = <T extends { id: string }>(entries: readonly T[]) => [...entries].sort((left, right) => left.id.localeCompare(right.id));

function choiceContract(choice: Choice) {
  return {
    id: choice.id,
    nextNodeId: choice.nextNodeId,
    effects: choice.effects,
    requiresClue: choice.requiresClue,
    requires: choice.requires,
    repeatable: choice.repeatable,
  };
}

function nodeContract(node: SceneNode) {
  return {
    id: node.id,
    chapter: node.chapter,
    title: node.title,
    location: node.location,
    time: node.time,
    clock: node.clock,
    background: node.background,
    speaker: node.speaker,
    artBrief: node.artBrief,
    character: node.character,
    challenge: node.challenge,
    ending: node.ending && { title: node.ending.title, tone: node.ending.tone },
    choices: node.choices.map(choiceContract),
  };
}

function worldContract(world: GameWorld) {
  return {
    id: world.id,
    storyId: world.storyId,
    version: world.version,
    compatibleSaveVersions: world.compatibleSaveVersions,
    startNodeId: world.startNodeId,
    source: world.source,
    adaptation: world.adaptation,
    calendar: world.calendar,
    cover: world.cover,
    background: world.background,
    resources: world.resources,
    clueVariables: world.clueVariables,
    nodeIds: Object.keys(world.nodes).sort(),
  };
}

function stateContract(world: GameWorld, path: string[]) {
  const session = replayA(world, path);
  return {
    nodeId: session.node.id,
    resources: session.resources,
    clues: [...session.clues].sort(),
    resolve: session.resolve,
    trust: session.trust,
    choices: session.choices.map(choice => choice.id),
  };
}

const previousManifest = await json<Manifest>(resolve(previousDirectory, 'served-manifest.json'));
const currentManifest = await json<Manifest>(resolve(currentDirectory, 'served-manifest.json'));
assert.deepEqual(
  currentManifest.worlds.map(world => world.worldId).sort(),
  previousManifest.worlds.map(world => world.worldId).sort(),
  'Catalog A world set changed between captures',
);
assert.deepEqual(currentManifest.paths, previousManifest.paths, 'Acceptance route handoff changed between captures');

const summary: Array<Record<string, unknown>> = [];
const allChangedNodes: Array<Record<string, unknown>> = [];
for (const currentEntry of currentManifest.worlds) {
  const previousEntry = previousManifest.worlds.find(entry => entry.worldId === currentEntry.worldId)!;
  assert.equal(currentEntry.storyId, previousEntry.storyId, `${currentEntry.worldId}: story binding changed`);
  assert.equal(currentEntry.version, previousEntry.version, `${currentEntry.worldId}: version changed`);
  const previous = await json<GameWorld>(previousEntry.file);
  const current = await json<GameWorld>(currentEntry.file);
  assert.deepEqual(worldContract(current), worldContract(previous), `${current.id}: non-prose world contract changed`);

  const changedNodes: Array<Record<string, unknown>> = [];
  for (const nodeId of Object.keys(previous.nodes).sort()) {
    const oldNode = previous.nodes[nodeId], newNode = current.nodes[nodeId];
    assert.ok(newNode, `${current.id}/${nodeId}: node removed`);
    assert.deepEqual(nodeContract(newNode), nodeContract(oldNode), `${current.id}/${nodeId}: non-prose node contract changed`);
    assert.equal(newNode.choices.length, oldNode.choices.length, `${current.id}/${nodeId}: choice count changed`);
    for (const oldChoice of oldNode.choices) {
      const newChoice = newNode.choices.find(choice => choice.id === oldChoice.id);
      assert.ok(newChoice, `${current.id}/${nodeId}/${oldChoice.id}: choice removed`);
      assert.deepEqual(choiceContract(newChoice), choiceContract(oldChoice), `${current.id}/${nodeId}/${oldChoice.id}: choice contract changed`);
      if (oldChoice.text !== newChoice.text) {
        assert.ok(newChoice.legacyTexts?.includes(oldChoice.text), `${current.id}/${nodeId}/${oldChoice.id}: rewritten choice lost legacy replay text`);
      }
      for (const legacy of oldChoice.legacyTexts ?? []) {
        assert.ok(newChoice.legacyTexts?.includes(legacy) || newChoice.text === legacy, `${current.id}/${nodeId}/${oldChoice.id}: legacy replay text removed`);
      }
    }
    if (JSON.stringify(oldNode.text) !== JSON.stringify(newNode.text)) {
      const paragraphs = oldNode.text.map((before, index) => ({ before, after: newNode.text[index] })).filter(paragraph => paragraph.before !== paragraph.after);
      changedNodes.push({ nodeId, endingTone: newNode.ending?.tone ?? null, paragraphs });
    }
  }

  const oldGraph = enumerateA(previous), newGraph = enumerateA(current);
  assert.deepEqual([...newGraph.nodePaths.keys()].sort(), [...oldGraph.nodePaths.keys()].sort(), `${current.id}: reachable node set changed`);
  assert.deepEqual([...newGraph.edgePaths.keys()].sort(), [...oldGraph.edgePaths.keys()].sort(), `${current.id}: reachable choice set changed`);
  const routes = currentManifest.paths.filter(route => route.worldId === current.id);
  const routeChecks = routes.flatMap(route => [
    { variant: 'failed', expectedEnding: route.failed, path: route.path },
    { variant: 'avoided', expectedEnding: route.avoided, path: [...route.path.slice(0, -1), ...route.alternative] },
  ]).map(route => {
    const beforeState = stateContract(previous, route.path), afterState = stateContract(current, route.path);
    assert.equal(beforeState.nodeId, route.expectedEnding, `${current.id}/${route.variant}: old route ended elsewhere`);
    assert.equal(afterState.nodeId, route.expectedEnding, `${current.id}/${route.variant}: current route ended elsewhere`);
    assert.deepEqual(afterState, beforeState, `${current.id}/${route.variant}: ending state changed`);
    return { ...route, state: afterState };
  });
  const cache = (await json<{ data: { author_name: string; chapter_name: string; content: string } }>(`.local/zhihu-cache/story-${current.storyId}.json`)).data;
  assert.equal(cache.author_name, current.source.author, `${current.id}: author attribution drifted`);
  assert.equal(cache.chapter_name, current.source.title, `${current.id}: source title drifted`);
  const endings = sorted(Object.values(current.nodes).filter(node => node.ending).map(node => ({ id: node.id, tone: node.ending!.tone })));
  summary.push({
    worldId: current.id,
    storyId: current.storyId,
    oldSha256: previousEntry.sha256,
    currentSha256: currentEntry.sha256,
    oldBytes: previousEntry.bytes,
    currentBytes: currentEntry.bytes,
    nodes: Object.keys(current.nodes).length,
    choices: Object.values(current.nodes).flatMap(node => node.choices).length,
    endings,
    graphStates: { previous: oldGraph.states.length, current: newGraph.states.length },
    changedNodeIds: changedNodes.map(node => node.nodeId),
    source: { title: current.source.title, author: current.source.author, sha256: sha256(cache.content), length: cache.content.length },
    routeChecks,
  });
  allChangedNodes.push(...changedNodes.map(change => ({ worldId: current.id, ...change })));
}

const report = {
  previousDirectory,
  currentDirectory,
  generatedAt: new Date().toISOString(),
  contract: 'Server prose may differ. Node IDs, choice IDs/destinations/effects/requirements, replay legacy texts, source attribution, resources, reachable graph, and the 16 failed/remedy terminal states must not.',
  totals: {
    worlds: summary.length,
    nodes: summary.reduce((sum, world) => sum + Number(world.nodes), 0),
    choices: summary.reduce((sum, world) => sum + Number(world.choices), 0),
    endings: summary.reduce((sum, world) => sum + (world.endings as { tone: string }[]).length, 0),
    darkEndings: summary.reduce((sum, world) => sum + (world.endings as { tone: string }[]).filter(ending => ending.tone === 'dark').length, 0),
    changedNodes: allChangedNodes.length,
    changedParagraphs: allChangedNodes.reduce((sum, node) => sum + (node.paragraphs as unknown[]).length, 0),
    terminalRouteChecks: summary.reduce((sum, world) => sum + (world.routeChecks as unknown[]).length, 0),
  },
  worlds: summary,
  proseChanges: allChangedNodes,
};
const reportFile = resolve(currentDirectory, 'catalog-a-live-delta.json');
await writeFile(reportFile, JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ reportFile, totals: report.totals, changedNodeIds: allChangedNodes.map(change => `${change.worldId}/${change.nodeId}`) }, null, 2));
