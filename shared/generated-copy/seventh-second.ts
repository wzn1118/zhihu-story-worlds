import baseline from './seventh-second.baseline.json';
import { sceneCopy } from './copy-record';
import { rescueCopy } from './seventh-second-rescue';
import { recordCopy } from './seventh-second-record';
import { shutdownCopy } from './seventh-second-shutdown';
import { workshopRuntimeGuidance } from '../workshop-guidance';

const battery = '电池得留给闸门或录音台，两边只能顾一边。开检修灯、驱动工具也会耗电，站里没有另一组电池可换。';
const seal = '门封和管路还能撑多久。补漏能让它们多撑一阵，开舱、拆密封件、等浪过去都会损耗余量。';
const chapters: Record<string, string> = {
  '序章 · 不可逆的选择': '序章 · 撤站前夜',
  '第一线：让第七个人走出来': '救韩穗',
  '第二线：让她的证词上岸': '录下证词',
  '第三线：把第七秒留在海底': '关站撤离',
};

// Reviewed copy, applied only while a field still matches this published draft.
export const seventhSecondCopy: Record<string, string> = {
  subtitle: '撤站前夜，你接到了自己的电话',
  summary: '海底中继站马上要撤了，电话里却传来陆遥自己的声音，叫她拦住一个抱着白色线轴的人。那人的女儿死了三年，死亡证明写的却是明天。最后一艘艇就在玻璃外，陆遥得在它离开之前弄清楚，线轴里到底装着什么。',
  'introduction/0': '你叫陆遥，在海底中继站做电气维护。今晚是最后一班，接驳艇十八分钟后就走。你刚被烙铁烫了手背，电话里的人却已经知道了。',
  'introduction/1': '韩砚抱着白色线轴站在闸门边。他的女儿死了三年，他却说听见里面有人叫爸爸。桌上的旧表被海水泡透，你认出了上面的签名：是自己写的。',
  'introduction/2': '备用电池只够接一边。开闸要用它，录音台也在等它。你把两个插头放在一起，隔着玻璃看了一眼艇上的红灯。',
  'introduction/3': '电话还没挂断。那头传来一声枪响，你眼前却什么也没发生。墙上的钟，又比手机慢了七秒。',
  'player/role': '34岁，电气维护工程师。三年前，邵勤说韩穗已经转运，你没亲眼核实就签了移交。今晚那张表又回到了你手里。',
  objective: '艇离开前，查清白轴和那通电话的来历，决定怎么救人、怎么离站。',
  'characters/lu_yao/role': '值班工程师',
  'characters/lu_yao/description': '34岁，黑发紧束，左眉尾有道浅疤。灰蓝工装外套着橙色救生背心，左手背刚烫起水泡。紧张时话更少，先看读数，再动手。',
  'characters/han_yan/role': '机械工程师，韩穗的父亲',
  'characters/han_yan/description': '55岁，灰白胡茬，右眼下挂着眼袋。深绿工装已经褪色，右袖口缠了两圈黄胶带。他把白轴抱得很紧，一直侧着耳朵听。',
  'characters/han_sui/role': '声学工程师，韩砚的女儿',
  'characters/han_sui/description': '今年29岁，白轴里的身体仍停在26岁。鼻梁有淡晒斑，穿深红高领衫和黑色背带裤。嗓子已经哑了，讲起设备故障仍很清楚。',
  'characters/shao_qin/role': '撤站负责人',
  'characters/shao_qin/description': '48岁，薄唇，头发向后梳，深蓝制服领口别着银色领夹。右手扭伤后，他换左手拿纸、扶阀，也用左手去碰不该碰的按钮。',
  'characters/xu_cheng/role': '接驳艇艇长',
  'characters/xu_cheng/description': '42岁，宽颧骨，嘴角有道旧裂痕。黄色防水夹克，黑针织帽，袖口扣着一截铅笔。她很少提高声音，只一遍遍报距离、潮向和剩下的时间。',
  'resources/battery/description': battery,
  'resources/seal/description': seal,
  'mechanics/title': '电量、密封和线索',
  'mechanics/description': '电量和密封都有限。检查设备、修漏管和撤离时，要留意手里还剩多少。',
  'mechanics/beginnerTip': workshopRuntimeGuidance,
  ...Object.fromEntries(Object.entries(baseline).filter(([path, text]) => path.endsWith('/chapter') && chapters[text]).map(([path, text]) => [path, chapters[text]])),
  ...sceneCopy('arrival', {
    title: '提前七秒的枪声',
    paragraphs: { 4: '白轴的观察片亮起，里面是个穿深红高领衫的女人。她张口说了个“别”字。你按住录音台的本地对讲键，先报出自己的伤情，又冲韩砚喊：“别让韩工把白色线轴带上船。里面不是电缆。”你停住了。这正是刚才电话里的话，连那一下吸气都一样。你的手还压在键上，录音继续着。' },
    choices: {
      enter_bring_her_back: ['接上电池，先把韩穗救出来', '启动后，白轴里的原始记录就会被覆盖。想查清当年发生了什么，得另找证据。'],
      enter_let_the_record_speak: ['接通录音台，让韩穗把话说完', '她能留下证词，却活不下来。要先问过她。录音台接通后，主闸就没了电，你们得爬检修井出去。'],
      enter_close_the_station: ['把白轴送进井里，彻底毁掉', '先问韩穗，她没点头就不动手。压锤落下，她会死，记录也会毁掉；检修井堵死后，你们只能走主闸。'],
    },
  }),
  ...rescueCopy,
  ...recordCopy,
  ...shutdownCopy,
};
