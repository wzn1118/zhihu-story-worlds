import type { AuthoredWorld } from './worlds.ts';
import type { SceneNode } from '../shared/types.ts';

// Corrections found while playing the 2026-09-06 live 2.0.0 graphs.
// Late withdrawals must not erase events already played, and prose before a
// choice must not pre-empt that choice. The two additive decisions below fix
// separately witnessed inert route budgets; all old edges stay unchanged.
const corrections: Record<string, Record<string, Partial<SceneNode>>> = {
  'temple-heart': {
    temple: { location: '毓娘家', time: '雨将落下时' },
    b_grain_bad: { text: ['旧绳在半途断了。你为了抱住整袋米，连化风的空当也没腾出来，被水卷到下游，困在倒树间整整一夜。', '毓娘等不到人，只好请邻人把念念抬去远亲家。你挣脱时米已泡烂。院门锁着，门槛上留了两道搬床的痕迹，你提着滴水的空袋坐到天黑。'] },
    b_shrine_bad: { text: ['黑影听懂了你想成仙，贴住你的胸口，先取走了你记得毓娘名字的那一小块心。它说这是头一笔。你低头看红纸，竟觉得早一天收账也没什么。', '獐子带母女离开了山脚。庙里后来多了一尊会喊饿的像，香客都说它灵验。有人端来一碗热汤，你闻了很久，始终想不起从前是谁在灶前等你。'] },
  },
  'tiger-shelter': {
    b_audience: { text: ['侧院的争执传到水门，老池丁赶来，伸手推翻了铜秤。他把自己收着的死鱼鳞撒在青砖上，几个养鱼人都停了手。', '国师终于隔帘开口：猫若已经消化鱼，留下也未必有用。内侍还想争辩，青年先松开了腰间的锁。'] },
    b_crest: { text: ['营地敲铃，领队提着火折走向烟笼，君洲终于从山腰绕到他面前。风吹来一点辛味，你看不清笼下有没有明火。', '“洞已空了。”君洲说，“你再烧，烧的是整座山。”你从高处盯着守火人的手。若先前没能拖住点烟的人，这时候再喊已经迟了。'] },
    b_court_good: { text: ['御苑开了水门，你每月去做几日工，赔鱼的钱逐笔从工钱里扣。青年把药材交接簿带回监天司，内侍因擅改交接名目被撤了这趟差，抓你的囚车也收了回去。', '君寻秋起初仍叫你孩子，后来也学会叫小橘。你不必长成老虎才能回洞睡觉，偷来的两条鱼也终于有了还清的一天。'] },
    b_court_small: { text: ['你不再独自往下交涉，和君洲退到山脚驿舍。君寻秋赶来守在门口，把余下的事接过去谈，谁也没再敢把笼子推近。', '最终双方约定以劳作抵鱼价，不再把你送作药材。你暂住山脚，每月报到，失去了随意远游的自在，却保住了身体和名字。'] },
  },
  'six-roots': {
    b_arena_poem: { text: ['周阳把“几处早莺争暖树”又念了一遍，显然不信你还接得住。你看见他下巴绷得发白。', '宋沐已经被抬上担架。你在心里接到乱花、浅草，抬头辨认拳风来的方向：这一回得先让它离开台边的人。'] },
    b_watch: { time: '当夜至黎明' },
    b_inn_school: { time: '次日早晨', text: ['次日早晨，掌棚人让你们轮换着出去吃饭，宋沐仍留在药棚。客栈掌柜听说你会混合运算，端来一碗粥，顺带递上被伙计算乱的货单。', '大师兄坐在你旁边，怕自己连这碗粥也帮不上。你把第一行推给他：二乘三，这道他会。'] },
    b_village_road: { time: '次日下午' },
    b_grain_class: { time: '三日后的第一堂课' },
    b_notice_school: { time: '开课后的第四日' },
    b_rain_class: { time: '当晚' },
    b_school_return: { time: '一月后', text: ['一个月后，宋沐才离开药棚。来村里这天，他借着师父的手迈过门槛，看见门板做的匾，问比赛后来怎么样。', '你递给他一把粉笔。他听完没说可惜，手指捻了捻粉末，问第一堂该讲什么。'] },
    b_school_bad: { text: ['二师姐在山路上追到你，要你先回去照看宋沐。你仍往会场走，她只好转身找掌棚人，和师父接下余下的照料。等你回来，师父已用佩剑抵了欠账。', '名额没有追回，宋沐也不肯再让你背他。伤养好后，他扶着大师兄慢慢走回旧山门。师父给你留下饭，却把赴会名牌收进了柜底。'] },
  },
  'palace-ledger': {
    b_audience_palace: { text: ['皇帝不愿听账，只说太后年高。你把今晚的空碗放在他面前：“她年高，厨房的人也没饭吃？”', '你把带来的账页摊在案上。皇帝叫内库另取修亭的支出簿，才看见厨房工钱也压在那一项下。他合上簿子，问你到底要怎样。'] },
    b_supply_palace: { text: ['送货的人在门外等钱。小厨娘说锅还能撑一晚，炭却潮得点不着。小英要把自己的被子先铺给值夜的人。', '你先问米炭各要多少钱，再看袖里还剩几张银票。小英的被子仍搁在椅背上，今夜怎么过，得在钱付出去以前说定。'] },
    b_month_end: { time: '下月初' },
    b_shop_morning: { time: '请辞七日后' },
    b_palace_small: { text: ['你先关起侧门，把用度缩到付得起的范围。小英留下，愿意离开的宫人由朱家管事接去安置；尚欠的工钱记在你的下笔分红下，不扣他们的饭。', '太后收不到这月的锦盒，你也失去了宫宴和排场。冬天很难熬，好在没有把谁的月钱填进去；开春后朱家恢复供货，小厨房终于不用借火。'] },
    b_merchant_small: { text: ['你回朱家旧宅住下。父亲把宫里的往来交给管事，嘱咐按已经办妥的手续行事，剩下的慢慢谈，先别催你上船。', '往后三个月，你留在城里帮分号核账，只领做工的钱，不急着另开铺子。旧宅的门每天按时关上，晚饭也不用等宫里来人。'] },
    b_palace_bad: { text: ['你把往后的分红签了出去。内库照着盖过印的条子按月收银，本宫缺的米炭却仍没有人负责。送货人开始绕过你的宫门。', '小英被调走时，只带一卷铺盖。你还坐在皇后的位子上，锦盒也每月送来，只是你已经没有银票能放进去了。'] },
  },
  'red-plum': {
    b_shed_key: { text: ['张婶要钥匙，你攥着不松，怕一转身菜就分光了。她说你人都走了，总得有人浇水。', '她指着腰间空着的钥匙绳，答应接手后先按留村人数分菜，不让棚里的土干死。你摸着钥匙齿，门还没锁，话也还没应。'] },
    b_ferry_good: { text: ['你在河对岸种下了第一畦葱。闹闹仍住在能分开照看的院里，来往的人先打招呼，再隔篱笆换菜。', '你托回程船家给张婶带话，原来的菜棚往后由村里接着种，若门还锁着便卸下那把旧锁。你给娃娃补上一条新腿，把辣酱罐洗净当花盆；少了半辈子的家具，女儿还在饭桌对面。'] },
    b_ferry_small: { text: ['你请胡医生联系就近的堤仓，带闹闹在那里暂住，不再追着下一段行程走。他找到轮班的人送水，你帮人打理仓后的菜地，抵最先几日的食宿。', '到开春，你们才找到能长住的小院。旧家再没回去，母女却没有在搬家的途中分开；闹闹的娃娃越补越大，你的针线包还在手边。'] },
    b_ferry_bad: { text: ['你强逼闹闹往前走，她却一下停住，挣开了护袖。躲避的人挡在你们中间，你追过去，只抓到另一人的湿衣角。', '最后一班船开走了。你留在岸边找人，粮袋沉在泥水里。天黑后胡医生来接你，你还站在原处，一遍遍举起手里那截护袖。'] },
  },
  'hollow-immortals': {
    b_copper_small: { text: ['你沿眼前还能走通的路退下山，把弟子牌丢进山脚的深沟，没再回头找别的出口。璇玑再也没等到你吃第二枚丹。', '你在集镇为人找井，换饭和住处。有人听说你从蓬莱下来，拿着拜师的包袱来问，你就请他坐到井沿上，把那一夜从头说起。'] },
    b_return_water: { text: ['新徒没敢回去讨车钱，卖掉的田也回不来了。他跟你来到一片没人肯种的地，你蹲下贴着地面，听见很深的水声。', '他问这里能活吗。你说要挖了才知道，又补一句，不许把你叫神明之子。'] },
  },
  'island-broadcast': {
    b_shore_bad: { text: ['拍摄没有在该停的时候停下。为了把那段镜头拍完，人又留在了低处，鞋底很快被涨上来的水打湿。有人滑倒，后面的人也撞了上去。', '救援人员清空现场，拍摄全部取消。小林在医疗帐篷外等同伴的检查结果，谢骁陪他坐到天黑。李姐来接你时没提热搜，把停工通知放在了你空着的行李箱上。'] },
    b_camp_bad: { text: ['你照提示指控秦白故意让大家挨饿。他丢下手里的抹布，问你凭什么这么说；苏苏把切了一半的菜推到旁边，锅就那么搁着。', '节目组最后发了应急餐。第二天，你被停掉剩余拍摄，秦白也没再回那间茅屋。李姐陪你看完播出的争吵，你想解释的那几句话，全在停机以后。'] },
  },
  'wrong-realm': {
    b_walk_realm: { time: '休养二十日后', text: ['休养到第二十天，你才第一次不用扶墙走到井边，没快多少，却没有再被疼痛截住。医修让你提空桶，水稍后再说。', '路过的商队缺一个看物资的人，不问你曾是哪位弟子。你看着单子，发现往后的日子还真有别的活。'] },
    b_depart_small: { text: ['你把余下的行程停在山脚。驿舍替你留了一间靠近药舍的房，医修隔日过来看一次，按伤势安排后面的疗程。你替掌柜做些杂事，慢慢续付食宿。', '这一年你没有接远行的活，等身体许可才帮掌柜搬几件轻货。系统最后判定存活成功，你关掉提示，去收晾在院里的衣裳。'] },
    b_judgment_small: { text: ['你不再为赔物留下周旋，带着玉灵芝到山外药舍落脚。宗门还想邀你回去谈，你把信搁到一边，先让医修看伤。', '药赶上了治疗，恢复比盼望的慢，你靠旧任务留下的余资过了半年。每天醒来，药匣就在伸手够得着的地方；桌上的来信慢慢积了一叠，你不急着拆。'] },
  },
};

