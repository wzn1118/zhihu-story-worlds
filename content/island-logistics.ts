import type { AuthoredWorld } from './worlds.ts';
import type { Choice, SceneNode } from '../shared/types.ts';

const clue = {
  stock: '配载库存核验', waterSite: '配载饮水需求核验', spareSite: '配载机组型号核验', rescueSite: '配载转移意愿核验',
  terms: '配载收货条款', rest: '配载值守已轮休', water: '配载饮水装船', spare: '配载备件装船', rescue: '配载转移模块装船',
  sailed: '配载出航确认', waterReceipt: '配载饮水签收单', spareReceipt: '配载备件签收单', rescueReceipt: '配载转移交接单',
  trial: '配载机组试机回单', returned: '配载返航核销', closed: '配载支线已收束', missed: '配载临时承诺误潮',
} as const;

const loaded = [clue.water, clue.spare, clue.rescue];
const receipts = [clue.waterReceipt, clue.spareReceipt, clue.rescueReceipt];
const maintenanceProof = [clue.stock, clue.spareSite, clue.terms, clue.spare, clue.spareReceipt, clue.trial, clue.returned];

function back(id: string, target = 'logistics_table', text = '回到调度台，核对下一项'): Choice {
  return { id, text, nextNodeId: target, repeatable: true };
}

