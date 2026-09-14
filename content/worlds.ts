import type { Character, Choice, GameWorld, SceneNode } from '../shared/types.ts';
import { futureIsland } from './future-island.ts';
import { catalogWorldsA } from './catalog-a.ts';
import { catalogWorldsB } from './catalog-b.ts';
import { withCoreInvestigation } from './core-gameplay.ts';
import { withBlueInvestigation } from './blue-investigation.ts';
import { withIslandLogistics } from './island-logistics.ts';
import { withOperationJournals } from './operation-journals.ts';
import { coreSourcePassages } from './source-passages-core.ts';
import { withCreativeCore, polishCoreReview } from './core-dramatic.ts';
import { withWorldProse } from './world-prose.ts';
import { withWorldContinuation } from './world-continuation.ts';

export type AuthoredWorld = Omit<GameWorld, 'ink' | 'clueVariables'>;

function choice(id: string, text: string, nextNodeId: string, effects?: Choice['effects'], requiresClue?: string, hint?: string): Choice {
  return { id, text, nextNodeId, effects, requiresClue, hint };
}

function scene(id: string, chapter: string, title: string, location: string, time: string, background: string, text: string[], choices: Choice[], speaker?: string, character?: SceneNode['character']): SceneNode {
  return { id, chapter, title, location, time, background, text, choices, speaker, character };
}

function ending(id: string, title: string, text: string[], tone: 'hopeful' | 'uneasy' | 'dark', background: string): SceneNode {
  return { id, chapter: '终章', title, location: '余页', time: '之后', background, text, choices: [], ending: { title, text: text[text.length - 1], tone } };
}

function nodes(entries: SceneNode[], clocks: Record<string, NonNullable<SceneNode['clock']>> = {}): Record<string, SceneNode> {
  return Object.fromEntries(entries.map((node) => [node.id, clocks[node.id] ? { ...node, clock: clocks[node.id] } : node]));
}

const adaptation = { scope: 'based-on-api-excerpt' as const, adultCast: true as const, note: '基于知乎赛事接口提供的节选改编。分支、角色年龄设定与结局为本游戏原创，不代表原作后续。所有登场角色均为成年人。' };

const blueArt = '/assets/blue-blood.webp';
const blueCover = '/assets/blue-blood-cover.webp';
const trainingArt = '/assets/blue-training-room.webp';
const pursuitArt = '/assets/night-pursuit.webp';
const velvetArt = '/assets/double-life.webp';

const blueCharacters: Character[] = [
  { id: 'fangnuo', name: '方诺', role: '公司职员 · 27 岁', description: '在这家公司工作了三年。今天上课时，只有她问了那句话：“血不是一直红的吗？”', portrait: '/assets/fang-nuo-main.webp', portraits: { main: '/assets/fang-nuo-main.webp', reaction: '/assets/fang-nuo-reaction.webp' }, color: '#a92939' },
  { id: 'zhangwei', name: '张薇', role: '同事 · 28 岁', description: '坐在方诺身边。听见她反问培训师，悄悄扯了扯她的袖口。', color: '#6d8f73' },
  { id: 'observer', name: '灰夹克', role: '陌生男人 · 成年', description: '方诺后来几次见到的男人，总穿着同一件灰夹克。她还不知道他的名字。', color: '#8e9297' },
];

