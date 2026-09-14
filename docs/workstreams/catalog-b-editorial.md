# B 组全文审读与因果修订

2026-09-07 续检交接：[catalog-b-editorial-20260907.md](catalog-b-editorial-20260907.md)。该轮新增 15 个定点修订字段与当前验证证据；下方 252 项全文修订及其日志保留为 2026-09-06 历史，不覆盖。

## 本轮范围与进度

- 已读当前协调与最新 `catalog-b.md`。此前完成的是真实 UI 与资源压力验收，以及若干定点修订；工作区没有同范围的全文审读交接。本轮从最终 `getWorld` 导出开始，不重复扩图或 32 组压力实玩。
- 审读包含八篇的原文节选、开场、两条新路线及全部旧线、选项/提示/反馈、资源说明、所有结局。机器清单只用于覆盖核对，不代替阅读判断。
- 仅修改 B 所有者文件和新 B 专属工具/测试；保留现有适配器与最终 `withWorldProse`。图、ID、费用、门槛、来源和旧存档均为冻结契约；图问题先报告协调。
- 当前阶段：导出修改前最终文本到 `output/editorial/catalog-b/before/`，逐篇记录可复现的文案问题。尚未宣称修订或发布通过。
- 不重启 4173、不改共享 UI/引擎、不请求图片。场景数与图像交付数分别报告。

## 已完成修改前通读

- 已逐篇读完 `before/{temple-heart,tiger-shelter,six-roots,palace-ledger,red-plum,hollow-immortals,island-broadcast,wrong-realm}.md`：338 节点、770 选项、74 结局，包含旧线；八份缓存节选也在各篇开头完整列出。缺失的截断工具输出另行分段补读。
- 最终顺序还含 `withWorldContinuation`，不止 `withWorldProse`。后者的成年念念身高、小林动作、部分共享结局也在本轮审读范围。新增 B 适配器将只覆盖已冻结的准确文本，保留其他并行修订。
- 初步重点：寺庙的纸契/火/母女位置；鱼池原鱼死亡之说与小橘吃鱼事实；算术与村塾选项提前执行答案；宫中探亲手续和客船费用；红梅救人位置、板车与晚期退守；铜柱供液方向、令牌重复丢弃；海岛食物搬运和晚期停任务；错位面还剑与冷藏失败的区分。
- 另记录两类非正文契约问题供 root 协调：若干开场地点沿用旧线地点（如 hollow 的卧房与实际洞府、island 的茅屋与实际林地）；月份推进后时间栏仍为“时限内”。现有共享玩法投影冻结 location/time，本轮先不动这些字段，不通过放松其断言消除问题。

以上为本轮早期记录，保留以便追踪；最终交接如下。

## 最终交接 / 2026-09-06 12:38 China Time

**源码审读与修订已完成；共享 UI 发布仍待 root 统一加载。** 本轮不是上一轮 32/32 压力实玩的重复，也不是再次扩图。下面的数量与检查均来自本轮 `output/editorial/catalog-b/`，不沿用此前 444 项测试或生产构建结果。

- 逐篇通读修改前的最终 `getWorld`：8 份缓存原文、24 段介绍、338 个节点的 684 段正文、770 个选项、74 个结局、24 条资源说明及机制说明。当前最终 B 没有独立 choice hint/feedback 或 challenge 字段，核对结果均为 0，不把不存在的内容记作已读。
- 定点修订 **252 个文案字段**，涉及 **156 个节点、119 个可见选项**；不是 252 个独立缺陷，也不是 156 张图片。修改后重新从最终 `getWorld` 导出，252/252 项实际生效，无被后置适配器覆盖的项。
- 完整前后文本：[before/](../../output/editorial/catalog-b/before/)、[after/](../../output/editorial/catalog-b/after/)。全部准确旧文、新文、原因和源锚：[changes.md](../../output/editorial/catalog-b/changes.md) / [changes.json](../../output/editorial/catalog-b/changes.json)。[coverage.json](../../output/editorial/catalog-b/coverage.json) 列出逐篇已读节点、结局及完整哈希；没有用关键词次数代替文学审读。
- 保持 338 节点、770 选项、74 结局；16 条独占路线、失败结局、费用、资源上下界、门槛、效果、版本与来源契约未改。`island-broadcast` / `wrong-realm` 仍为 2.0.1，其余六篇仍为 2.0.0。

