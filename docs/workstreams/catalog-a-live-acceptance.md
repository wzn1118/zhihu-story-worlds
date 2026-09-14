# Catalog A — 真实浏览器验收

## 服务续写加载复验 / 2026-09-07

**当前服务文案已复验通过；本轮是针对共享续写所触及节点的选择性 32 项 UI 批次，不把它记作重新跑完全部 64 项。**

本轮默认索引：[results.json](E:/知乎/output/playwright/catalog-a-live/2026-09-06T19-56-54-750Z/results.json)。前后服务抓取和图契约结果见 [catalog-a-live-delta.json](E:/知乎/output/playwright/catalog-a-live/2026-09-06T19-56-54-750Z/catalog-a-live-delta.json)。

- 八篇仍为 `1.1.0`、各 37 节点；总计 **296 节点、751 选项、64 结局、17 dark**。与上次 64 项完整批次相比，服务只改写 **24 个节点的 25 段正文**；节点 ID、选项 ID／目标／效果／条件、`legacyTexts`、资源、来源署名、可达节点／边和 16 对失败／补救的终局状态均逐项一致。
- 新批次 **32/32** 通过：八个发生正文变化的失败／补救对，各自从书库、教程、序章开始，在 **1440×960** 与 **390×844** 各走失败和补救一次。共 274 次实际剧情点选、320 个记录的故事 API `GET 200`、32 次原文阅读往返、320 张截图；无页面异常、无布局问题。每个 UI 世界响应 SHA-256 与同批服务审计字节相等。
- 全量 64 项 UI 基线仍保留在下方的 `2026-09-06T04-13-44-426Z`；本轮未变化的另八对不重复开浏览器，而是由增量审计的全图枚举和 32 条终局状态回放复核。不能将本段表述为“当前 64 项全部重新截图”。
- 原作节选没有改写或并入改编正文。八个缓存节选的 title、author、storyId、长度与 SHA-256 均记录在上方增量 JSON；完整来源表仍见本文“原文边界”。
- A 组专项测试 **51/51** 通过。`npx tsc --noEmit` 在本轮被并行的非 A 文件 `tests/catalog-b-editorial-followup.test.ts:157` 阻断（`AuthoredWorld` 传入需要 `GameWorld` 的位置）；本线未修改该文件，故本轮未把生产构建称作通过。

### 本轮实际路径

| World | 失败路径（终局） | 同决策前补救路径（终局） |
| --- | --- | --- |
| happy-home | `route_roof > roof_climb > roof_trace > roof_copy > roof_anchor > enter_roof_feed > roof_preview_upload > roof_complete_upload` (`ending_broadcast`) | `… > roof_preview_upload > roof_pull_plug > roof_depart` (`ending_off_air`) |
| rotten-pilgrimage | `route_heaven > gate_show > gate_screen > gate_feed > gate_prepare > enter_gate_cargo > gate_vouch_cargo > gate_hide_cargo` (`ending_lost_gate`) | `… > gate_vouch_cargo > gate_retract_vouch > gate_close` (`ending_heaven`) |
| ming-whisper | `route_escort > escort_take_grain > escort_detour > escort_feed > escort_kitchens > enter_escort_muster > escort_stage_muster > escort_sign_false` (`ending_broken_column`) | `… > escort_stage_muster > escort_correct_roll > escort_stay` (`ending_field`) |
| score-room | `route_wen > wen_compare > wen_submit > wen_rewrite > wen_regular > wen_apply > enter_wen_blame > wen_shift_blame > wen_insist_blame` (`ending_broken_study`) | `… > wen_shift_blame > wen_correct_blame` (`ending_class`) |
| online-heir | `route_dinner > dinner_open > dinner_truth > dinner_return > dinner_accept_host > enter_dinner_screenshot > dinner_preview_private > dinner_post_private` (`ending_exposed_chat`) | `… > dinner_preview_private > dinner_delete_preview > dinner_restart` (`ending_restart`) |
| black-flood | `route_arena > arena_register > arena_shield > arena_disarm > arena_lastward > enter_arena_record > arena_remove_page > arena_insist_false` (`ending_lost_class`) | `… > arena_remove_page > arena_restore_page > arena_take_class` (`ending_teacher`) |
| radish-court | `route_kitchen > market_start > market_share_work > market_accept_grain > market_thin > enter_market_pledge > market_promise_five > market_take_seed` (`ending_closed_kitchen`) | `… > market_promise_five > market_revise_debt > market_stay_public` (`ending_kitchen`) |
| harvest-box | `route_mill > mill_inspect > mill_clear > mill_adjust > mill_limit > enter_mill_pledge > mill_offer_deposit > mill_ship_others` (`ending_lost_mill`) | `… > mill_offer_deposit > mill_cancel_pledge > mill_open` (`ending_mill`) |