export function withIslandLogistics(world: AuthoredWorld): AuthoredWorld {
  if (world.id !== 'future-island' || world.nodes.logistics_table) return world;
  const nodes = structuredClone(world.nodes);
  const dock = nodes.dock;
  const scene = (id: string, title: string, text: string[], choices: Choice[], speaker = '闻澄', challenge?: SceneNode['challenge']): SceneNode => ({
    id, title, chapter: '支线 · 这一班的四格货位', location: '未来岛 · 船坞调度台', time: '灾变 第 9 日 · 本班航次',
    background: dock.background, text, choices, speaker, challenge,
  });
  const close = (id: string, text: string, nextNodeId: string, requires?: Choice['requires']): Choice => ({
    id, text, nextNodeId, requires, effects: { clues: [clue.returned, clue.closed], resources: { cargo: 4 } },
  });
  nodes.dock.choices.push({
    id: 'plan_limited_manifest', text: '单列一班四格货位，逐项核验后自行配载', nextNodeId: 'logistics_intake',
    requires: { noneClues: [clue.closed] }, hint: '可选航次；出航仍需船坞转运配额与 1 份应急配额。',
  });
  nodes.last_decision.choices.push({
    id: 'choose_maintenance_pact', text: '以备件签收、试机和返航记录为依据，延续小规模维护合作',
    nextNodeId: 'ending_maintenance_pact', requires: { allClues: maintenanceProof }, effects: { trust: 8 },
    hint: '需要本班实际装运备件、签收、现场试机和返航核销；其他航次的账本不能代替。',
  });

  const additions: SceneNode[] = [
    scene('logistics_intake', '四格，已经扣过返航', [
      '段铎把船坞验收单转给你。按本班海况、固定点和返航余量，工作艇只放行四格。仓库里的钱和货还很多，装载线却不会随着账户变化。',
      '闻澄在单上分开三行：三格机组备件、两格饮水、两格用于转移的座位与安全物资。段铎按住第一行：“这套东西少一个箱就配不齐。装它，就带不了后两项。”',
      '“以前交出去的批次别再写进来。”闻澄另起了一张库存单，“这一班只算重新清点、实际装上的东西。谁收、收几件，先说清楚。”',
    ], [back('open_logistics_table', 'logistics_table', '摊开本班库存、站点和配载三张单'), { id: 'decline_logistics', text: '暂不开这班航次，回到原船坞方案', nextNodeId: 'dock', effects: { clues: [clue.closed] } }], '段铎',
    { kind: 'resource', prompt: '本班四格：备件三格，饮水两格，转移模块两格', hint: '出航还需船坞转运配额和 1 份应急配额。核验每类站点消耗 1 点值守精力；备件交接后的试机另需 1 点。' }),

    scene('logistics_table', '先把空格留着', [
      '桌角压着四枚货位牌。闻澄不肯先发出到货承诺：“把空格写成未知，比让人按空格分水好。”朱玲玲在另一端提醒，愿意接电话的人不一定能卸船。',
      '段铎指向待验的返工箱。钱早已付过，库存来源、型号、收货人却仍是三件事。你把三张单分开，免得一个签名替另一张单作证。',
      '船坞的离泊铃还没响。能完成的项目可以逐项落笔，不能完成的也可以在这里撤回；回头拆封重新配载，会错过这一班验收。',
    ], [
      { id: 'check_logistics_stock', text: '到库口复点本班可动用的实物', nextNodeId: 'logistics_inventory', repeatable: true, requires: { noneClues: [clue.stock] } },
      back('open_logistics_contacts', 'logistics_contacts', '接通站点，逐项核实需求与接收能力'),
      { id: 'open_logistics_terms', text: '与接收方约定减量、拒收和退出的处理', nextNodeId: 'logistics_terms', repeatable: true, requires: { noneClues: [clue.terms] } },
      { ...back('open_logistics_cargo', 'logistics_cargo', '查看已核实项目，安排本班配载'), requires: { allClues: [clue.stock] } },
      { id: 'take_logistics_watch_break', text: '调换一次值守：用 1 份应急配额恢复 2 点精力', nextNodeId: 'logistics_rest', requires: { noneClues: [clue.rest], resources: { focus: { max: 3 } } }, effects: { clues: [clue.rest], resources: { reserve: -1, focus: 2 } } },
      { ...back('review_logistics_manifest', 'logistics_manifest', '汇总已装船货物，核对是否能承诺出航'), requires: { allClues: [clue.stock, clue.terms], anyClues: loaded } },
      back('abort_logistics_plan', 'logistics_aborted', '撤回本班计划，把已封的货物留在岛上'),
    ], '闻澄', { kind: 'resource', prompt: '库存、站点、条款和货位必须分别成立', hint: '先核实想做的项目，再封舱；装船不退格。轮休只有一次，也会占用出航或误潮补救需要的应急配额。' }),

    scene('logistics_inventory', '标签不能代替箱子', [
      '你沿库口摄像头逐箱报数。段铎拆开返工箱：一套尚未配出的匹配密封件与固定架；生活水则要从你自己的封存用量里划出。两项都没有列入此前已交接的独立救助批次。',
      '闻澄让你把个人用量表同步减记。你说先装船，回来再补，她摇头：“回来就会有人问能不能再出一班。到那时，这一行还空着。”',
      '你在本班单上写明来源。转移模块的座位、救生物资与固定空间也被单列，空甲板没有自动变成载客能力。清点结束，仍没有任何一箱离开库口。',
    ], [
      { id: 'confirm_logistics_stock', text: '签下独立库存来源，允许按本单封装', nextNodeId: 'logistics_table', effects: { clues: [clue.stock] } },
      back('leave_logistics_inventory', 'logistics_table', '暂不签库存来源，回调度台'),
    ], '段铎'),

    scene('logistics_contacts', '三个站点的来电', [
      '闻澄要饮水，另一处站点请求修净水机。朱玲玲带来的是几名成年人想离开现驻站点的消息。三条记录被公屏挤在一起，看起来像同一个“急”字。',
      '崔英睿发来一句话：“统一写给我，省得你们来回确认。”闻澄读完，没有转发表格：“修机器找实际操作的人，离开问本人。您一个签名代不了三边。”',
      '每做一项双向核验，都要占去一段值守时间。你可以只核一项，把其余需求保留为未确认，也可以先回去重新考虑配载。',
    ], [
      { ...back('call_logistics_water', 'logistics_water_contact', '核对闻澄所在站点的饮水与卸货条件'), requires: { noneClues: [clue.waterSite] } },
      { ...back('call_logistics_spares', 'logistics_spare_contact', '让段铎与机组站点逐项核对型号'), requires: { noneClues: [clue.spareSite] } },
      { ...back('call_logistics_rescue', 'logistics_rescue_contact', '逐人确认转移意愿，并接通目的地'), requires: { noneClues: [clue.rescueSite] } },
      back('leave_logistics_contacts'),
    ], '朱玲玲'),

    scene('logistics_water_contact', '水桶里的刻度', [
      '闻澄把镜头对准水桶内壁，三十六名成年住户的用量已经标到明晚。她要的是这班能到的密封饮水，不接受把下一周写在本周的回执上。',
      '朱玲玲接通站点另一端，请值守者独立报出楼顶编号、余水和卸货时段。两边答完，闻澄才说：“可以少送，不能同一箱在两张清单上各算一次。”',
      '核验仍需要你把两个时间点、接收人和数量逐项对上。只听过这通电话，还不能在单上盖已确认。',
    ], [
      { id: 'verify_logistics_water', text: '花 1 点精力完成双向核对，确认本班饮水需求', nextNodeId: 'logistics_contacts', requires: { noneClues: [clue.waterSite] }, effects: { clues: [clue.waterSite], resources: { focus: -1 } } },
      back('leave_logistics_water_contact', 'logistics_contacts', '保留来电内容，暂不确认饮水项目'),
    ]),

    scene('logistics_spare_contact', '同名的零件装不上去', [
      '段铎听见对方报“通用密封件”，就打断了他：“别读采购名称，拍机身铭牌和拆下来的件。”几分钟后，两张照片的接口朝向才终于一致。',
      '站点还有待处理的存水与会操作机组的成年人，缺的是这一套配件。段铎却不肯签恢复供水：“型号吻合只能说明值得运。装好以后，要有人看完整个试机过程。”',
      '对方问能否顺带饮水。你看着占三格的整套箱子，听见段铎把话说完：“这班带了它，就要明说带不了两格的水。”',
    ], [
      { id: 'verify_logistics_spares', text: '花 1 点精力核对型号、接收人和后续试机条件', nextNodeId: 'logistics_contacts', requires: { noneClues: [clue.spareSite] }, effects: { clues: [clue.spareSite], resources: { focus: -1 } } },
      back('leave_logistics_spare_contact', 'logistics_contacts', '不把型号猜测写成确认，回到站点清单'),
    ], '段铎'),

    scene('logistics_rescue_contact', '她替他们拨号，不替他们点头', [
      '朱玲玲把电话递出去，没有替任何人回答。几名成年人分别说明想离开的原因，又问目的地能否自行离开。最后一个人改了主意，名字从本班名单上划掉。',
      '闻澄接通大陆一侧的临时接驳码头，对方确认本班可接收的名额和离站通道。你把目的地圈在图上，注明短途接驳，并请对方复述下船后的去向。',
      '崔英睿追问为什么不先把人集中。朱玲玲看向刚划掉的名字：“因为他刚才说不去。您听到了。”船位只给确认了去向、并仍然愿意的人。',
    ], [
      { id: 'verify_logistics_rescue', text: '花 1 点精力分别核对本人意愿、名额与目的地交接', nextNodeId: 'logistics_contacts', requires: { noneClues: [clue.rescueSite] }, effects: { clues: [clue.rescueSite], resources: { focus: -1 } } },
      back('leave_logistics_rescue_contact', 'logistics_contacts', '保留申请，暂不对转移作出承诺'),
    ], '朱玲玲'),

    scene('logistics_terms', '签在空白旁边', [
      '崔英睿把“服从统一分配”贴进收货栏。闻澄将它挪到单独一页：“领取这班物资，不等于把以后去哪儿交给您。”屏幕安静了一阵。',
      '你们把能核实的条款缩到本班：收货人逐件签数量，有权拒收损坏品；乘船本人上船前仍可退出；临时减货或加站，必须重新联系受影响的人。',
      '“那就不能保证所有人都满意。”崔英睿说。你在没有核实的地方留了空白：“确实不能。先保证他们知道自己答应的是什么。”',
    ], [
      { id: 'confirm_logistics_terms', text: '确认按实收签字、可拒收和本人退出权', nextNodeId: 'logistics_table', effects: { clues: [clue.terms] } },
      back('leave_logistics_terms', 'logistics_table', '条款未定，先不出航'),
    ], '崔英睿'),

    scene('logistics_cargo', '封条贴下去以后', [
      '库口的箱子按项目排开。三格备件必须成套固定；饮水占两格；转移模块也占两格，既包括物资，也包括不能堆货的活动空间。',
      '闻澄问你先推哪一排。没有一种排法能带走全部：备件留岛，机组修复要等下一次；饮水留岛，站点要重新计算余水；不放转移模块，这班就不接人。',
      '段铎举起封条：“这一班不做拆封重验。选定后，剩下的格数只会更少。真要全部撤回，可以停航，把货留在岛上。”',
    ], [
      { id: 'load_logistics_spares', text: '封装整套机组备件，占 3 格', nextNodeId: 'logistics_loaded_spares', requires: { allClues: [clue.stock, clue.spareSite], noneClues: [clue.spare] }, effects: { resources: { cargo: -3 }, clues: [clue.spare] } },
      { id: 'load_logistics_water', text: '封装本班饮水，占 2 格', nextNodeId: 'logistics_loaded_water', requires: { allClues: [clue.stock, clue.waterSite], noneClues: [clue.water] }, effects: { resources: { cargo: -2 }, clues: [clue.water] } },
      { id: 'load_logistics_rescue', text: '固定转移模块并留出活动空间，占 2 格', nextNodeId: 'logistics_loaded_rescue', requires: { allClues: [clue.stock, clue.rescueSite, clue.terms], noneClues: [clue.rescue] }, effects: { resources: { cargo: -2 }, clues: [clue.rescue] } },
      back('leave_logistics_cargo'),
    ], '段铎', { kind: 'resource', prompt: '四格内配载；每项只能封装一次', hint: '备件与饮水、转移分别互斥。饮水加转移恰好四格，但仍不能修机组。先核实再装货，避免把精力花在装不下的项目上。' }),

    scene('logistics_loaded_spares', '少一件就不能交', [
      '三格的固定点依次扣紧。段铎对照站点型号，把每件配套物的编号念了一遍。你想把最外侧一只箱子挪出来，他指给你看那是整套里不能少的固定架。',
      '余下的一格空着，闻澄没有再问饮水。她在未承运栏写明原因，然后把修机组之后仍需核验的试机格圈了起来。',
    ], [back('return_logistics_loaded_spares', 'logistics_cargo', '保留成套装载，查看剩余货位')], '段铎'),

    scene('logistics_loaded_water', '这次扣的是自己的用量', [
      '两格密封饮水推上艇，你在自己的封存表上签了划出日期。闻澄把新的封条编号发回站点，叮嘱他们只有见到实物后才计入余量。',
      '岸上的机组请求仍亮着。这班已装不下三格备件；另一份两格只能按清单用于转移或继续留空，已经装过的项目不能再拿一次。',
    ], [back('return_logistics_loaded_water', 'logistics_cargo', '核对剩余货位，决定是否保留转移空间')]),

    scene('logistics_loaded_rescue', '空出来的地方也有用途', [
      '固定带扣上以后，甲板上仍显得很空。有人在频道里提议再塞几箱，朱玲玲把模块清单翻过来，让他看需要保持畅通的那一段。',
      '你将这两格标成已占用。它们不会在饮水卸下后凭空翻倍，也不允许把尚未核实的新来者直接加进本班名单。',
    ], [back('return_logistics_loaded_rescue', 'logistics_cargo', '保留核定转移空间，不追加名额')], '朱玲玲'),

    scene('logistics_rest', '把耳机交给下一个人', [
      '段铎接过你戴热了的耳机，让你先离开屏幕。你喝完一杯水，才发现刚才把同一个站点编号读反过两次。',
      '这一轮替岗动用了应急人员和备用通信时段。闻澄在配额栏划掉一份：“精神回来了，后面的余量却少了。出航还得留一份。”',
    ], [back('return_logistics_rest')], '段铎'),

    scene('logistics_manifest', '付款凭证不在这一栏', [
      '闻澄只把已验库存、已核站点和已封舱项目抄进出航单。没装的东西仍留在未承运栏，空着的一格也没有变成额外的水或座位。',
      '段铎要求你再看船坞配额。为私人撤离封存的能力不算这班往返检修；缺少此前保留的船坞转运配额，就只能撤回。',
      '“航次要用一份应急配额，备件交后试机还要一点值守精力。”闻澄说，“您若现在先答应一个未核实的加站，后面的签收时间也跟着变了。”',
    ], [
      { id: 'sail_logistics_manifest', text: '投入船坞转运配额与 1 份应急配额，按已装项目出航', nextNodeId: 'logistics_crossing', requires: { allClues: [clue.stock, clue.terms, '船坞转运配额'], anyClues: loaded, noneClues: [clue.sailed] }, effects: { resources: { reserve: -1 }, clues: [clue.sailed] } },
      back('revise_logistics_manifest', 'logistics_table', '尚未离泊，回调度台继续核对'),
      back('cancel_logistics_manifest', 'logistics_aborted', '本班条件不足，撤回出航承诺'),
    ], '闻澄', { kind: 'resource', prompt: '封舱不等于有条件出航', hint: '1 份应急配额用于本班往返。备件路线另留 1 点精力做试机；没有实收和试机回单，就没有维护合作结局。' }),

    scene('logistics_crossing', '多答应一句的距离', [
      '工作艇离开遮蔽水域，几个已确认站点按约定亮起值守信号。船长的录音里有风声，也有返航时刻。他没有说“顺路”两个字。',
      '公屏忽然转来一个陌生位置，请求临时加站。朱玲玲只收到转发，原发送人没接电话。崔英睿说不如先答应，闻澄却问：“地址改了三次，哪边在等？”',
      '若去追这个位置，本班会错过原卸货窗口。你可以留下未核需求，也可以先作出承诺；承诺不会替你完成核验或多装货。',
    ], [
      { id: 'keep_logistics_schedule', text: '保留陌生请求待核，履行已确认站点的时间', nextNodeId: 'logistics_receipts' },
      { id: 'promise_logistics_detour', text: '先答应追查陌生位置，接受错过本班卸货窗口', nextNodeId: 'logistics_missed_tide', effects: { trust: -5, clues: [clue.missed] }, feedback: { tone: 'setback', text: '未核实的承诺改变了航程。货物仍在船上，尚无任何签收；恢复原交接要另耗联络与应急余量。' } },
    ], '崔英睿'),

    scene('logistics_missed_tide', '接电话的人已经换班', [
      '转发位置只传回同一段旧录音。船长没有让未核实的人上船，却已经错过原定窗口。闻澄所在站点换了值守，对方拒绝替上一班签字。',
      '崔英睿说可以先记成已送达，省得名单不好看。闻澄把镜头对准仍未拆的封条：“货还在这里。把这行写满，他们明早就会少找一批水。”',
      '重新约到原接收方，需要一点值守精力和一份应急配额。若凑不齐，船能带着原货返岛，这一班只能记作未交付。',
    ], [
      { id: 'repair_logistics_schedule', text: '花 1 点精力和 1 份应急配额，重约已核站点的交接', nextNodeId: 'logistics_receipts', effects: { resources: { focus: -1, reserve: -1 } }, feedback: { tone: 'neutral', text: '恢复的是既有站点的交接窗口；陌生请求仍未核实，没有新增物资或载客名额。' } },
      { id: 'return_logistics_undelivered', text: '不填虚假回执，带原货返岛', nextNodeId: 'logistics_failed_return' },
    ]),

    scene('logistics_receipts', '不按预计数签收', [
      '接收端打开本班清单，只核对船上实际出现的项目。未承运的行保留着空白，谁也不能用此前另一批货的收据把它补齐。',
      '闻澄将封条编号逐一念给对面。朱玲玲提醒转移人员再次确认去向；段铎在等配件落地后的试机画面。三件事各有自己的完成时刻。',
      '船长催你留出返航时间。已经签收的可以结束，未完成的必须如实核销；留在船上的货不会因为你点了返航就算交过。',
    ], [
      { id: 'deliver_logistics_water', text: '核对饮水实物、封条和数量，取得本班签收', nextNodeId: 'logistics_water_delivery', requires: { allClues: [clue.sailed, clue.waterSite, clue.water, clue.terms], noneClues: [clue.waterReceipt] }, effects: { clues: [clue.waterReceipt], trust: 4 } },
      { id: 'deliver_logistics_spares', text: '按型号逐件交付整套备件，取得本班签收', nextNodeId: 'logistics_spare_delivery', requires: { allClues: [clue.sailed, clue.spareSite, clue.spare, clue.terms], noneClues: [clue.spareReceipt] }, effects: { clues: [clue.spareReceipt], trust: 3 } },
      { id: 'trial_logistics_pump', text: '花 1 点精力连线监督试机，核对回单', nextNodeId: 'logistics_pump_trial', requires: { allClues: [clue.spareSite, clue.spare, clue.spareReceipt], noneClues: [clue.trial] }, effects: { resources: { focus: -1 }, clues: [clue.trial] } },
      { id: 'deliver_logistics_rescue', text: '依本人再次确认的名单接驳，在核定目的地交接', nextNodeId: 'logistics_rescue_delivery', requires: { allClues: [clue.sailed, clue.rescueSite, clue.rescue, clue.terms], noneClues: [clue.rescueReceipt] }, effects: { clues: [clue.rescueReceipt], trust: 4 } },
      { id: 'finish_logistics_handover', text: '带已完成的回执返岛，逐项记录未完成的部分', nextNodeId: 'logistics_return', requires: { anyClues: receipts } },
      { id: 'leave_logistics_without_receipt', text: '放弃本班交接，原货返岛并记录未交付', nextNodeId: 'logistics_failed_return', requires: { noneClues: receipts } },
    ], '闻澄', { kind: 'investigation', prompt: '已装船、已签收与已试机是三个不同状态', hint: '每项交接只能完成一次。转移不能使用卸水后的空位追加名额；备件签收后若没有精力试机，可以如实结束，但不能解锁维护合作。' }),

    scene('logistics_water_delivery', '先看见，才分下去', [
      '接收人先报封条，再报实际到货数量。闻澄把已签清单推到镜头前，这才允许另一侧将本批饮水加到站点账上。',
      '有人问是不是从此每周都有。你没有点头，只把本班日期重说了一遍。两格饮水缓解的是眼下的等待，机组和下一周仍然需要另外的安排。',
    ], [back('return_logistics_water_delivery', 'logistics_receipts', '收好饮水签收单，核对本班其余项目')]),

    scene('logistics_spare_delivery', '落地还不算修好', [
      '三格备件卸到干燥处，接收人照着型号清单逐件签字。段铎听到“设备恢复”四个字，立刻让对方划掉：“现在只能写货收到了。”',
      '装配人员开始接管设备，镜头仍对着未运行的机组。你可以留下精力核对试机，也可以带着真实的交货收据结束，不能把两者合写成一个完成。',
    ], [back('return_logistics_spare_delivery', 'logistics_receipts', '保存备件签收，决定是否继续试机核验')], '段铎'),

    scene('logistics_pump_trial', '回单上有两个人的笔迹', [
      '段铎守着画面，站点操作人按既有规程完成装配后的整轮试机，将实测结果与当班记录发回。你核对时间和设备编号，删去那句过大的“永久恢复”。',
      '回单留下两处签名：一个负责现场，另一个负责远端复核。这一轮机组可以按核定范围运行，下一次耗材和维护仍要另算，未来岛没有因此多出无穷淡水。',
      '闻澄把回单与本班备件签收放在同一个夹里：“以后谈下一次，就拿这个数字开头。别拿您账户里的数字开头。”',
    ], [back('return_logistics_pump_trial', 'logistics_receipts', '收入试机回单，继续核销本班交接')], '段铎'),

    scene('logistics_rescue_delivery', '在岸上再问一次', [
      '上船前，朱玲玲逐人重复目的地，等本人回答。原先核定的模块和空间保持不变，饮水卸下的空处没有被当作新增座位。',
      '艇到大陆一侧的接驳码头，目的地值守者逐人确认抵达。有人急着问下一班船，闻澄指向仍未排定的日期：“先把今天已经完成的写清楚。”',
      '交接单只证明这些成年人按本班约定抵达，既没有自动成为谁的追随者，也没有取得未来岛的长住配额。',
    ], [back('return_logistics_rescue_delivery', 'logistics_receipts', '保存转移交接单，核对剩余回执')], '朱玲玲'),

    scene('logistics_return', '签过的和没签过的都带回来', [
      '工作艇重新进入遮蔽船坞。闻澄将本班表分成实收、原封带回、仍未完成三栏；留空的签名没有在返航途中自己长出来。',
      '段铎问这些记录下一步送去哪里。议事频道等着准确余量，档案室等着具体人的去向；已经交过备件的站点，还可能需要把未试机写在最前面。',
      '四格货位可以在核销后释放，但这一班已经结束。新的需求要有新的航次，你不能回到今天的装货台再拿一遍同样的货。',
    ], [
      close('close_logistics_water', '带本班饮水签收回议事频道，只承诺已经完成的数量', 'council', { allClues: [clue.waterReceipt] }),
      close('close_logistics_rescue', '带本班转移交接回档案室，记下具体人的去向', 'archive', { allClues: [clue.rescueReceipt] }),
      close('close_logistics_maintenance', '带备件签收与试机回单回议事频道，讨论下次维护边界', 'council', { allClues: [clue.spareReceipt, clue.trial] }),
      close('close_logistics_spares_only', '仅公开备件签收，把机组是否恢复留为未确认', 'archive', { allClues: [clue.spareReceipt], noneClues: [clue.trial] }),
    ], '段铎'),

    scene('logistics_aborted', '把停航说在等候之前', [
      '你把本班出航栏划掉，通知已联系的站点不要按这班货来分配。闻澄让他们回复收到停航通知，才把耳机摘下来。',
      '封好的货仍在岛上，饮水签收与转移抵达两栏都空着。段铎撤掉货位牌，把到货时间改成待定：“我去通知码头，这一班取消。”',
    ], [{ id: 'close_logistics_aborted', text: '核销本班计划，回到原船坞方案', nextNodeId: 'dock', effects: { clues: [clue.closed], resources: { cargo: 4 } } }]),

    scene('logistics_failed_return', '原封带回的重量', [
      '回岛时，封条仍和出航照片里一样。船长卸回原货，闻澄在到货数量上写零，又把未完成的接驳一并划掉。没有人替未抵达的人签名。',
      '你听见频道里有人叹气。承认这一班没送成，不能弥补等待，却能阻止下一班按错误库存继续分配。剩下的记录会跟你一起进入档案室。',
    ], [{ id: 'close_logistics_failed', text: '记录未交付航次，回档案室保留事实', nextNodeId: 'archive', effects: { clues: [clue.closed], resources: { cargo: 4 } } }]),

    { ...scene('ending_maintenance_pact', '结局 · 只修这一台，先守这一次', [
      '雨季之后，站点寄来的表仍只写着那一台机组。三格备件的签收、两个人核过的试机回单和返航记录夹在一起，谁也没有把它改名为一整片地区的获救。',
      '下一次维护日期改过两回。闻澄据实重排用量，段铎把尚未到手的零件留在待定栏。没有直送饮水，也没有转移席位的那一班，留下了另一种可以核对的成果。',
      '你们延续小规模维护合作：每次只接下有实物、有接收人、有完成记录的那一项。金币仍在桌上，下一张单是否签字，要等对面把设备状况说完。',
    ], []), chapter: '终章 · 有回单的约定', location: '未来岛 · 维护联络桌', time: '雨季之后', ending: { title: '结局 · 只修这一台，先守这一次', text: '每次合作都从实际库存和上一份回单开始，规模不再由一句承诺决定。', tone: 'hopeful' } },
  ];
  for (const node of additions) nodes[node.id] = node;

  return {
    ...world, nodes, version: '1.2.0',
    compatibleSaveVersions: [...new Set(['1.1.0', '1.0.0', world.version, ...(world.compatibleSaveVersions ?? [])])].filter(version => version !== '1.2.0'),
    resources: [...(world.resources ?? []), { id: 'cargo', label: '本班剩余货位', initial: 4, min: 0, max: 4, description: '可选航次共四格。备件三格、饮水两格、转移模块两格；封舱后本班不重配。' }],
    mechanics: {
      title: '记录、货位与兑现',
      description: `${world.mechanics?.description ?? ''}船坞可选装船支线共四格货位；先核验站点再配载，联络消耗精力，往返消耗应急配额。实收、转移与机组试机分别记账。`,
      beginnerTip: '想出这班船，准备期先保留船坞转运配额。备件 3 格，饮水和转移各 2 格；先核验准备承运的项目。出航留 1 份应急配额，备件试机再留 1 点精力。条件不足时可撤回，新增结局只认本班真实回单。',
    },
    adaptation: { ...world.adaptation, note: `${world.adaptation.note}四格配载支线、保留受限工作艇的分歧、具体站点与机组、库存批次、航次事件及维护合作结局均为游戏原创；原文节选写到销毁远程交通工具，并未提供这些灾后转运情节。` },
  };
}
