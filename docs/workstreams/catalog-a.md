# Catalog A — 因果张力与失败结局补修

## 继续优化 / 2026-09-07

- 已重新抓取共享服务的八篇 A 组世界：仍为 `1.1.0`、各 37 节点。当前服务已经加载 `score-room/ending_broken_study` 的首段修订；响应字节变化来自共享续写适配的既有节点正文，不在本线修改共享适配器。
- 新增 `tests/catalog-a-live-delta.ts`，将前次完整浏览器批次与本次只读服务抓取逐项对照：正文允许变化，但节点、选项 ID／目标／效果／条件、旧选项回放文本、资源、来源署名、可达图和 16 对失败／补救终局状态必须完全保持。报告写入本次抓取目录，作为选择性浏览器复验依据。
- 浏览器验收脚本新增 `--failed=ending_a,ending_b`：仍抓取并预检八篇服务世界，只将实际 UI context 限定在指定的失败／补救对；逗号与 PowerShell 展开的空白列表均会解析为同一严格 ID 白名单。它与 `--retry-from` 互斥，避免把不相同的复验范围混入旧批次。
- 选择性浏览器复验发现共享前端将终局来源区从 `.ending-source` 改为具名 region `原作与这次改编`；已用语义定位并保留旧类回退。中止的首批 6 例都已实际到达预期终局，失败仅在终局底部截图定位，不能计为通过；失败目录保留，修正后从新 context 补跑。
- 当前服务的 24 节点／25 段续写正文已完成针对性浏览器复验：八对受影响的失败／补救分支，在桌面与手机共 **32/32** 通过；274 次真实剧情点选、320 个 API `GET 200`、32 次原文往返、320 张截图，零页面异常和零布局问题。最新目录：`output/playwright/catalog-a-live/2026-09-06T19-56-54-750Z/`；精确路径、当前边界和增量审计写入 `docs/workstreams/catalog-a-live-acceptance.md`。
- `tests/catalog-a-live-delta.ts` 对前次完整浏览器批次与当前服务捕获通过，确认全组仍为 **296 节点、751 选项、64 结局、17 dark**，32 条失败／补救终局状态与来源署名不变；只识别到上述 25 段正文变化。A 专项测试 **51/51** 通过。全库 `tsc` 被并行的 Catalog B 文件 `tests/catalog-b-editorial-followup.test.ts:157` 类型错误阻断，未改动其所有权文件，故不报告本轮生产构建通过。

> Root 集成提示：此前仅修订 `content/catalog-a-crises.ts` 中 `score-room/ending_broken_study` 首段一句不自然的转折，替换为“卷面分数没变，你的名字却从下周的答疑值班表上划掉了”。节点、选项、效果、正文段数和版本均不变；新增旧 1.1.0 同版本恢复回归测试。该句现已由共享服务加载并在 2026-09-07 的当前 UI 批次复验；A 组未重启服务。

## 本次续跑交付 / 2026-09-06 12:20

- 16 对失败／补救终局在 1440×960、390×844 完成 **64/64** 实际 UI 用例；32 对最后决策状态相同，574 次剧情点选，269 次 GET/200。手动存档导出、重载、回溯、重新开局与原文逐字往返均有实际证据。
- 正式批次 64 + 41 + 2 个隔离 context，最终取 23 + 39 + 2 条通过证据；旧失败记录保留。新默认索引：[acceptance-summary.json](E:/知乎/output/playwright/catalog-a-live/2026-09-06T04-13-44-426Z/acceptance-summary.json)。
- 本轮不增节点，现有规模仍是 **8 世界、296 节点、232 决策场景、751 选项、64 结局、17 dark**，其中 16 个是上轮新增的失败结果。八篇各 37 / 29 / 8，原来源不变。零 dark 的原始审计与旧边保存契约仍见下方写作交付。
- 历史批次曾通过 **51/51 A 专项测试**、TypeScript 和生产构建；当前 2026-09-07 批次再次通过 51/51，线上已加载该句。当前全库 TypeScript 状态以本页最新段落为准，不能沿用这条历史构建结论。
- 自动布局检查无遮挡；人工查看八篇手机联系表及桌面长文本抽样。**64 个终局背景均为 unavailable**，未完成插画验收、未花费图像额度。外部字体有一个终局截图仍处加载状态，已另列证据。
- 完整路径、作者／来源边界、截图索引、重跑来历与 root 待办：[catalog-a-live-acceptance.md](E:/知乎/docs/workstreams/catalog-a-live-acceptance.md)。没有提交 git、没有更改共享测试、前端或服务，也没有重启共享进程。

## 浏览器续验 / 2026-09-06 11:40

- 本轮继续既有 1.1.0 的真实浏览器验收，不扩张节点或改写已发布分支。此前写作交付与测试结果保留在下方，均不是本轮新结果。
- 已读最新 coordination 与 `catalog-a-live-acceptance.md`。改用单条 cmd.exe 命令后执行器恢复，八篇真实接口返回 1.1.0、各 37 节点；本轮原始响应与 SHA-256：`output/playwright/catalog-a-live/2026-09-06T03-38-18-788Z/served-manifest.json`。
- 本轮 `npx tsc --noEmit` 已通过。首条浏览器试跑遇到测试端的 `__name` 序列化错误，未抵达故事结局；已将布局测量的嵌套浏览器函数隔离于 tsx 转换，并增加接口请求超时。失败证据保留在 `output/playwright/catalog-a-live/2026-09-06T03-38-45-502Z/`，不计为通过。
- 继续通过页面原生操作验收 16 对失败与补救终局、原文往返和存档回退。没有付费请求、共享代码改动或服务重启。

