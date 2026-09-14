import type { AuthoredWorld } from './worlds.ts';
import type { Choice, SceneNode } from '../shared/types.ts';

export function withBlueInvestigation(world: AuthoredWorld): AuthoredWorld {
  if (world.id !== 'blue-blood' || world.nodes.case_desk) return world;
  const nodes = structuredClone(world.nodes);
  const scene = (id: string, title: string, text: string[], choices: Choice[], challenge?: SceneNode['challenge']): SceneNode => ({
    id, title, chapter: '支线 · 今夜的三份记录', location: '方诺的住处', time: '深夜',
    background: '/assets/blue-case-desk.webp', text, choices, challenge,
  });
  const back = (id: string, text: string, clues: string[], feedback: string, requires?: Choice['requires'], resources?: Record<string, number>): Choice => ({
    id, text, nextNodeId: 'case_desk', effects: { clues, resources }, requires,
    feedback: { tone: 'neutral', text: feedback },
  });
  nodes.home.choices.push({ id: 'open_case_desk', text: '把今晚的疑点分成三份记录，自己安排复核顺序', nextNodeId: 'case_desk' });

  nodes.case_desk = scene('case_desk', '还剩多少清醒的时间', [
    '你把桌面分成三块：试卷、地名、灰夹克。每块只放它能证明的事。三条疑问是否相关，还需要你亲手连起来。',
    '窗外最后一班车开走了。重新翻查一份材料要耗一点注意力；白天留下的原件能省去重复取证。联络余量既能用来请人核对，也得留给最后一次交接。',
    '桌角的空杯提醒你已经很累。可以调整复核顺序，花余量换休整，或随时收起材料。没有哪一张纸会因为你付了代价就自动成为证据。',
  ], [
    { id: 'review_paper', text: '复核培训试卷：谁被要求回答什么', nextNodeId: 'case_paper', effects: { resources: { focus: -1 } }, requires: { noneClues: ['试卷复核完成'] } },
    { id: 'review_map', text: '复核地理参照：页面与记忆哪里不一致', nextNodeId: 'case_map', effects: { resources: { focus: -1 } }, requires: { noneClues: ['地理复核完成'] } },
    { id: 'review_watch', text: '复核出现时刻：观察发生在何种反应之后', nextNodeId: 'case_witness', effects: { resources: { focus: -1 } }, requires: { noneClues: ['目击复核完成'] } },
    { id: 'case_rest', text: '暂停联络一轮，恢复两点注意力', nextNodeId: 'case_desk', repeatable: true, effects: { resources: { focus: 2, reserve: -1 } }, requires: { resources: { focus: { max: 3 } } }, feedback: { tone: 'neutral', text: '你定好闹钟，离开桌子闭眼休息。醒来后能继续核对，但今晚可用来找人的余量少了一份。' } },
    { id: 'case_connect', text: '把已核实的材料连成一个可以反驳的假说', nextNodeId: 'case_inference', repeatable: true, requires: { anyClues: ['试卷复核完成', '地理复核完成', '目击复核完成'] } },
    { id: 'case_stop', text: '到此为止，保留今晚已经做过的事', nextNodeId: 'ending_case_pause' },
  ], { kind: 'resource', prompt: '三份材料，有限的注意力与联络余量', hint: '原始差异试卷、地标错位记录和观察者行程各能节省一次补证。没有原件也可补查，但最后交接仍需一份联络余量。已完成的复核不能重复领取线索。' });

  nodes.case_paper = scene('case_paper', '卷子在问谁', [
    '你先写下上午确实发生的事：你在培训中说了与教材不同的常识，随后有人格外注意你。至于试卷，记忆与手里留存的记录必须分开放。',
    '若白天保留了题目差异，现在可以核对各题的出现顺序。若没有，就只能再联系张薇，请她确认她那一份考了什么；这会消耗今晚的联络余量。',
    '你没有办法仅凭自己的卷子知道每个人拿到了什么。空白不必涂掉，留在纸上就好。',
  ], [
    back('paper_original', '用白天留下的差异试卷核对题目与姓名栏', ['试卷复核完成', '定向试题记录'], '题目差异和姓名栏都有原记录支持。你确认自己受到了额外测试，尚不能确认其他人知道多少。', { allClues: ['差异试卷'] }),
    back('paper_recontact', '请张薇核对她的卷子，补记这一份差异', ['试卷复核完成', '定向试题记录'], '张薇只确认了她自己的包扎题。你把她的口述与自己的回忆分别署时，没有替她写下其他人的答案。', undefined, { reserve: -1 }),
    back('paper_leave_blank', '只留下自己能够确定的问话，不补写整份试卷', ['试卷复核完成'], '试卷页保留了未知部分。你没有取得定向测试的完整记录，仍可转查其他材料。'),
  ], { kind: 'investigation', prompt: '原件、转述与回忆，能否互相冒充？', hint: '有差异试卷可直接核对；重新联系只补一位同事的证言。保留空白不会自动产生试题证据。' });

  nodes.case_map = scene('case_map', '把城市放回不同栏里', [
    '你在纸上画出两栏，分别写“我的记忆”与“现在的页面”。东方明珠、陆家嘴、黄浦江，各占一行。',
    '你在两栏之间画线，将同名地点一一连起来。缺少白天的截图，就得重新检索，记下今晚页面显示的地址和时间。',
    '搜索栏在等你。重新查一遍会占用注意力，把猜测写成绝对答案却不需要任何时间。你知道后者并不因此更可靠。',
  ], [
    back('map_original', '将已有地标记录与记忆并排，逐项保留来源', ['地理复核完成', '独立地理对照'], '三处参照被分栏保存。你没有将一个矛盾外推成整座城市统一平移，也没有给未知原因补上名字。', { allClues: ['地标错位记录'] }),
    back('map_research', '多用一点注意力，重新保存今晚的检索页面', ['地理复核完成', '独立地理对照'], '新的页面与检索时刻都已记下。它们是今晚的版本，不冒充白天没有保存的截图。', undefined, { focus: -1 }),
    back('map_memory', '只画出记得的旧地名，标明尚未重新验证', ['地理复核完成'], '这页是回忆图，尚不能当作当前页面的核验材料。你保住了一点余力。'),
  ], { kind: 'investigation', prompt: '哪些是原始记录，哪些是后来补查？', hint: '旧地标截图可以省去一点注意力。仅凭回忆画图，不会取得可对外核查的独立地理对照。' });

  nodes.case_witness = scene('case_witness', '先记出现，再谈动机', [
    '灰夹克的脸在记忆里格外清楚，时间却没有那么清楚。你把培训中的发言写在前面，随后才列餐厅、地铁和写字楼。',
    '他为什么出现，你并不知道。若留过目击时间，现在可以核对先后；若没有，就向张薇确认一次公司门口的情况，不把她未曾看见的街道也填满。',
    '钟表没有替你证明阴谋。它只能帮助分清，哪些反应先于哪些观察。',
  ], [
    back('watch_original', '用已留存的行程记录核对先后，动机栏留空', ['目击复核完成', '反应与观察时序'], '记录支持发言之后仍受到关注；灰夹克的身份与动机都还没有得到证明。', { allClues: ['观察者行程'] }),
    back('watch_recontact', '联系张薇，只补记她亲见的公司门口时刻', ['目击复核完成', '反应与观察时序'], '她只确认公司附近的一次目击。你把无法确认的其他时刻划到待查栏，没有把口述写成全程跟踪记录。', undefined, { reserve: -1 }),
    back('watch_uncertain', '把模糊的时刻写成区间，不强行排列因果', ['目击复核完成'], '记录承认了记忆中的缺口。今晚没有形成足以连接反应与观察的时间线。'),
  ], { kind: 'investigation', prompt: '被看见的行动，能证明行动者的全部动机吗？', hint: '保留时序不等于读懂动机。原行程能节省联络；重新联系只补亲眼见到的一部分。' });

  nodes.case_inference = scene('case_inference', '纸上留下的连线', [
    '你把已经核过的纸移到台灯下。哪些材料存在，哪些仍然缺失，都留在手记里。',
    '要提出“对方在观察我是否意识到异常”的假说，至少要有针对你的测试和反应之后的观察。地名矛盾是另一份可以独立交流的材料。',
    '一个假说应当允许别人找出反例。把所有人都写成知情者，会让任何回应都变成你想要的证据。',
  ], [
    { id: 'case_supported', text: '提出反应试探假说，明确身份、目的与能力仍未知', nextNodeId: 'case_channel', requires: { allClues: ['定向试题记录', '反应与观察时序'] }, effects: { clues: ['反应试探假说'], resolve: 4 }, feedback: { tone: 'success', text: '你把“有人在试探反应”写在两份材料旁，末尾留了问号。观察者的身份和地名变化的原因还空着。' } },
    { id: 'case_geography_only', text: '只交流已经核对的地理差异，不发布身份推断', nextNodeId: 'case_channel', requires: { allClues: ['独立地理对照'] }, effects: { clues: ['有限地理发布方案'] }, feedback: { tone: 'neutral', text: '你缩小了要对外说明的范围。地理对照可以独立交流，观察者的目的继续留在待查栏。' } },
    { id: 'case_overclaim', text: '把所有同事都认定为知情者，不再区分证言来源', nextNodeId: 'case_reconsider', repeatable: true, effects: { resources: { focus: -1 }, resolve: -5 }, feedback: { tone: 'setback', text: '这个判断无法由现有材料支持。你花去一点注意力重新拆开混写的来源，没有得到新结论。' } },
    { id: 'case_return_to_desk', text: '回到桌面，先补足需要的材料', nextNodeId: 'case_desk', repeatable: true },
    { id: 'case_end_inference', text: '保留未解决的问题，今晚停止核对', nextNodeId: 'ending_case_pause' },
  ], { kind: 'deduction', prompt: '试卷、出现时刻、地理矛盾，各支持到哪一步？', hint: '定向试题与观察时序支持反应试探假说；地理对照可单独发布。任何一组都不能证明全体同事知情。' });
  nodes.case_reconsider = scene('case_reconsider', '划掉的是推断', [
    '你将“所有人”三个字划掉。没有一份纸因为这道划线就消失；失去的是继续核对的一点精神。',
    '张薇的回答只能归在她的名下。培训师与灰夹克之间是否相互知情，纸上还没有那条连线。',
    '你可以回到桌面重新组合，也可以把未解的部分留到明天。',
  ], [
    { id: 'case_reconsider_back', text: '回到桌面，重新区分事实和推断', nextNodeId: 'case_desk', repeatable: true },
    { id: 'case_reconsider_stop', text: '停止消耗余力，留下更正后的材料', nextNodeId: 'ending_case_pause' },
  ]);

  nodes.case_channel = scene('case_channel', '最后一份联络余量', [
    '屏幕里的新问题还是空白。你决定说明多少，并不等于今晚还有足够余力等一位接收者逐条确认。',
    '完整交接需要地理材料、试探假说和一份联络余量。也可以只发布一条匿名的地名问题，或者完全不发，把这一夜的记录留在自己手里。',
    '你检查了一遍附件，没有姓名、住址和公司位置。对方将如何回答，不能由你预先写进草稿。',
  ], [
    { id: 'case_full_handoff', text: '保留双方署时，用最后的联络余量完成独立核对', nextNodeId: 'case_handoff', requires: { allClues: ['反应试探假说', '独立地理对照'] }, effects: { resources: { reserve: -1 }, clues: ['独立材料交接'] } },
    { id: 'case_anonymous_question', text: '只用地名差异发布匿名问题，等待另一份记忆', nextNodeId: 'forum', requires: { allClues: ['独立地理对照'] }, feedback: { tone: 'neutral', text: '你只发布了去除身份信息的地理差异。观察者的身份推断没有出现在这条问题里。' } },
    { id: 'case_private_record', text: '暂不发布，封存这次复核及其未知部分', nextNodeId: 'ending_case_pause' },
  ], { kind: 'resource', prompt: '今晚还能完成交接，还是只能写好问题？', hint: '独立交接需要试探假说、地理对照及一份联络余量。匿名提问能走向原有见证者路线，个人封存始终可选。' });
  nodes.case_handoff = scene('case_handoff', '回复还不能算同意', [
    '匿名接收者先复述地名，又问你能否将亲见与推测拆成两个附件。对方没有自称知道真相，也没有许诺带你回去。',
    '你们为下一次核对约了时间。手里已经留下交接记录，但要继续相互验证，还是先收束今晚的调查，仍然由你决定。',
    '台灯照着杯沿。你第一次发现，这一夜的成果不必用“已经全都明白”来命名。',
  ], [
    { id: 'case_keep_testing', text: '约定交换反例与更正，不把假说当成入会条件', nextNodeId: 'ending_case_network', effects: { trust: 5 } },
    { id: 'case_keep_receipt', text: '保留接收确认，先结束今晚的联络', nextNodeId: 'ending_case_record' },
  ]);
  const finish = (id: string, title: string, text: string[], tone: 'hopeful' | 'uneasy') => {
    nodes[id] = { ...scene(id, title, text, []), chapter: '终章 · 今夜的记录', ending: { title, text: text.join('\n\n'), tone } };
  };
  finish('ending_case_network', '结局 · 允许更正的名单', [
    '第二次联络时，对方纠正了你写错的一处旧站名。你没有把这当成背叛，在原记录旁写下更正时间。',
    '试卷与目击仍只支持一个假说。你们轮流补查，让反例也能留在同一份档案里。没人靠说得最确定来决定谁算同类。',
    '这座城市的秘密尚未打开。你的问题却终于有了另一个愿意认真反驳它的人。',
  ], 'hopeful');
  finish('ending_case_record', '结局 · 签收不等于答案', [
    '对方确认收到了材料，你把这条回执保存下来，关掉了联络窗口。今晚没有人承诺明天世界就会恢复。',
    '有依据的观察、可以讨论的假说和尚未核实的事分开放好。交出去的副本没有带走你的生活。',
    '你替手机充上电，设好明早的闹钟。该继续的核对可以另约时间。',
  ], 'hopeful');
  finish('ending_case_pause', '结局 · 空白也留到明天', [
    '你只把确实做过的复核标上日期。没有补齐的栏位继续空着，没有获得的确认也没有出现在纸上。',
    '停止这一夜的调查，并不替任何疑问给出答案。你将材料放在自己找得到的地方，关掉台灯。',
    '窗外早班清扫车的声音慢慢近了。明天是否继续，你准备睡醒后再决定。',
  ], 'uneasy');

  return { ...world, nodes, version: '1.2.0', compatibleSaveVersions: [...new Set([world.version, ...(world.compatibleSaveVersions ?? [])])],
    mechanics: { title: '自由复核与有限余量', description: '主线记录会影响深夜复核的成本。回家后可自行安排试卷、地理与目击三项调查，用有限注意力组合材料，再决定是否支付最后一份联络余量完成交接。', beginnerTip: '白天保留原始试卷、地标截图与行程，能省去夜间补证。休整也消耗联络余量，不必为了集齐每一项而放弃最后的交接。' },
    adaptation: { ...world.adaptation, note: `${world.adaptation.note}深夜复核、匿名交接与新增结局为原创支线；试探目的只作为待验证假说，不宣称揭晓原作真相。` },
  };
}
