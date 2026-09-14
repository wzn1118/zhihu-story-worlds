import type { AuthoredWorld } from './worlds.ts';
import type { JournalStatus, OperationJournal } from '../shared/types.ts';

const pending = (detail: string): JournalStatus => ({ label: '待办', detail, tone: 'pending' });
const recorded = (label: string, detail: string, ...allClues: string[]) => ({ label, detail, tone: 'recorded' as const, allClues });
const gap = (detail: string, clue: string) => ({ label: '保留空缺', detail, tone: 'gap' as const, allClues: [clue] });

export function withOperationJournals(world: AuthoredWorld): AuthoredWorld {
  let journal: OperationJournal;
  if (world.id === 'blue-blood') {
    journal = {
      id: 'night-records', title: '今夜的三份记录',
      introduction: '试卷、地理、目击分开复核。原件能省去补证；今晚的联络余量还要负担休整和最后交接。',
      nodeIds: Object.keys(world.nodes).filter(id => id.startsWith('case_') || id.startsWith('ending_case_')),
      items: [
        { id: 'paper', title: '培训试卷', initial: pending('核对谁被要求回答什么，未证实的部分留白。'), stages: [
          gap('本项已经复核，但没有取得定向测试的完整记录。', '试卷复核完成'),
          recorded('已核实', '题目差异支持额外测试，不等于证明每位同事的知情程度。', '定向试题记录'),
        ] },
        { id: 'map', title: '地理参照', initial: pending('把记忆和当前页面分栏，保留每项的来源。'), stages: [
          gap('只留下了记忆图，尚无可对外核查的页面对照。', '地理复核完成'),
          recorded('已核实', '地名差异已独立记录，原因仍未确定。', '独立地理对照'),
        ] },
        { id: 'watch', title: '观察时序', initial: pending('先核对出现的时间，再讨论观察者的动机。'), stages: [
          gap('未补全时序；模糊记忆没有被写成跟踪证据。', '目击复核完成'),
          recorded('已核实', '发言与后续关注的先后有记录，观察者的动机仍未知。', '反应与观察时序'),
        ] },
        { id: 'hypothesis', title: '材料之间的关系', initial: pending('在复核后判断哪些材料能够支持同一个假说。'), stages: [
          recorded('有限发布', '只提出独立地理疑问，不把它扩写成监视动机。', '有限地理发布方案'),
          recorded('假说待证', '试卷与时序支持反应试探假说，仍应接受反例。', '反应试探假说'),
        ] },
        { id: 'handoff', title: '独立材料交接', initial: pending('是否交接由你决定；材料齐全时仍需一份联络余量。'), stages: [
          recorded('已交接', '独立材料已有接收确认，签收不代表世界的秘密已经揭晓。', '独立材料交接'),
        ] },
      ],
    };
  } else if (world.id === 'future-island') {
    journal = {
      id: 'four-slot-voyage', title: '这一班的四格货位',
      introduction: '本班只算重新核验、实际装上的货。备件三格；饮水两格；转移模块两格。出航与误潮补救共用应急配额。',
      nodeIds: Object.keys(world.nodes).filter(id => id.startsWith('logistics_') || id === 'ending_maintenance_pact'),
      closedClues: ['配载支线已收束'],
      cargo: { resourceId: 'cargo', loads: [
        { label: '备件', slots: 3, clue: '配载备件装船' },
        { label: '饮水', slots: 2, clue: '配载饮水装船' },
        { label: '转移', slots: 2, clue: '配载转移模块装船' },
      ] },
      items: [
        { id: 'stock', title: '本班库存', initial: pending('重新复点来源，旧航次的批次不算本班库存。'), stages: [recorded('已复点', '本班库存已单独核对；复点不代表已经装船。', '配载库存核验')] },
        { id: 'terms', title: '收货条款', initial: pending('核清实收、拒收与退出的边界。'), stages: [recorded('已确认', '只对本班实际交付负责，收货不构成长期接纳承诺。', '配载收货条款')] },
        { id: 'spares', title: '机组备件 · 三格', initial: pending('可以不选本项。承运前核对型号和现场操作人。'), stages: [
          recorded('已核验', '机组型号已核，尚未装船。', '配载机组型号核验'),
          recorded('已装船', '三格整套备件已封装，尚未取得现场签收。', '配载备件装船'),
          recorded('已签收', '现场已逐件签收；能否运行还要另做试机。', '配载备件签收单'),
        ] },
        { id: 'water', title: '饮水 · 两格', initial: pending('可以不选本项。承运前核对余水、接收人与窗口。'), stages: [
          recorded('已核验', '需求已核，尚未装船。', '配载饮水需求核验'),
          recorded('已装船', '两格饮水已装船，尚未取得实收回执。', '配载饮水装船'),
          recorded('已签收', '实收数量有本班签收单，不代表已解决长期供水。', '配载饮水签收单'),
        ] },
        { id: 'rescue', title: '成年人员转移 · 两格', initial: pending('可以不选本项。先确认本人意愿、目的地和接收名额。'), stages: [
          recorded('已核验', '转移申请已核，座位与物资尚未装配。', '配载转移意愿核验'),
          recorded('已装船', '两格座位与物资已留出，人员交接尚未完成。', '配载转移模块装船'),
          recorded('已交接', '本班转移有接驳交接单，不等于获得长期登岛资格。', '配载转移交接单'),
        ] },
        { id: 'voyage', title: '出航与返航', initial: pending('出航需船坞转运配额、收货条款和一份应急配额。'), stages: [
          recorded('已出航', '本班已离泊，只兑现核验过的窗口。', '配载出航确认'),
          { label: '曾经误潮', detail: '临时承诺打乱了窗口；后续是否实收，以各项回执为准。', tone: 'gap', allClues: ['配载临时承诺误潮'] },
          recorded('已核销', '本班已结束，货位恢复。已装过的东西不自动成为签收记录。', '配载返航核销'),
          { label: '已收束', detail: '本班不再新增装载，交付结果以各项回执为准。', tone: 'recorded', allClues: ['配载支线已收束'] },
        ] },
        { id: 'trial', title: '机组试机', initial: pending('仅承运备件时需要：签收后再留一点精力检查实际运行。'), stages: [recorded('有试机回单', '本台机组完成现场试机，不外推为其他站点也已修复。', '配载机组试机回单')] },
      ],
    };
  } else return world;
  return { ...world, operationJournals: [journal] };
}
