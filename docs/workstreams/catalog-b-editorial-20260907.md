# B 组文案续检 / 2026-09-07

## 当前范围

继续上一轮 B 编辑任务，不重复扩写或已经通过的 32 组资源压力实玩。已读取最新协调、上轮全文审读与今天独立完成的红梅结局交接；保留 `red-plum/b_village_small` 的现行版本。

本轮已读八篇现行最终编译输出的全部 74 个结局，并针对可疑项查看实际前后节点、所有入边与四篇缓存原文。候选不是直接当成缺陷：宋沐曾救过村民有原作及车夫场景依据，这一项保留。

拟修范围为 4 篇、15 个字段：虎山两种失败入路的共同因果与选前立场；村塾早退/晚退按钮的物理位置；丹房桥头的获救状态、下山后分散与碰面；海岛成功结局误提不存在的争吵。仅 B 精确文案层及 B 测试，图/费用/门槛/来源冻结。

输出独立存放于 `output/editorial/catalog-b/20260907-followup/`，不覆盖上轮 before/after、测试日志或 252 项证据。当前阶段为冻结本轮修改前实际 getWorld 与只读核验共享 HTTP；实现、测试与发布状态待实测后补充。

共享服务 4173 不重启，图片不生成、不支付。地点/时间元数据仍按此前冻结契约等待协调，不借此次文案修订改动。

## 最终结果 / 2026-09-07 04:03 China Time

**本轮源码优化已完成，新增文案尚未发布到共享服务。** 新默认交接为本文件；上轮的 252 项全文修订和今天单独验收的红梅结局是修改前基线，不重新计作本轮成果。

- 已审读现行八篇的 74 个结局，并围绕候选问题读取上下游节点、全部入边和四篇原作缓存；这是结局/分支续检，不冒称再次逐字通读全部 338 个节点。
- 本轮实际修订 **15 个字段、12 个节点、7 个可见选项**。后置 `withWorldProse` / `withWorldContinuation` 处理后的最终 `getWorld` 已核对，15 项全部生效。
- 新内容文件为 `content/catalog-b-editorial-followup.json`，由现有 B 精确修订器按旧批次之后的顺序接入；未再加一层重复适配器。旧句逐字命中才更新，七个新选项均追加修改前可见文字到 `legacyTexts`。后来的独立修订仍由精确匹配保护。
- 没有新节点、改边、改费用或放宽门槛。八篇仍为 338 节点 / 770 选项 / 74 结局，版本、源引文、原作者与旧存档兼容声明不变。没有改 `content/world-prose.ts`、共享 UI/引擎/类型、其他 catalog、红梅当前结局或美术模块。

## 具体修订

准确的 15 项旧文、新文、字段路径、理由与源锚在 [changes.md](../../output/editorial/catalog-b/20260907-followup/changes.md) 和 [changes.json](../../output/editorial/catalog-b/20260907-followup/changes.json)。各篇修改前/后最终编译正文分别在本轮 `before/`、`after/`，不是重新导出并覆盖上轮证据。

