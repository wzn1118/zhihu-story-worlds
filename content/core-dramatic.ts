import type { AuthoredWorld } from './worlds.ts';
import { blueFinale } from './core-story-blue.ts';
import { pursuitFinale } from './core-story-pursuit.ts';
import { velvetFinale } from './core-story-velvet.ts';
import { islandFinale } from './core-story-island.ts';
import { renameChoice } from './core-story-kit.ts';
import { closeCoreEpilogues } from './core-epilogues.ts';

const treatments = {
  'blue-blood': { version: '1.3.0', apply: blueFinale, anchor: 'blue-observer-disappearance', prefix: 'b_',
    summary: '急救培训上，培训师说血液是蓝色的。方诺反问了一句，满屋人都转过头来。教材上也是这么写的，可她明明记得，血一直是红的。',
    title: '从培训室查起',
    description: '你可以留下来看看试卷，也可以先去洗手间。课后再找张薇聊聊，听听她怎么说。',
    tip: '发现不对劲的地方，可以先记下来。有些线索过后就找不到了，手里的记录也能省去重复调查。',
    invention: '窗影延迟、记忆中继、灰夹克的经历、身份替换和终局装置全部为游戏原创，非原作真相；这些解释只在自选终局支线内成立。',
  },
  'double-pursuit': { version: '1.2.0', apply: pursuitFinale, anchor: 'pursuit-police-arrival', prefix: 'p_',
    summary: '门外有人要你的命，门内有人要你的一生。仅剩的体力与电量，要留给屋顶信号、老人门前的卷帘，还是一次冒险的诱声脱困？',
    title: '先找地方躲起来',
    description: '你已报过地址，警察还没到。隔壁的门开着，楼道里却还有脚步声。先决定去哪里躲，再想办法让外面的人找到你。',
    tip: '换了藏身的地方，记得告诉接警员。手机电量有限，体力也会用完，行动前先看看自己还剩多少。',
    invention: '检修过道、屋顶脱困、卷帘守层、诱声路线及其伤亡后果均为游戏原创；不沿用原文的诊断标签解释暴力。',
  },
  'velvet-alibi': { version: '1.2.0', apply: velvetFinale, anchor: 'velvet-family-marriage', prefix: 'v_',
    summary: '两个人都在装穷，一场联姻却真要拿工厂和工资当筹码。杜曼笙必须决定：当众撤席、独自离开，还是守完最后一班夜工。漂亮的解围，也可能换掉牢笼的主人。',
    title: '这笔钱，接还是不接',
    description: '林望鹿把跑单挣来的钱塞给你。他还不知道你家的底细，你也没想好，今晚要不要告诉他。',
    tip: '有些话可以当面问，也可以等独处时再查。谈话和调查都需要精力，累了可以先休息。',
    invention: '宴会续单、工资倒计时、林家收购条件及所有新结局为原创社会悬疑改编；节选只确立互相装穷与家庭联姻，未揭示这些交易。',
  },
  'future-island': { version: '1.3.0', apply: islandFinale, anchor: 'island-water-systems', prefix: 'f_',
    summary: '无限财富建起末世堡垒，却买不到洪水中的最后一只备件。保住高地、弃岛出航，或接受只有一人能等来的重生：金币会留下，选择的人未必还在。',
    title: '还有一年准备',
    description: '你选了无限财富，打算买下一座岛。钱够用，时间却只有一年：先建什么、先备什么，都得现在安排。',
    tip: '设备买来以后，还要安装、检查。灾难到来时，能用上什么，要看你这一年做了哪些准备。',
    invention: '共用进水廊故障、第三十夜危机、终局托管与副本重生条款、异能控制后果均由游戏原创设定；保留受限工作艇则调整了原作销毁交通工具的情节。',
  },
} as const;

export function withCreativeCore(input: AuthoredWorld): AuthoredWorld {
  const spec = treatments[input.id as keyof typeof treatments];
  if (!spec) return input;
  const world = spec.apply(closeCoreEpilogues(input));
  // Append, never reorder old nodes/choices: old path IDs stay stable.
  // New clue indices may be introduced by additive choices; restoreSession replays the
  // real old path into the current compilation, rather than trusting old variables.
  const newIds = Object.keys(world.nodes).filter(id => !input.nodes[id]);
  const anchorFor = (id: string) => {
    if (input.id === 'future-island') {
      if (['f_crown', 'f_voice', 'f_receipt', 'ending_white_room', 'ending_borrowed_voice'].includes(id)) return 'island-single-winner-rule';
      if (['f_convoy', 'f_ballast', 'f_beacon', 'ending_last_ship'].includes(id)) return 'island-destroyed-transport';
    }
    if (input.id === 'velvet-alibi' && ['v_box', 'v_lastmeal', 'ending_empty_table'].includes(id)) return 'velvet-mutual-disguise';
    return spec.anchor;
  };
  const sourcePassages = world.sourcePassages?.map(p => {
    const linked = newIds.filter(id => anchorFor(id) === p.id);
    return linked.length ? { ...p, nodeIds: [...p.nodeIds, ...linked],
      note: `${p.note} 新终局节点仅借用这一前提展开；${spec.invention}` } : p;
  });
  return { ...world, summary: spec.summary, sourcePassages, version: spec.version,
    compatibleSaveVersions: [...new Set([input.version, ...(input.compatibleSaveVersions ?? [])])],
    mechanics: { title: spec.title, description: spec.description, beginnerTip: spec.tip },
    adaptation: { ...input.adaptation, note: `${input.adaptation.note} ${spec.invention}所有结局均为改编收束，不代表原作后续。` },
  };
}