### 逐篇覆盖与阅读判断

| world ID | 节点 | 选项 | 结局 | 修订字段 | 涉及节点 | 改名选项 | 前后存档位置 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| temple-heart | 43 | 98 | 10 | 36 | 20 | 16 | 67 |
| tiger-shelter | 42 | 97 | 9 | 13 | 9 | 2 | 67 |
| six-roots | 42 | 96 | 9 | 32 | 20 | 15 | 85 |
| palace-ledger | 43 | 96 | 10 | 38 | 22 | 16 | 78 |
| red-plum | 42 | 96 | 9 | 25 | 14 | 11 | 75 |
| hollow-immortals | 42 | 95 | 9 | 39 | 27 | 20 | 93 |
| island-broadcast | 42 | 95 | 9 | 32 | 21 | 16 | 92 |
| wrong-realm | 42 | 97 | 9 | 37 | 23 | 23 | 96 |
| 合计 | 338 | 770 | 74 | 252 | 156 | 119 | 653 |

- **寺庙**：保留毓娘求救与主角学着照料的动机，以及运粮/返山两条不同的行动链。重点核对纸契、母女位置、灵火、已送到的米；晚退不撤销运粮成果，焚契后不再写回旧钟与旧契。债务结局仍需母女承担代价，不改成轻松团圆。念念在本局已经成年，门闩一段改为恢复力气，未改缓存中的原作年龄或冒充原作后续。
- **虎山**：保留吃鱼惹祸、寻求家人庇护和山中围猎的不同压力。鱼池另批死鱼与被小橘吃掉的两条鱼分开，饲养人不再借案情讲伦理。借款确实附带做工；威胁头狼的失败经过喊声、哨声、母虎扑击和枯草起火，而非一句抽象“拿怒气当爪牙”直接跳到烧洞。已经谈成边界的晚退不重启围猎。
- **六根**：保留替战的胜负与伤者、村塾的后续生活。题目前不预先完成正确答案；只卖答案的人没有获得“村民会复算”。离药炉追回名额明确为独自离岗。赛场失败交代第二副担架是主角，资格损失是本场落败的结果；宋沐仍活下来。教室与治疗的后续用实际照看、房钱和劳动接续，不宣讲输赢的道理。
- **宫账**：保留女主收回支配权及出宫做生意的动机，也保留赔损、签掉分红等不舒服的结果。分工资不在玩家决定前自动发出；催信和舱位另费有实际事由。轻装者不凭空背首饰大箱，探亲牌、销牌和退居书各自交代。失败是扣船、错过水路、遣散船工，不把比喻中的船写成被本人压坏。
- **红梅**：保留母亲依赖闹闹、又需要把她带回身边的矛盾。门被柜子堵住便从小窗进入；菜棚后墙失窃不抹掉前门守卫。板车尚未卸下前给玩家保留重载决定。较早失败没有预先救到老王，后文由胡医生与邻人救回。渡河后胡医生通过船家捎话，不瞬移到对岸；退守须先靠岸。
- **空仙**：保留看见异物后的恐惧、铜柱救人与下山拦招徒的两种选择。区分供液与抽取方向、魏旻与璇玑的称呼，处理令牌和外袍只各一次。打散药丸不等于众人已经看见虫卵；成功门槛仍锁着。共用撤退结局不假定人人获救，也不说已经离开的人又全上了山；已经付出的救人行动不被一句总结抹掉。
- **海岛**：保留晚饭分工、导演催拍和潮滩风险的实际冲突。拿食物、搬食物、带谢骁找人都在选项或此前行动中交代；原作只有一部传呼机，通过节目组转问而非添一部。玩家选配合或拒演前，人物没有提前表态。已吃晚饭/修好屋顶的晚退保留成果；王玥已上岸后不再落回海里等待重复营救。
- **错位面**：保留索剑赔药与带药离宗的不同目标，不淡化冷藏失败及身体损伤。证人未表态前仍可被迫沉默；“只结药”明确还剑，后续不重复交还。外门弟子的钥匙待交换后才拿到。药已入用的晚退只是结束后续安排，不取消已经完成的治疗；普通出山也有过门手续，不直接穿过封山阵。