### 11:47 进展

- 桌面试跑 `2026-09-06T03-43-19-613Z` 已完整通过：失败终局、原文逐字往返、原生存档导出、重载后载入、补救终局、回溯、收集记录和重新开局。
- 本轮 A 组专项测试 50/50 通过，含全部旧边存档迁移、两阶段预警、零消耗补救及资源耗尽遍历。
- 完整 64 用例批次正在 `output/playwright/catalog-a-live/2026-09-06T03-44-21-729Z/` 运行。完成数以该批次 results.json 为准，尚未宣告全部通过。
- 新增只读验收汇总 `tests/catalog-a-live-review.ts`：对照每对相同最终决策状态、实际响应字节、缓存正文、API GET、原生导出和截图，并制作本轮截图联系表。联系表仅供检查，不属于新场景插画。

### 完整批次中的字体等待问题

- `2026-09-06T03-44-21-729Z` 批次出现首页 `page.goto(... waitUntil: load)` 和截图等待字体的 15 秒超时。失败保留于各 result.json；不是所涉故事已经通关，也不是故事分支断裂。已完成的故事路径继续正常通过。
- 验收脚本改用 DOM 就绪后等待原生可见控件；截图不再无限等待外部 Google Fonts，记录截图时真实的 FontFaceSet 状态。仅调整 Playwright 等待，不注入样式、不替换字体、不拦截请求。仍需人工检查实际显示字形与布局。
- 增加 `--retry-from=DIR`：只接受已结束批次，只有实际接口 SHA 完全一致且无布局/页面错误的通过项才可沿用，其他项用新的隔离 context 从书库重跑。最终索引会明确记录前轮目录、沿用数与新执行数，原始失败记录不删除。
- 此后共享前端将序章按钮由“以……的身份醒来”改为“开始故事”，旧进程的《网恋对象真是霸总》用例因此停在已加载的序章。FAILURE.aria.txt 已记录真实按钮文字。A 组选择器兼容两种文案，相关用例重跑；未改共享 App 或撤回其他会话的文案修正。

### 12:05 重跑与本地复验

- 首批 64 项已结束，原进程与浏览器正常退出。开始 `output/playwright/catalog-a-live/2026-09-06T04-05-02-792Z/` 重跑批次；八篇实际接口 SHA 仍与首批相同，未把本地微调冒充已加载。
- 含一句文案修订后的 A 组专项测试 **51/51** 通过；`npm run build` 通过（1598 模块，存在共享前端 500 KB 包体告警，未扩大改动范围）。
- 汇总脚本分别记录真实故事 GET、外部资产请求问题、截图字体状态，以及本地／线上 `ending_broken_study` 首段差异；最后一次改动后来已由共享服务加载并复验。
- 重跑暴露一处验收路径表错误：`canal_withdraw_seal` 后拥有的是“家人先行”，对应 `canal_guard_family -> ending_exile`，不是需要“支流离京”的 `canal_exile`。页面正确禁用了后者，并保留两个可用出口。只修测试路径，未改游戏条件；新增实际接口 Ink 条件预检，相关桌面／手机两项下一轮补跑。
- 人工检查手机端 `black-flood/arena_original`：灵药 0、契合 0，仍显示三个完整选择；归还缺页后可以退出或补救，失败不是耗尽资源后被强迫触发。图片证据：本轮重跑目录下 `black-flood--ending_lost_class--mobile--failed/06-last-decision.png`。当前背景状态显示 unavailable，这不是独立插画交付，汇总中另列资产状态交美术线。

**状态：本轮已完成并验证。** 新默认为 Catalog A `1.1.0`：八篇各 37 节点、29 个选择场景、8 结局；新增 16 个有两阶段预警和零成本补救的失败结局，全组最终 17 dark。131 项测试及构建通过，旧存档迁移通过。未请求图片、未重启服务；运行中进程的加载由 root 统一处理。

## 启动记录 / 2026-09-06（历史进展）

- 已读取 `coordination.md` 与前一轮 `docs/catalog-a-route-rewrite.md`。继承八篇各 31 节点、25 个选择场景、6 个结局的基线，不重做已完成的独立分支。
- 正在逐篇读取完整缓存节选、全部现有场景与图测试；本轮重点是核实零 dark 结果、为各篇补至少两个有预警和补救机会的失败收束，并润色人物行动与对白。
- 保留原文件未提交改动、原始署名及来源范围；新增后续属于改编。原节点/选择 ID、效果、条件和去向优先保持，新增危机用新入口；改名保留准确 `legacyTexts`。
- 只写 `content/catalog-a.ts`、A 组专属新模块/测试及本报告。不改共享断言、注册、前后端；不提交、不重启 4173、不请求付费图片。
- 验证与最终精确统计待本轮实际执行后补录；历史 280/280 为 root 的上一轮集成结果，非本轮成果。

## 中期进展（历史记录，验证完成情况以下文为准）