### 本轮脚本优化

- `scripts/catalog-a-browser-acceptance.ts` 新增严格 `--failed=` 白名单，用逗号或 PowerShell 展开的空白列表选择危机对；它与 `--retry-from` 互斥，不将不同复验范围合并。
- 终局来源区已从旧 `.ending-source` 类迁移为具名 region `原作与这次改编`。验收脚本以该语义 landmark 定位，同时保留旧类回退；修复前中止的 6 个 context 均已到达预期终局，失败仅在终局底部取景，保留为诊断记录，不计为通过。
- `tests/catalog-a-live-delta.ts` 对两个真实服务捕获做允许正文变化、严禁图契约漂移的回归审计；报告保存在当前批次目录，不依赖本地未加载的作者对象推断线上内容。

## 本次续跑结果 / 2026-09-06 12:20

**以下为 2026-09-06 历史批次：路径、原文往返与存档验收通过，插画交付未通过。当时待加载的一句本地正文已在 2026-09-07 当前批次加载并复验，以上方“服务续写加载复验”为准。**

本次默认索引：
[acceptance-summary.json](E:/知乎/output/playwright/catalog-a-live/2026-09-06T04-13-44-426Z/acceptance-summary.json)。
这份索引只引用本次续跑实际产生的文件，未采用上轮的“0 通过”或旧单测代替浏览器证据。

### 范围与精确结果

- 实际访问 `http://127.0.0.1:4173`，未启动、停止或重启共享服务。
- **64/64** 目标用例通过：16 个新增失败结局及各自一个补救终局，分别在 **1440×960、390×844** 从书库、教程、序章开始，全部靠页面点选完成。不是 64 个不同结局；覆盖的是 32 个 `(worldId, endingId)` 目标。
- **32/32** 对最终决策前的状态完全相同：节点、段落、历史、资源、线索、信任、决心与可用选择逐项比较。574 次实际剧情点选包含原生恢复与重玩验证，不包含导航／教程点击。
- **269** 次记录的故事 API 响应均为 GET、HTTP 200。八篇 UI 世界响应与各自本轮审计响应的原始字节 SHA-256 一致。
- 每例在危险决策处打开原文并返回，正文与真实缓存逐字相同，署名不变，段落／资源／历史不变。`happy-home/ending_erased` 的两个视口另完成手动存档导出、整页重载后载入、补救、回溯、双结局收集及重新开局。
- 64 个用例均无页面异常、无测量到的文字／控件遮挡。长结局允许在 `.ending-view` 内正常滚动；同时保留顶部与底部截图，不把滚动内容的原始矩形当成页脚重叠。
- 人工检查了八篇手机端联系表，以及《大明》《秋收》的桌面联系表；另检查过《幸福之家》桌面原图和《黑蛟》手机最后决策原图。没有将自动矩形检查说成人工逐屏审图。

### 三批证据的关系

| 正式批次目录（均为本次续跑） | 新开隔离 context | 本批通过 | 失败原因 |
| --- | ---: | ---: | --- |
| `2026-09-06T03-44-21-729Z` | 64 | 23 | 9 项首页／字体截图等待；32 项共享前端序章按钮改名后旧选择器失配 |
| `2026-09-06T04-05-02-792Z` | 41 | 39 | 2 项《大明》验收路径用了需要另一条线索的末步 ID |
| `2026-09-06T04-13-44-426Z` | 2 | 2 | 无 |

最终索引保留 23 + 39 + 2 = 64 条完整证据，原始失败文件未删除。后批只在实际世界响应 SHA 完全相同且前项无错误时沿用通过结果；不是把沿用项再计作新执行。目录均在 `E:/知乎/output/playwright/catalog-a-live/` 下。调试用的单例试跑未混入此统计。

### 16 对终局

以下各行均已在两个视口通过。完整入口至终局的选择 ID、实际段落及资源状态见
[playthrough-review.md](E:/知乎/output/playwright/catalog-a-live/2026-09-06T04-13-44-426Z/playthrough-review.md)
和各例 `steps.json`。

