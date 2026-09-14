import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { StoryWorkshop, jsonFile, writeJson } from '../server/story-workshop.ts';
import { stageDraftRecovery } from '../server/workshop-recovery.ts';
import type { EditorialNotes } from '../server/workshop-editorial-job.ts';

const cases = {
  factory: {
    id: 'import-0b3ce5e1-1f96-474d-871d-5e2a2a541713',
    job: 'af57dc03-6470-48ee-8b1a-d581b44f2622',
    hash: '00a2b808514ee9f7bee6b20d11821c949a8f2c1c5f2527aaf44d3b23892195bc',
    run: 'editorial/run-4-c2e760050624/workshop-editorial-extend-v2-4e150450b365f0a60231b484',
    round: 1,
    repairs: [] as string[],
    notes: [
      '本次恢复使用上一次任务已完成真实全稿审读的 round-1 完整快照，并保留其 review-r1 发现，不继承通过结论。当前结构预检发现 return_with_luoli_05_signature 的 explain 与 only_handwriting 两个旧动作都去06_awning。保留律师仍会交出无关雨棚材料的合理因果，不能为了两个不同next强迫玩家跳过无关调查；可在路线18场景上限内加入真正有作用的询问或证据处理场景，让选择产生真实不同后果。',
      '上一次 round-1 全稿审读发现 return_with_luoli_07_share_excerpt 从1月5日直接到1月12日责任判定，缺少1月7日日期核查的场内原因；核查并补齐因果，同时维持每个非结局至少两个不同next，不以跳过调查凑分支。name_the_dead 的三个未定罪调查结局需独立交代12月17日对罗莉的侵害指控如何处理，不能仅解决12月27日死者身份就省去另一项指控；可明确证据边界、分别受理或实际结案处置，不必虚构必然定罪。',
      '当前调查路线实际13个决策与4个结局；大纲漏 name_the_dead_later_recheck 节拍与 name_the_dead_reading_unresolved_bad 结局。大纲现在允许最多16个节拍和8个结局，应对应全部实际节点与结局，不截断、不合并不同结局。公开路线大纲还承诺trust8联署，但实际只可自署；按当前具体可玩行为修正大纲，不给正式更正凭空新增互信门槛。提示中不要向玩家泄露内部线索字段或调度用语。',
    ],
  },
  'factory-closure': {
    id: 'import-0b3ce5e1-1f96-474d-871d-5e2a2a541713',
    job: 'b2c3befe-4ad3-4016-b329-5fe011029401',
    hash: '14ac3eea80fd3a03c2cfda0b58e08045d6e5329798185e3f82cd344ff8ea69f4',
    run: 'editorial/run-5-465beb63478d/workshop-editorial-extend-v2-392388627bc91151c70bbb70',
    round: 2,
    repairs: [] as string[],
    notes: [
      '本次候选是 attempt5 已完成全稿复审的 round-2 快照14ac3eea80fd3a03c2cfda0b58e08045d6e5329798185e3f82cd344ff8ea69f4，当前完整稿和该快照一致；上轮修复均保留，不继承审稿通过结论。此前录音来源、调查改约与调查/公开路线解谜缺口已有修订，核读当前稿，不重做已解决内容。',
      '当前终审唯一阻断是 return_with_luoli 路线：05_only_handwriting 跳过16搬运补述，06_suggest_witness 又跳过追问送医原话，接着08日期核对、09个人说明、11申请递交均未取得那句话，但三种结局都断言想回家来自罗莉送医时的请求。医院存活记录不能证明她当时说过什么。补齐此实际路径：呈现罗莉同意转交的送医陈述及老陈实际核听或核读，在相应选择gains记录原话来源。已有原话的路径核对即可，保留未目击二十七日的限定、私人拒见的结果、旧choice ID、免费出口和所有当前证据条件。不要只在结局加断言，也不要凭空强迫新的私人接触。',
      '当前一项文风建议仅涉及 name_the_dead 三个未定罪结局：末段连续公文列项过长，可分为报案伤情、期限决定与救济、回到2032年现场三个自然段，使用核读、律师指出依据、收存回函的具体动作；保留独立处置、期限例外、救济结果和三种证言历史差异，不删必要结论，也不改结局机械条件。',
    ],
  },
  star: {
    id: 'import-32bcca2e-c8e9-47bb-91b1-ee567f3cbe2f',
    job: '08e82388-3509-4ff3-9e52-5872eb46859b',
    hash: '68c16f9980fdb964f9669c5f34bff336498b916a6447d636b278e2b88f9548d1',
    run: 'editorial/run-3-09abf23a989b/workshop-editorial-extend-v2-8d703b89210a58e6cc083591',
    round: 0,
    repairs: [
      'outline-repair-r0-1c7979f28a6760f2a7dc001b-a1.accepted.json',
      'route-repair-r0-c0c3eac7b9a74385c1c50309-a1.accepted.json',
      'route-repair-r0-f194de6d851bb25924337737-a1.accepted.json',
      'route-repair-r0-af2ab309625f97dda2e0e360-a1.accepted.json',
    ],
    notes: [
      '本次恢复从已全稿审读的 round-0 快照按严格输入输出哈希链应用四个实际模型 accepted 修订，结果与上次完整 round-1 快照一致；round-1 的全稿审读因上游请求失败而尚未完成。本次必须重新全稿审读，不继承通过结论。历史观察中的三个强迫断氧/封罐/守舱路径已有实际止损补丁，先回放当前稿再判断，不重复假定旧缺陷仍存在。',
      '当前 round-1 真实快照有13个结局，大纲只有9个。新增 return_home_heat_bad、return_home_pressure_bad、return_home_reserve_bad、save_sample_crew_rescued 均须独立写入大纲，不能为了原先容量限制省略、并入别项或删除新增结局。大纲现在支持每路线最多8个结局、16个节拍；保持实际图每路线12至18场景且至少10个有意义决策。',
      '当前三条路线的 premise 均恰好1000字符且句中截断，末尾分别为“转向生活舱的”“有天气而不足3，或没有”“两项costs均”。请在1000字符上限内重写为简洁完整的因果概要，使用正常句子收尾；不能机械截字或将内部costs变量写成叙事。设备差异和原节选银白工作服、白手套、眼镜、纸张及植物等事实继续保留。',
      '新增返航止损选择需要按真实状态核查：服务段未分离、乘员舱未密封、天气缺失和氧气不足各有具体原因与结果，不相互替代；有足够氧气且仅缺设备条件时，不强迫玩家主动关闭呼吸盒。样本目标失败与保住乘员分开判定，不让危险样本缺项自动取消独立供氧避难处。必须用所有实际可达状态验证新增结局均可达，已有设备差异不应被修回成同一装置。',
    ],
  },
};