/** Old evidence decisions retain their exact effects, but speak in the cast's voice. */
export function polishCoreReview(world: AuthoredWorld): AuthoredWorld {
  const nodes = structuredClone(world.nodes);
  const voices: Record<string, { text: string[]; good: string; wrong: string; release: string[] }> = {
    'blue-blood': {
      text: ['台灯照着两张纸。地图里的黄浦江去了天津，巷口照片里的门牌却多了一笔。你把它们推到一起，又拉开。', '张薇发来一个问号。你把门牌上多出的那一笔圈起来，连同地图拍给她：“你记得这条街叫什么？”'],
      good: '把两个街名都指给她看，承认还不知道是谁改了它', wrong: '告诉她灰夹克肯定知道所有答案，不再查别的',
      release: ['张薇把纸翻回来，指着你圈过的门牌：“我再找个人来。他去哪里能看到这个？”你把路线补在照片旁。', '手机电量还够一轮联络。发出照片以后，你还得听完对方复述街名和位置，才好在记录里写下收到确认的时间。'],
    },
    'double-pursuit': {
      text: ['接待室的热水凉了。你在手机上翻出求救时间，另一张照片里，墙角那只钟也走到了同一分钟。', '“这一张在哪儿拍的？”接待员问。你从房门讲起，讲到照片墙，喉咙又紧了。他放下笔，等你继续。'],
      good: '从房门到照片墙，把亲眼看见的经过说清楚', wrong: '只写一句他们不是正常人，省去具体经过',
      release: ['手机还剩一点电，接待员让你先挑要保留的原件。你挪开水杯，在桌上给它们腾出一块干燥的地方。', '继续交接要耗去一点体力和电量。若肩膀已经疼得抬不起来，可以先去休息，位置与主要经过已经说过。'],
    },
    'velvet-alibi': {
      text: ['母亲发来的席位表躺在屏幕左边，右边是那只换过标签的牛奶瓶。林望鹿想收走瓶子，你用手挡住。', '“这是你家的事，还是我们俩的事？”他问。你把席位表关掉：“先说你为什么骗我。然后我说我的。”'],
      good: '把自己的假身份也说出来，再问他愿不愿意继续', wrong: '让出钱最多的人决定明天住哪，今晚不再争',
      release: ['林望鹿把重新装好的钥匙放在桌上，没有推给你。你也把备用钥匙取下来，两把之间隔着那只牛奶瓶。', '今晚还有余力，就把共同生活剩下的安排说完；没有，就各自回去睡，别用一个拥抱盖过去。'],
    },
    'future-island': {
      text: ['合影里的工人站在边上，安全帽遮掉半张脸。公屏没有他，工资单却留着他收款时按下的指印。', '闻澄报出他的名字，又报出最后联系的站点。雨声在她身后响，系统在你身后提醒玩家总数。两个声音始终对不上。'],
      good: '按最后联系的站点找他，不把没编号当作没活过', wrong: '把没玩家编号的人从求援名单里划去',
      release: ['对面留出了一轮应急通信，等你报人员与时间。再慢一点，就得把电让给那里的水泵。', '你看了眼自己的配额。能够送出就把这轮做完，不够就说明停在哪里，别让对方关着泵空等。'],
    },
  };
  const voice = voices[world.id];
  if (!voice) return world;
  nodes.evidence_review.text = voice.text;
  nodes.evidence_check.text = [...voice.text, '笔尖停在最后一行。你要把刚才没说完的话补成什么？'];
  nodes.evidence_release.text = voice.release;
  renameChoice(nodes.evidence_check, 'reason_supported', voice.good);
  renameChoice(nodes.evidence_check, 'reason_wrong', voice.wrong);
  renameChoice(nodes.evidence_check, 'reason_limited', '停在确实知道的地方，暂时不补结论');
  return { ...world, nodes };
}