export const blueBlood: AuthoredWorld = {
  id: 'blue-blood', storyId: '2025684191967294692', title: '蓝血', subtitle: '你记得的常识，是谁的错误？',
  summary: '急救培训上，所有人都同意血液是蓝色的。方诺却记得另一个世界。留下证据，辨认观察者，在成为异类之前决定如何生活。',
  introduction: ['你是方诺，27 岁。今天的急救培训上，培训师说，血液原本是蓝色的，接触空气才会变红。', '你忍不住反问了一句。周围的人转过头，张薇悄悄扯了扯你的袖口。', '教材上写的也是蓝色。可你明明记得，血一直是红的。'],
  player: { name: '方诺', role: '公司职员' }, objective: '弄清楚为什么只有你记得血是红的。',
  startNodeId: 'training', characters: blueCharacters, cover: blueCover, background: trainingArt,
  source: { title: '蓝血', author: '桃花先生', url: 'https://api.zhihu.com/km-indep-home/hackathon/v2/story/2025684191967294692' },
  version: '1.0.1', compatibleSaveVersions: ['1.0.0'], adaptation,
  nodes: nodes([
    scene('training', '第一章 · 错色', '所有人都点了头', '公司 · 培训室', '09:40', trainingArt,
      ['投影仪嗡嗡作响。培训师指着模型上的血管，说血液原本是蓝色，接触空气才会变红。你等着他纠正口误，周围却已经响起翻页声。', '“血不是一直红的吗？”话一出口，前排的人转过身。培训师把教材摊到你面前，指甲压住“蓝色”两个字。张薇扯了一下你的袖口。', '你说自己记混了，笔尖却悬在纸上。二十几个人继续听课，只有培训师翻页前，又看了一眼你的名字。'],
      [choice('accept_exam', '留在座位上，观察发下来的试卷', 'test', { resolve: 3 }), choice('check_mirror', '借口整理仪容，去洗手间确认', 'mirror', { resolve: 5 })], undefined, { id: 'fangnuo', expression: 'main', position: 'right' }),
    scene('test', '第一章 · 错色', '不一样的第一题', '公司 · 培训室', '10:05', trainingArt,
      ['邻座翻到第二页，露出的题目是包扎步骤。你面前的第一题问血液颜色，第二题问婴儿出生时的发色。题号旁的印墨还没干透。', '“以前可没考过这个。”后排的大姐小声嘀咕。你把卷子往桌沿挪了半寸，培训师的鞋尖随即转向你。', '蓝色，白色。你记得教材要求的答案。姓名栏已经印好了“方诺”，两个字和题目用着同一种新墨。你把拇指移开，纸上留下了一点黑。'],
      [choice('record_test', '记下题目差异，再按教材作答', 'desk', { clues: ['差异试卷'], resolve: 5 }), choice('surrender_test', '立刻交卷，尽快结束这场注视', 'desk', { resolve: -4, trust: 2 })], undefined, { id: 'fangnuo', expression: 'reaction', position: 'right' }),
    scene('mirror', '第一章 · 错色', '镜子不会替你解释', '公司 · 洗手间', '10:03', blueArt,
      ['“真该让方诺来看看。”洗手台前的同事抬起嘴唇。她牙齿边缘沾着一线蓝色，擦到纸巾上后，才慢慢洇成暗红。', '你下意识捂住嘴。上午拆教材时，纸边划过手指，创可贴下那一点血从出现起就是红的。水声停了，你连呼吸也收住。', '同事把纸巾丢进桶里，蓝色已经找不到了。门缝外还剩镜子和你的半张脸；几秒钟前的差别，正随着她们的脚步声一起消失。'],
      [choice('observe_colour', '在手机上记录变化的顺序与时间', 'desk', { clues: ['变色观察记录'], resolve: 6 }), choice('leave_mirror', '收起手机，先回到熟悉的工位', 'desk', { trust: 3 })]),
    scene('desk', '第一章 · 错色', '照常工作的下午', '公司 · 工位', '14:20', blueArt,
      ['王经理问你最近是不是压力太大。你笑着说培训时开了个玩笑，他也笑，手指却一直按在你的考勤表上。报表照旧要在下班前交。', '回到工位，你输入用了三年的密码，一次就开了锁。屏幕右下角弹出生日提醒，下个月，同事们仍打算给你庆生。', '光标在搜索框里闪。张薇的消息压住了半个页面：“晚上吃点东西？你今天午饭都没怎么动。”'],
      [choice('search_landmarks', '查几个最不会记错的地名', 'browser', { resolve: 4 }), choice('speak_zhang', '和张薇单独谈一谈', 'zhang', { trust: 6 })]),
    scene('browser', '第二章 · 异乡', '城市没有站在原处', '公司 · 搜索页面', '14:36', blueArt,
      ['东方明珠：北京朝阳区，建成于 2008 年奥运会前。你刷新页面，地址没变。陆家嘴的配图是三座陌生高楼，下面写着“金融三柱”。', '最后搜到黄浦江时，你的手停在鼠标上。页面写它流经天津。你记得自己站在上海的江边，风把渡轮票吹得贴在掌心。', '隔壁有人起身，你立刻切回报表。纸角已经画下三个地名，各自连向记忆里相隔很远的地方。你把纸翻过来，压在键盘下面。'],
      [choice('save_map', '保存两套坐标的对应关系', 'zhang', { clues: ['地标错位记录'], resolve: 8 }), choice('hide_search', '清空搜索记录，直接下班', 'transit', { resolve: -2 })]),
    scene('zhang', '第二章 · 异乡', '她没有笑你', '公司 · 茶水间', '17:50', blueArt,
      ['张薇倒水时烫了手，杯底在桌上磕出一声。“上午那事，经理也问我了。我说你最近加班多。”她避开了你的目光。', '你问她，明天还能不能记住今天这段话。她皱眉：“方诺，你说得像我明天会换一个人。”你想解释，却连第一句话都选不出来。', '她把手机放到桌上，打开与你的聊天框。“你要我记什么，就现在说。”输入栏空着，她拇指旁边的发送键还是灰的。'],
      [choice('ask_witness', '请她把今天的谈话写给明天的你', 'transit', { clues: ['张薇的留言'], trust: 12 }), choice('protect_zhang', '向她道谢，暂时不把她卷进来', 'transit', { resolve: 4, trust: -2 })], '张薇'),
    scene('transit', '第二章 · 异乡', '第三次偶遇', '写字楼外', '18:15', blueArt,
      ['旋转门把街景切成一格格倒影，灰夹克站在其中一格里。午餐时，那个人面前的套餐放凉了也没动；早班地铁上，你似乎也见过这张脸。', '你假装查看叫车页面。六分钟。他低头看手机，拇指却没有滑动。旋转门转过两轮，他还站在原处。', '旧街在右边，你从前在那里租过房，知道每条岔路通向哪里。左边的地铁入口有人值守，晚高峰正把人群往地下送。'],
      [choice('visit_diner', '走向旧街的便利店，隔着玻璃观察', 'diner', { resolve: 7 }), choice('use_station', '去有人值守的地铁站，确认是否被跟随', 'station', { trust: 3 })]),
    scene('diner', '第三章 · 死路', '便利店里的空座', '旧街 · 便利店', '18:42', blueArt,
      ['关东煮的蒸汽糊住一角玻璃。你坐到临街的位置，右边那条死胡同只有旧房东一户人家；你替她倒过垃圾，知道尽头那面石墙。', '灰夹克经过窗前，径直拐了进去。你把准备质问他的第一句话默念两遍，等他被墙挡回来。店门的提示音又响过三次。', '竹签泡软了，碗里的汤浮起一层油。街灯准时亮起，胡同里始终没走出人。你原先准备的那句话，现在显得可笑。'],
      [choice('record_alley', '请店员留意你的去向，到巷口查看', 'alley', { resolve: 5 }), choice('avoid_alley', '记下时间，从大路回家', 'home', { clues: ['观察者行程'], trust: 2 })]),
    scene('alley', '第三章 · 死路', '尽头是一面墙', '旧街 · 巷口', '19:06', blueArt,
      ['石墙上仍有旧房东晾衣绳留下的铁钩。你往里走了几步，鞋底碾碎一块墙皮，声音在窄巷里来回碰撞。房东家的窗紧闭着。', '回头拍照时，便利店的玻璃也被收入画面。门牌上的街名和玻璃里的倒影差了一个字；放大照片，那一笔清清楚楚。', '身后传来衣料擦过墙面的轻响。你转身，铁钩下空无一物，屏幕上却还开着刚拍下的照片。'],
      [choice('save_alley', '保留门牌照片与时间戳', 'home', { clues: ['消失巷口照片', '观察者行程'], resolve: 8 }), choice('delete_alley', '删除照片，告诉自己别再追下去', 'home', { resolve: -8 })]),
    scene('station', '第三章 · 死路', '人在镜头之下', '地铁站 · 服务台', '18:39', blueArt,
      ['服务台的对讲机一直有人说话。你指向闸机外的灰夹克，工作人员顺着你的手看了一眼，让你先站在柜台旁边。', '你抬起手机，灰夹克已经转身。玻璃门合上前，他往服务台望了一次。工作人员问衣服颜色，你发现自己只能反复说“灰色”。', '候车屏滚到下一站，报出了旧街的名字。你望向线路图：两个相隔很远的站，竟标着你记忆中同一条路。广播照常播了两遍。'],
      [choice('keep_route', '记下站名重复与观察者离开的方向', 'home', { clues: ['观察者行程'], resolve: 5 }), choice('call_friend', '给张薇报平安，再回家', 'home', { clues: ['张薇的留言'], trust: 8 })]),
    scene('home', '第四章 · 命名', '你在纸上写下问题', '方诺的住处', '21:10', blueArt,
      ['钥匙转进锁孔的声音比往常响。你又试了一遍门把手，才打开台灯。白天喝剩的水还在，杯底压着昨天的购物小票。', '你在纸上写：他们要查的是血，还是我知不知道血不对？笔尖把最后一个问号戳破了。你试着列出灰夹克出现的时间，他为什么来，又为什么离开，仍然解释不通。', '电脑里存着这座城市的地图，抽屉里是下个月的房租收据。你盯着它们，第一次认真考虑：如果今晚不再查下去，明天是不是照样能过。'],
      [choice('seek_community', '用地标差异提一个只有同类看得懂的问题', 'forum', { resolve: 7 }, '地标错位记录'), choice('meet_observer', '整理目击时间，要求观察者在公共场所说明', 'observer', { resolve: 3 }, '观察者行程'), choice('keep_living', '给未来的自己留一封不删改的信', 'ending_witness', { resolve: 4 }), choice('forget_all', '把笔记收进箱底，明天照常上班', 'ending_blend', { resolve: -10 })]),
    scene('forum', '第四章 · 命名', '有人记得同一条河', '匿名问答页面', '23:08', blueArt,
      ['问题发出后，第一条回复让你去看医生。你把手放在删除键上，又等了一会儿：有没有人，也总把同一条河记在另一座城市？', '凌晨前，一个匿名账号列出几个渡口名。第三个早已停用，你记得旧售票亭的蓝铁门。那名字不在你发出的任何文字里。', '新消息紧跟着亮起：“最后一班船是什么时候？”你查不到这里的时刻表。对方正在等一个只能从你的记忆里取出的答案。'],
      [choice('verify_memory', '交叉核对旧站名，不透露个人信息', 'coordinate', { clues: ['第二位见证者'], trust: 12 }), choice('pause_contact', '截存回复，先让张薇知道自己的状况', 'ending_witness', { trust: 8 })]),
    scene('observer', '第四章 · 命名', '白昼见面', '便利店 · 临街座位', '次日 11:00', blueArt,
      ['你把见面要求托给了留意过他的店员。第二天十一点，灰夹克果然坐到对面，外套肘部磨得发亮，纸杯里的水满到杯沿。', '“你要回去，还是要一句你没疯？”他问。你把手机扣在桌上：“昨晚那条巷子。你怎么出去的？”隔壁微波炉响了，他等提示音停下来才开口。', '“十八点四十二分，看店招的倒影。”他说，“墙会一直在。出问题的是你拿哪一边当参照。”你看向窗外，此刻玻璃里外的街名完全相同。'],
      [choice('share_proof', '用巷口照片要求一个可以验证的回答', 'coordinate', { clues: ['边界参照'], resolve: 8 }, '消失巷口照片'), choice('retain_boundaries', '结束谈话，保留记录与自己的生活', 'ending_witness', { resolve: 5 })], '灰夹克'),
    scene('coordinate', '第五章 · 另一页', '不要独自穿过那条线', '旧街 · 便利店门前', '次日 18:42', blueArt,
      ['十八点四十一分。你把最后一份记录发出去，约好的人回了确认。手机屏幕贴着掌心，震动短得像是一次错觉。', '下一分钟，店招在玻璃上叠出第二个名字。你侧移半步，倒影里那盏路灯仍在原位，灯下却多出记忆中的旧售票亭。', '手机又响了。这边的人在问你还在不在，玻璃里的街道已经有了深度。你看得见对面的台阶，却看不见跨过去后，身后的便利店还会不会亮着。'],
      [choice('cross_with_witness', '带着见证者约定，走向另一侧街灯', 'ending_return', { resolve: 10 }, '第二位见证者'), choice('cross_with_reference', '以公开留存的参照核对边界，再尝试通过', 'ending_return', { resolve: 8 }, '边界参照'), choice('remain_connected', '留在原地，让两边的人继续交换记录', 'ending_witness', { trust: 10 })]),
    ending('ending_return', '结局 · 有人记得你', ['鞋底踩到台阶时，关东煮的气味消失了。街角站牌写着你记得的名字，报站声从远处传来，你听到最后一个字才敢松开手。', '手机还能收到另一侧的确认，随后信号断了。张薇的聊天框留在原处，最后一条消息问你明天还来不来上班。', '你把“我到了”发送出去。圆圈转了很久，终于停住；屏幕上没有失败的红色标记，也没有新的回复。'], 'hopeful', blueArt),
    ending('ending_witness', '结局 · 清醒地生活', ['星期五下班，张薇照旧多倒一杯热水。你们各拿一份记录，她念日期，你核对那些始终对不上的地名。她有时会叹气，但仍把纸翻到下一页。', '新的培训通知发来，你的名字还在名单里。你把通知也留下副本，夹在房租收据后面。日子能继续，问题却仍在那里。', '回家路上，你隔着玻璃看了一眼便利店的空座。然后打开手机，给今天的记录写下日期。'], 'hopeful', blueArt),
    ending('ending_blend', '结局 · 折好的白纸', ['第二天你交了一份全对的卷子。培训师微笑，王经理放心，一切终于像从前一样流畅。', '很久以后收拾房间，你从箱底找到一张折好的纸，上面只有几个城市的名字。笔迹毫无疑问属于你。', '你把纸放回去。那天经过便利店，灰夹克第一次朝你点了点头。'], 'uneasy', blueArt),
  ]),
};