- 已逐篇读完 8 份缓存的完整 `data.content` 及 `introduction`，也读完并枚举原有 248 个场景。`introduction` 中的后续梗概不当作原作后续正文。
- 磁盘与直接 `compileWorld` 的实际基线为：七篇 0 dark，《西游》2 dark。其中 `ending_spent` 是暂停误标，`ending_bargain` 停在悬念上；与任务交接所说“零 dark”有快照差异，但实质缺少合格失败结局的问题成立。保留这个真实审计结果，不改写历史统计。
- 已冻结 `tests/catalog-a-v1.fixture.json`，含原 248 节点、639 条选择与完整原世界定义。保留旧结构，在每条独立路线的第 5 或第 6 个场景追加两段危机及一个失败结局：共新写 48 节点、112 条选择，不重做前轮路线。
- 每篇当前 37 节点、29 个选择场景、8 结局；两条路线各 8 个专属选择场景，互不相交。新增 16 个 dark；《西游》休息退出改为 uneasy，旧交易 dark 补完收束。正常休息、交接或分手不作失败。
- 同步补完旧结局与正文连续性：包括福顺留宫记账而非随队涉水、湿麦先晾干再磨、补基础与晋级的分项成绩、天门留隙最终封门、回流槽先实测再断后。选项改名逐层保留精确别名。
- 旧 ID / 目标 / 效果 / 条件未改，但新选择和线索改变活动存档中的 Ink 状态，因此明确使用 `1.1.0` + `compatibleSaveVersions: ['1.0.0']`，而非沿用原版本号赌状态兼容。
- 原有 A 路线 8 项已通过。首次新测试已验证全部旧存档迁移；8 个反事实测试因复用已前进的 Ink 引擎触发过期选项保护，正在改为从同一决策前存档分别恢复，未动共享引擎或断言。

## 最终交付 / 2026-09-06 / Catalog A 1.1.0

本报告是本轮新默认交付。`docs/catalog-a-route-rewrite.md` 保留为前一轮 31 节点基线，不覆盖其历史记录。

八篇总计 **296 节点、232 个选择场景、751 条选择、64 个结局、17 个 dark**。每篇新增两条有预警与挽回选择的失败线；每条独立路线现有 8 个专属选择场景（原 6 + 危机 2），两路之间无非结局节点交集。

| 世界 ID | 节点 | 选择场景 | 选择 | 结局 | dark | 可区分路由状态 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| happy-home | 37 | 29 | 93 | 8 | 2 | 1577 |
| rotten-pilgrimage | 37 | 29 | 93 | 8 | 3 | 2263 |
| ming-whisper | 37 | 29 | 96 | 8 | 2 | 1506 |
| score-room | 37 | 29 | 95 | 8 | 2 | 2150 |
| online-heir | 37 | 29 | 90 | 8 | 2 | 1925 |
| black-flood | 37 | 29 | 93 | 8 | 2 | 2787 |
| radish-court | 37 | 29 | 96 | 8 | 2 | 1789 |
| harvest-box | 37 | 29 | 95 | 8 | 2 | 1843 |
| 合计 | 296 | 232 | 751 | 64 | 17 | 15840 |

继承全部 248 个旧节点与 639 条旧选择；本轮新增 48 节点、112 条选择。另修订 58 个旧节点的正文（含 37 个旧结局），改写 58 条旧选择用语并保留其精确 legacyTexts。没有删除或改动旧选择的 ID、效果、条件与目标。

### 失败设计与零 dark 审计

- 接手实测并非全组字面零标记：七篇为零，《西游》的 `ending_bargain` 与 `ending_spent` 为 dark。后者仅是休息，前者仍是悬念，均不作为本轮新增失败量。
- 本轮确实新写并验证 16 个失败结局。《西游》的休息退出改为 uneasy，旧交易 dark 补为不可逆角色命运，故最终 dark 为 17，而不是将 16 个原退出点改色凑数。
- 新失败在进入两段独立危机、获得两条实际 Ink 前置事实后才可选择；每段都有至少两条零资源成本的止损/交接路线。换用另一条选择可实测回到既有可玩路线，不靠旁白假装有退路。
- 轻故事的损失是资格、项目、信任、生计或关系终止。正常休息、拒接任务、保留私事、拒绝供养、主动分手仍走非 dark；没有新增任意暴力惩罚。

### 原文边界与完整缓存核读

阅读的是本地接口缓存中的完整节选，非整部小说。下表 SHA-256 对 `data.content` 的 UTF-8 字节计算；字数按 Unicode 码点计。完整来源标题、作者、storyId、原 URL 与冻结基线逐字段相等，缓存文件未改。

