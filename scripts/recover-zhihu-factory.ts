import { join } from 'node:path';
import { StoryWorkshop, jsonFile } from '../server/story-workshop.ts';
import { stageDraftRecovery } from '../server/workshop-recovery.ts';
import type { EditorialNotes } from '../server/workshop-editorial-job.ts';

const id = 'import-0b3ce5e1-1f96-474d-871d-5e2a2a541713', service = new StoryWorkshop();
const project = await service.get(id);
if (project.revision !== 1 || project.jobId !== '69668a9a-dbc8-4d27-90f6-f5ee5ee329ed' || project.status !== 'failed') throw new Error('This recovery belongs only to the recorded stopped factory job');
const directory = join(service.dir(id), 'r1');
const run = join(directory, 'editorial/run-2-2fcb28e0ad75/workshop-editorial-v1-30b2c0734125f16dc330efcb');
const historical = await jsonFile<EditorialNotes>(join(directory, 'editorial-notes.json'));
const notes = [...historical.notes,
  '历史全稿只读复核见 docs/workstreams/zhihu-factory-review-1445.md，观察的是第一轮完成稿，不是当前稿已存在问题的断言。核查 name_the_dead_separate_interview 的每个非结局是否有 needs=[] 且无负数costs 的真实行动出口；也核查最终提交在整理证词但尚未让证人采用整理稿时，是否只剩主动造假。必须保留已经发生的损害与证据不确定性，但不能强迫玩家新增尚未选择的造假。若新稿已修复，不重复报旧问题。',
  '当前恢复候选使用第一轮已完整审读快照，再按输入哈希链应用第二轮的大纲、罗莉路线和调查路线真实模型输出。调查路线的旧验证只因新增场景名单而拒绝；该输出不视为审稿通过，必须重新全稿审读和编译。speak_in_public 仍是第一轮路线稿，第二轮关于纸本未实际排入失实附件的发现尚须核对：本次群发不自动等于改动纸本。',
  '场景扩展已明确启用。仅当具体因果或合理止损缺少容身处时增加必要的场景或完整结局，保持所有旧场景和选项ID及可达性。结局继续解决身份、两份日期、死者与存活者、旧案责任及各人物去向，不以待续代替结局。所有历史问题须引用当前稿再判断。',
];
console.log(JSON.stringify(await stageDraftRecovery(service, id, join(run, 'round-1.draft.json'), [
  'outline-repair-r1-9abefea40495487114acfe22-a1.accepted.json',
  'route-repair-r1-4b2d8dade0908ce41cc044fc-a1.accepted.json',
  'route-repair-r1-dced16f8be63796449f0ad0f-a1.rejected.json',
].map(name => join(run, name)), notes), null, 2));