export const doublePursuit: AuthoredWorld = {
  id: 'double-pursuit', storyId: '2025333783608537435', title: '双重追踪', subtitle: '门外是威胁，门内也未必安全。',
  summary: '一条网络威胁变成楼下的脚步。张冬冬躲进熟人的房间，却发现自己早已被另一双眼睛注视。你必须在等待救援时保留证据、保护边界。',
  introduction: ['你是张冬冬，26 岁，独居在一栋老公寓。几分钟前，一个曾给你发威胁消息的账号传来了你家楼下的照片。', '你已拨打求助电话，却没能从楼梯离开。温和的邻居李宇打开了门，仿佛一直在等你。', '走廊尽头的老人正准备开门。你的手机还剩一点电，楼下的脚步已经上了台阶。'],
  player: { name: '张冬冬', role: '被追踪的租客' }, objective: '等待并核实救援，争取逃离机会，把侵害证据带出去。',
  startNodeId: 'landing', cover: pursuitArt, background: pursuitArt,
  characters: [
    { id: 'dongdong', name: '张冬冬', role: '公寓租客 · 26 岁', description: '面对由网络延伸到现实的威胁，开始重新判断熟人与安全的关系。年龄为游戏设定。', color: '#aa2538' },
    { id: 'liyu', name: '李宇', role: '邻居 · 29 岁', description: '曾以日常善意接近冬冬，却在对方避难时暴露出控制欲与跟踪行为。年龄为游戏设定。', color: '#7d5b69' },
    { id: 'elder', name: '老住户', role: '同层邻居 · 68 岁', description: '被走廊动静惊醒。他并不知道外面发生了什么，能否及时提醒他取决于你的选择。年龄为游戏设定。', color: '#97948d' },
    { id: 'operator', name: '接警员', role: '救援联络 · 成年', description: '只有经过核实的联络才值得信任。准确的位置和持续的通信，比任何逞强都有用。', color: '#6d8f73' },
  ],
  source: { title: '李冬原著：同时被两个精神病追杀', author: '写小说的秃头老张', url: 'https://api.zhihu.com/km-indep-home/hackathon/v2/story/2025333783608537435' },
  version: '1.0.0', adaptation,
  nodes: nodes([
    scene('landing', '第一章 · 第二扇门', '地址已经暴露', '老公寓 · 楼梯平台', '22:14', pursuitArt,
      ['那人先发你的姓名，再发住址，最后一张照片里是公寓门口刚换的灯。三天前，你还把他的私信当成评论区的气话。', '楼下响起刺耳的马达声，随即有什么撞上扶手。你刚向接警员报完地址，已经退回了自己的楼层。钥匙在手里，怎么也对不准锁孔。', '隔壁门开了。李宇探出半张脸：“冬冬，先来我这儿。”他上周送过你奶油蛋糕，声音还是那么轻。'],
      [choice('keep_call', '保持联络，让接警员知道你进入了邻居家', 'neighbor', { clues: ['接警记录'], resolve: 5 }), choice('preserve_messages', '把威胁消息转存，再进入邻居家', 'neighbor', { clues: ['威胁消息备份'], resolve: 5 })]),
    scene('neighbor', '第一章 · 第二扇门', '反锁的动作', '李宇的房间', '22:16', pursuitArt,
      ['李宇反锁门，把钥匙攥进掌心。你说了声谢谢，想站到门旁听动静，他的手却先按住你的肩，把你推回墙边。', '餐桌摆着两份奶油蛋糕，塑料叉已经拆开。你问是不是有客人，他看着你笑：“这不是来了么。”', '“手机给我，别让他听见。”他的目光跟着屏幕移动。你把手机握得更紧，背后的墙冰凉，肩膀被他按过的地方开始发疼。'],
      [choice('keep_distance', '保持距离，以需要透气为由走近窗边', 'window', { resolve: 7 }), choice('ask_phone', '告诉他你必须向家人报平安，保留手机', 'phone', { resolve: 5 })], '李宇'),
    scene('window', '第二章 · 视线', '窗下的距离', '李宇家 · 窗边', '22:18', pursuitArt,
      ['窗扇只能推开一掌宽，外面的设备平台缺了一块水泥边。楼下那盏路灯显得很小，你伸出去的手又收了回来。', '对楼还有一家亮着电视。窗帘旁的小支架却正对着你的卧室，固定螺丝周围磨出浅浅一圈，显然调过很多次角度。', '玻璃里映着背后的书架。架子和墙之间露出半张照片，你认出了自己的睡衣袖口。'],
      [choice('inspect_photos', '留意反光里的照片，不触动室内物品', 'photographs', { resolve: 3 }), choice('signal_window', '在窗边向对面示意有人需要帮助', 'phone', { clues: ['对楼目击者'], trust: 5 })]),
    scene('phone', '第二章 · 视线', '发出的定位', '李宇家 · 洗手间门边', '22:20', pursuitArt,
      ['你说脸上全是汗，挪到洗手间旁。水龙头开着，屏幕只剩一格电。李宇的影子堵在磨砂玻璃外，几次晃到门缝边。', '接警员收到的还是你家地址。你现在隔了一道墙，门牌末位也换了；对楼那位留过电话的住户，窗口仍亮着灯。', '走廊猛地一震，你家门板发出刺耳的刮擦声。“洗好了没有？”李宇敲了两下门，第二下比第一下重。'],
      [choice('update_location', '补充所在门牌、人数与无法自由离开的情况', 'photographs', { clues: ['接警记录'], resolve: 6 }), choice('send_contact', '把当前位置与求助状态发送给可信联系人', 'photographs', { clues: ['对楼目击者'], trust: 6 })]),
    scene('photographs', '第二章 · 视线', '熟悉感的背面', '李宇家 · 客厅', '22:23', pursuitArt,
      ['书架后整面墙贴着你的照片。拉窗帘的、睡着的、洗澡后走出浴室的。最旧一张右下角有日期，早于你们第一次在楼下说话。', '桌下的垃圾袋系着你惯用的双结，外卖单上还有你的姓。你忽然明白，他为什么总能在你晚归时恰好开门，为什么知道你不吃哪种奶油。', '李宇侧身挡住照片：“我就是想多看看你。”他的手搭上架子，指节发白。手机藏在你的身体和桌沿之间，屏幕还亮着。'],
      [choice('backup_evidence', '在安全距离记录房间证据并发出备份', 'kitchen', { clues: ['室内跟踪证据'], resolve: 8 }), choice('avoid_exposure', '先记住位置与特征，不让他察觉你发现了什么', 'kitchen', { resolve: 3, trust: -2 })]),
    scene('kitchen', '第三章 · 走廊', '他说会替你解决', '李宇家 · 厨房外', '22:26', pursuitArt,
      ['门外有人喊“张冬冬”，每喊一遍，就撞一下你家的门。李宇的笑容僵住了。他从厨房拿起菜刀，刀面碰到台沿，发出很薄的一声响。', '“他凭什么来找你？”李宇问的像是一件私事。你盯着他手中的钥匙，脑子里只剩门开以后那几步路；楼梯口偏偏正是喊声传来的方向。', '锁舌缩了回去。走廊深处传来拖鞋声，最里面的老住户大概也被吵醒了。李宇的手已经放上门把。'],
      [choice('deescalate', '劝他留在门内，说明警方已在赶来', 'hallway', { trust: 5, resolve: 4 }), choice('watch_exit', '不参与争执，靠近安全位置观察走廊', 'hallway', { resolve: 5 })], '李宇'),
    scene('hallway', '第三章 · 走廊', '有人要开门', '公寓 · 客厅门边', '22:28', pursuitArt,
      ['两个人挤在楼梯口，先是喊，随后是一串撞击声。李宇踉跄着撞上墙又扑过去，墙面留下一道暗痕。你连门槛都没跨完，路已经封死。', '走廊尽头亮起一条门缝。“几点了，还吵？”老住户的声音夹在撞击声里。他把门推开，手还扶着门框。', '你记得替他送错拿的快递时，总得把名字喊两遍。现在那两个人只顾盯着彼此，老住户的半只拖鞋已经伸出来。'],
      [choice('warn_neighbor', '隔门提醒老住户锁门，等待救援', 'elder', { clues: ['邻居安全确认'], trust: 10 }), choice('seek_cover', '先回到能隔开冲突的房间，保持联络', 'utility', { resolve: 6 })]),
    scene('elder', '第三章 · 走廊', '这次他听见了', '公寓 · 走廊内侧', '22:29', pursuitArt,
      ['“回去！锁门！”你喊到喉咙发涩。老住户愣住，拖鞋往后一缩，门板紧接着合上。两道锁声过后，楼梯口有人朝这边看了一眼。', '门里压着嗓子问：“是冬冬吗？”你应了一声，告诉他人正在赶来。他的呼吸贴着门板，过了片刻才说知道了。', '“水表间外头有张图，别往旧平台走，那门封了。”他说完，又问你是不是还在。你用指节轻轻敲了一下墙。'],
      [choice('note_plan', '确认示意图位置，并向接警员报告住户已避险', 'utility', { clues: ['楼层示意图'], trust: 8 }), choice('stay_in_touch', '让老住户留在电话旁，自己返回掩护位置', 'stairwell', { trust: 5 })], '老住户'),
    scene('utility', '第四章 · 等待', '墙上的示意图', '公寓 · 水表间外', '22:32', pursuitArt,
      ['水表间缩在门边的凹处，堆着半捆旧报纸。你借着这点遮挡贴近墙，褪色的消防图就在眼前，旧平台上被人粗粗画了一道叉。', '门牌从图的左边排到右边。刚才有人隔着楼梯喊“从右边出来，我带你下去”，可图上右边只有封死的平台。', '楼梯口又是一声闷响。你退向门后的掩蔽处，手机亮度低得几乎看不清，电池符号已经变红。'],
      [choice('save_floorplan', '用准确房号核对救援方向', 'stairwell', { clues: ['楼层示意图'], resolve: 7 }), choice('protect_battery', '保存最后一点电，退回安全位置等回电', 'stairwell', { resolve: 4 })]),
    scene('stairwell', '第四章 · 等待', '楼下传来脚步', '公寓 · 门后', '22:35', pursuitArt,
      ['门外突然安静。随后有人说没事了，让你出来。声音隔着厚门板发闷，你听不出是谁，也听不见刚才那两个人去了哪里。', '手机在掌心里震动，陌生号码。第一遍响铃结束，又打来第二遍。你靠着门坐下，膝盖这才开始发软。', '门把手往下压了一次。“开门。”外面的人比刚才急。你的手停在接听键上，屏幕映出指缝里的汗。'],
      [choice('verify_dispatch', '通过接警联络核对现场人员与所在门牌', 'policecheck', { resolve: 8 }, '接警记录'), choice('contact_official', '重新使用已知求助渠道说明现况，核对来人', 'policecheck', { resolve: 5 }), choice('wait_silent', '保持门关闭，请可信联系人代为确认', 'rescue', { trust: 4 }, '对楼目击者')]),
    scene('policecheck', '第四章 · 等待', '门牌被正确报出', '公寓 · 安全房间', '22:38', pursuitArt,
      ['通话里的接警员复述了你更新的位置，请你先离开门边。片刻后，门外报出了同一个房号，楼下对讲机里传来相互应答。', '你说最里面还住着一位老人。“知道了，我们过去看。”听筒那端开始问你有没有受伤，你低头才看见袖口沾着墙灰。', '金属物被移走时在地上拖了一小段。门外再次叫你的名字，接警员确认现场已能带你离开。你试着站起来，第一次没站稳。'],
      [choice('leave_with_team', '按现场人员引导离开，并说明其他住户位置', 'rescue', { resolve: 5, trust: 8 })], '接警员'),
    scene('rescue', '第五章 · 带出去', '一层楼慢慢安静', '公寓楼外', '22:51', pursuitArt,
      ['冷空气灌进领口，楼下警灯一闪一闪。你走到台阶边，伸手扶住墙，听见楼里有人催拿担架。直到这时，你还会为每次开门声回头。', '工作人员问肩膀能不能抬起来。你试了一下，疼得吸气。手机里弹出家人的回拨，铃声响到一半，你才意识到那是自己的手机。', '“之前见过他们吗？”笔尖停在本子上。你想起奶油蛋糕、楼下的问好，还有那堵墙上早了几个月的日期。'],
      [choice('deliver_records', '把已经备份的证据和发现位置一并说明', 'evidence', { resolve: 6 }, '室内跟踪证据'), choice('support_neighbor', '先说明老住户的情况，再接受帮助', 'ending_collective', { trust: 8 }, '邻居安全确认'), choice('rest_first', '说明主要经过，先去安全地点休息', 'ending_safe', { resolve: 5 })]),
    scene('evidence', '第五章 · 带出去', '把日常拼回来', '临时接待处', '次日 00:10', pursuitArt,
      ['手机接上电后，备份一条条载出来。你从最早的威胁讲起，讲到那面照片墙时停住，接待员把水杯往你手边移了移。', '“我收过他送的蛋糕。”你说完，自己也不知道为什么要补这一句。对方问的是拍摄角度和日期，你终于把这两件事重新说清楚。', '笔录里的“未经允许”四个字就在你手边。你反复看过室内记录的时间，才把手机屏幕转向桌子的另一侧。'],
      [choice('keep_all_evidence', '提交证据副本，为后续调查留下清楚时间线', 'ending_evidence', { resolve: 10 }), choice('include_neighbor', '补充老住户位置，让记录包括所有受影响的人', 'ending_collective', { trust: 10 }, '邻居安全确认')]),
    ending('ending_evidence', '结局 · 镜头之外', ['你搬家那天，取证仍在继续。有人打来电话核对一张旧照片的日期，你在纸箱上写到一半的字停了停，才报出当时住进公寓的月份。', '新房间的窗对着空地。第一次拉开窗帘，你还是找了一遍对面的镜头，随后坐回桌前，把回执夹进文件袋。', '晚上家人来帮忙拆箱，问灯开哪一盏。你指了指窗边那盏，自己伸手拉开了半幅窗帘。'], 'hopeful', pursuitArt),
    ending('ending_collective', '结局 · 这一层有人应答', ['老住户后来打来电话，说那天锁好门，手抖得拨了三次才拨对号码。“再晚一点，我就走出去了。”他说。你握着电话，半天只应了一声。', '他把你的号码抄到座机旁，你也存下了能联系到他的家人。那张褪色的楼层图换过了，封死的平台终于贴上醒目的标记。', '搬走前你去还他借过的工具。他隔门问是谁，你报了名字，听见里面慢慢走近的拖鞋声。'], 'hopeful', pursuitArt),
    ending('ending_safe', '结局 · 先活回自己', ['你暂住到家人那里。洗澡时，肩上的淤青碰到热水，你才记起李宇按住你的那只手。手机备忘录停在半句话上，今晚实在写不下去了。', '照片拍了多久，地址怎样泄露，楼里那位老人后来怎么样，仍有一串问题等着核实。天亮后你会再联系接警记录上的号码。', '家人把早餐放在门边，敲了两声就走开。你等脚步远了才开门，粥还热着。'], 'uneasy', pursuitArt),
  ]),
};