const name = process.argv[2];
assert.ok(name === 'factory' || name === 'factory-closure' || name === 'star', 'Choose an exact recorded recovery');
const item = cases[name], service = new StoryWorkshop();
const project = await service.get(item.id);
assert.equal(project.revision, 1);
assert.equal(project.jobId, item.job);
assert.equal(project.status, 'failed');
assert.ok(!project.publishedVersion);
const directory = join(service.dir(item.id), 'r1');
const history = await jsonFile<EditorialNotes>(join(directory, 'editorial-notes.json'));
const notes = [
  '前面保留的审读笔记来自历史快照，仅用作回归线索；本次以下新观察对应恢复候选，所有结论需审读当前完整稿后确认。',
  ...history.notes,
  ...item.notes,
  '条件数据现在支持有限语法：needs中的普通字符串表示已有线索，!线索名表示缺少该线索，已定义资源ID与非负整数的<、<=、>、>=比较表示资源门槛；多项为AND。gains仍只填写普通线索名。没有OR、代码、函数或任意表达式；costs继续表示实际资源变化。缺失线索必须确有某处可获得。每个非结局仍需至少两个不同next，且有needs=[]、无负数costs的无条件免费出口。新增节点必须保留旧场景/选项ID、路线前缀及18场景上限，产生具体新行为或完整不同结局，不作填充。',
];
const run = join(directory, item.run);
const staged = await jsonFile<{ appliedAt?: string; draftHash: string; validation: unknown; provenance: string[]; notes: EditorialNotes }>(join(directory, 'draft-recovery.json')).catch(error => {
  if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
  throw error;
});
const recovery = staged && !staged.appliedAt && staged.draftHash === item.hash && JSON.stringify(staged.notes.notes) === JSON.stringify(notes)
  ? { stagedSelection: join(directory, 'draft-recovery.json'), draftHash: staged.draftHash, validation: staged.validation, provenance: staged.provenance, nextAction: 'resume-through-workshop' }
  : await stageDraftRecovery(service, item.id, join(run, `round-${item.round}.draft.json`), item.repairs.map(file => join(run, file)), notes);
assert.equal(recovery.draftHash, item.hash, 'The recovery must exactly reproduce the completed model snapshot');
const output = resolve('output/zhihu-expansion', `resume-recovery-${new Date().toISOString().replace(/[:.]/g, '-')}-${name}`);
await mkdir(output, { recursive: true });
await writeJson(join(output, 'receipt.json'), { id: item.id, oldJobId: item.job, sourceHash: project.sourceHash, revision: 1, ...recovery });
console.log(JSON.stringify({ output, id: item.id, ...recovery }, null, 2));
