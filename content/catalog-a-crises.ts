import type { Choice, SceneNode } from '../shared/types.ts';

// Each detour belongs to an existing exclusive route. Neither old edges nor
// resource contracts are redirected. Two decisions separate temptation from
// irreversible loss; withdrawing never requires a resource payment.
type Prose = [string, string, string];
type EndingTone = NonNullable<SceneNode['ending']>['tone'];
const c = (id: string, text: string, nextNodeId: string, effects?: Choice['effects']): Choice => ({ id, text, nextNodeId, effects });
const s = (id: string, title: string, location: string, text: Prose, choices: Choice[]): SceneNode => ({ id, title, location, chapter: '岔路', time: '此刻', background: '', text, choices });
export const epilogue = (id: string, title: string, text: Prose, tone: EndingTone = 'uneasy'): SceneNode => ({ id, title, location: '尘埃落定之后', chapter: '终章', time: '之后', background: '', text, choices: [], ending: { title, text: text[2], tone } });

export interface CatalogACrisis {
  from: string;
  entry: Choice;
  warning: string;
  mistake: string;
  retreat: string;
  resume: string;
  commit: string;
  ending: string;
  nodes: SceneNode[];
}

// Player-visible discoveries, not internal node IDs or generic risk labels.
const evidence: Record<string, [string, string]> = {
  roster_offer: ['删名将转为永久住户', '四楼的登记暂时冻结'],
  roof_feed: ['上传将注销玩家账号', '影像替身已先行结算'],
  sea_exchange: ['送出的木牌改成入朝', '名册变座次而老卒失忆'],
  gate_cargo: ['跟过桥的空担仍无影', '担内白皮学人发令'],
  canal_seal: ['真手令只准家眷过闸', '新札与真手令编号不符'],
  escort_muster: ['齐员册一交便要开拔', '伤兵正在替缺席者应名'],
  solo_shortcut: ['至少为六排除五与五', '旧取等与题头条件矛盾'],
  wen_blame: ['温简只问过是否看卷', '完整聊天里没有保真承诺'],
  project_numbers: ['三成被重复算成八成', '客户已看见底表批注'],
  dinner_screenshot: ['傅琰明说私事别转发', '完整截图仍停在发送预览'],
  river_brand: ['定位印带有强制归位', '黑蛟被旧鳞扯回浅水'],
  arena_record: ['原图记有师妹叫停', '执事保有第二份阵图'],
  frontier_marker: ['旧车辙终点留有断轮', '满载头车的轴已经开裂'],
  market_pledge: ['实到来粮只够两锅', '同一筐收成写了两份用途'],
  sect_sword: ['旧水沟直通粮仓后方', '试切的水已经抵到仓后'],
  mill_pledge: ['寄存的麦要留作春种', '粮主当面拒绝抵给石匠'],
};

// The two risk facts are inspected by actual Ink gates, not merely test labels.
function crisis(from: string, entryText: string, first: SceneNode, second: SceneNode, ending: SceneNode): CatalogACrisis {
  const [warning, mistake] = evidence[first.id];
  const entry = c(`enter_${first.id}`, entryText, first.id, { clues: [warning] });
  const risk = first.choices.find(choice => choice.nextNodeId === second.id)!;
  risk.requires = { allClues: [warning] };
  risk.effects = { ...risk.effects, clues: [...(risk.effects?.clues ?? []), mistake] };
  const commit = second.choices.find(choice => choice.nextNodeId === ending.id)!;
  commit.requires = { allClues: [warning, mistake] };
  commit.feedback = { tone: 'setback', text: ending.text[0] };
  return { from, entry, warning, mistake, retreat: second.choices[0].id, resume: second.choices[0].nextNodeId, commit: commit.id, ending: ending.id, nodes: [first, second, ending] };
}

