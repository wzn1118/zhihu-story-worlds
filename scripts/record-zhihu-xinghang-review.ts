import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { StoryWorkshop, jsonFile, writeJson, type LockOwner } from '../server/story-workshop.ts';
import { buildGeneratedWorld } from '../server/workshop-compiler.ts';
import { editorialHash } from '../server/workshop-editorial.ts';
import { readEditorialNotes, type EditorialNotes } from '../server/workshop-editorial-job.ts';
import type { GeneratedDraft } from '../shared/workshop.ts';
import { choose, startSession } from '../src/game.ts';

const id = 'import-32bcca2e-c8e9-47bb-91b1-ee567f3cbe2f', service = new StoryWorkshop();
const before = await service.get(id);
assert.ok(['ready', 'failed'].includes(before.status), 'Observe a completed draft, not the live repair input');
const directory = join(service.dir(id), `r${before.revision}`), source = await service.source(id);
const draft = await jsonFile<GeneratedDraft>(join(directory, 'draft.json'));
const world = buildGeneratedWorld(id, before.revision, source, draft).world;
const profiles = [
  { node: 'return_home_descent', forced: 'return_home_descent_cabin_air', problem: '检查缺项不应强迫玩家主动关闭仍有氧气的呼吸盒。可以保留已有故障造成的失败，但不能给玩家强加一次尚未选择的新断氧行为。',
    path: ['enter_return_home', 'return_home_departure_now', 'return_home_plume_pressure', 'return_home_seal_find_oxygen', 'return_home_oxygen_connect', 'return_home_uplink_weather', 'return_home_burn_horizon', 'return_home_separation_manual_start', 'return_home_manual_release_defer', 'return_home_cabin_check_seated'] },
  { node: 'save_sample_probe', forced: 'save_sample_probe_shell', problem: '只缺冷却稳定且尚有氧气时，不应只剩主动热封罐并把危险样本带入避难处。放弃样本或进一步测量可能有实际代价，但必须保留合理的行动选择；不要求所有选择都成功。',
    path: ['enter_save_sample', 'save_sample_battery_start', 'save_sample_records_clip', 'save_sample_valve_arm', 'save_sample_bottle_connect', 'save_sample_fire_suppress', 'save_sample_contacts_cut'] },
  { node: 'save_sample_seal', forced: 'save_sample_seal_stay', problem: '伤员已进入可独立供气的隔间且尚有氧气时，样本缺项不应强迫玩家留在敞开的漏气舱。需要区分保住样本和保住乘员，止损可以失去原目标并承担既有后果。',
    path: ['enter_save_sample', 'save_sample_battery_start', 'save_sample_records_clip', 'save_sample_valve_arm', 'save_sample_bottle_connect', 'save_sample_fire_vent', 'save_sample_account_cut', 'save_sample_archive_carry'] },
];
const findings = [], results = [];
for (const profile of profiles) {
  let session = startSession(world);
  let stalePath = false;
  for (const choiceId of profile.path) {
    const choice = session.choices.find(c => c.id === choiceId);
    if (!choice) { stalePath = true; break; }
    session = choose(session, choice);
  }
  const forced = !stalePath && session.node.id === profile.node && session.choices.length === 1 && session.choices[0].id === profile.forced;
  const result = { node: session.node.id, path: profile.path, stalePath, forced, resources: session.resources, choices: session.choices.map(c => ({ id: c.id, text: c.text })) };
  results.push(result);
  if (forced) findings.push(`局部引擎复核：${profile.problem} 当前合法路径=${JSON.stringify(profile.path)}；到达${session.node.id}时资源=${JSON.stringify(session.resources)}，唯一行动=${session.choices[0].text}。这是实际状态观察，不是要求抹掉既有错误或代价。请用完整当前稿复核后修订，并查找同类分支。`);
}
const output = resolve('output/zhihu-expansion', `xinghang-causal-check-${new Date().toISOString().replace(/[:.]/g, '-')}`);
await mkdir(output, { recursive: true });
await writeJson(join(output, 'verification.json'), { id, revision: before.revision, draftHash: editorialHash(draft), findings: findings.length, results, recorded: false });
if (process.argv.includes('--record') && findings.length) {
  const lock = join(service.dir(id), 'job.lock'), token = randomUUID(); await mkdir(lock);
  try {
    await writeJson(join(lock, 'owner.json'), { token, pid: process.pid, heartbeat: new Date().toISOString() });
    const current = await service.get(id);
    assert.equal(current.revision, before.revision); assert.equal(current.jobId, before.jobId); assert.equal(current.status, before.status);
    assert.deepEqual(await service.source(id), source);
    assert.equal(editorialHash(await jsonFile(join(directory, 'draft.json'))), editorialHash(draft));
    const prior = await readEditorialNotes(directory, source);
    const notes: EditorialNotes = { sourceHash: editorialHash(source), observedDraftHash: editorialHash(draft), repairMode: 'preserve-and-extend-v2',
      notes: [...prior?.notes ?? [], ...findings, '以上来自具体路径的局部引擎复核，不冒充全稿人工验读。审读完整当前稿，只报告仍存在的问题；增加必要的场景或已收束的止损结局时保留所有旧ID和可达性，新增剧情仍属于改编。'] };
    assert.ok(notes.notes.length <= 32 && notes.notes.every(n => n.length <= 2500));
    await writeJson(join(output, 'observations.json'), notes);
    await writeJson(join(directory, 'editorial-notes.json'), notes);
    await writeJson(join(output, 'verification.json'), { id, revision: before.revision, draftHash: editorialHash(draft), findings: findings.length, results, recorded: true });
  } finally {
    if ((await jsonFile<LockOwner>(join(lock, 'owner.json')).catch(() => null))?.token === token) await rm(lock, { recursive: true, force: true });
  }
}
console.log(JSON.stringify({ output, id, revision: before.revision, findings: findings.length, results }, null, 2));
