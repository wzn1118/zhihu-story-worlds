import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { getWorld } from '../server/worlds.ts';
import { canonical, sha256 } from '../server/art-production-prompts.ts';
import type { GameWorld, SceneNode } from '../shared/types.ts';
import { saveSession, restoreSession, rewindSession } from '../src/game.ts';
import { editorialBefore, affectedPaths, play, step, facts, readField } from './catalog-b-editorial-support.ts';
import revisions from '../content/catalog-b-editorial-data.json';

const dir = 'output/editorial/catalog-b';
mkdirSync(`${dir}/paths`, { recursive: true });
const coverage = [];
const actual = [];
const artHashes = [];
const markdown = ['# B 全文审读：逐项实际差异', '', '修改前来自本轮冻结的最终 getWorld（包含两层公共精确文案适配）；下列源锚只证明原作事实，新增场景、交易及结局均为游戏改编。', ''];
// Exact same source identity projection as buildSceneBrief, without reading
// image references, constructing a prompt, queueing or paying for any image.
function artSourceHash(world: GameWorld, node: SceneNode) {
  const { background: _background, ...scene } = node;
  const cast = world.characters.map(({ portrait: _p, portraits: _ps, ...character }) => character);
  return sha256(canonical({ worldId: world.id, storyId: world.storyId, title: world.title, source: world.source, summary: world.summary, adaptation: world.adaptation, cast, scene }));
}
for (const old of editorialBefore) {
  const world = getWorld(old.storyId);
  const sourceFile = readFileSync(`.local/zhihu-cache/story-${old.storyId}.json`);
  const source = JSON.parse(sourceFile.toString()).data;
  const own = revisions.filter(r => r.worldId === old.id);
  const paths = affectedPaths(old).map(path => {
    const a = play(old, path), b = play(world, path);
    a.paragraphIndex = a.paragraphs.length - 1;
    const saved = saveSession(a);
    for (const textOnly of [false, true]) {
      const input = structuredClone(saved);
      if (textOnly) for (const h of input.history) delete h.choiceId;
      const restored = restoreSession(world, input);
      assert.deepEqual(facts(restored), facts(a));
      assert.equal(restored.paragraphIndex, a.paragraphIndex);
      assert.deepEqual(facts(restoreSession(world, saveSession(restored))), facts(a));
      if (path.length) assert.deepEqual(facts(step(rewindSession(restored, restored.history.length - 2), path.at(-1)!)), facts(b));
    }
    return { path, facts: facts(b), before: a.paragraphs, after: b.paragraphs, idRestore: true, textOnlyRestore: true, rewind: path.length ? true : 'start' };
  });
  writeFileSync(`${dir}/paths/${world.id}.json`, JSON.stringify(paths, null, 2));
  markdown.push(`## ${world.id} / ${source.chapter_name} / ${source.author_name}`, '', ...world.sourcePassages!.map(p => '- 源锚 `' + p.id + '`：' + p.quote + '（' + p.note + '）'), '');
  for (const entry of own) {
    const current = readField(world, entry.path);
    const applied = current === entry.after;
    actual.push({ ...entry, actualAfter: current, applied });
    markdown.push('### `' + entry.path + '`', '', `**原：** ${entry.before}`, '', `**现：** ${current}`, '', `**原因：** ${entry.reason}`, '', `**锚点：** ${entry.anchors.join(' / ')}；原文与续写区别见本篇源锚说明。`, '');
  }
  const changedNodes = Object.values(world.nodes).filter(n => canonical(n) !== canonical(old.nodes[n.id]));
  for (const n of changedNodes) artHashes.push({ worldId: world.id, storyId: world.storyId, nodeId: n.id, before: artSourceHash(old, old.nodes[n.id]), after: artSourceHash(world, n) });
  const choices = Object.values(world.nodes).flatMap(n => n.choices);
  coverage.push({ worldId: world.id, storyId: world.storyId, sourceTitle: source.chapter_name, sourceAuthor: source.author_name, sourceTextSha256: sha256(source.content), sourceEnvelopeSha256: sha256(sourceFile), beforeFinalSha256: sha256(canonical(old)), afterFinalSha256: sha256(canonical(world)), beforeDraftSha256: sha256(canonical({ ...old, ink: undefined })), afterDraftSha256: sha256(canonical({ ...world, ink: undefined })), version: world.version, nodesRead: Object.keys(old.nodes), openingsRead: old.introduction.length, nodeParagraphsRead: Object.values(old.nodes).reduce((n, x) => n + x.text.length, 0), choicesRead: choices.length, hintsRead: choices.filter(c => c.hint !== undefined).length, feedbackRead: choices.filter(c => c.feedback !== undefined).length, challengesRead: Object.values(old.nodes).filter(n => n.challenge).length, endingsRead: Object.values(old.nodes).filter(n => n.ending).map(n => n.id), resourceDescriptionsRead: world.resources!.length, mechanicFieldsRead: 3, decisionFieldsRevised: own.filter(r => r.path.includes('.choices.')).length, changedNodes: changedNodes.map(n => n.id), revisedFields: own.length, positionsChecked: paths.length, idRestores: paths.length, textOnlyRestores: paths.length, readerReview: '源节选、元数据、所有正文与出边逐篇通读；非关键词统计', uiPublication: 'Not verified; root shared-server reload required', imagesGenerated: 0 });
}
writeFileSync(`${dir}/changes.json`, JSON.stringify(actual, null, 2));
writeFileSync(`${dir}/changes.md`, markdown.join('\n'));
writeFileSync(`${dir}/coverage.json`, JSON.stringify(coverage, null, 2));
writeFileSync(`${dir}/art-source-hashes.json`, JSON.stringify(artHashes, null, 2));
const summary = { createdAt: new Date().toISOString(), worlds: coverage.length, nodesRead: coverage.reduce((n, x) => n + x.nodesRead.length, 0), choicesRead: coverage.reduce((n, x) => n + x.choicesRead, 0), endingsRead: coverage.reduce((n, x) => n + x.endingsRead.length, 0), revisedFields: actual.length, appliedFields: actual.filter(r => r.applied).length, supersededFields: actual.filter(r => !r.applied), changedNodes: artHashes.length, editedChoices: coverage.reduce((n, x) => n + x.decisionFieldsRevised, 0), savePositionsChecked: coverage.reduce((n, x) => n + x.positionsChecked, 0), imagesGenerated: 0, hashFormat: 'coverage/ art-source-hashes use canonical SHA256; exporter inventory uses JSON insertion order SHA256. Do not compare these two encodings as if identical.', uiPublication: 'Not verified; root shared-server reload required' };
writeFileSync(`${dir}/summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