| 世界 | 缓存 ID | 原题 / 作者 | 节选码点 | content SHA-256 |
| --- | --- | --- | ---: | --- |
| happy-home | 1747681485547843585 | 近视眼勇闯恐怖游戏 / 沈南因 | 3000 | `1246b3195bf94e22a4ce42ec53030db83909fe0746a68713f725531b24c88dae` |
| rotten-pilgrimage | 1617220591035113472 | 西游之众佛腐烂 / 杀不死的林海仙 | 3000 | `2a9e22b5343b038469a1354d63c26775f2866f4dbb02557361a865759e180827` |
| ming-whisper | 1654134122145320960 | 穿越大明，我被崇祯偷听心声 / 凉风有信 | 2630 | `42b7adf7e042eb3c75f8decbc285eadddbaec90cb031e4673c1daa340e7dc64e` |
| score-room | 2050600604976803918 | 不提分就出不去的房间 / 灯灯 | 3000 | `10bf691ab5d52029894c5ffff102a6cc311ced26d4a0c75b9783a69a8f4bef44` |
| online-heir | 1981680284933063553 | 网恋对象真是霸总 / 北瓜 | 3000 | `ec7fd80627497aa8519ac36b7ca22bac8b0815a67142b02457f700c2728a14b8` |
| black-flood | 1775834953454288896 | 重生后，我抢了师妹的灵兽 / 花花在画画 | 3000 | `878513f25ac5f8b10003e1eed6f2e6d310fe5709159f531c61a7bdcc2e7c5e82` |
| radish-court | 1985108790006277782 | 端妃黑又壮 / 重十八 | 3000 | `24462422e36103830f6243f835f4d785d0422c9455db1cfc9d6eabded8b02970` |
| harvest-box | 1986486345988851330 | 山回路转不见鸡 / 旺旺大队长 | 3000 | `6b63be956e1f7b6c79139584120d3e4256c1419202a50874c6b9707324fd52c4` |

- **happy-home**：正文止于男主人回家后的冲突；沿用前轮明确的成人化角色改编。消防联络、名单、天台与结算后生活均为续写。
- **rotten-pilgrimage**：正文止于小白龙回到深度异常的龙宫；假观音关于师门的指控不当作原文事实。撤宫、守天门、师门命运与灾变封护均为改编收束。
- **ming-whisper**：正文止于周鉴开始不舍家人；心声、败报、雨阻断粮与周父惜财来自节选。船札、军营点兵、筹粮执行与各人物后续为架空改编，不作史实断言。
- **score-room**：正文止于第二轮入梦提起月考；保留此前公开的成人升学班改编。自拟题、选拔、试卷细节、群聊误传与所有结局为游戏续写。
- **online-heir**：正文止于决定分手后的开头；网恋误会、公司身份、同事提醒均有节选依据。外派、数据争议、饭局、私信冲突与结局为改编。
- **black-flood**：正文止于次日醒来发现成人形态；简介另有后续梗概，未当作读过的后续正文。沿海、定位印、公开试招、笔录及结局为独立续写。
- **radish-court**：正文止于棋后皇帝谈御史；开头有北境回礼引子，不当作完整北境章节。驿路、施饭、欠粮和院外任职均为续写。
- **harvest-box**：正文止于秋收比较干活能力；和离、旧疤、箱中人、伤饿与农院支点保留。修堤、磨坊、寄存粮与各人的长期去向为续写。

### 存档兼容与资源验证

- 新版本 `1.1.0`，明确接受 `1.0.0`。增加的活动选项和线索会改变 Ink 的 choice snapshot，故调用既有显式版本迁移，通过原历史重新播放，而不是读取旧状态碰运气。
- 冻结定义：`tests/catalog-a-v1.fixture.json`，SHA-256 `90cc599fb3edf76d4162b6dd04e66d1f0cf41d0590920349556ab7a54c921021`。在任何本轮内容修改前保存，并保留原世界完整正文、元数据和全部选择。
- 639 条旧边均使用冻结定义编译成真实旧 Ink 后存档迁移；含起点共 647 个状态，各测试带 ID 与纯文字历史，共 1294 次，另外逐个测试冻结别名。比对资源、线索、resolve、trust、路径及更新后的可选项。
- 新图枚举 15840 个可区分状态：751 条边与 64 个结局全可达。所有非结局可达状态至少两项合法选择，且非强制 dark。共享验证器另逐边在真实 Ink 中回放全部 751 条选择。
- 16 个危机的失败、止损、决策前存档恢复分别测试；不复用已前进的 Ink 引擎。首次反事实测试因复用引擎触发过期保护，测试修正后通过，游戏引擎未改。

### 本轮实际执行的验证

1. `npx tsx --test tests/catalog-a-editorial.test.ts tests/catalog-a-routes.test.ts`：**50/50**，无跳过。
2. `npx tsx --test --test-name-pattern="happy-home|rotten-pilgrimage|ming-whisper|score-room|online-heir|black-flood|radish-court|harvest-box" tests/backend-worlds.test.ts`：**8/8**。该共享测试文件未改。
3. `npx tsx --test tests/choice-outcomes.test.ts tests/resources.test.ts tests/save-transfer.test.ts tests/source-reader.test.ts tests/source-boundary.test.ts`：**73/73**。
4. `npx tsc --noEmit`、`npm run build`：均通过。合计本轮以上测试运行 **131 项通过**；不是把旧的 root 280/280 当作本轮全仓结果。

收尾时将 32 条玩家可见的危机线索改成具体发现（如“满载头车的轴已经开裂”），删去内部节点编号式标记，并在同一条命令里重跑专属与资源/存档/来源集 **123/123**，再跑共享 A 图集 **8/8**，再次构建通过；最终仍为 **131 项通过、0 失败、0 跳过**。

### 当前边界与集成交接