export const catalogACrises: Record<string, CatalogACrisis[]> = {
  'happy-home': [
    crisis('neighbors_names', '查看俊哥发来的快速补签单；先不交出任何名字',
      s('roster_offer', '少写一个，能多拿多少', '第六夜的消防门后', [
        '俊哥把手机从门缝递进来：把四楼从救援名单划掉，余下的人就能提前锁定积分。删除键旁还亮着一行小字：未登记者转为永久住户。',
        '“反正你也把人拉上来了。”他说。四楼玩家就在你身后，攥着断了半截的红线，听到这里往后退了一步。',
        '红姐伸手挡住屏幕：“先叫他的名字。他已经在变淡了，别再拿他试。”点名还在继续，名单也尚未提交。',
      ], [c('roster_keep', '把名单交给红姐轮班，保留四楼的名字', 'neighbors_seven', { clues: ['共同点名'] }), c('roster_preview', '划掉四楼，先看积分预览；他的登记会暂时冻结', 'roster_receipt'), c('roster_handoff', '请红姐接完这一夜，自己退出补签交涉', 'ending_spent')]),
      s('roster_receipt', '红线那头不再叫名字', '结算机的冷光前', [
        '你刚划下那一笔，四楼玩家的手机就响了。通讯录里的人名全变成楼号，他喊了两遍自己的名字，第二遍已经很轻。',
        '积分栏多出一笔，下面写着：确认后，住户登记不再撤销。俊哥催你按下去，四楼却把红线递给红姐，不敢再找你。',
        '“撤回键还亮着。”红姐指给你看，“我来接线，你把他加回来。”机器还在等最后一次确认。',
      ], [c('roster_restore', '撤回删名，向四楼道歉并让红姐接线', 'neighbors_seven', { clues: ['共同点名', '补签撤回'], trust: -3 }), c('roster_stop', '把手机交给红姐撤回，退出结算交涉', 'ending_spent'), c('roster_sell', '确认删名，拿走以四楼身份换来的积分', 'ending_erased')]),
      epilogue('ending_erased', '空出来的第四格', ['积分到账，四楼玩家的姓名从所有屏幕上消失。他被留作这栋楼的登记员，七日结算从此没有他的席位。', '红姐带其余玩家离开，删掉了你的联系方式。思思取回红线，只说：“这东西给你，是让你叫他回来的。”三十层的门随后关上。', '你独自完成结算。那笔额外积分花得掉，第四格却再没有人能补上；你丢掉的也不只是一位同行者。'], 'dark')),
    crisis('roof_alarm', '查看播控台的停播协议，辨认断线和上传的区别',
      s('roof_feed', '它要借你的眼睛', '红灯下的播控台', ['总线旁亮起一个上传框，声称用一段完整视野就能换回楼外梯。画面里的你没有近视，正替你逐字读提示。', '思思留下的检修纸压在绝缘剪下：上传后，账号会归入节目素材，不再列作玩家。回屋的通道还没消失。', '你把手从镜头前移开，屏幕里的手却停了一拍。它并不是在帮你看清。剪断线，或试接一次，得现在定。'], [c('roof_manual', '关掉上传框，拉下机械断路闸', 'roof_daybreak', { clues: ['总线已断'] }), c('roof_preview_upload', '接上镜头，试用它承诺的清晰视野', 'roof_duplicate'), c('roof_exit_feed', '退回楼内，请住户拆掉检修灯', 'ending_spent')]),
      s('roof_duplicate', '屏幕先替你伸了手', '检修台的双重影像', ['镜头刚亮，电梯便报出你的名字，说该玩家已经结算。你本人还站在天台，脚边的外梯纹丝不动。', '屏幕里那个人笑着指向“完成上传”。下方写明：原账号注销，只保留可重复播出的影像。退出钮就在你手边的插头上。', '你拔松半寸，画面里的笑脸便散了一半，脚下梯级重新露出来。还有机会断开，代价只是放弃这副借来的眼睛。'], [c('roof_pull_plug', '拔掉插头，再用手闸截断总线', 'roof_daybreak', { clues: ['总线已断', '上传中止'] }), c('roof_abandon_console', '掀掉镜头退回楼内，交还检修任务', 'ending_spent'), c('roof_complete_upload', '接受注销账号，完成上传换取清晰视野', 'ending_broadcast')]),
      epilogue('ending_broadcast', '第七天被播了三百遍', ['上传结束，外梯收回。系统注销了你的玩家账号，将整段视野归入三十层的固定节目；画面里的你每晚都在同一个门口醒来。', '思思守过七次检修口，最后只能拆走那盏灯。红姐带其他人完成了结算，名单上再没有可供申诉的你的姓名。', '后来屏幕换过三次广告，你仍只看得见那段格外清楚的走廊。眼前再也不模糊，路却永远只剩这么长。'], 'dark')),
  ],
  'rotten-pilgrimage': [
    crisis('sea_floodgate', '听清宫灯提出的换闸条件，暂扣上门不动',
      s('sea_exchange', '父王叫出了每个人的乳名', '排潮闸的上下两扇门', ['宫灯隔着上闸游动，那张父王的脸说能将所有人送走，只要你先把避难者的名册递上去。', '守将指着水中的倒影：刚才试送出去的木牌，名字已变成“入朝”。下渠通向海湾，上闸通向那座浅了四千米的宫殿。', '“三太子，我认得您的字，不认得灯里那个人。”他把名册按在胸口。你仍能从下渠断后，只是再没有机会搬走旧宫的财物。'], [c('sea_keep_lower', '放弃旧宫财物，按下渠的牵索断后', 'sea_shore', { clues: ['断后归来'] }), c('sea_lend_names', '把名册递给宫灯，试换一条宽阔水路', 'sea_names_lost'), c('sea_stop_trade', '将下渠交给守将，自己停止施术撤离', 'ending_spent')]),
      s('sea_names_lost', '名册在水里倒过来', '上闸开出的一道缝', ['名册贴上宫灯，每个名字下方都浮出一个座次。最先上浮的老卒忽然改口叫你殿下，忘了自己方才还在逃难。', '父王那张脸让你拔掉下渠的锁，声称入朝以后便再不用担心灵山。守将攥住你的腕子：“那我们就永远不是出来的人了。”', '名册尚有一角在你手里。撕断它，众人还能靠彼此的喊声回下渠；再把手松开，所有座次就会封定。'], [c('sea_tear_roll', '撕掉名册，让守将逐个喊人退回下渠', 'sea_shore', { clues: ['断后归来', '王令撕毁'] }), c('sea_yield_to_guard', '把名册交守将处理，随伤者撤出这座宫', 'ending_spent'), c('sea_finish_court', '松开名册，封死下渠，接受新的朝会', 'ending_false_court')]),
      epilogue('ending_false_court', '五千米处再无宫门', ['下渠合拢，避难者按名册坐进一排排空椅。朝钟停时，他们连逃来的经过也忘了，只会随那张龙王的脸一同向你行礼。', '守将把剑折在闸缝中，仍没能留下出口。他成了不再说话的殿前卫，你被安在三太子的座上，每日接受同样一轮朝拜。', '八戒循断剑找到封死的海床，只带走半截剑柄。西海这一次没有撤出的人，灵山也少了一个会回去求援的师弟。'], 'dark')),
    crisis('gate_lastboat', '检查末队带来的行囊，先把人接到灯下',
      s('gate_cargo', '空担自己跟上了桥', '断云桥的末端', ['末队的人抓住绳索，背后一副空担却没系绳，也跟着浮过来。天火照着它，地上仍然没有影子。', '有人哭喊担里是师父留下的衣物。巨灵神压住桥头：“人先过，东西放下。此前隔开的就是它。”', '你看见担角露出熟悉的袈裟色。放手，最后这队人仍能进门；把担保作普通行李，守将就会移开火。'], [c('gate_drop_cargo', '留担在桥外，只接回抓绳的人', 'gate_seal', { clues: ['末队接回'] }), c('gate_vouch_cargo', '为行囊作保，让守将移开照它的天火', 'gate_inner_shadow'), c('gate_return_watch', '把检查交给巨灵神，自己退到炉后', 'ending_spent')]),
      s('gate_inner_shadow', '门内多了一声喊停', '侧门火盆旁', ['空担一过桥，炉后便响起与你一样的声音，命人打开内殿。巨灵神回头望你，你还没开口，那声音又说了一遍。', '担里的袈裟翻出来，内侧没有针脚，只有一张正在长出嘴的白皮。天火照回去，嘴立刻闭上。', '老君递来铁钩：“别护着它，推回炉口。”桥上的人已经接回，只有你替它作保的那句话还在起作用。'], [c('gate_retract_vouch', '撤回作保，用铁钩把空担推入封炉', 'gate_seal', { clues: ['异物隔离', '末队接回', '行囊重封'] }), c('gate_surrender_hook', '请老君接手封炉，带伤者退开', 'ending_spent'), c('gate_hide_cargo', '掩住白皮，继续将它当作师门遗物放入内殿', 'ending_lost_gate')]),
      epilogue('ending_lost_gate', '天门的门闩留在外面', ['你掩住白皮，内殿的门便循着那句作保打开。笑声从空担里涌出，巨灵神只来得及斩断接引台，把已经入门的伤者推往后殿。', '老君封死整座前殿才截住扩散，巨灵神与那副空担一同留在封炉外，再未归队。幸存者迁入九重天，南天门永久废弃。', '你交出佩剑，留在迁走的伤者中服役。求援没有带回师兄，反而赔掉了肯开门的守将；墙上的失踪名册，此后由你来抄。'], 'dark')),
  ],
  'ming-whisper': [
    crisis('canal_checkpoint', '查看掮客递来的空白通行札，不急着盖家印',
      s('canal_seal', '一枚印，换全家过闸', '关闸旁的油布棚', ['掮客从袖里抽出一张空白札子，说盖上周家印，便能写成全家奉旨出京。真手令就在闸兵手上，明明只许家眷走。', '父亲摸到印匣，问查出来会怎样。船家抢先答：“冒旨的船整条扣。如今不是多付点钱的事。”', '王承恩留的正路还在：你留在闸口，家人照样放行。印盒盖没开，掮客却已将笔蘸满。'], [c('canal_keep_order', '收起家印，自己留下，让家人凭真手令过闸', 'canal_morning', { clues: ['家人先行'] }), c('canal_try_forgery', '让掮客写成全家奉旨，先拿去比照关防', 'canal_seal_check'), c('canal_end_attempt', '遣走掮客，一家人返回府中结束南行', 'ending_spent')]),
      s('canal_seal_check', '两张札子的纸色不同', '闸口验文桌', ['闸吏将札子举到灯前，问这道旨是谁传的。他还未收件，旁边那张真手令的编号清清楚楚，和你新添的对不上。', '父亲悄悄把印匣往回拽：“鉴儿，咱们别全押在这上头。”渡船还拴着，家眷的名册也未作废。', '此刻撤回，只当递错纸；继续按印，就是你亲自认下这道假旨。闸吏将空着的签押格转向你。'], [c('canal_withdraw_seal', '撤回假札，照真手令留下自己、放行家人', 'canal_morning', { clues: ['家人先行', '假札撤回'] }), c('canal_return_house', '取回名册与行李，全家回府等候处置', 'ending_spent'), c('canal_stamp_forgery', '在假札上按家印，坚称全家奉旨南下', 'ending_impounded')]),
      epilogue('ending_impounded', '船走了，箱子还在', ['家印落下，闸吏随即拿两道编号对质。假札被扣，全家同行的资格一并停了；船家按原时刻载别的客人离岸。', '姐姐为家人争到居家看管，免了下狱，却再争不到出京的船。父亲变卖那几箱没舍得丢的家财，才清偿船租与扣押后的支出。', '入冬，你被革去闲职，在府里看守最后一仓口粮。亲人都还活着，却一同困在原想送他们离开的城中；断掉这条路的，是你盖下去的印。'], 'dark')),
    crisis('escort_command', '拿催战令去点一次实兵，再决定是否报齐员额',
      s('escort_muster', '纸上还有三百人', '病棚外的点兵桌', ['传令者摊开旧花名册，上面仍写三百壮丁。把总领你看病棚，能起身应名的只有半数，能背粮走路的更少。', '“照旧数报上去，朝里好批下一趟粮。”传令者压低声音。把总却说齐员册一交，这些人明日便得按它开拔。', '病兵听见“开拔”，将没喝完的粥放下。你可以报实数请缓，也可以先让他们排起来，赌朝廷只看文书。'], [c('escort_true_muster', '报出实到人数，随传令者回京说明病情', 'escort_departure', { clues: ['亲见病营'] }), c('escort_stage_muster', '按旧数排队点名，试着凑出一份齐员册', 'escort_rollcall'), c('escort_leave_muster', '把余粮交给把总，退出点兵差事', 'ending_spent')]),
      s('escort_rollcall', '第二遍点名没人答', '晨雨里的营旗旁', ['第一排刚站稳，就有两个人扶着旗杆坐下。你让伤兵替缺席的人应名，把总当场叫出了两人的本名。', '“签上壮健，明天连抬他们的车也不会给。”他将笔搁回你面前。传令者还等着封袋，错填的那页尚可换掉。', '你听见棚里咳嗽，又听见锅盖被掀开。改报实数，只会让这封文书难看；照旧交上去，难走的是明天那条路。'], [c('escort_correct_roll', '划掉虚报人数，附病营实情后亲自回奏', 'escort_departure', { clues: ['亲见病营', '点兵更正'] }), c('escort_give_back_roll', '拒签壮健册，将点兵交回把总并交清粮账', 'ending_spent'), c('escort_sign_false', '签下齐员壮健，换取立即开拔的批复', 'ending_broken_column')]),
      epilogue('ending_broken_column', '粮车回来了，人没站成队', ['齐员册换来了开拔令，却没有给病兵添力气。队伍走到断桥便散了，余粮落进水里，把总带车夫将倒下的人一批批接回驿站。', '你按自己的签名受了撤职查办，周家余粮也划作伤病安置。那支原本还能整备的营被拆散收编，再没有下一次由你押去的补给。', '父亲送饭来时，把空印匣留在桌上。你保住了性命，却赔掉军中对你的信任；那三百个纸上的壮丁，终于从账上划净。'], 'dark')),
  ],
  'score-room': [
    crisis('solo_exam', '回看草稿上的二十五，检查它能否直接搬进利润题',
      s('solo_shortcut', '熟答案旁多了一个条件', '月考最后十分钟', ['题里的两个非负数相加是十，较大者至少为六。你却在答案格里顺手写了二十五，和前夜旧题一模一样。', '草稿上的六乘四明明只有二十四。五与五取不到，卷面右侧还特意留了“可行取值”一栏。', '铃没响。你可以划掉这一步回查基础题，也能把熟练的旧证明补齐，赌阅卷者不看最后那个条件。'], [c('solo_return_basics', '划掉二十五，写清六与四后回查基础题', 'solo_result', { clues: ['基础月考'] }), c('solo_copy_old', '沿用五与五的旧证明，先把空白填满', 'solo_last_line'), c('solo_hand_in_early', '交出现有答卷，结束这一轮月考', 'ending_spent')]),
      s('solo_last_line', '取等那一行写不下去', '收卷前的草稿纸', ['你把“两个数均为五”抄到最后一行，笔尖刚停，便发现它和题头的“至少为六”挨在同一道折痕上。', '同桌仍在写。监考老师报还有三分钟，明确说现在修改仍计分。你把橡皮压在那一行上，却舍不得前面整页工整的过程。', '划掉不可行的取值，至少能保住正确起式；签上那个旧答案交卷，丢的就是这道题真正考的部分。'], [c('solo_cross_equality', '划掉不可行取值，交出正确起式与基础题', 'solo_result', { clues: ['基础月考', '取等更正'] }), c('solo_stop_last', '交卷结束本轮复习，不再追加训练', 'ending_spent'), c('solo_submit_old', '保留五与五及二十五，按旧证明交卷', 'ending_wrong_range')]),
      epilogue('ending_wrong_range', '被划掉的取等号', ['卷子发回来，压轴的正确起式留了步骤分，不可行的取值和结论全部划掉。你的总分没到本轮晋级线，申请被退回，下一期才能重报。', '李迟游把六与四写在旧证明旁，没有替你找阅卷的错。你承认自己看见了限制仍想蒙过去，随后关闭了这一轮梦中训练。', '母亲替你腾出饭后的一小时，你重新拿起橡皮，把那一整页熟练的错证擦掉。报名处寄回旧表，新教室已经坐进别人；这个学期，你仍留在原班。'], 'dark')),
    crisis('wen_offer', '处理群里对所谓内部卷的追问，先核实谁说过什么',
      s('wen_blame', '群里有人问是谁保证的', '成绩栏旁的楼梯', ['落选的同学在群里问谁说过内部卷保真，有人因为温简和周希相熟，便认定她有内情。可你亲眼见过，她只问过“要不要看”。', '她把原消息递给你：“你当时也在。帮我说清这句行吗？”李迟游也在等你回到正常的讨论安排。', '你可以将原话说出来，也可以顺着同学的猜测，把矛头引向她。群里已经有人开始截屏，这次发出去的不会只是随口闲聊。'], [c('wen_own_forward', '说明没人保证真卷，停止相互指责后筹办答疑', 'ending_class', { clues: ['转发澄清'] }), c('wen_shift_blame', '谎称温简向自己保证过真卷，附和群里的指责', 'wen_receipts'), c('wen_decline_role', '只澄清她没作保证，谢绝组织工作后回去复习', 'ending_real')]),
      s('wen_receipts', '她把原图发了出来', '安静下来的讨论群', ['温简发出完整聊天，从收到卷子到后来提问，时间和原话都在，没有你声称的那句保证。她没骂人，只私聊问你要不要更正。', '老师说考分照常认定，但组织公开答疑的人得先把误传解释清楚。你尚未失去席位，也没有谁逼你当着全班检讨。', '输入框里，温简的名字被你打了又删。承认说错，搭档还有得谈；继续咬定她删过话，就是明知原图在场仍要诬赖她。'], [c('wen_correct_blame', '向群里更正并单独道歉，将答疑交回共同安排', 'ending_class', { clues: ['转发澄清'], trust: -4 }), c('wen_step_down', '公开撤回指责，辞去组织工作专心自己复习', 'ending_real'), c('wen_insist_blame', '指责她删过证据，继续让同学追究她', 'ending_broken_study')]),
      epilogue('ending_broken_study', '空下来的讨论位', ['老师核对双方的原图后，撤掉了你组织答疑的资格。卷面分数没变，你的名字却从下周的答疑值班表上划掉了。', '温简收回共用的资料夹：“题可以不会，话别栽给我。”她转去别组。李迟游也停止共同备课，只把原先借来的书归还。', '你继续留在备考班，独自处理那本没补完的错题。公开答疑照常开课，桌边不再留你的组织席；这段学习搭档关系在这一晚结束。'], 'dark')),
  ],
  'online-heir': [
    crisis('project_arrival', '打开投放底表，核对一页看起来过于漂亮的结果',
      s('project_numbers', '八成转化从哪里来', '异地办公室的白灯下', ['方案写着八成意向转化，底表却只有三成。你顺着公式找到重复计算的几行，正是小杨交接时特意标黄的地方。', '客户肯再给一次小规模试投，前提是今晚说清哪些数尚未核实。明早若把八成当实绩签入合同，项目就按这个数验收。', '傅琰问要不要替你找程谦。你没回，先把手放到黄色那几行上：修数据还有时间，装没看见也只需一次发送。'], [c('project_correct_numbers', '公开更正底表，用三成结果重做小规模试投', 'project_return', { clues: ['独立项目结果', '数据更正'] }), c('project_send_draft', '将八成当已验实绩发给客户，先抢下预算', 'project_evidence'), c('project_withdraw_offer', '撤回未经核实的方案，申请退出本期外派', 'ending_spent')]),
      s('project_evidence', '客户索要原表', '视频会议共享屏幕', ['客户没有立刻签字，反而打开了你附上的原表：“这里为什么是三成？”屏幕角落还留着小杨提醒重复计数的批注。', '“今晚纠正，我们只做试投。”对方说。小杨在另一端关了麦，给你发来未改动的版本，足够把错数从头讲明白。', '这还只是发错一份方案。删掉批注，声称原表过期，就会把同事也拖进你明知有错的保证里。'], [c('project_admit_data', '承认重复统计，保留小杨批注并重做试投', 'project_return', { clues: ['独立项目结果', '数据更正'], trust: -3 }), c('project_end_offer', '撤回整份承诺，把原始材料交给接手同事', 'ending_spent'), c('project_hide_data', '删掉批注，坚持八成属实并签下验收数字', 'ending_lost_project')]),
      epilogue('ending_lost_project', '退回来的合同', ['首轮验收按你签下的八成核对，重复数据被逐项剔除，客户终止了合作。你回到原岗位，独立负责下一期的资格被撤销。', '小杨提交交接底稿，保住自己的署名，此后只通过正式任务单与你交接。傅琰没有找朋友替你抹平结果，私人关系也没有替合同续上一天。', '季度汇报由你说明损失，主管收回了项目负责人的席卡。回到工位，新任务只有整理底表；那几行曾被你删掉的黄字，又出现在第一份退回稿上。'], 'dark')),
    crisis('dinner_stall', '看看朋友群里催晒聊天的消息，先不发送私人对话',
      s('dinner_screenshot', '有人要看两年的笑话', '夜市的红色塑料桌边', ['群里还在起哄，让你晒傅琰当年认真问拼单饭风险的聊天。截屏里却连着他谈家人的私事，他刚刚才请你别把那段发出去。', '“玩笑那句可以。”傅琰将手机推回你面前，“后面的，删掉。”烤肠还没凉，程谦已经连发三个等着看的表情。', '剪掉私事再讲笑话，今晚仍能轻松收场。把整页送进预览，只能换来更响的一阵起哄，未必还是两个人一起笑。'], [c('dinner_crop_private', '删掉私事，只当面讲完那个烤肠笑话', 'dinner_train'), c('dinner_preview_private', '把整页聊天放进群发预览，想逼他别再端着', 'dinner_send_confirm'), c('dinner_put_phone', '收起手机，说明今晚到这里便各自告别', 'ending_separate')]),
      s('dinner_send_confirm', '手指停在发送上', '地铁口的路灯下', ['傅琰看见了预览，伸手遮住家人那一行：“刚才说过，这段别发。”他没有碰你的手机，只把自己的手收回去。', '程谦这时也发来消息，说只是逗一句，私事就算了。没人再催，预览仍在你掌心里，未发出的截屏随时能删。', '你可以认下自己过了头，也可以把它当作让傅琰当众低头的办法。后者要拿走的，恰是你刚要求他尊重的那份私下信任。'], [c('dinner_delete_preview', '删除预览并道歉，回到两个人的谈话', 'dinner_train', { clues: ['截屏撤回'], trust: -3 }), c('dinner_leave_without_post', '删掉截屏，说明双方先不再交往', 'ending_separate'), c('dinner_post_private', '仍把完整私信发进群，逼他当众表态', 'ending_exposed_chat')]),
      epilogue('ending_exposed_chat', '他没有接下那句玩笑', ['截屏发出后，群里没再出现表情包。傅琰请大家删除，陪你走到地铁口，说这段关系到此结束。原因不是你的家境，而是他当面说过别发。', '程谦退出了起哄，翌日的工作也没有因此刁难你。你删去截屏、退出群聊，仍然照常上班；两年的私信却再没有新的回复。', '那顿面没有约成。你留住了自己的岗位和生活，失去的是一个已经愿意坐在夜市、却被你推到众人面前的人。'], 'dark')),
  ],
  'black-flood': [
    crisis('river_deep', '展开旧阵符，先问黑蛟是否接受定位印',
      s('river_brand', '不是每张符都能叫回同伴', '海礁上晾着的阵符', ['你在旧符里找到一枚定位印，最末一行却写着强制归位。黑蛟看完，把尾鳍从符边移开：“约好在河口见就够了。”', '它将剑推还给你，转身试了试去深水的路。符一旦写进它的旧鳞，今后每次发作都会把它往岸边拖。', '你还记得上一世等不到青鸾回头的日子。收起符，那份害怕只能自己带着；试写一笔，黑蛟就得替你承受。'], [c('river_fold_brand', '收起强制归位符，只约河口相见', 'river_farewell', { clues: ['河口再会'] }), c('river_test_brand', '把定位笔画写进旧鳞，试着让它暂留浅水', 'river_tether'), c('river_end_trip', '停止寻海，商量由泉院继续照料伤势', 'ending_spent')]),
      s('river_tether', '尾鳍第一次背向你', '退潮后露出的礁沟', ['黑蛟刚游出两丈，旧鳞便把它扯了回来。它咬断一片水草稳住身子，回头问：“我说的够了，你没听见？”', '最后一道笔画还没封。你用海水一擦，牵扯便弱下去；它留在原处，等你亲手擦净。', '“治伤的钱，我会还。这个，我不要。”它把话说得很慢。若再封印，它宁可脱下受印的旧鳞，也不会留下作随叫随到的灵兽。'], [c('river_wash_brand', '擦净笔画，道歉并收回所有强留的符', 'river_farewell', { clues: ['不结契放行', '归位印洗去'], trust: -4 }), c('river_release_and_go', '擦净笔画，结束这次同行后独自回山', 'ending_free'), c('river_seal_brand', '封上归位印，仍想强迫它留在岸边', 'ending_broken_tide')]),
      epilogue('ending_broken_tide', '河口没有等你的水声', ['黑蛟自行剥下承印的旧鳞，游入同类栖息的深水。它的伤由海中同族接着照料，归位印只拖回一片空鳞。', '你回宗后收到它托船家带来的药钱，没有再会的口信。长老撤了这次结契登记，旧院仍归你，今后的委托也仍由你独自承担。', '你将空鳞放回河口的石上，等过一整次涨潮。水冲走了它，再没有谁替你推回佩剑；回山时，另一份药仍原封不动地压在包底。'], 'dark')),
    crisis('arena_judgment', '核对试招笔录，决定是否保留青鸾失控的那一页',
      s('arena_record', '删掉一页就能讲顺的旧怨', '议事厅的阵图案', ['记录里写着青鸾自行抽取法力、方霓笙已经叫停。你盯着那一行，想起上一世断阶边只有她被带走。', '有人问是不是师妹故意纵兽。只要删掉这一页，余下几段就很像她一人挑起了事。长老却已让执事另存原图，随时能对。', '“我要说的都在这张纸上。”方霓笙把颤抖的手压平。你能恨她，也能将这一次真正发生的事完整留下。'], [c('arena_keep_page', '保留叫停与抽法记录，请长老照实处置', 'arena_newclass', { clues: ['基础课获准'] }), c('arena_remove_page', '抽走她叫停的那一页，试着让罪责都落在她身上', 'arena_original'), c('arena_leave_record', '把完整笔录交回，退出这次评议', 'ending_spent')]),
      s('arena_original', '执事拿来第二份阵图', '堂前两张并排的纸', ['执事将原图放下，缺页的位置立刻显出来。青鸾转向你的时刻，与方霓笙叫停的时刻前后分明。', '长老没有先问前世，只问这一页是不是你抽的。黑蛟在门边等你，说自己记得师妹确实喊过停。', '纸还在你袖里。拿出来，你得承认自己挟了旧怨；说它从未存在，就要让两个亲眼见过的人陪你撒谎。'], [c('arena_restore_page', '交出缺页并认错，将基础训练交长老重新安排', 'arena_newclass', { clues: ['基础课获准', '试招笔录更正'], trust: -5 }), c('arena_step_away', '归还缺页，谢绝授课后带黑蛟回院养伤', 'ending_free'), c('arena_insist_false', '藏住缺页，指称执事与师妹串供', 'ending_lost_class')]),
      epilogue('ending_lost_class', '练习台不再等你点名', ['两份阵图核对后，方霓笙被免去纵兽的指控，青鸾仍由宗门隔离。你因隐去叫停记录而失去授课与见证试招的资格。', '师妹回去重学基础，没再到你的院门口借药，也不肯接你的解释。黑蛟陪你养好伤，却谢绝了这一季共同出行，说还要看看你怎样处理自己的旧怨。', '钟响时，新一班弟子跟着另一位师姐收剑。你留在旧院修行，性命与药袋都保住了，原本可以重新建立的两段信任却断在那张缺页上。'], 'dark')),
  ],
  'radish-court': [
    crisis('frontier_fog', '亲看领队口中的近道，不急着让车队压上去',
      s('frontier_marker', '旧车辙停在崖口', '浓雾中的岔路木牌', ['领队拨开草，露出一段旧车辙，说沿它走能追回误掉的军期。车辙到了崖口就断了，旁边滚着一只去年丢的车轮。', '驿卒蹲下摸土，一按便渗出水：“这路连空车也得先拆着过。”牧场路还在身后，走它慢，至少人和粮都能一齐回营。', '领队等你这位御前来的端妃开口。你要试近道，就得先说明这只坏车轮意味着什么。'], [c('frontier_choose_known', '放弃追回时辰，带两队回牧场路', 'frontier_reply', { clues: ['双队归营'] }), c('frontier_test_loaded', '让满载头车试压旧车辙，想省下绕路时间', 'frontier_axle'), c('frontier_handoff_route', '请驿卒带两队回营，自己交还试路差事', 'ending_spent')]),
      s('frontier_axle', '车轴发出第一声裂响', '崖边半陷的头车', ['头车只走了两丈，左轮便陷进泥里。轴上裂开一道白口，车夫勒住牲口，剩下的车还没跟上。', '你将第一袋粮卸到干石上，车身随即稳了些。驿卒说卸空能拖回，粮包由众人分肩抬走，不必拿满车去赌。', '领队仍盯着时辰。若再催一鞭，裂轴承的是后面整排粮袋；原地退车会丢脸，不会丢掉它们。'], [c('frontier_unload_cart', '卸粮分肩运回，将空车拖离崖口', 'frontier_reply', { clues: ['双队归营', '裂轴卸载'] }), c('frontier_stop_duty', '停下队伍交给驿卒处置，辞去领队差事', 'ending_spent'), c('frontier_force_cart', '仍让满载车加鞭，赌这段软土撑得到头', 'ending_lost_convoy')]),
      epilogue('ending_lost_convoy', '空筐回了景华宫', ['第二鞭落下，裂轴折断。车夫割开套索保住牲口，人也及时退到干石上，车与粮却一同滑入涨水的沟底。', '两队空手返营，前哨改调别处存粮，你的试路差遣随即撤回。损耗由你具名填报，不再记作天气，驿卒也不肯替你签那份旧图。', '回宫后，你从自用开支里补还粮额，福顺逐月销账。祖母的兵书还在桌上，北境却没有再来下一季的任命。'], 'dark')),
    crisis('market_harvest', '对照新一季的五锅供饭承诺，先看实际能收几筐',
      s('market_pledge', '五口锅写在尚未收成的地上', '菜地旁的筹粮桌', ['送来的新牌匾写着每日足额开五锅。青杏只数出足够两锅的来粮，萝卜还在地里，留种那一筐也已画了记号。', '捐粮人说，肯包五锅便替你垫首月米，往后由你的下一季收成偿还。福顺把算盘往前推：“同一筐，别给了两回。”', '可以把牌匾改成按日公布份量，棚照旧开。按五锅签下去，就得用本来留给下季的种粮填今年的窟窿。'], [c('market_correct_board', '改掉五锅承诺，按实收换工并留足种子', 'market_future', { clues: ['粮棚自种'], resources: { crop: 2 } }), c('market_promise_five', '先承诺五锅，拿未收的作物抵下首月垫米', 'market_doublepledge'), c('market_close_cleanly', '不接垫米，清算已开饭食后结束主持', 'ending_spent')]),
      s('market_doublepledge', '那一筐有两张欠条', '粮棚账桌的雨灯下', ['月底对账，同一筐萝卜既写作还捐粮人的垫米，又写作下一季的种子。两张单子都是你的字，不是青杏舀多了半勺。', '市坊愿将棚缩到两锅，重新排班，余欠按月慢还。福顺说现在更正还来得及，旧牌匾拿下来就行。', '再保住“五锅不断”的名声，只有挪走留种粮，还得让帮灶者多留一班。你看向他们，没人答应替这两张欠条再签一次。'], [c('market_revise_debt', '承认重许收成，缩为两锅并另列还米账', 'market_future', { clues: ['粮棚自种', '供饭减量'], resources: { crop: 2 } }), c('market_transfer_debt', '公开结清自己应担的欠额，将棚移交市坊', 'ending_spent'), c('market_take_seed', '仍保五锅牌匾，挪尽留种粮并强留帮工', 'ending_closed_kitchen')]),
      epilogue('ending_closed_kitchen', '牌匾比锅先撤下', ['种粮挪完，五口锅也只多撑了十日。垫米到期无收成可抵，帮灶者散去，粮棚只得关门，由市坊另设两口救急灶。', '你用自己的赏赐逐月还米，没有把欠额摊给福顺与青杏。青杏回院管地，福顺辞了外棚账务；两人仍留在景华宫，却不再替你承诺院外的饭。', '错过播种的地空到开春，旧牌匾被收进库角。市坊新灶开门时只摆两口锅，原来的帮手都去了那里；你将还米的最后一张回条交给福顺，没再请他挂牌。'], 'dark')),
  ],
  'harvest-box': [
    crisis('sect_dike', '沿临时堤查看旧剑裂，先听村人说水往哪边走',
      s('sect_sword', '再劈一剑，水往谁家去', '村口临时堤的上游', ['李仙昀说再劈开一处岩口，便能迅速泄水。老伯却指着你家粮仓：那条旧沟正通向仓后，山被劈开后才断过一次。', '白衣女子催他别在泥里耗着。沈凶拾起树枝画水路，胸口疼得弯着腰：“剑下去很快，水停下来可不听他的。”', '抬粮去高地慢一些，却不必再动山。你若还想借仙力省下这一趟搬运，至少得先看清旧沟的出口。'], [c('sect_keep_highland', '不再动山，叫众人把麦捆抬上高地', 'sect_settle', { clues: ['高地保粮'], resources: { harvest: 1 } }), c('sect_trial_cut', '请他试切岩口，想让泄水替代搬粮', 'sect_waterline'), c('sect_leave_dike', '带村人撤至高处，把堤交回仙门修复', 'ending_spent')]),
      s('sect_waterline', '水先钻进了仓后的沟', '新裂口与旧粮仓之间', ['岩口刚开一线，水便贴着沈凶画的旧沟往下走。你仓后第一块垫砖已湿，李仙昀收住剑，问还要不要继续。', '老伯叫人搬来门板，堵住小口尚来得及。沈凶将绳头递给你：“先搬麦。我今天抬不动，可我能给你拴。”', '这一剑还没劈到底。停手并承认判断错了，损失只是半日工；再切深，山水会直穿来不及搬空的粮仓。'], [c('sect_plug_cut', '堵回小口，改用绳索将麦捆逐批抬高', 'sect_settle', { clues: ['高地保粮', '剑口回堵'], resources: { harvest: 1 } }), c('sect_stop_all', '交还指挥，先把所有人送到高地', 'ending_spent'), c('sect_finish_cut', '坚持劈到底，仍赌水会绕开自家粮仓', 'ending_washed_harvest')]),
      epilogue('ending_washed_harvest', '一仓麦换来一条新沟', ['岩口裂开，水沿旧沟冲穿粮仓。村人都撤上了高地，麦袋却来不及搬，沉在泥里发了芽；这一季的收成没有再捞回来。', '仙门为动剑担下修沟与临时口粮，你也承认自己明知水路仍坚持开口。李仙昀留下工匠便走了，和离没有撤回，赔粮也不是重过三年的许诺。', '沈凶搬去老伯空屋养伤，你靠补衣和换工熬到春种。新沟修得很直，绕开了新仓；当初以为一剑能省下的活，最后多做了整个冬天。'], 'dark')),
    crisis('mill_share', '核对磨费和寄存麦的布条，决定拿什么扩修磨坊',
      s('mill_pledge', '这一袋还没轮到你挣', '磨坊门后的粮架', ['石匠愿修第二副磨盘，订钱要先付。你挣下的磨费还不够，架上却有邻里寄存的整袋麦，袋口布条写着来春留种。', '沈凶把那袋往里推：“上回说的是替人看粮，不是替人花粮。”老伯也留话，宁可慢转一副盘，不要动寄存的。', '扩大磨坊能多接几家活。等够磨费是一路，用别人留种的麦作抵，又是另一路；袋子的主人并未答应。'], [c('mill_wait_earnings', '只用已挣磨费，维持一副磨盘慢慢经营', 'mill_choice', { clues: ['轮值看磨'] }), c('mill_offer_deposit', '把寄存麦列作自己的订钱，先给石匠看单子', 'mill_claims'), c('mill_end_lease', '归还所有寄存粮与钥匙，结束本季合作', 'ending_space')]),
      s('mill_claims', '布条上的人来提粮了', '石匠车前的磨坊门槛', ['石匠的车还没装好，寄存粮的邻人就来了。她拿着另一半布条，说这些麦要留给春种，不卖。', '沈凶将车板扶住：“现在搬回来，订钱以后慢慢凑。”石匠也肯作罢，只收已经量过石料的工钱，不逼你交粮。', '你给出去的是一张越过主人的许诺，尚未变成真正的损失。继续装车，等于拿她下一季的田，押你的第二副盘。'], [c('mill_cancel_pledge', '撤掉订粮单，将寄存麦逐袋还原后轮值看磨', 'mill_choice', { clues: ['轮值看磨', '寄存粮归还'], trust: -3 }), c('mill_give_up_mill', '还清寄存粮与量料工钱，交回钥匙种自家的田', 'ending_space'), c('mill_ship_others', '无视提粮人的要求，仍把寄存麦交作订钱', 'ending_lost_mill')]),
      epilogue('ending_lost_mill', '第二副磨盘没进你的门', ['寄存麦送走后，邻里取回余粮，原主人收回磨坊钥匙。新磨盘被转给别处，订钱抵了损耗，你没得到它，也失去了看磨的营生。', '你拿下一季自家收成补还被挪的种粮；沈凶另接修缮活，没替你声称邻人已经同意。老伯仍会来吃饭，却不再将公共粮仓的钥匙交给你。', '水轮由另外几户轮班照管，第一袋磨费已付给新的看磨人。你挑着补还的种粮经过，亲手对好两半布条，等主人收下，再提空袋回自己的田。'], 'dark')),
  ],
};