### 代表性准确旧文 → 新文

以下均为本轮最终输出的实际差异，完整 252 项见 `changes.md`。路径中的选项名是稳定 choice ID，不因改字而更换。

| world / node / choice 或字段 | 原文 | 新文 | 修复理由 / 原作源锚 |
| --- | --- | --- | --- |
| temple-heart / b_home / b_withdraw | 敲邻家的门，请他们接手今晚，放弃赶渡口 | 请邻人接手后续照料，把送到的东西留给母女 | 此时米已送回，不能倒回未过渡口；`b-temple-bargain`、`b-temple-hesitation`。 |
| tiger-shelter / b_repay / borrow | 借山中人情先赔一部分，立下归还日期 | 借山中人情先赔一部分，余款仍按做工抵还 | 同一效果授予“赔鱼劳约”，必须让玩家知道还要做工；`b-tiger-fish`、`b-tiger-name`。 |
| six-roots / b_grain_class / text.1 | 大师兄在地上摆石子，一堆堆移过去。等他抬头，最后一排的人也跟着算出了结果。 | 大师兄在地上摆开石子，一堆堆移到秤边。最后一排的人探着头，还没看清为何要分这几堆，等你往下讲。 | 只有随后教复算的选择才赋予能力；`b-six-arithmetic`、`b-six-save`。 |
| palace-ledger / b_dock / charter | 另付两份银票雇小船，不误商船 | 付两份雇小船先走，行李舱位的费用另结 | 下一场真实扣费不再看似重复收取同一船费；`b-palace-box`、`b-palace-feet`。 |
| red-plum / b_shed_key / give | 留一份菜粮给张婶接手，换堤路的消息 | 交钥匙并留一份菜粮，请张婶接手、指明堤路 | 明说钥匙也交给张婶，而非暗中执行第二件事；`b-plum-chilli`、`b-plum-doll`。 |
| hollow-immortals / b_broken_cart / text.0 | 管事要关车门，新徒抱住车辕，问那东西进了肚子怎样取出来。管事催他上车，他又问一遍，抱得更紧。 | 管事要把新徒拖上车。新徒反抱住车辕：“先把药说清，吃下去的究竟是什么？”管事不答，只催他松手，他便抱得更紧。 | `snatch` 没让新徒看见虫卵，仍然只能怀疑药物；`b-hollow-village`、`b-hollow-window`。 |
| island-broadcast / b_radio_gap / high | 借高处重新呼叫，问王玥看见哪块标牌 | 登高请节目组转问王玥位置，再同谢骁带食物去找她 | 明说呼叫之后的转移、同行者和食物去向；`b-island-radio`、`b-island-name`。 |
| wrong-realm / b_walk_realm / b_withdraw | 转去山脚驿舍求助，放弃最快的修复窗口 | 停下余下安排，留在驿舍请医修接着照看 | 灵芝已经入药，不再抹去治疗；`b-realm-root`、`b-realm-bet`。 |

结局的一个具体示例：`palace-ledger/b_merchant_bad/text.1` 原为“父亲把你接回旧宅，变卖一处分号填上损失。你总算离了宫，却仍拿宫里的身份替别人作担保，亲手压坏了原本能载你走远的船。”现为“父亲请人将你接回旧宅，卖掉一处分号赔误期的货款。商船解扣时已赶不上那季水路，掌柜遣散了半船人。你在旧宅替他核最后一笔工钱，名册上有个船工正是那晚替你搬箱子的。”保留损失，让代价落在人、工钱与错过的船期上，不再追加道德裁决。

### 原文与改编边界

缓存 `story-<storyId>.json` 均只读。八篇内容哈希及缓存封套哈希见 `coverage.json`；源文本、原作者、来源 URL、16 个引文锚点及原创改编标识均由契约检查确认不变。源锚用于核对起因与已有事实，**不声称新增交易、角色行为及结局来自原作**。