- 内容文件只改 `content/catalog-a.ts` 的适配接入；新正文/结局在 `content/catalog-a-editorial.ts`，新分岔在 `content/catalog-a-crises.ts`。新 A 组测试/夹具/复核器均为 `tests/catalog-a-*`，旧路线测试未改。
- 未编辑 `content/worlds.ts`、B 组、共享类型、前端或服务器；未提交，未重启 4173。此处统计来自本轮磁盘定义与真实 Ink 编译，未声称运行中的旧缓存已刷新。共享进程加载新定义由 root 统一处理。
- 本轮付费图像请求 **0**，新图片 **0**。新增的每个场景保留独立标题、地点与具体人物/物件/光线动作，不把共享 background 或节点数算作独立 4K 配图验收。29 是每篇选择场景数，不冒称 30 张新插画。
- 复核统计与可玩路径：`npx tsx tests/catalog-a-report.ts`。下列路径为真实 Ink 重放成功的选择 ID；不是只列静态图上的箭头。

### 各结局的可执行路线与最后补救点

#### happy-home

- **ending_family / 下个副本见 / hopeful**：`ask_rules → dry_clothes → hear_family → clean_marks → set_boundary → share_meal → ask_proof → deduce_home → ask_family → sleep_early → promise_contact → leave_linked`
- **ending_clear / 带着自己的钥匙 / hopeful**：`route_neighbors → relay_mark → relay_thread → relay_test → relay_wedge → relay_share → relay_own`
- **ending_stay / 仍亮着的餐厅 / uneasy**：`ask_rules → dry_clothes → hear_family → clean_marks → set_boundary → share_meal → ask_proof → ledger_put_away → sleep_early → threshold_stay`
- **ending_roster / 这次点名，一个不少 / hopeful**：`route_neighbors → relay_mark → relay_thread → relay_test → relay_wedge → relay_share → relay_all`
- **ending_off_air / 镜头终于灭了 / uneasy**：`route_roof → roof_climb → roof_trace → roof_copy → roof_anchor → roof_short → roof_depart`
- **ending_spent / 守完剩下的几天 / uneasy**：`route_neighbors → relay_stop`
- **ending_erased / 空出来的第四格 / dark**：`route_neighbors → relay_mark → relay_thread → relay_test → relay_wedge → enter_roster_offer → roster_preview → roster_sell`
- **ending_broadcast / 第七天被播了三百遍 / dark**：`route_roof → roof_climb → roof_trace → roof_copy → roof_anchor → enter_roof_feed → roof_preview_upload → roof_complete_upload`

- 危机入口：`neighbors_names → enter_roster_offer → roster_offer`；最终风险场景 `roster_receipt`。
  - 失败：`roster_sell → ending_erased`。你独自完成结算。那笔额外积分花得掉，第四格却再没有人能补上；你丢掉的也不只是一位同行者。
  - 同一决策前存档的补救：`roster_restore → neighbors_seven`；零资源成本，接回原路线或完整非失败收束。
- 危机入口：`roof_alarm → enter_roof_feed → roof_feed`；最终风险场景 `roof_duplicate`。
  - 失败：`roof_complete_upload → ending_broadcast`。后来屏幕换过三次广告，你仍只看得见那段格外清楚的走廊。眼前再也不模糊，路却永远只剩这么长。
  - 同一决策前存档的补救：`roof_pull_plug → roof_daybreak`；零资源成本，接回原路线或完整非失败收束。

#### rotten-pilgrimage

- **ending_beacon / 白色之外的灯 / hopeful**：`keep_warning → ask_timestamp → record_uncertainty → ask_missing → record_laugh → measure_depth → verify_old → fix_sea → record_steps → make_rope → prepare_entry → reinforce_anchor → limited_rescue`
- **ending_witness / 西行路的新图 / uneasy**：`keep_warning → ask_timestamp → record_uncertainty → ask_missing → record_laugh → measure_depth → save_chart → comparison_leave → companion_withdraw`
- **ending_bargain / 第一个被补全的字 / dark**：`keep_warning → ask_timestamp → record_uncertainty → ask_missing → record_laugh → measure_depth → save_chart → comparison_leave → cross_testimony → prepare_retreat → accept_bargain`
- **ending_sea / 海湾不再听朝钟 / uneasy**：`route_sea → sea_down → sea_residents → sea_ring → sea_break_seal → sea_spend_anchor → sea_stay`
- **ending_heaven / 天门之后 / uneasy**：`route_heaven → gate_show → gate_screen → gate_feed → gate_prepare → gate_bridge → gate_close`
- **ending_spent / 收回最后一口龙息 / uneasy**：`route_sea → sea_stop`
- **ending_false_court / 五千米处再无宫门 / dark**：`route_sea → sea_down → sea_residents → sea_ring → sea_break_seal → enter_sea_exchange → sea_lend_names → sea_finish_court`
- **ending_lost_gate / 天门的门闩留在外面 / dark**：`route_heaven → gate_show → gate_screen → gate_feed → gate_prepare → enter_gate_cargo → gate_vouch_cargo → gate_hide_cargo`

- 危机入口：`sea_floodgate → enter_sea_exchange → sea_exchange`；最终风险场景 `sea_names_lost`。
  - 失败：`sea_finish_court → ending_false_court`。八戒循断剑找到封死的海床，只带走半截剑柄。西海这一次没有撤出的人，灵山也少了一个会回去求援的师弟。
  - 同一决策前存档的补救：`sea_tear_roll → sea_shore`；零资源成本，接回原路线或完整非失败收束。