| World | 失败结局 | 相同最后决策处的补救路径 |
| --- | --- | --- |
| happy-home | ending_erased | roster_restore → relay_all → ending_roster |
| happy-home | ending_broadcast | roof_pull_plug → roof_depart → ending_off_air |
| rotten-pilgrimage | ending_false_court | sea_tear_roll → sea_stay → ending_sea |
| rotten-pilgrimage | ending_lost_gate | gate_retract_vouch → gate_close → ending_heaven |
| ming-whisper | ending_impounded | canal_withdraw_seal → canal_guard_family → ending_exile |
| ming-whisper | ending_broken_column | escort_correct_roll → escort_stay → ending_field |
| score-room | ending_wrong_range | solo_cross_equality → solo_keep_practice → ending_real |
| score-room | ending_broken_study | wen_correct_blame → ending_class |
| online-heir | ending_lost_project | project_admit_data → project_stay_city → ending_career |
| online-heir | ending_exposed_chat | dinner_delete_preview → dinner_restart → ending_restart |
| black-flood | ending_broken_tide | river_wash_brand → river_part → ending_sea |
| black-flood | ending_lost_class | arena_restore_page → arena_take_class → ending_teacher |
| radish-court | ending_lost_convoy | frontier_unload_cart → frontier_stay → ending_frontier |
| radish-court | ending_closed_kitchen | market_revise_debt → market_stay_public → ending_kitchen |
| harvest-box | ending_washed_harvest | sect_plug_cut → sect_truce → ending_truce |
| harvest-box | ending_lost_mill | mill_cancel_pledge → mill_open → ending_mill |

《大明》补救的实际代价是“家人先走，自己留京”，页面正确锁住缺少“支流离京”的 `canal_exile`。本次仅修验收表，未改条件或给玩家补线索。《黑蛟》`arena_original` 在灵药 0、契合 0 时仍有三个完整选择，补救与退出都能点选；有真实截图和成对终局证据。

### 文案复读

- `happy-home`：删名实际留下四楼住户，玩家带积分独自离开；撤回后分摊积分、共同离楼。上传失败与断线退出的去向分别写完。
- `rotten-pilgrimage`：名册换闸让避难者永久入朝；行囊作保损失守将和天门。补救只保住对应人群，没有顺带许诺救回灵山众人。
- `ming-whisper`：假札导致扣船、家财消耗和家人滞京；虚报壮健造成队伍拆散与撤职。补救仍承担留京或公开报告病营的代价。
- `score-room`：错用取等条件失去本轮资格；诬责同学失去搭档和组织席，不改卷面分数。复读发现的生硬句子已在后续当前服务批次加载并复验。
- `online-heir`：错数合同实际撤销项目资格；泄露已被明确拒绝公开的私信结束关系，没有额外丢工作或任意报复。两种补救都结束本轮冲突。
- `black-flood`：强留的印只带回空鳞；隐去原图失去授课资格和信任。拒绝结契、结束同行本身不是失败触发条件。
- `radish-court`：裂轴预警兑现为失粮、撤差，不加任意人员死亡；重复抵押留种粮导致关灶、还米、帮手离开。
- `harvest-box`：已试出的水路导致粮仓损失，后续赔偿、和离和过冬都有交代；挪用寄存粮导致磨坊钥匙被收回，补偿与重新经营的去向写明。

以上危机及结局属于互动改编，不是付费原文续章。原文仍单独保留为 `api-excerpt`。

### 原文边界

| World | 原作 | 作者 | storyId | 缓存正文长度 |
| --- | --- | --- | --- | ---: |
| happy-home | 近视眼勇闯恐怖游戏 | 沈南因 | 1747681485547843585 | 3000 |
| rotten-pilgrimage | 西游之众佛腐烂 | 杀不死的林海仙 | 1617220591035113472 | 3000 |
| ming-whisper | 穿越大明，我被崇祯偷听心声 | 凉风有信 | 1654134122145320960 | 2630 |
| score-room | 不提分就出不去的房间 | 灯灯 | 2050600604976803918 | 3000 |
| online-heir | 网恋对象真是霸总 | 北瓜 | 1981680284933063553 | 3000 |
| black-flood | 重生后，我抢了师妹的灵兽 | 花花在画画 | 1775834953454288896 | 3000 |
| radish-court | 端妃黑又壮 | 重十八 | 1985108790006277782 | 3000 |
| harvest-box | 山回路转不见鸡 | 旺旺大队长 | 1986486345988851330 | 3000 |

所有 source URL 原样保留。八个正文 SHA-256 及 API 字节 SHA 分别存于最终索引的 `sourceTexts` 和 `served-manifest.json`；缓存外壳 fetchedAt 的自然更新不当作原文改变。

### 当前交接事项