| 故事 / 节点 | 本轮发现与处理 | 原作参照 |
| --- | --- | --- |
| tiger-shelter / b_signal | 原来在选 `charge` 之前就“咽下催她扑人的话”，提前替玩家拒绝进攻。现在母亲仍盯着坡下火光，选择后再决定劝阻或催战。 | `b-tiger-name`：小橘借君寻秋之名取得庇护。 |
| tiger-shelter / b_mountain_bad | 直接查看烟笼后催战的路线未经过狼群交涉，不该被写成头狼刚拒绝开路。共同后果改为喊声、哨响、扑击打翻火把、营外枯草起火；已谈成背风路者也不再被无故毁约。旧洞失火、继续搬迁和湿冷新窝保留。 | `b-tiger-fish` / `b-tiger-name`；围猎与失火属于游戏续写。 |
| six-roots / b_stretcher、b_cart_school、b_medicine、b_watch | 四个早退按钮原来一律“收起招牌”，但玩家尚未开课。分别写明送伤者进药棚、留下安排照料、请师父安排接班。不是隐去离岗后果，`hurry` 的弃炉失败仍保留。 | `b-six-save`：原作中的重伤与替三师兄挡拳。 |
| six-roots / b_school_return | 宋沐已经离开药棚来到村塾，`slow` / `b_withdraw` 明确“陪宋沐回药棚复诊”，再进入既有休养结局。 | `b-six-arithmetic` / `b-six-save`；复诊与村塾为改编。 |
| hollow-immortals / b_copper_bridge、b_copper_foot | `leave` 未救人却能到桥头，原文“陆木匠若还走得动，便由同伴扶着”提前宣告获救。桥头只写可见杂役和树影后的脚步，`divert` 仍受救人门槛限制。真过桥后再由杂役交代陆木匠及镇上同伴，补足跳过自报家门场景时的信息。 | `b-hollow-window`；丹房、杂役、木匠属于原创。 |
| hollow-immortals / b_names_home、b_return_water | `move` 让众人各自离开，下一场却写新徒一直随主角走。现在事先约好荒地，再写新徒赶到；送信与自己接家眷的不同费用、线索照旧。未讨回车钱、没赎回田的损失仍在。 | `b-hollow-village`：白鹤村死讯与主角反应；逃离招徒车为原创。 |
| island-broadcast / b_camp_good | 这条路没有演出指控，结局却说“剪辑里那场争吵没有发生”，容易误读为另有被删掉的争吵。改写为播出秦白擦桌、苏苏切菜、八人吃饭这些实际完成的事。`perform` 仍进入失败结局。 | `b-island-radio` / `b-island-name`；分组寻找食物、单部传呼机的原作设定保留。 |

一处完整的按钮差异：`six-roots/b_stretcher/b_withdraw` 原为“收起招牌，到山下药棚休养，不再争这次名额”，现为“先把宋沐送进药棚，请师父安排往后照料”。

一处完整的衔接差异：`hollow-immortals/b_return_water/text.0` 原为“新徒没敢回去讨车钱，卖掉的田也回不来了。他跟你来到一片没人肯种的地，你蹲下贴着地面，听见很深的水声。”现为“你先到约好的荒地等。卖田的新徒赶来时，鞋底沾满了泥；他没敢回去讨车钱，田也赎不回。你贴着地面听了一会儿，地下很深处有水声。”

**核实后不改的候选**：原作明确写宋沐阻止周阳为取灵药牺牲整村百姓；`b_cart_school` 和 `b_village_road` 又通过车夫接上该村。因此 `b_school_return/welcome` 的“教被他救过的人”有依据，保留原字，未为了替换词句而删掉人物旧事。

## 本轮验证

| 检查 | 结果 / 本轮证据 |
| --- | --- |
| 适配器与非目标字段 | 新增测试逐世界只归一化这 15 项文案与新增选项别名，剩余 JSON 字段要求完整相等，包含其他正文、地点/时间、费用、门槛、版本与来源。红梅新结局也受此保护。 |
| 修改前真实存档 | 冻结 `tests/fixtures/catalog-b-editorial-20260907-before.json.gz`；59 个受影响入边/出边位置，118 次带 ID / 纯历史文本恢复，并检查重新保存与回溯重选。`paths/` 分篇保留实际路径和资源/线索。没有穷举声明。 |
| 因果负例 | 明确重放虎山“威胁头狼 / 绕过狼群冲营 / 已换背风路再冲营”；未撤出伤者的丹房路径仍不能护送过桥；陆木匠未自报姓名的成功路径；两种家眷接送的实际扣费；村塾未开课的早退；海岛演指控的失败。 |
| 既有相关契约 | `npx tsx --test --test-reporter=spec tests/catalog-b*.test.ts tests/backend-worlds.test.ts tests/resources.test.ts tests/world-prose.test.ts tests/world-continuation.test.ts tests/world-prose-contract.test.ts tests/red-plum-ending.test.ts`：**216/216 通过，0 失败、0 跳过**，见 `contracts-final.log`。原有可达性、耗尽出口、独占路线、旧版迁移及红梅单结局测试未放宽。 |
| 最终定点检查 | 类型修正后再跑 `tests/catalog-b-editorial-followup.test.ts`：**18/18 通过**，见 `focused-final.log`。 |
| 类型检查 | 完整 `npx tsc --noEmit` 退出码 **0**，见 `typecheck-final.log`。没有声称本轮执行生产构建。 |
| 最终导出 / HTTP | `npx tsx tests/catalog-b-editorial-followup-evidence.ts after` 通过。15 项实际生效，12 个节点来源哈希改变，8 篇缓存正文、标题和作者保持；当前发布差异见 `after/publication.json`。 |