- 危机入口：`gate_lastboat → enter_gate_cargo → gate_cargo`；最终风险场景 `gate_inner_shadow`。
  - 失败：`gate_hide_cargo → ending_lost_gate`。你交出佩剑，留在迁走的伤者中服役。求援没有带回师兄，反而赔掉了肯开门的守将；墙上的失踪名册，此后由你来抄。
  - 同一决策前存档的补救：`gate_retract_vouch → gate_seal`；零资源成本，接回原路线或完整非失败收束。

#### ming-whisper

- **ending_supply / 粮到以后再议 / hopeful**：`request_dispatch → track_food → copy_route → pledge_family → count_stock → deduce_supply → state_limits → ask_cover → write_supply_order → argue_supply → sign_transport → release_carts → keep_supply`
- **ending_relief / 城门还开着 / hopeful**：`request_dispatch → track_food → copy_route → pledge_family → count_stock → route_queen_help → accept_aid → write_relief_order → argue_relief → sign_relief → release_carts → keep_relief`
- **ending_record / 纸上没有捷报 / uneasy**：`request_dispatch → track_food → copy_route → pledge_family → count_stock → route_queen_help → accept_aid → write_relief_order → argue_relief → hold_dispatch → keep_record`
- **ending_exile / 南方有一封回信 / uneasy**：`route_family → canal_pawn → canal_ask_again → canal_show_letter → canal_share_space → canal_buy_passage → canal_exile`
- **ending_field / 催战的人看见了军营 / hopeful**：`route_escort → escort_take_grain → escort_detour → escort_feed → escort_kitchens → escort_sign → escort_stay`
- **ending_spent / 这一趟到此为止 / uneasy**：`route_family → canal_stop`
- **ending_impounded / 船走了，箱子还在 / dark**：`route_family → canal_pawn → canal_ask_again → canal_show_letter → canal_share_space → enter_canal_seal → canal_try_forgery → canal_stamp_forgery`
- **ending_broken_column / 粮车回来了，人没站成队 / dark**：`route_escort → escort_take_grain → escort_detour → escort_feed → escort_kitchens → enter_escort_muster → escort_stage_muster → escort_sign_false`

- 危机入口：`canal_checkpoint → enter_canal_seal → canal_seal`；最终风险场景 `canal_seal_check`。
  - 失败：`canal_stamp_forgery → ending_impounded`。入冬，你被革去闲职，在府里看守最后一仓口粮。亲人都还活着，却一同困在原想送他们离开的城中；断掉这条路的，是你盖下去的印。
  - 同一决策前存档的补救：`canal_withdraw_seal → canal_morning`；零资源成本，接回原路线或完整非失败收束。
- 危机入口：`escort_command → enter_escort_muster → escort_muster`；最终风险场景 `escort_rollcall`。
  - 失败：`escort_sign_false → ending_broken_column`。父亲送饭来时，把空印匣留在桌上。你保住了性命，却赔掉军中对你的信任；那三百个纸上的壮丁，终于从账上划净。
  - 同一决策前存档的补救：`escort_correct_roll → escort_departure`；零资源成本，接回原路线或完整非失败收束。

#### score-room

- **ending_independent / 自己的第一步 / hopeful**：`read_rules → state_gap → write_structure → test_new → recall_method → set_own_goal → rest_lunch → audit_try_basics → complete_square → independent_exam → graduate_room`
- **ending_schedule / 每天只多一点 / hopeful**：`read_rules → state_gap → write_structure → test_new → recall_method → leave_talk → audit_try_basics → complete_square → secure_basics → keep_schedule`
- **ending_real / 把门关在梦里 / uneasy**：`route_solo → solo_try → solo_correct → solo_design → solo_twentyfour → solo_basic_exam → solo_keep_practice`
- **ending_author / 这道题，由你来讲 / hopeful**：`route_solo → solo_try → solo_correct → solo_easy → solo_verify → solo_finish_exam → solo_leave_questions`
- **ending_class / 这张课桌旁，不止一个人 / hopeful**：`route_wen → wen_compare → wen_submit → wen_rewrite → wen_regular → wen_apply → wen_transfer`
- **ending_spent / 本轮交卷 / uneasy**：`route_solo → solo_giveup`
- **ending_wrong_range / 被划掉的取等号 / dark**：`route_solo → solo_try → solo_correct → solo_design → solo_twentyfour → enter_solo_shortcut → solo_copy_old → solo_submit_old`
- **ending_broken_study / 空下来的讨论位 / dark**：`route_wen → wen_compare → wen_submit → wen_rewrite → wen_regular → wen_apply → enter_wen_blame → wen_shift_blame → wen_insist_blame`

- 危机入口：`solo_exam → enter_solo_shortcut → solo_shortcut`；最终风险场景 `solo_last_line`。
  - 失败：`solo_submit_old → ending_wrong_range`。母亲替你腾出饭后的一小时，你重新拿起橡皮，把那一整页熟练的错证擦掉。报名处寄回旧表，新教室已经坐进别人；这个学期，你仍留在原班。
  - 同一决策前存档的补救：`solo_cross_equality → solo_result`；零资源成本，接回原路线或完整非失败收束。
