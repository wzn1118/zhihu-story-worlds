import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { authoredWorlds, type AuthoredWorld } from '../content/worlds.ts';
import { compileWorld } from '../server/worlds.ts';
import { saveSession } from '../src/game.ts';
import { explore, replay } from './core-creative-support.ts';
import { gameplayContract, markerCount, visibleProse } from './world-prose-support.ts';

const directory = process.env.WORLD_PROSE_OUTPUT ?? 'output/world-prose';
mkdirSync(directory, { recursive: true });
const before: AuthoredWorld[] = JSON.parse(gunzipSync(readFileSync(process.env.WORLD_PROSE_BASELINE ?? 'tests/fixtures/worlds-pre-prose.json.gz')).toString());
const sha = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const worlds = authoredWorlds.map(authored => {
  const old = before.find(w => w.id === authored.id)!;
  assert.ok(old);
  assert.deepEqual(gameplayContract(authored), gameplayContract(old));
  const originalFields = new Map(visibleProse(old).map(f => [f.path, f.text]));
  const changes = visibleProse(authored).filter(f => originalFields.get(f.path) !== f.text)
    .map(f => ({ path: f.path, before: originalFields.get(f.path), after: f.text }));
  const world = compileWorld(authored);
  const graph = explore(world);
  assert.equal(graph.nodes.size, Object.keys(world.nodes).length);
  const scene = changes.find(f => /^nodes\.[^.]+\.text\.\d+$/.test(f.path) && !world.nodes[f.path.split('.')[1]].ending);
  const targetId = scene?.path.split('.')[1] ?? world.startNodeId;
  const path = graph.nodes.get(targetId)!;
  const session = replay(world, path);
  const paragraphIndex = scene ? Number(scene.path.split('.').at(-1)) : 0;
  session.paragraphIndex = paragraphIndex;
  const save = saveSession(session);
  const worldFile = `${directory}/${world.id}.world.json`;
  const saveFile = `${directory}/${world.id}.save.json`;
  writeFileSync(worldFile, JSON.stringify(world));
  writeFileSync(saveFile, JSON.stringify(save, null, 2));
  const endings = Object.values(world.nodes).filter(n => n.ending).map(n => {
    const witness = graph.nodes.get(n.id)!;
    const end = replay(world, witness);
    assert.equal(end.node.id, n.id);
    return { id: n.id, tone: n.ending!.tone, path: witness, resources: end.resources, clues: end.clues };
  });
  const endingCases = endings.filter(end => changes.some(f => f.path.startsWith(`nodes.${end.id}.text.`))).map(end => {
    const finished = replay(world, end.path);
    const endingSaveFile = `${directory}/${world.id}-${end.id}.save.json`;
    writeFileSync(endingSaveFile, JSON.stringify(saveSession(finished), null, 2));
    return { nodeId: end.id, paragraphIndex: 0, text: finished.paragraphs[0], path: end.path, saveFile: endingSaveFile };
  });
  return {
    id: world.id, storyId: world.storyId, version: world.version,
    previousVersion: old.version, nodeCount: Object.keys(world.nodes).length,
    markerCount: { before: markerCount(old), after: markerCount(authored) },
    changedFields: changes.length,
    changedScenes: [...new Set(changes.filter(f => f.path.startsWith('nodes.')).map(f => f.path.split('.')[1]))],
    changedChoiceLabels: Object.values(world.nodes).flatMap(n => n.choices.filter(c => old.nodes[n.id].choices.find(o => o.id === c.id)!.text !== c.text).map(c => ({ nodeId: n.id, choiceId: c.id, text: c.text, legacyTexts: c.legacyTexts }))),
    unchangedGameplaySha256: sha(gameplayContract(authored)),
    source: world.source, sourcePassages: world.sourcePassages, adaptation: world.adaptation,
    unchangedSourceSha256: sha({ source: authored.source, sourcePassages: authored.sourcePassages }),
    prePassSourceSha256: sha({ source: old.source, sourcePassages: old.sourcePassages }),
    worldFile, worldSha256: sha(world), changes,
    scenes: Object.values(world.nodes).map(n => ({ id: n.id, title: n.title, text: n.text, ending: n.ending, textSha256: sha({ title: n.title, text: n.text, ending: n.ending }), sceneSha256: sha(n), background: n.background })),
    endings,
    replay: { nodes: graph.nodes.size, edges: graph.edges.size, savePoints: graph.edges.size + 1, legacyRestoreChecks: (graph.edges.size + 1) * 2 },
    browserCase: { nodeId: targetId, paragraphIndex, text: session.paragraphs[paragraphIndex], path, saveFile },
    endingCases,
  };
});
const sum = (f: (w: typeof worlds[number]) => number) => worlds.reduce((n, w) => n + f(w), 0);
const summary = {
  worldCount: worlds.length, changedWorldCount: worlds.filter(w => w.changedFields).length,
  sceneCount: sum(w => w.nodeCount), changedFields: sum(w => w.changedFields), changedScenes: sum(w => w.changedScenes.length),
  changedChoiceLabels: sum(w => w.changedChoiceLabels.length), markersBefore: sum(w => w.markerCount.before), markersAfter: sum(w => w.markerCount.after),
  newProseCharacters: sum(w => w.changes.reduce((n, f) => n + f.after.length, 0)),
  endingsReplayed: sum(w => w.endings.length), prePassSavePoints: sum(w => w.replay.savePoints), legacyRestoreChecks: sum(w => w.replay.legacyRestoreChecks),
};
writeFileSync(`${directory}/scene-manifest.json`, JSON.stringify({ generatedAt: new Date().toISOString(), scope: 'All 20 registered authored worlds; generated workshop drafts are outside this registry.', markerDefinition: 'Visible prose occurrences of 不是|不只是|真正|并非|而是; original source quotations, legacy aliases and duplicate ending metadata are excluded.', summary, worlds }, null, 2));
const readThrough = ['# 赤页：本轮续写稿', '', '按世界汇集关键抉择与不同分支的收场。以下场景为游戏改编；原作署名与节选链接随各世界列出。', ''];
for (const entry of worlds) {
  const world = authoredWorlds.find(w => w.id === entry.id)!;
  readThrough.push(`## ${world.source.title}`, '', `原作：${world.source.author} · [原文节选](${world.source.url})`, '');
  const changed = entry.changedScenes.map(id => world.nodes[id]).sort((a, b) => Number(Boolean(a.ending)) - Number(Boolean(b.ending)));
  for (const node of changed) {
    readThrough.push(`### ${node.title}`, '', `场景：\`${world.id}/${node.id}\` · ${node.ending ? node.ending.tone === 'dark' ? '失败结局' : '完成结局' : '关键抉择'}`, '', ...node.text.flatMap(text => [text, '']));
    if (node.choices.length) readThrough.push(...node.choices.map(c => `- ${c.text}`), '');
  }
}
writeFileSync(`${directory}/read-through.md`, readThrough.join('\n'));
console.log(JSON.stringify(summary, null, 2));