1. **已加载并复验 / 2026-09-07。** `content/catalog-a-crises.ts` 的 `score-room/ending_broken_study` 首段“老师核对双方的原图后，撤掉了你组织答疑的资格。卷面分数没变，你的名字却从下周的答疑值班表上划掉了。”保持 1.1.0、原节点／选择／效果与段数不变。当前服务响应和四个 `score-room` UI context 均已读到该句；同版本旧 Ink 存档恢复测试继续通过。历史索引的 `copyStatus.loadedByRoot: false` 只表示该索引生成时的旧服务状态。
2. **背景资产缺失。** 64/64 终局的 `visuals.backgroundState.status` 为 `unavailable`，对应八个 `/assets/<worldId>.webp`。本轮没有交付原生 4K 图，没有 paid 请求，也没有把截图／联系表算插画。美术／集成线需处理实际资产绑定后另验。
3. **字体记录。** 41 条新格式终局截图有字体状态记录；40 条 loaded，`online-heir--ending_lost_project--mobile--failed` 截图时仍有 20 个字体面加载中、0 error。真实 fallback 字形可读，没有替换 CSS 或拦截字体。不可据此宣称全部外部字体已加载。

本轮 A 组专项测试 **51/51**，`npx tsc --noEmit` 通过，`npm run build` 通过；构建存在共享前端包体超过 500 KB 的提示。全库测试由 root 负责，本轮未声称重跑全库。

Root 完成统一加载后，可复用下面的命令；只有实际 SHA 改变的世界或失败项会重新开局：

```text
npx tsx scripts/catalog-a-browser-acceptance.ts --retry-from=output/playwright/catalog-a-live/2026-09-06T04-13-44-426Z
npx tsx tests/catalog-a-live-review.ts <该次打印的新绝对目录>
```

## 上轮中断记录 / 2026-09-06

以下是续跑前留下的历史交接，“0 通过”仅指当时的中断状态。

- 本轮仅验收现有 1.1.0，不扩写故事。已读 coordination 与 catalog-a 交接。
- 初次实际 GET `http://127.0.0.1:4173/api/worlds/1747681485547843585` 返回 `happy-home / 1.1.0`；八篇字节哈希仍待批量命令成功执行后记录。
- 新脚本：`scripts/catalog-a-browser-acceptance.ts`。计划 64 个隔离 context：16 条既定失败路径及同一最终决策的补救终局，分别走 1440×960 和 390×844。每次从书库和真实教程开始；不注入进度，不替换接口，不连接或关闭别人浏览器。
- 脚本包含逐段 UI 读取/选择、真实接口字节核对、原文往返、布局测量、截图/trace、原生手动存档导出与重载/回溯/重玩。它此刻尚未运行通过，不能当作已有验收证据。
- 当前执行器问题：批量命令、环境检查、`Write-Output 'catalog-a-shell-check'` 均连续超时（含 login=false）。最后一条简单命令 64.5 秒超时且无输出；未重启或改动共享服务。待执行器恢复后继续实际验收。
- 本轮浏览器通过数目前 **0**，没有以旧单测替代；没有付费调用、导入新故事、修改全局 UI 或共享契约。

## 上轮停止点：执行器阻塞，验收未完成

又尝试 `login=false`、将工作目录切至 `C:/Windows`、使用仅 `Get-Date` 的命令，以及显式 `Write-Output ...; exit 0`。都以 exit 124 超时结束，无 stdout；这不是某个故事的浏览器断言失败。最初读取文件与单篇 GET 成功，随后 shell 工具失去可用响应。文件补丁工具仍可写入此交接。

**没有取得**：完整 served hash、浏览器截图、16 对实际终局、存档恢复证据、布局验收或文案通过结论。脚本尚未经 TypeScript 检查或真实试跑，64 是计划用例数，不是通过数。`output/playwright/catalog-a-live/` 中没有本轮可认定为成功运行的结果路径；不要引用其他人的旧截图补数。

恢复后的顺序：

1. `npx tsx scripts/catalog-a-browser-acceptance.ts --audit-only` — 八篇真实接口版本/原始响应 SHA-256（脚本会打印新的绝对输出目录）。
2. `npx tsc --noEmit`，再 `npx tsx scripts/catalog-a-browser-acceptance.ts --limit=1` — 校验脚本与实际选择器，先完成桌面第一对存档/回溯练习。
3. `npx tsx scripts/catalog-a-browser-acceptance.ts` — 64 个独立 context；终局后的补救也玩到终局，不只比较下一节点。
4. 人工看新的截图、`read-text.json`、八篇 `copy-review.txt`。报告准确内容 ID 与短引文；本轮尚未人工验收，不以自动布局矩形代替视觉检查。
5. 汇总 `served-manifest.json`、各 `result.json`、`network.json`、`steps.json`、`layout.json`、原生导出的 `decision-manual-save.json`、`replay-save-restore.json` 和 `trace.zip`。每一条报告必须指向本次实际产生的目录。

告 root：本轮没有修改已发布内容，**不需要重载 4173**；也没有重启或停止任何服务/他人浏览器。需要恢复的是此会话命令执行能力，不是据此判定故事服务故障。