保留失败历史：新增测试首跑 9/18，由运行时 `undefined` 与 JSON 序列化快照的比较，以及复用已推进的 Ink 会话造成；修正测试后通过。既有套件首跑 215/216，唯一失败是改写会合时把“没敢回去讨车钱”换成了无必要的近义短语；恢复原短语，未改既有断言。初次类型检查是新增测试把 AuthoredWorld 传给 GameWorld 辅助函数，已改用该节点的实际类型读取，没有强制类型转换或共享类型修改。

## 真实页面复核

本轮另完成上次留下的两处已发布长选项验收，不是假 API，也未注入游戏存档。当前真实 UI 从书库进入，分别在 **1440×1000 与 320×740** 逐步点击：

- `palace-ledger/b_dock/charter`：`b_enter_merchant → alone → light → hire_runner → pass`，验证长按钮完整显示、实际扣费按钮可点击并进入 `b_ship_hold`。
- `island-broadcast/b_radio_gap/high`：`b_enter_camp → water → leave → reshoot`，验证长按钮完整显示并进入 `b_wrong_turn`。

**4/4 通过，0 页面异常、0 横向溢出、目标按钮无内部裁切**。四张桌面/窄屏截图均已打开检查；窄屏选项区仍需滚动，未声称所有选项同时出现在屏幕内。实际报告：[live-long-choices/report.json](../../output/editorial/catalog-b/20260907-followup/live-long-choices/report.json)，截图在同目录。

这两个控件来自上轮修订且本轮未改，**不等于本轮新增 15 项已经做过 UI 验收**。四个截图的场景背景均为 `unavailable/degraded`，不计视觉美术通过。

## 发布与哈希交接

本轮修改前真实 HTTP 与八篇本地编译内容一致；完全字节级对象比较为 7/8，余下一篇宫账只是 `cover`、`background`、`arrival.background` 挂接为 `/generated-art/scene_02ba4bcf0ddaa29bc043edb146f4.png`。逐项保留这种美术挂接，不把它冒报成正文未发布，也不从单个 URL 推算图片总数或批准状态。

最终核对时间为 **2026-09-07 04:02:51 China Time**。本轮新增的四篇、12 节点尚未在 4173 生效：

| world | 待加载 node ID |
| --- | --- |
| tiger-shelter | b_signal、b_mountain_bad |
| six-roots | b_stretcher、b_cart_school、b_medicine、b_watch、b_school_return |
| hollow-immortals | b_copper_bridge、b_copper_foot、b_names_home、b_return_water |
| island-broadcast | b_camp_good |

- [after/summary.json](../../output/editorial/catalog-b/20260907-followup/after/summary.json)：当前通过/未发布清单。
- [after/coverage.json](../../output/editorial/catalog-b/20260907-followup/after/coverage.json)：八篇最新完整 canonical draft SHA256、源文本哈希、节点/选项/结局清单。
- [art-source-hashes.json](../../output/editorial/catalog-b/20260907-followup/art-source-hashes.json)：12 个节点的精确旧/新生产 sourceHash，投影与 `buildSceneBrief` 一致，供 root / 美术所有者对齐来源。没有构建图片提示词、提交生成任务或支付费用。

真实书库访问后，宫账、海岛缓存封套哈希发生变化，当前 `fetchedAt` 已刷新；**8/8 原文内容哈希、标题、作者仍一致**。因此最终证据比较原文内容并另记两项封套变化，不声称整份缓存文件逐字节不变，也不回滚应用刷新。变化详情在 summary 的 `cacheEnvelopeChanges`。

## 剩余事项

1. root 统一重载共享服务后，按上述 12 节点做新文案定点 UI 复核，特别是 `b_names_home/move` 和村塾早退/复诊的选项换行。本会话未重启 4173，未触碰其他工作进程。
2. 前轮列出的地点/时间展示元数据仍属冻结字段协调事项，本轮没有改动。没有新增必须改边或拆结局才能成立的已知问题。
3. 缺图仍未验收。源哈希更新数、场景节点数与图片数分开报告；本轮生成/支付/批准图片均为 0。

未提交、未重置、未回滚并行工作，也未覆盖今天已验收的红梅结局。此前全文审读、资源压力与 UI 大范围通过记录仅作为历史证据引用。