export const velvetAlibi: AuthoredWorld = {
  id: 'velvet-alibi', storyId: '2068540656734180439', title: '史密斯装穷夫妇', subtitle: '两个秘密，一张共同的餐桌。',
  summary: '杜曼笙为了守住感情里的安全感隐瞒家境，却撞见自己的“穷男友”从昂贵酒局离席。坦白、试探与家庭安排交错，谁先放下角色？',
  introduction: ['你是杜曼笙，25 岁。为了不再被金钱左右感情，你对男友隐瞒了家境。你们把小出租屋过得有模有样。', '今晚在会所，你却看见穿着骑手服出门的林望鹿，被另一个房间的人郑重送到门口。', '他回家前，你还有一点时间决定：继续演下去，还是把“我们”建立在真实的两个人身上。'],
  player: { name: '杜曼笙', role: '不想被安排的人' }, objective: '厘清彼此的隐瞒，决定感情与人生由谁来作主。',
  startNodeId: 'dinner', cover: velvetArt, background: velvetArt,
  characters: [
    { id: 'mansheng', name: '杜曼笙', role: '隐瞒家境的恋人 · 25 岁', description: '她瞒着家境谈恋爱，想知道对方会怎样对待一个普通女孩。听见男友也编过相似的身世，她终于得把自己那一半说清楚。年龄为游戏设定。', color: '#b12c45' },
    { id: 'wanglu', name: '林望鹿', role: '同样有所隐瞒的恋人 · 27 岁', description: '原作写到他身形出挑、眉眼好看，行为间有清贵气；其他外形与年龄为游戏设计。他为何扮演穷小子，需要当面询问。', color: '#9f7178' },
    { id: 'friend', name: '闺蜜', role: '知情的朋友 · 26 岁', description: '对曼笙的生活直言不讳。她愿意陪伴，但朋友的判断也不该代替曼笙自己的选择。年龄为游戏设定。', color: '#6d8f73' },
    { id: 'chengmo', name: '程墨', role: '前任 · 28 岁', description: '过去的关系已经结束，家族却仍打算继续联姻。他对外宣称的身份，没有经过曼笙同意。年龄为游戏设定。', color: '#86838b' },
  ],
  source: { title: '史密斯装穷夫妇', author: '年年', url: 'https://api.zhihu.com/km-indep-home/hackathon/v2/story/2068540656734180439' },
  version: '1.0.0', calendar: { firstWeekday: 4 }, adaptation,
  nodes: nodes([
    scene('dinner', '第一章 · 两块钱', '他把那颗蛋留给你', '出租屋 · 餐桌', '前夜 20:40', velvetArt,
      ['你多花两块钱加的溏心蛋，又被林望鹿拨回碗里。凉面坨成一团，他认真地用筷子分开，还把蛋黄完整的那一半留给你。', '他把一团皱钞票塞进你手里：“今天的。等我多接几单，咱们换个大点的房子。”你白天才从家里挑高三米的衣帽间出来，这会儿连钞票都捋不平。', '你说蛋是特地给他买的。他低头吃了一口，眼圈竟红了。两块钱把你逼到这一步，父母教你的那些识人办法，一条都用不上。'],
      [choice('plan_truth', '在便签上写下明天要坦白的话', 'club', { clues: ['未说出口的坦白'], resolve: 5 }), choice('protect_evening', '先把钱退回去，说明不必独自承担全部', 'club', { trust: 7 })], '林望鹿'),
    scene('club', '第一章 · 两块钱', '隔壁房间的人', '会所 · 走廊', '21:12', velvetArt,
      ['隔壁又送进一轮酒，服务员用托盘抵住门。闺蜜刚说完那桌一个果盘两千，你就看见林望鹿站起来，桌边的人叫他“霖哥”。', '他把杯底的酒喝完，笑着说回晚了女朋友要不高兴。昨晚为一颗蛋红眼圈的人，此刻把杯子放下，满屋的人都等着他那句话。', '你差点喊他的名字，手已经碰到门框。走廊镜子恰好照出你没来得及换下的裙子和首饰：工厂保洁今晚的开销，也不太好解释。'],
      [choice('talk_friend', '把看到的事告诉闺蜜，先理清自己的位置', 'friend', { trust: 5 }), choice('return_early', '提前回出租屋，等他自己开门', 'cake', { resolve: 4 })]),
    scene('friend', '第二章 · 人设', '你先气哪一件', '会所外 · 车边', '21:20', velvetArt,
      ['闺蜜听完，车钥匙停在半空：“你先气哪一件？他有钱，还是他骗你？”你说当然是后者。她往你那只藏起商标的包上瞥了一眼。', '你把包往身后挪。“我那是有原因。”她没接话，按开车锁，过了几秒才说：“那就听听他的原因，看看你自己信不信。”', '手机上又跳出程墨提到婚期的消息。闺蜜把屏幕转给你：“这个倒是从来不装。你们一家不出声，他连酒店都敢替你挑。”'],
      [choice('ask_facts', '请她只帮忙核对公开信息，不跟踪私人行程', 'cake', { clues: ['公开身份线索'], resolve: 6 }), choice('ask_support', '请她在需要时陪自己面对家里', 'cake', { clues: ['朋友的支持'], trust: 10 })], '闺蜜'),
    scene('cake', '第二章 · 人设', '蛋糕盒没有换', '出租屋 · 门口', '22:02', velvetArt,
      ['林望鹿换回骑手服，提着小蛋糕进门。“客人送的。”你认得那家店，连缎带都是每季换色。他至少应该把盒子换掉。', '你问他身上怎么有酒味，他说送过酒吧外卖。随即凑近你：“你也有。”你脱口而出同事喝酒，他笑了：“厂里不是不让喝？”', '蛋糕放在两人中间，谁也没拆。你几乎能听见自己在编下一句，他的笑也开始挂不住了。'],
      [choice('open_conversation', '告诉他自己今晚在哪里，也看见了什么', 'confession', { trust: 10, resolve: 5 }), choice('notice_breakfast', '先不追问，明早重新看一遍共同的日常', 'breakfast', { resolve: 2 })], '林望鹿'),
    scene('breakfast', '第二章 · 人设', '瓶子里的生活', '出租屋 · 厨房', '次日 08:10', velvetArt,
      ['他出门后，你倒掉牛奶瓶里的最后一口，发现瓶底贴纸翘起，底下还有另一层标签。面包塞在透明袋里，封口夹却是家里常用的进口牌子。', '你咬着最后一片面包，想起自己昨天还嫌它烤得不够松。怪不得一直吃得惯，两个人谁都没真过过嘴里说的那种穷日子。', '手机上，他问你早餐吃了没有。你打出“很好吃”，又删掉。水槽边那只换过标签的瓶子，正好够当谈话的第一句。'],
      [choice('keep_labels', '记下矛盾，准备用具体事实开启谈话', 'call', { clues: ['换装的早餐'], resolve: 7 }), choice('drop_competition', '停止比谁演得像，主动发出坦白邀约', 'confession', { trust: 8 })]),
    scene('call', '第三章 · 安排', '家里的来电', '出租屋 · 窗边', '10:35', velvetArt,
      ['母亲一口气说完饭局时间、礼服颜色和司机出发的点，才问你有没有在听。程家也来，被她放在最后，像是添上一道菜。', '你提醒她已经和程墨分手。她停了两秒：“这么久了，那点事还过不去？”你记得一个月里四次撞见的场面，她把它们合成了三个字。', '手机随即收到席位表，你的名字紧挨着程墨。母亲还在线上等答复，表格右上角却已经写着“最终版”。'],
      [choice('say_no', '明确说明已分手，任何婚约都没有你的同意', 'invitation', { clues: ['明确的拒绝'], resolve: 10 }), choice('build_support', '约闺蜜同行，准备在饭局当面说清楚', 'invitation', { clues: ['朋友的支持'], trust: 8 })]),
    scene('confession', '第三章 · 安排', '先说自己的那一半', '出租屋 · 餐桌', '22:30', velvetArt,
      ['你从工厂保洁这个身份讲起，讲到家里的房子，再讲为什么总想知道一个人会不会因为你没钱就变脸。林望鹿听着，手里的纸杯被捏出一道折痕。', '“所以那天你是特意来找我的？”他问。你说是，接着问他骑手服、酒局和那声“霖哥”。这回轮到他低下头：“我的工作、家里，还有名字，都得重新讲。”', '水壶烧开，谁也没去拿。你把凉掉的蛋糕推到一边，让桌面空出来：“一件一件说。说完以后，我再想今晚住哪里。”'],
      [choice('mutual_truth', '把身份和生活安排逐项说清楚', 'agreement', { clues: ['共同坦白'], trust: 15, resolve: 5 }), choice('time_apart', '谢谢他的解释，但需要一点独处时间', 'distance', { resolve: 8 })], '林望鹿'),
    scene('invitation', '第三章 · 安排', '印好的席位', '杜家 · 会客厅', '周六 16:20', velvetArt,
      ['电子席位表变成了烫金卡片。程墨身旁那把椅子是空的，父亲正在和他商量酒店档期，服务员见你过来，立刻收走了另一边的空杯。', '程墨替你拉开椅子：“别闹了，长辈都在。”语气和从前让你原谅他时一样。母亲轻轻碰了碰你的手，示意你先坐下。', '椅脚在地板上拖出一声长响。满桌话声停了，你握着椅背，发现他们真的在等你把这场安排坐实。'],
      [choice('state_boundary', '明确更正关系，要求撤下未经同意的安排', 'boundary', { clues: ['明确的拒绝'], resolve: 10 }), choice('speak_private', '请父母单独谈，先把选择权的问题说清楚', 'family', { resolve: 6 }), choice('ask_wanglu', '把处境告诉林望鹿，请他只在你需要时出现', 'agreement', { trust: 5 })]),
    scene('agreement', '第四章 · 对等', '他把笔递过来', '出租屋 · 餐桌', '23:15', velvetArt,
      ['谈到程家的安排，林望鹿下意识说“我去处理”，你立刻抬头。他停了停，换成：“你准备怎么说？需要我做什么？”这次你才继续往下讲。', '桌上摊开各自的身份和生活安排。他写下收入和工作，你划掉“其他以后再说”。租期还有几个月，谁的钥匙留在哪里，也得有个答案。', '他把笔递给你。纸上的最后一行空着，过去你们会拿一个吻把这种停顿糊弄过去，今晚他坐着等。'],
      [choice('consent_rule', '写下：任何关系的下一步，都由两个人明确同意', 'boundary', { clues: ['共同约定'], trust: 12 }), choice('pause_relationship', '写下：先暂停共同生活，等彼此想清楚', 'distance', { resolve: 8 })], '林望鹿'),
    scene('distance', '第四章 · 对等', '一个人的清晨', '自己的住处', '07:50', velvetArt,
      ['自己的住处大得有回声。你拿出两只杯子，放到桌上才把其中一只收回去。林望鹿的消息停在昨晚：“钥匙放好，到了告诉我。”', '早餐的面包和出租屋里是同一个牌子，你却吃了很久。想回那间小房子是真的，想到他还有多少事没说清，手又停在了聊天框上。', '你把自己的日程摊开，先划出搬东西的时间，再看周末那一格。那天可以见他，也可以空着。'],
      [choice('choose_independence', '先把生活重新安排好，结束这段以隐瞒开始的关系', 'ending_independent', { resolve: 10 }), choice('return_honest', '愿意重新谈，但只从没有角色扮演的一次约会开始', 'rebuild', { trust: 8 })]),
    scene('family', '第四章 · 对等', '书房里的续约', '杜家 · 书房', '17:00', velvetArt,
      ['书房门一关，父亲便问你知不知道家里有多少生意还靠着程家。母亲坐在沙发边，把饭桌上没说完的话接上：“至少等合同续了。”', '你说程墨做过什么，他们听过很多遍。父亲打断你：“是不是为了外面那个？”你看着书桌上的合影，回答：“没有他，我也不嫁程墨。”', '父亲把茶杯放下，杯盖碰出一声脆响。他让你想清楚离开会有什么后果。司机仍在楼下，门把手就在你身后。'],
      [choice('leave_family', '留下明确书面回应，离开饭局', 'boundary', { clues: ['明确的拒绝'], resolve: 10 }), choice('call_support', '请朋友陪同离开，另约平静的时候谈', 'boundary', { clues: ['朋友的支持'], trust: 6 })]),
    scene('boundary', '第五章 · 名字', '用自己的名字回答', '杜家门外', '18:10', velvetArt,
      ['你走到杜家门外，在家族群那张席位表下面写明：已与程墨分手，未同意任何婚约。消息发出去，父亲的电话马上追来，你先按了静音。', '林望鹿问你在哪，说可以来接。闺蜜也发来车里的定位。你把门牌拍给他们，手机握在手里，谁的车都还没有坐进去。', '母亲追到门口，叫你回去把话说完。你转身重说了一遍，她这次听得很清楚，却仍没有让开那扇门。'],
      [choice('rebuild_together', '和林望鹿回去，把说过的约定落实到日常', 'rebuild', { trust: 8 }, '共同约定'), choice('begin_new_date', '提出重新认识彼此，今晚只约一顿饭', 'rebuild', { trust: 5 }), choice('leave_for_self', '先一个人离开，给关系与自己留出距离', 'ending_independent', { resolve: 8 })]),
    scene('rebuild', '第五章 · 名字', '同一张桌子的另一边', '街边小餐馆', '19:30', velvetArt,
      ['老板问加几个蛋，你们同时说两个。林望鹿笑了一下，你也笑，笑完便各自低头拆筷子。小桌仍旧摇晃，他伸手垫了张纸。', '他把手机放在桌上，问你要不要先把彼此还有疑问的事情问完。家里的电话仍在震，你按掉以后，问起他第一次穿着工作服出现在厂里的那天。', '面端上来了。他把刚要推给你的碗收回去，先回答那个问题。你听着，筷子一直搭在碗沿。'],
      [choice('practice_equality', '按共同约定继续，保留各自的经济与决定空间', 'ending_equal', { trust: 12 }, '共同约定'), choice('honest_new_start', '坦白所有剩下的误会，从一段新的约会关系开始', 'ending_restart', { trust: 10 }), choice('kind_farewell', '承认仍有感情，也承认现在更需要独自生活', 'ending_independent', { resolve: 8 })]),
    ending('ending_equal', '结局 · 一张对等的餐桌', ['租期还剩几个月，你们先住完。第一次把账单放到一起时，又为谁该付押金争了一阵，最后照纸上写好的约定转账，谁都没偷偷多塞钱。', '牛奶终于留在原来的盒子里。母亲的电话有时仍让你沉默，他学着等你讲完，再问能做什么。你们也会吵架，已经不再围着两个虚构的人吵。', '周末你回来晚了，他从厨房探头问加几个蛋。你把包放下，说两个，再给我留点辣。'], 'hopeful', velvetArt),
    ending('ending_restart', '结局 · 重新认识你', ['下一次约会定在周三，地点改过两回，都是各自工作真的抽不开身。你穿平常穿的衣服过去，他也没带骑手外套。', '他从家里怎么叫自己讲起，你重新说了一遍自己的全名。讲到工厂初见时，两人都停了停，最后是你先问：“那时候你到底在干什么？”', '这次他的回答很长。你把凉了一点的茶重新倒满，听完，再问下一件事。'], 'hopeful', velvetArt),
    ending('ending_independent', '结局 · 我自己的下一页', ['你回出租屋收完最后一箱东西，把钥匙放到桌上。林望鹿问那只常用的杯子要不要带，你说带走，伸手时还是犹豫了一下。', '家里还在为饭局的事生气。搬家后的第一晚，闺蜜坐在纸箱上吃外卖，听你把母亲的电话接完，才递过来一双筷子。', '你点的面里也有一颗蛋。这次没人和你推让，你吃完它，把明天要办的事一项项记在手机里。'], 'hopeful', velvetArt),
  ], {
    dinner: { minuteOfDay: 20 * 60 + 40, notBeforeDay: 0 },
    club: { minuteOfDay: 21 * 60 + 12, notBeforeDay: 1 },
    friend: { minuteOfDay: 21 * 60 + 20 },
    cake: { minuteOfDay: 22 * 60 + 2 },
    breakfast: { minuteOfDay: 8 * 60 + 10 },
    call: { minuteOfDay: 10 * 60 + 35 },
    confession: { minuteOfDay: 22 * 60 + 30 },
    invitation: { minuteOfDay: 16 * 60 + 20, notBeforeDay: 2 },
    agreement: { minuteOfDay: 23 * 60 + 15 },
    distance: { minuteOfDay: 7 * 60 + 50 },
    family: { minuteOfDay: 17 * 60 },
    boundary: { minuteOfDay: 18 * 60 + 10, notBeforeDay: 2 },
    rebuild: { minuteOfDay: 19 * 60 + 30 },
  }),
};

export const authoredWorlds: AuthoredWorld[] = [...[blueBlood, doublePursuit, velvetAlibi, futureIsland].map(withCoreInvestigation).map(withBlueInvestigation).map(withIslandLogistics).map(withOperationJournals).map(world => ({ ...world, sourcePassages: coreSourcePassages[world.id] })).map(polishCoreReview).map(withCreativeCore), ...catalogWorldsA, ...catalogWorldsB].map(withWorldProse).map(withWorldContinuation);