- 危机入口：`wen_offer → enter_wen_blame → wen_blame`；最终风险场景 `wen_receipts`。
  - 失败：`wen_insist_blame → ending_broken_study`。你继续留在备考班，独自处理那本没补完的错题。公开答疑照常开课，桌边不再留你的组织席；这段学习搭档关系在这一晚结束。
  - 同一决策前存档的补救：`wen_correct_blame → ending_class`；零资源成本，接回原路线或完整非失败收束。

#### online-heir

- **ending_equal / 约在平常吃饭的地方 / hopeful**：`check_site → save_identity → mark_jokes → present_work → finish_packet → ask_policy → deduce_misread → public_meet → deduce_firewall → confirm_work → agree_budget → continue_equal`
- **ending_pause / 两周之后 / uneasy**：`route_dinner → dinner_open → dinner_truth → dinner_leave_alone`
- **ending_separate / 退出发小群 / hopeful**：`route_dinner → dinner_open → dinner_truth → dinner_return → dinner_end`
- **ending_career / 这份履历写的是项目 / hopeful**：`route_project → project_accept → project_restore → project_ask_distance → project_finish → project_rework → project_stay_city`
- **ending_restart / 两个人重新约了一次会 / hopeful**：`route_dinner → dinner_open → dinner_truth → dinner_return → dinner_accept_host → dinner_revisit → dinner_restart`
- **ending_spent / 把没答应完的事收回来 / uneasy**：`route_project → project_decline`
- **ending_lost_project / 退回来的合同 / dark**：`route_project → project_accept → project_restore → project_ask_distance → project_finish → enter_project_numbers → project_send_draft → project_hide_data`
- **ending_exposed_chat / 他没有接下那句玩笑 / dark**：`route_dinner → dinner_open → dinner_truth → dinner_return → dinner_accept_host → enter_dinner_screenshot → dinner_preview_private → dinner_post_private`

- 危机入口：`project_arrival → enter_project_numbers → project_numbers`；最终风险场景 `project_evidence`。
  - 失败：`project_hide_data → ending_lost_project`。季度汇报由你说明损失，主管收回了项目负责人的席卡。回到工位，新任务只有整理底表；那几行曾被你删掉的黄字，又出现在第一份退回稿上。
  - 同一决策前存档的补救：`project_admit_data → project_return`；零资源成本，接回原路线或完整非失败收束。
- 危机入口：`dinner_stall → enter_dinner_screenshot → dinner_screenshot`；最终风险场景 `dinner_send_confirm`。
  - 失败：`dinner_post_private → ending_exposed_chat`。那顿面没有约成。你留住了自己的岗位和生活，失去的是一个已经愿意坐在夜市、却被你推到众人面前的人。
  - 同一决策前存档的补救：`dinner_delete_preview → dinner_train`；零资源成本，接回原路线或完整非失败收束。

#### black-flood

- **ending_partner / 第二次踏进阵里 / hopeful**：`choose_black → mutual_contract → observe_spring → verify_identity → claim_ration → share_records → practice_stop → read_seal → match_register → deduce_resonance → volunteer_pair → hold_outer → partners_end`
- **ending_steward / 旧院重新开了门 / hopeful**：`choose_black → mutual_contract → observe_spring → verify_identity → claim_ration → share_records → practice_stop → read_seal → match_register → deduce_resonance → publish_gap → support_watch → steward_end`
- **ending_free / 山下各有一条路 / uneasy**：`route_arena → arena_register → arena_shield → arena_disarm → arena_lastward → arena_teach → arena_return_home`
- **ending_sea / 没有结契的同路人 / hopeful**：`route_river → river_follow → river_trade → river_refuse → river_treat → river_free → river_part`
- **ending_teacher / 第一课，先学收招 / hopeful**：`route_arena → arena_register → arena_shield → arena_disarm → arena_lastward → arena_teach → arena_take_class`
- **ending_spent / 泉院的灯按时熄了 / uneasy**：`route_river → river_handover`
- **ending_broken_tide / 河口没有等你的水声 / dark**：`route_river → river_follow → river_trade → river_refuse → river_treat → enter_river_brand → river_test_brand → river_seal_brand`
- **ending_lost_class / 练习台不再等你点名 / dark**：`route_arena → arena_register → arena_shield → arena_disarm → arena_lastward → enter_arena_record → arena_remove_page → arena_insist_false`

- 危机入口：`river_deep → enter_river_brand → river_brand`；最终风险场景 `river_tether`。
  - 失败：`river_seal_brand → ending_broken_tide`。你将空鳞放回河口的石上，等过一整次涨潮。水冲走了它，再没有谁替你推回佩剑；回山时，另一份药仍原封不动地压在包底。
  - 同一决策前存档的补救：`river_wash_brand → river_farewell`；零资源成本，接回原路线或完整非失败收束。
- 危机入口：`arena_judgment → enter_arena_record → arena_record`；最终风险场景 `arena_original`。
  - 失败：`arena_insist_false → ending_lost_class`。钟响时，新一班弟子跟着另一位师姐收剑。你留在旧院修行，性命与药袋都保住了，原本可以重新建立的两段信任却断在那张缺页上。
  - 同一决策前存档的补救：`arena_restore_page → arena_newclass`；零资源成本，接回原路线或完整非失败收束。

#### radish-court