export function correctBLiveProse(world: AuthoredWorld): AuthoredWorld {
  for (const [id, patch] of Object.entries(corrections[world.id] ?? {})) {
    const node = world.nodes[id];
    if (!node) throw new Error(`Missing live-review target: ${world.id}/${id}`);
    Object.assign(node, patch);
    if (patch.text && node.ending) node.ending = { ...node.ending, text: patch.text.at(-1)! };
  }
  if (world.id === 'palace-ledger') {
    const opening = [...world.nodes[world.startNodeId].text];
    opening[1] = '你把银票抽回自己袖里，扣上空盒。嬷嬷没有拦你，反而叫人记住小英的名字，说皇后总要有个管不好下人的由头。';
    world.nodes[world.startNodeId].text = opening;
    world.introduction = [...opening];
  }
  if (world.id === 'red-plum') {
    const ditch = world.nodes.b_ditch.choices.find(c => c.id === 'push_cart')!;
    ditch.legacyTexts = [...new Set([...(ditch.legacyTexts ?? []), ditch.text])];
    ditch.text = '让闹闹先下看不清底的田沟，自己跟在后面';
    for (const node of Object.values(world.nodes)) {
      const choice = node.choices.find(c => c.id === 'b_withdraw' && c.nextNodeId === 'b_ferry_small');
      if (!choice) continue;
      choice.legacyTexts = [...new Set([...(choice.legacyTexts ?? []), choice.text])];
      choice.text = '请胡医生安排就近的堤仓，暂缓搬家';
    }
  }
  if (world.id === 'island-broadcast') {
    // A fresh shore route previously never exhausted any usable resource.
    // Escorting someone is slower than calling them back, but earns the actual
    // foot route and can save boat supplies when the tide deadline runs short.
    world.nodes.b_shore_notice.choices = [...world.nodes.b_shore_notice.choices, {
      id: 'escort_route', text: '亲自陪王玥辨认蓝绳撤离路，再折返叫齐其他人',
      nextNodeId: 'b_shore_prop',
      effects: { resources: { energy: -2, b_time: -3 }, clues: ['蓝绳回营路', '王玥先上岸'] },
    }];
    world.compatibleSaveVersions = [...new Set([...(world.compatibleSaveVersions ?? []), world.version])];
    world.version = '2.0.1';
  }
  if (world.id === 'wrong-realm') {
    world.nodes.b_sword_offer.choices = [...world.nodes.b_sword_offer.choices, {
      id: 'read_terms', text: '请年轻裁判当众重念替战条款，不接受闭口交换',
      nextNodeId: 'b_coldcase',
      effects: { resources: { b_time: -2 }, clues: ['替战当众宣读', '不以沉默换药'] },
    }];
    world.compatibleSaveVersions = [...new Set([...(world.compatibleSaveVersions ?? []), world.version])];
    world.version = '2.0.1';
  }
  return world;
}