| world | 缓存 storyId | 原标题 / 作者 |
| --- | --- | --- |
| temple-heart | 2025954672918163637 | 吃人心的小妖怪 / 女巫 |
| tiger-shelter | 1962166083206242442 | 咪假虎威 / 反骨 |
| six-roots | 1760265980192886784 | 学科修仙 / 六酒 |
| palace-ledger | 1793742089336532992 | 00后整顿后宫 / 苏荔 |
| red-plum | 1930445234262750503 | 俺妈和她的丧尸闺女 / 归像 |
| hollow-immortals | 1558118587956662272 | 杀仙成道 / 满目山河依旧 |
| island-broadcast | 1783485301039054849 | 穿成十八线女星我坐鳄鱼全网爆火 / 不吃鱼的喵 |
| wrong-realm | 1716453753710972928 | 我在修真界掏出了AK47 / 风吹过你的心窝 |

### 实现与旧存档兼容

- 新增 `content/catalog-b-editorial.ts` 与 `content/catalog-b-editorial-data.json`，只在 `content/catalog-b.ts` 的现有 `correctBLiveProse` 后追加 `.map(withCatalogBEditorial)`。未编辑 `content/world-prose.ts`、两个共享文案映射、UI、引擎、worker/types 或其他目录的故事。
- 正确顺序为：B 扩写 → 旧选项润色 → 前轮现场修订 → **本轮 B 精确修订** → 共享 `withWorldProse` → 共享 `withWorldContinuation`。B 修订器只对目标字段计算两层共享映射后的文本，命中本轮冻结的准确旧句才改；较新的并行句子不覆盖，也不提前运行共享层处理其他字段。
- 119 个选项将已有别名、B 原始旧句及最终界面旧句追加到 `legacyTexts`。同步 ending 的标题/末段镜像，不改任何路由或效果。旧 1.0.0 兼容与已存在的 2.0.0 兼容声明保留。
- 本轮冻结的真实前版 final world 存于 `tests/fixtures/catalog-b-editorial-before.json.gz`，不是从新版删字段倒推出“旧版”。导出工具禁止覆盖 `before/`。后续重跑证据不会改变迁移基线。
- 只调整两份 B 旧测试 `tests/catalog-b-live-prose.test.ts`、`tests/catalog-b-migration.test.ts` 中资源定义比较：通过 B 专属 `resourceContract` 排除自然语言 `description`，仍比较 ID、标签、初值和上下界；新增负例验证这些字段仍能报错。根会话已修复的共享断言没有再次改动，图可达性、消耗、门槛及耗尽出口断言没有放松。

### 本轮验证

| 检查 | 实际结果与证据 |
| --- | --- |
| 新增编辑专项 | 首跑 24/26，两个新测试选了已耗尽资源的到达路径；修正为真实可执行的分支证据后 26/26。未调整路线/扣费。保留 `focused-first.log` 与 `focused-corrected.log`。 |
| 受影响路径前后对照 | 653 个唯一位置；每个分别恢复带 choiceId 和仅历史文本的旧存档，共 1306 次恢复，并重存/回溯重放。`paths/<worldId>.json` 保留实际 choice ID 序列、前后段落、资源、线索与可用选择；不宣称穷举所有路径组合。 |
| 既有契约套件 | `npx tsx --test --test-reporter=spec tests/catalog-b*.test.ts tests/backend-worlds.test.ts tests/resources.test.ts tests/world-prose.test.ts tests/world-continuation.test.ts tests/world-prose-contract.test.ts`：**196/196，0 失败、0 跳过**；见 `contracts-final.log`。含原有独占路线、真实 Ink 全图可达、所有结局、自然耗尽、v1/v2 迁移及共享后置文案层。 |
| 类型检查 | B 范围 `npx tsc --noEmit -p output/editorial/catalog-b/tsconfig.json` 通过；最终完整 `npx tsc --noEmit` **退出码 0**，`typecheck-final.log` 无错误。此前共享 App props 不匹配的失败日志仍保留，随后并行所有者已修好；本会话未编辑 App。没有把旧构建结果算作本轮构建。 |
| 最终实际导出 | `npx tsx tests/catalog-b-editorial-export.ts after`；`npx tsx tests/catalog-b-editorial-evidence.ts`：252/252 个准确替换生效，0 失配；`summary.json` 时间 2026-09-06T04:33:16.969Z。 |
| 窄屏单次冒烟 | 真实书库进入 `red-plum`，`b_enter_ferry → light → lock → b_ditch`；320×740，已有技能客户端，没有拦截 world API 或注入存档。已打开 `output/playwright/catalog-b-editorial-smoke/shot-0.png`，正文可读、继续按钮可见。此节点首段不是本轮新改文本，因此只证明现存界面可操作，**不证明 252 项文案已发布，也未验证全部新增长按钮的换行**。 |

