import { join } from 'node:path';
import { StoryWorkshop, jsonFile, writeJson } from '../server/story-workshop.ts';
import { editorialHash } from '../server/workshop-editorial.ts';
import type { StoryOutline } from '../shared/workshop.ts';

const id = 'import-0b3ce5e1-1f96-474d-871d-5e2a2a541713';
const service = new StoryWorkshop(), project = await service.get(id), source = await service.source(id);
if (project.revision !== 1 || project.stage !== 'scenes' || project.status !== 'running') throw new Error('Only the current pre-editorial production may receive this observation');
const directory = join(service.dir(id), 'r1'), outline = await jsonFile<StoryOutline>(join(directory, 'outline.json'));
const observedDraft = { outline, routes: [] };
await writeJson(join(directory, 'editorial-notes.json'), {
  sourceHash: editorialHash(source), observedDraftHash: editorialHash(observedDraft),
  notes: [
    '这份历史观察只审读了阶段一的真实 outline.json；observedDraftHash 对应 {outline, routes:[]}，不代表具体场景已经写完。请审读届时完整当前稿，只为仍存在的问题引用实际文字。',
    '用户要求有意义的玩法、清楚具体的人物对白，避免机器人说教。大纲 return_with_luoli 的01、03、04、05、06、07等节拍常以尊重或耐心作为加互信的显然正确选项，以冒犯、诱导、剪辑作为扣互信的显然错误选项。核对完成稿是否把整条调查写成连续道德选择题；如果仍如此，应让主要调查选择包含可信的目标冲突、证据可靠性和付出，角色有各自愿望，而不是只为测试玩家是否礼貌服务。保留必要的风险预告和免费退路，不将正确事实变成互信奖励，不用故意隐瞒后果制造难度。',
    '原节选的真实重点是老陈记得抬过罗莉、12月17日与12月27日不一致、22岁与七旬死者不一致。检查每条路线至少有具体场景让玩家亲自核实材料或询问当事人，而不是全部关键证据由场外办案人员一次送齐，再让玩家只决定递交方式。三条路线需要不同的持续事件和不可逆取舍，不是同一真相的三种文书流程。以上是完整稿待核问题，不是要求推翻已保存的来源事实或捏造原作者的结局。',
  ],
});
console.log(JSON.stringify({ id, stage: project.stage, observed: 'outline-only', revision: project.revision, notes: 3 }));