- **ending_supply / 第二趟粮车 / hopeful**：`assign_skills → hear_drain → drained_crop → restore_team → answer_ledger → play_honest → guard_supply → weigh_stock → full_harvest → deduce_trial → formal_trial → print_duties → end_system`
- **ending_garden / 傍晚又摆开一盘棋 / hopeful**：`assign_skills → hear_drain → drained_crop → restore_team → answer_ledger → play_honest → guard_supply → weigh_stock → full_harvest → deduce_gap → protect_garden → print_duties → end_garden`
- **ending_favor / 收回去的差遣牌 / uneasy**：`assign_skills → hear_drain → drained_crop → restore_team → answer_ledger → play_honest → guard_supply → weigh_stock → full_harvest → deduce_gap → offer_personal → end_favor`
- **ending_frontier / 萝卜筐到了北境 / hopeful**：`route_frontier → frontier_chart → frontier_permission → frontier_ford → frontier_join → frontier_wait_fog → frontier_stay`
- **ending_kitchen / 侧门每天开一会儿 / hopeful**：`route_kitchen → market_start → market_share_work → market_accept_grain → market_thin → market_reap → market_stay_public`
- **ending_spent / 空筐归了库 / uneasy**：`route_frontier → frontier_stop`
- **ending_lost_convoy / 空筐回了景华宫 / dark**：`route_frontier → frontier_chart → frontier_permission → frontier_ford → frontier_join → enter_frontier_marker → frontier_test_loaded → frontier_force_cart`
- **ending_closed_kitchen / 牌匾比锅先撤下 / dark**：`route_kitchen → market_start → market_share_work → market_accept_grain → market_thin → enter_market_pledge → market_promise_five → market_take_seed`

- 危机入口：`frontier_fog → enter_frontier_marker → frontier_marker`；最终风险场景 `frontier_axle`。
  - 失败：`frontier_force_cart → ending_lost_convoy`。回宫后，你从自用开支里补还粮额，福顺逐月销账。祖母的兵书还在桌上，北境却没有再来下一季的任命。
  - 同一决策前存档的补救：`frontier_unload_cart → frontier_reply`；零资源成本，接回原路线或完整非失败收束。
- 危机入口：`market_harvest → enter_market_pledge → market_pledge`；最终风险场景 `market_doublepledge`。
  - 失败：`market_take_seed → ending_closed_kitchen`。错过播种的地空到开春，旧牌匾被收进库角。市坊新灶开门时只摆两口锅，原来的帮手都去了那里；你将还米的最后一张回条交给福顺，没再请他挂牌。
  - 同一决策前存档的补救：`market_revise_debt → market_future`；零资源成本，接回原路线或完整非失败收束。

#### harvest-box

- **ending_partner / 檐下多了一双鞋 / hopeful**：`record_compensation → fix_yard → offer_meal → portion_food → inspect_injury → ask_binding → write_limits → deduce_light_work → trade_meal → pay_cover → claim_repairs → secure_full → choose_partner`
- **ending_coop / 下一季种什么 / hopeful**：`record_compensation → fix_yard → offer_meal → portion_food → inspect_injury → ask_binding → write_limits → deduce_light_work → trade_meal → pay_cover → claim_repairs → secure_full → choose_coop`
- **ending_space / 把箱子改成农具柜 / uneasy**：`route_sect → sect_demand → sect_remove_seal → sect_reject_return → sect_village → sect_fill → sect_break_all`
- **ending_truce / 仙人也得下田 / hopeful**：`route_sect → sect_demand → sect_remove_seal → sect_reject_return → sect_village → sect_fill → sect_truce`
- **ending_mill / 水轮转过一整个冬天 / hopeful**：`route_mill → mill_inspect → mill_clear → mill_adjust → mill_limit → mill_take_duty → mill_open`
- **ending_spent / 这一季，先守住饭碗 / uneasy**：`route_sect → sect_turnback`
- **ending_washed_harvest / 一仓麦换来一条新沟 / dark**：`route_sect → sect_demand → sect_remove_seal → sect_reject_return → sect_village → enter_sect_sword → sect_trial_cut → sect_finish_cut`
- **ending_lost_mill / 第二副磨盘没进你的门 / dark**：`route_mill → mill_inspect → mill_clear → mill_adjust → mill_limit → enter_mill_pledge → mill_offer_deposit → mill_ship_others`

- 危机入口：`sect_dike → enter_sect_sword → sect_sword`；最终风险场景 `sect_waterline`。
  - 失败：`sect_finish_cut → ending_washed_harvest`。沈凶搬去老伯空屋养伤，你靠补衣和换工熬到春种。新沟修得很直，绕开了新仓；当初以为一剑能省下的活，最后多做了整个冬天。
  - 同一决策前存档的补救：`sect_plug_cut → sect_settle`；零资源成本，接回原路线或完整非失败收束。
- 危机入口：`mill_share → enter_mill_pledge → mill_pledge`；最终风险场景 `mill_claims`。
  - 失败：`mill_ship_others → ending_lost_mill`。水轮由另外几户轮班照管，第一袋磨费已付给新的看磨人。你挑着补还的种粮经过，亲手对好两半布条，等主人收下，再提空袋回自己的田。
  - 同一决策前存档的补救：`mill_cancel_pledge → mill_choice`；零资源成本，接回原路线或完整非失败收束。
