import type { AuthoredWorld } from './worlds.ts';
import type { SceneNode } from '../shared/types.ts';

interface Investigation {
  hub: string; fallback: string; costs: string[]; clues: string[];
  resource: string; reserve: string; title: string; prompt: string; hint: string;
  text: string[]; correct: string; wrong: string; ending: string[];
}
const investigations: Record<string, Investigation> = {
  'blue-blood': { hub: 'home', fallback: 'ending_witness', costs: ['save_map', 'save_alley'], clues: ['地标错位记录', '消失巷口照片'], resource: '注意力', reserve: '联络余量', title: '同一条街的两份记录', prompt: '地标与倒影共同支持什么，而不能证明什么？', hint: '两份记录支持参照发生异常；它们没有证明某个人知道全部原因。', text: ['你把地标截图与巷口照片并排。纸上有两种城市坐标，照片里有两个街名，证据却还没有长成一个完整答案。', '发给他人之前，需要先标出哪些是自己看见的，哪些是关于观察者的猜测。'], correct: '确认参照异常，保留原因与观察者身份为未知', wrong: '既然照片异常，就能断定观察者掌握全部真相', ending: ['你们把两套记录交给不同的人复核，约好下一次交换的时间。没人被要求当场相信所有推论。', '第二天你仍去上班，但异常不再只躺在一个人的手机里。找路需要时间，你已有可以一起核对的人。'] },
  'double-pursuit': { hub: 'rescue', fallback: 'ending_safe', costs: ['backup_evidence', 'save_floorplan'], clues: ['接警记录', '室内跟踪证据'], resource: '体力', reserve: '电量', title: '两份记录的同一个时刻', prompt: '照片和接警记录怎样拼成可调查的材料？', hint: '保留原始时间、来源与亲身见闻；不要从追逐行为自行推出疾病诊断。', text: ['到达安全处后，你才发现自己握手机握得指节发白。屋里的跟踪照片与求援时间不是同一种记录，却可以互相确定先后。', '这次整理不要求你重新靠近危险，只要分清亲见、转述和仍需调查的事。'], correct: '分别保留来源与时间，交给正式调查核对', wrong: '替所有行为直接作医学诊断，就不必调查具体事实', ending: ['你保留原件、备份与交接时间，将两条时间线交给调查人员。邻居的经历也被单独记录。', '今晚的危险已经结束，后续判断交给证据和调查。你终于能把剩下的电量留给给亲友的一通电话。'] },
  'velvet-alibi': { hub: 'boundary', fallback: 'ending_independent', costs: ['keep_labels', 'ask_facts'], clues: ['换装的早餐', '明确的拒绝'], resource: '精力', reserve: '独处时间', title: '身价与同意无关', prompt: '包装里的价格能决定谁该替谁答应吗？', hint: '物品与身份的证据，不会改变当事人明确拒绝的效力。', text: ['早餐包装与父亲安排的邀请，被你分别放在桌子的两边。知道一个人藏着身家，不等于把自己的决定权交出去。', '你想把共同生活与家庭要求拆开谈。这次谈话需要精力，也需要给彼此停下来的时间。'], correct: '分别核实身份与意愿，任何一方都能明确拒绝', wrong: '谁提供的钱更多，谁就自然拥有最终决定权', ending: ['你把身份、财务和同意分成三项约定，各自保留可以说不的空间。没有人用一份礼物换取对方的未来。', '这不是立刻和好的保证。你们开始学习在知道真相以后，仍把选择问到本人面前。'] },
  'future-island': { hub: 'last_decision', fallback: 'ending_solitude', costs: ['audit_labels', 'retain_npc_records'], clues: ['双端通信时间线', '未计入的人员档案'], resource: '值守精力', reserve: '应急配额', title: '配给表之外的人', prompt: '系统标签能决定一个人是否有权被记录吗？', hint: '玩家名册、施工档案与通信证言是不同来源；不在玩家表上并不等于没有需求。', text: ['你把通信时间线与未计入名单的人员档案摊在同一张桌上。程序只给出标签，饭、水和离开的需求却属于具体的人。', '独立审阅要占用一次值守与应急配额。你可以保留余量，也可以把这些记录送到岛外。'], correct: '独立核对实际人员和需求，保留系统标签但不让它替人作主', wrong: '名单没有登记的人就不需要获得知情与退出机会', ending: ['独立核对的档案随应急通信发出，接收方逐项确认人员与需求。配给表终于可以接受名单外的更正。', '岛并没有因此拥有无穷物资。有限配额仍要讨论，只是系统不再独占谁算一个人的答案。'] },
};