新增测试既检查非文案契约，也以实际状态验证：已送米/已焚契、劳约、村民是否会复算、轻装船费、重板车与钥匙、虫卵门槛、已修屋顶/吃饭、已入药/已还剑。不是把每句新文复制到测试中逐句自证。

### 给 root / 美术所有者的哈希通知

八篇 final draft 与编译输出的完整 canonical SHA256 均在 `coverage.json`，每篇有 `beforeDraftSha256` / `afterDraftSha256`、`beforeFinalSha256` / `afterFinalSha256`。新 draft 摘要如下，完整值以机器清单为准：

| world | afterDraftSha256 前 16 位 |
| --- | --- |
| temple-heart | 464acb50c0dd3d7d |
| tiger-shelter | 0223bc408f5095f1 |
| six-roots | 0b4d50954e1729ed |
| palace-ledger | 1d4d01163010d18d |
| red-plum | 9733e4e5d859810b3 |
| hollow-immortals | 8af70496cba84211 |
| island-broadcast | ca3fb47ecb91c096 |
| wrong-realm | 8d680ac880c33af4 |

[art-source-hashes.json](../../output/editorial/catalog-b/art-source-hashes.json) 精确列出 **156 个节点**各自的旧/新 production sourceHash；哈希投影与 `buildSceneBrief` 一致，未生成 prompt、提交任务或调用图片接口。该清单仅供既有美术所有者核对来源变化，不表示这些节点有图片，也不表示需要新增 156 次付费请求。导出器 `inventory.json` 使用 JSON 插入顺序哈希，不能与上述 canonical 哈希混比。

### 尚待协调 / 未验收项

1. **发布**：请 root 在共享占用窗口允许后统一重载，再用实际 world API 与本轮 after 快照核对；本会话没有重启 4173。随后只需复核受影响的具体场景/长选项，不必再泛跑上一轮全部压力路线。原文返回、存档/回溯及结局重开的大范围 UI 结论仍引用旧 `catalog-b-live-acceptance.md`，不是本轮新测试。
2. **地点/时间展示元数据**：仍有下表的确定错配。它们被现有 `tests/world-prose-support.ts::gameplayContract` 与旧版资源/迁移投影保留为冻结字段；本轮没有借编辑任务放松契约。请求 root/契约所有者协调单独的纯展示元数据变更，保留边、费用与门槛后再验存档。下列为提案，**没有实施**：

   | world / node | 当前字段 | 正文事实 / 拟协调值 |
   | --- | --- | --- |
   | palace-ledger / arrival | location=皇后寝宫 | 人物在太后榻前；拟为“太后寝殿”。 |
   | hollow-immortals / arrival | location=弟子卧房 | 紫檀窗和师父在长老洞府；拟为“长老洞府”。 |
   | island-broadcast / arrival | location=临时茅屋 | 鸟、松鼠与谢骁仍在树林；拟为“林间小路”。 |
   | temple-heart / b_breakfast | time=时限内 | 雨停后的清晨；拟为“次日清晨”。 |
   | palace-ledger / b_return_letter | time=时限内 | 出宫后的三日牌期限正在约束回信；需与同线日期展示一起核定，不擅自加“第三日”事实。 |
   | wrong-realm / b_night_realm | time=时限内 | 正文明说“治疗之后的第一晚”；拟为“治疗后第一夜”。 |

   同类晚期节点的“时限内”标签需统一检视；本轮已把正文与资源说明中的行程工夫、次日和后续照料讲清，但未把标签问题冒报为解决。没有发现仍必须拆节点/改边才能处理的本轮正文因果缺陷。
3. **美术**：窄屏截图背景为 `unavailable/degraded`，有大块空背景。玩法文字可读不构成视觉接受；本轮图片生成、支付、批准均为 0。新文案长按钮和相关画面需 root 重载后继续定点视觉复核。

本轮未提交、未重置、未清理共享输出、未重启服务，未编辑其他所有者的模块。新默认交接为本文件；前轮 live/resource-pressure 报告仅保留为先前证据。