export function withCoreInvestigation(world: AuthoredWorld): AuthoredWorld {
  const spec = investigations[world.id];
  if (!spec) return world;
  const reviewId = 'evidence_review', checkId = 'evidence_check', decisionId = 'evidence_release', endingId = 'ending_verified';
  const proof = `${spec.title}·核对结论`;
  const nodes = structuredClone(world.nodes);
  for (const node of Object.values(nodes)) for (const choice of node.choices) {
    if (spec.costs.includes(choice.id)) choice.effects = { ...choice.effects, resources: { focus: -1 } };
  }
  const hub = nodes[spec.hub];
  hub.choices.push({ id: 'review_evidence', text: `单独核对：${spec.title}`, nextNodeId: reviewId });
  const scene = (id: string, title: string, text: string[], choices: SceneNode['choices'], challenge?: SceneNode['challenge']): SceneNode => ({ id, chapter: '支线 · 证据核对', title, location: hub.location, time: hub.time, background: hub.background, text, choices, challenge });
  nodes[reviewId] = scene(reviewId, spec.title, spec.text, [
    { id: 'combine_records', text: '用已有两条线索进行交叉核对', nextNodeId: checkId, requires: { allClues: spec.clues }, effects: { clues: ['两份记录已并列'] } },
    { id: 'verify_again', text: '花两点精力重新联系来源核验', nextNodeId: checkId, effects: { resources: { focus: -2 }, clues: ['来源重新核验'] } },
    { id: 'take_break', text: `用一份${spec.reserve}换取休整，再作有限核对`, nextNodeId: checkId, effects: { resources: { reserve: -1, focus: 2 } } },
    { id: 'leave_review', text: '保留现有记录，暂时结束核对', nextNodeId: spec.fallback },
  ], { kind: 'investigation', prompt: spec.title, hint: `已有线索可以节省${spec.resource}；重新核验会消耗两点。休整后只有有限核对，仍可保留判断。` });
  nodes[checkId] = scene(checkId, spec.prompt, [...spec.text, '你将来源、观察与推论分成三栏。有依据的结论可以提交，尚未确认的部分必须留在原来的位置。'], [
    { id: 'reason_supported', text: spec.correct, nextNodeId: decisionId, requires: { anyClues: ['两份记录已并列', '来源重新核验'] }, effects: { clues: [proof], resolve: 5 }, feedback: { tone: 'success', text: `核对结论已收入手记。${spec.hint}` } },
    { id: 'reason_wrong', text: spec.wrong, nextNodeId: decisionId, effects: { resolve: -8 }, feedback: { tone: 'setback', text: `推论超出了现有证据，未取得核对结论。${spec.hint}` } },
    { id: 'reason_limited', text: '把没有核实的部分明确留空', nextNodeId: decisionId, effects: { trust: 3 }, feedback: { tone: 'neutral', text: '尚未确认的部分仍然留空。你保留了已有材料，但还不能提交为独立核验的结论。' } },
  ], { kind: 'deduction', prompt: spec.prompt, hint: spec.hint });
  nodes[decisionId] = scene(decisionId, '结论交给谁', ['你的记录已经整理完。一次独立交接需要留出联络与处理的余量，不能只把“公开”写在纸上。', '如果条件不够，仍可保留已得材料，以后继续核对。'], [
    { id: 'release_verified', text: '完成独立核验与交接', nextNodeId: endingId, requires: { allClues: [proof] }, effects: { resources: { focus: -1, reserve: -1 } } },
    { id: 'retain_review', text: '把材料留在自己手中，先安排眼前生活', nextNodeId: spec.fallback },
  ], { kind: 'resource', prompt: '证据成立，也要有完成交接的余量', hint: `提交需要核对结论、1 点${spec.resource}与 1 份${spec.reserve}。` });
  nodes[endingId] = { ...scene(endingId, `结局 · ${spec.title}`, spec.ending, []), chapter: '终章', ending: { title: `结局 · ${spec.title}`, text: spec.ending[1], tone: 'hopeful' } };
  return { ...world, nodes, version: '1.1.0', compatibleSaveVersions: [...new Set([world.version, ...(world.compatibleSaveVersions ?? [])])], resources: [
    { id: 'focus', label: spec.resource, initial: 3, min: 0, max: 5, description: world.id === 'blue-blood' ? '部分调查和行动会消耗注意力。休息可以恢复。' : '调查和部分行动会消耗，休息可以恢复。' },
    { id: 'reserve', label: spec.reserve, initial: 2, min: 0, max: 3, description: world.id === 'blue-blood' ? '休息要花 1 份余量，最多恢复 2 点注意力。有些联络也要用到余量。' : '休息和部分联络都要用到，用一次就少一份。' },
  ], mechanics: { title: spec.title, description: '主线的记录会消耗精力；后段可进入独立核对支线，用已有线索节省资源，并取得额外结局。', beginnerTip: `保留${spec.clues.join('与')}，可省去重复核验。支线可以随时收束，旧主线仍可继续。` } };
}
