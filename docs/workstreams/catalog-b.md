# B 组叙事与独立分支

## 本轮：共享测试与类型阻断已消除

- 用户确认继续处理后，读取了最新协调记录和两处实际代码。共享区已完成资源说明的玩法投影排除，以及 A 组浏览器脚本 `page.evaluate` 返回对象的显式类型修正。本会话保留这些同步修改，没有重复覆盖其他所有者的文件。
- 新增 `tests/world-prose-contract.test.ts` 的 4 项回归：修改资源说明不改变玩法投影且不污染输入；资源 ID/标签/初值/上下界及资源删除仍产生差异；消耗和资源门槛仍产生差异。没有以忽略资源整体或跳过存档回放来消除失败。
- 本轮执行 `npx tsx --test --test-reporter=spec tests/*.test.ts`，实测 **444/444 通过、0 失败、0 跳过**。包含原先失败的 blue-blood 全边旧存档恢复，以及本会话新增的 4 项回归。
- 默认 `npm run build` 已通过类型检查，但在清理共享 `dist/generated-art` 时遇到 `ENOTEMPTY`；未手动清理共享目录。随后执行 `npm run build -- --outDir .local/catalog-b-build-20260906-1203`，**类型检查与生产构建均通过，退出码 0**，1598 个模块；JS/CSS 产物已核实。仅有大于 500 kB 的打包体积警告。
- 本轮产物目录为 `E:/知乎/.local/catalog-b-build-20260906-1203`。这是独立构建验收，不表示已部署到共享服务。
- 本轮再次只读核验发布状态：[当前发布差异](E:/知乎/output/playwright/catalog-b-live/integration-recheck/publication-check.json)、[当前汇总](E:/知乎/output/playwright/catalog-b-live/integration-recheck/summary.json)。24 个文案节点仍待统一加载；此前的 32/32 资源压力实玩属于已有证据，本轮没有宣称重新跑过浏览器。未重启服务、未提交、未请求图片。

## 此前续跑：已补齐余刻耗尽的真实页面验收

- 已读取最新协调记录及 `catalog-b-live-acceptance.md`，本轮不重复扩写、不覆盖已完成的文案修订。以下早期 `2.0.0` / 768 边统计保留为历史；当前 island-broadcast 与 wrong-realm 已为 `2.0.1`，其余六篇为 `2.0.0`，总节点仍为 338，选项边为 770。
- 本轮实际 GET 已返回 wrong-realm `2.0.1`。judgment 路线在 1440 与 320 视口各完成 8 次正常选择：`read_terms` 后在 `b_coldcase` 余刻为 0，`cool` 锁定，`b_withdraw` 仍可进入 `b_judgment_small`。两组原文返回、保存/整页刷新载入、回溯重放及结局重开均通过。
- 本轮成功证据：[真实页面报告](E:/知乎/output/playwright/catalog-b-live/resumed-judgment-pressure-retry/report.json)。首次运行发生页面重新导航，停在书库，保留于 `resumed-judgment-pressure`，没有计入通过；两次均不替换 API、注入存档或修改游戏状态。
- [本轮新汇总](E:/知乎/output/playwright/catalog-b-live/resumed-summary/summary.json) 合并先前已完成的 30 组与本轮新完成的 2 组，目前 16/16 路线、32/32 路线视口有自然耗尽证据。先前的 100 次基线实玩不是本轮重跑。桌面与窄屏耗尽截图已打开复核，文字和选项可用，背景仍缺失；没有把玩法通过计为美术通过。
- 修正 `tests/catalog-b-live-summary.ts` 的比较入口：原脚本直接编译 B 原始导出，绕过公共 `withWorldProse` 修订，会误报已发布内容。现在与服务共用最终 `getWorld`，保留字段级差异；支持指定本轮报告和独立输出目录，读取超时为 15 秒，不覆盖旧证据。
- 最终入口检查仍有 **24 个真实文案差异节点**，每篇 3 个，涉及正文/结局/标题，不涉及 choices 或路由。[精确发布差异](E:/知乎/output/playwright/catalog-b-live/resumed-summary/publication-check.json) 已列全；不能将已通过的 32 组资源压力检查等同于这批新文案已发布。此批公共文案由其现有所有者推进，本会话未覆盖或重启服务。
- 本轮全量测试实测 **410 项，409 通过、1 失败**。唯一失败为 `tests/world-prose.test.ts:45` 的 blue-blood 结构投影，仍将资源 `description` 当成不变玩法：当前“部分调查和行动会消耗注意力。休息可以恢复。”及“休息要花 1 份余量，最多恢复 2 点注意力。有些联络也要用到余量。”与冻结文本不同。ID、初值和上下界没有报错。交给共享文案测试所有者处理，本会话不改核心内容或放松共享断言。
- 随后单独复跑 `npx tsx --test --test-reporter=spec tests/catalog-b*.test.ts tests/backend-worlds.test.ts tests/resources.test.ts`：**121/121 通过**，其中 B 专项 93 项。当前八世界 338 节点、770 条边、74 个结局通过共享真实 Ink 回放；v1 与修改前 v2 的存档迁移均通过。
- 本轮 `npm run build` 退出码 **2**，被并行新增的 `scripts/catalog-a-browser-acceptance.ts:117:27` 阻断：`TS2698: Spread types may only be created from object types.` 因而本轮没有完整生产构建成功的结论；未改 catalog-a 文件。此前构建通过记录仅是历史结果。
- 本轮未新增场景 ID、未改 B 正文与图、未请求图片、未提交、未重启共享服务。

## 早期交付摘要（历史，最新结果见上方）

- 当前源码默认 `2.0.0`：8 世界，每世界 33 个可选对话场景、2 条各含 10 个独占对话场景的长线、9 至 10 个收束结局。合计 338 节点、264 对话、74 结局；新增 Bad Ends 18 个。
- 真实来源保留，16 个短引文锚点逐项与缓存唯一匹配。原文不改写，新增续写与所有结局明确标为游戏改编。旧 IDs、effects、requires、跳转均保留，修订选项保存 `legacyTexts`。
- 共享资源数量断言已由根会话修正，本轮完整复验 **280 项全部通过，0 失败**；其中全部 **68 项 B 专项通过**（分支/原文 16、因果与门槛 19、耗尽 9、主迁移 8、补充 v1 迁移 16）。原先受阻的八个世界现已执行完整共享图遍历及真实 Ink 回放，不再停在数量断言。
- 本轮 `npm run build` 通过，包含 `tsc --noEmit` 与 Vite 生产构建。没有请求图像、没有提交、没有重启服务；上轮只读 GET 曾确认 4173 提供旧 `1.0.0` / 16 节点，本轮测试与构建结果不等同于服务已更新。
- 下方“已接入场景清单”是当前默认 ID，不含未接入草稿。前面的阶段记录保留用于追踪同步工作，不应将阶段性数量当成当前数量。

### 共享断言修正后的复验（本轮）

- 用户确认继续修改后，先核对共享工作区：`tests/backend-worlds.test.ts:116` 已由并行根会话改为至少两项资源，本会话保留该修改，没有重复覆盖共享文件。
- `npx tsx --test --test-reporter=spec tests/*.test.ts`：280 / 280 通过，0 失败、0 跳过。B 组全部 338 节点、768 条选项边、74 个结局通过共享回放检查，包含旧选项文本别名与存档恢复。
- 资源边界、选项门槛、实际扣减、全图可达性与耗尽出口的校验仍在；没有以跳过测试消除旧失败。
- `npm run build`：退出码 0，类型检查通过，Vite 6.4.3 完成 1589 个模块的生产构建。共享服务仍交由根会话统一刷新，本会话未执行重启。

### 主集成产物与历史记录

- `E:/知乎/tests/catalog-b-full-regression.log`：保留的上一轮 `npm test` 历史日志，278 项 / 270 通过 / 8 旧断言失败；不是当前测试结果。当前结果以上方本轮 280 / 280 复验为准。
- `E:/知乎/tests/catalog-b-inventory.json`：本轮实际导出的机器清单，包含 world/story/version、所有新场景 ID，以及每个新结局的可执行 choice ID 路径。8 世界共遍历 **16,045 个路由等价状态、768 条可达选项边**。
- 复跑：`npx tsx --test tests/catalog-b*.test.ts`；重导清单：`npx tsx tests/catalog-b-inventory.ts`（`--markdown` 输出报告格式）。
- 最后一次因果收紧：`hollow-immortals/b_copper_bridge/divert` 除撤人外还必须实际关闭本层供液，才通往“丹房停止发药”的成功结局；新增负例测试证明只撤人不足以冒领此结果。
- 旧线仍可从“重走此前经过”进入；新游戏优先显示两条独占路线。缓存原文、原作者、旧资源定义与旧路径保持不变，新 `b_time` 不在旧线扣减。
- 节点数不代表图片数；本轮图片交付数为 **0**。源码验收不等同于已发布到共享服务，服务重新加载由根会话安排。
- 主集成最终只读核验：`GET http://127.0.0.1:4173/api/worlds/2025954672918163637` 返回 `temple-heart / 1.0.0 / 16 nodes`。现有服务尚未加载本轮源码，未执行重启或发布。

## 2026-09-06 / 第一阶段：原文与兼容接口已核对

- 所有权：仅 `content/catalog-b.ts`、新建的 `content/catalog-b-*` 辅助模块、B 专属测试与本报告。未动其他故事、类型、界面、服务；不重启、不提交、不请求图片。
- 已逐字读完本地 8 份真实节选：2025954672918163637、1962166083206242442、1760265980192886784、1793742089336532992、1930445234262750503、1558118587956662272、1783485301039054849、1716453753710972928。保留缓存原文及原作者；新增情节/人物/结局标为游戏原创改编。
- 现状：前两世界为短线，后六世界由同一 field/puzzle/aftermath 模板串联；新增路线不再使用此模板。
- 兼容决定：保留全部旧 node ID、choice ID、nextNodeId、effects、requires；改选项文案时追加 `legacyTexts`。新版 `2.0.0` 显式兼容 `1.0.0`，利用已有历史回放迁移，测试真实旧 Ink 存档与无 choiceId 的文本历史。新增资源仅作用于新路线。
- 新场景采用 `b_` 前缀，与旧图分离；入口为每世界现有 start 节点上的两个新增选项。每条新线独占至少十个对话节点，拥有好/妥协/坏结局，彼此不汇流。旧入口选项仍可走旧路径。
- 美术协作：本轮不产生图。新节点的确切 ID 清单将在各世界代码落地后追加到本报告，旧 ID 全部稳定。

## 预定路线（尚在编写，不计作已完成）

| world ID | 路线一 | 路线二 |
| --- | --- | --- |
| temple-heart | 毓娘灶火与渡河求粮 | 返山追问成仙与断契 |
| tiger-shelter | 陪同入城、御苑鱼池 | 留山守洞、拆除围猎 |
| six-roots | 上台替战、拆解六根阵 | 抬伤者退赛、回村开课 |
| palace-ledger | 留宫断供、追回宫务主权 | 携印出宫、朱家商路 |
| red-plum | 留村守棚、夜间接人 | 带闹闹撤离、旧渡口 |
| hollow-immortals | 深入铜柱、断开丹房 | 出山回乡、封住招徒路 |
| island-broadcast | 留在林地、完成晚饭 | 转去潮滩、停掉危险直播 |
| wrong-realm | 当场索剑、拆开宗门偏袒 | 带药离宗、修复灵根 |

## 验证状态

待代码落地后验证：带状态的全图可达性、不同路线场景序列、每个结局可达、真实资源消耗与时间门槛、耗尽仍有合法离场、旧存档逐节点迁移、原文锚点与作者匹配、类型检查及现有测试回归。

## 第二阶段进行中：前四世界独立路线已写入模块

`content/catalog-b-{temple,tiger,six,palace}.ts` 已具备各 20 个独占对话节点、6 个新结局，尚待统一挂接及状态测试，不计为验证通过。

- temple-heart 入口：`b_kitchen` / `b_shrine_steps`；结局前缀 `b_grain_*` / `b_shrine_*`。
- tiger-shelter 入口：`b_cart` / `b_den_dawn`；结局前缀 `b_court_*` / `b_mountain_*`。
- six-roots 入口：`b_arena_name` / `b_stretcher`；结局前缀 `b_arena_*` / `b_school_*`。
- palace-ledger 入口：`b_empty_box` / `b_private_seal`；结局前缀 `b_palace_*` / `b_merchant_*`。
- 新公共构造器 `catalog-b-kit.ts` 只构造节点与选项，不生成线性任务链；各故事显式定义跳转。每条线有独立的零资源退让结局，绝不转入另一条主线。
- 新版前的原始 8 世界数据已保存到 `tests/catalog-b-v1.fixture.json`，作为真正修改前的迁移基线，而非从新版倒推旧版本。

## 09:54 集成占用说明

目前本会话正在修改 `catalog-b-expansions.ts`、`catalog-b-legacy-prose.ts` 并开展 B 专属验收。共享目录中 `catalog-b-hollow.ts`、`catalog-b-island.ts` 出现了与本轮刚写入内容不同的同步修订，另有 `catalog-b-wrong-realm.ts`。这些内容先保留、不回滚；验收将针对实际接入的版本。请其余会话遵守 B 所有权，不覆盖 B 的集成文件。当前 wrong-realm 接入的是 `catalog-b-realm.ts`，另一同题模块未接入，不应据此生产额外图片。最终 ID 清单以本报告验收段为准。

### 补充会话协作范围（01a07459-d8a7-7590-a3f3-d67518739b66）

已确认当前 `expandCatalogB` 接入，不覆盖集成文件与 `catalog-b-legacy-prose.ts`。本会话补充真实 v1 全边迁移测试 `tests/catalog-b-v1-migration.test.ts`，并只收紧前四世界的少量因果错配：断绳与收债原共用一则互相矛盾的结局、当铺换米不应跳到河对岸、签掉分红不应凭空跳到扣船。相关新增结局会另列 ID。本轮跑过已有 B 分支测试 16/16 及类型检查。

措辞补充已以 `catalog-b.ts` 最后一层 `.map(polishBChoices)` 接入：只改旧选项文字并保留全部历史 `legacyTexts`，清除旧线重复的教学提示，不动 `catalog-b-expansions.ts` / `catalog-b-legacy-prose.ts` 的正文和路由。该函数在 `catalog-b-prose.ts`；其中另一个正文重写函数未接入，以当前 `reviseLegacyB` 的正文为准。`catalog-b-wrong-realm.ts` 保持未接入草稿，不纳入美术数量。

本会话新增已接入的结局 ID：`temple-heart/b_grain_debt`（米已送达后继续索心）、`palace-ledger/b_merchant_signed`（签掉将来分红）。原 `b_grain_bad` 专写断绳，原 `b_merchant_bad` 专写冒用后印后扣船，避免同一正文与前文矛盾。当铺卸货支线改为直接送米回家，不再凭空抵达河对岸。

真实 v1 迁移补测：16/16 通过；覆盖 265 个旧存档位置、246 条旧边，每个位置分别验证含 choiceId 与仅文本历史、再保存为 v2 后重载、回溯与重放。该结果来自修改前的 `catalog-b-v1.fixture.json`，不是由新版模拟生成。

## 10:06 集成验收进展

- 主集成的 `catalog-b-branches.test.ts` + `catalog-b-migration.test.ts`：24/24 通过；`tsc --noEmit` 通过。每个新节点、新边、结局均有可执行路径；两条主线无交叉节点，旧 IDs/effects/requires/routes 保持不变。
- 全套 `npm test` 本次为 236/245 通过、9 失败。8 项来自 `tests/backend-worlds.test.ts:116` 仍固定断言除 future-island 外只能有 **2** 项资源，本轮 B 组合法新增 `b_time` 成为 3 项；这些测试在进入图遍历前即停止，不是可达性错误。建议根会话将该共用测试更新为验证资源定义或按新版契约计数；本会话遵守范围未改共用测试。
- 另 1 项为工作坊的 subprocess startup failure 测试（`tests/workshop.test.ts:122`，实际 running / 预期 failed），属于并行工作坊模块；未越权修改或停止进程。
- 已接纳补充会话的两个独立坏结局 `b_grain_debt`、`b_merchant_signed` 和选项润色；下一次验收与完整 ID 清单将包含这两个新增节点。仍不将未接入草稿计为交付或美术生产对象。

### 补充验收与共享测试交接

- 阶段性 B 定向测试 51/51 通过：分支/原文 16、真实 v1 迁移 16、因果修订与门槛 19。`npx tsc --noEmit` 通过；合并其他 B 补测后的最后结果见顶部摘要。
- 本会话完整 `npm test` 实测 245 项：237 通过、8 失败。八项都停在 `tests/backend-worlds.test.ts:116` 将除 future-island 外的资源数量写死为 2 的旧断言；B 组增加余刻后为 3。没有改共享测试文件。请根会话更新这条旧数量假设；B 专属测试已用三资源实际执行所有新边与所有结局，并验证耗尽退路。
- 新增 `tests/catalog-b-causality.test.ts` 固定了换米不穿越河岸、饭已送到不再写成未送达、签掉分红不凭空扣船三个具体回归，并覆盖 16 条新路线的时间/线索门槛。
- `npx tsx tests/catalog-b-inventory.ts` 返回当前接入图的数量、全部 ID 以及每个结局的一条实际可达选择序列；加 `--markdown` 可输出下列美术可消费的 ID 表。该工具只读，不发图像请求、不接触服务器。

## 已接入场景清单（当前默认）

| world ID | 总节点 | 对话节点 | 结局 | Bad Ends | 状态 | 可达选项 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| temple-heart | 43 | 33 | 10 | 3 | 1227 | 98 |
| tiger-shelter | 42 | 33 | 9 | 2 | 975 | 97 |
| six-roots | 42 | 33 | 9 | 2 | 2364 | 96 |
| palace-ledger | 43 | 33 | 10 | 3 | 2261 | 96 |
| red-plum | 42 | 33 | 9 | 2 | 2405 | 96 |
| hollow-immortals | 42 | 33 | 9 | 3 | 2115 | 95 |
| island-broadcast | 42 | 33 | 9 | 2 | 2377 | 94 |
| wrong-realm | 42 | 33 | 9 | 2 | 2321 | 96 |

### temple-heart / 2025954672918163637

- grain 入口：`b_kitchen`
- 对话：`b_kitchen`、`b_rice`、`b_pawn`、`b_ferry`、`b_mill`、`b_rope`、`b_grain`、`b_home`、`b_night`、`b_breakfast`
- 原创结局：`b_grain_good`、`b_grain_small`、`b_grain_bad`、`b_grain_debt`

- shrine 入口：`b_shrine_steps`
- 对话：`b_shrine_steps`、`b_messenger`、`b_incense`、`b_table`、`b_bell`、`b_name`、`b_shadow`、`b_empty`、`b_ash`、`b_lantern`
- 原创结局：`b_shrine_good`、`b_shrine_small`、`b_shrine_bad`

### tiger-shelter / 1962166083206242442

- court 入口：`b_cart`
- 对话：`b_cart`、`b_lock`、`b_inn`、`b_keeper`、`b_gate`、`b_water`、`b_yard`、`b_audience`、`b_repay`、`b_homeward`
- 原创结局：`b_court_good`、`b_court_small`、`b_court_bad`

- mountain 入口：`b_den_dawn`
- 对话：`b_den_dawn`、`b_den_talk`、`b_wind`、`b_wolf_parley`、`b_smoke`、`b_hunter`、`b_signal`、`b_move`、`b_crest`、`b_border_dawn`
- 原创结局：`b_mountain_good`、`b_mountain_small`、`b_mountain_bad`

### six-roots / 1760265980192886784

- arena 入口：`b_arena_name`
- 对话：`b_arena_name`、`b_arena_referee`、`b_arena_math`、`b_arena_crack`、`b_arena_language`、`b_arena_poem`、`b_arena_spill`、`b_arena_sixfold`、`b_arena_bell`、`b_arena_result`
- 原创结局：`b_arena_good`、`b_arena_small`、`b_arena_bad`

- school 入口：`b_stretcher`
- 对话：`b_stretcher`、`b_cart_school`、`b_medicine`、`b_watch`、`b_inn_school`、`b_village_road`、`b_grain_class`、`b_notice_school`、`b_rain_class`、`b_school_return`
- 原创结局：`b_school_good`、`b_school_small`、`b_school_bad`

### palace-ledger / 1793742089336532992

- palace 入口：`b_empty_box`
- 对话：`b_empty_box`、`b_palace_receipt`、`b_kitchen_closed`、`b_cook`、`b_pay_servants`、`b_old_ledger`、`b_audience_palace`、`b_seal_palace`、`b_supply_palace`、`b_month_end`
- 原创结局：`b_palace_good`、`b_palace_small`、`b_palace_bad`

- merchant 入口：`b_private_seal`
- 对话：`b_private_seal`、`b_family_letter`、`b_gate_pass`、`b_gate_reply`、`b_dock`、`b_ship_hold`、`b_toll`、`b_city_shop`、`b_return_letter`、`b_shop_morning`
- 原创结局：`b_merchant_good`、`b_merchant_small`、`b_merchant_bad`、`b_merchant_signed`

### red-plum / 1930445234262750503

- village 入口：`b_night_knock`
- 对话：`b_night_knock`、`b_shed_guard`、`b_window`、`b_cabinet`、`b_whistle`、`b_shed_return`、`b_hurt_man`、`b_south_gate`、`b_before_dawn`、`b_village_table`
- 原创结局：`b_village_good`、`b_village_small`、`b_village_bad`

- ferry 入口：`b_pack_doll`
- 对话：`b_pack_doll`、`b_cart_plum`、`b_shed_key`、`b_ditch`、`b_toll_plum`、`b_boatman`、`b_lamp_plum`、`b_cut_rope`、`b_midriver`、`b_other_bank`
- 原创结局：`b_ferry_good`、`b_ferry_small`、`b_ferry_bad`

### hollow-immortals / 1558118587956662272

- copper 入口：`b_copper_window`
- 对话：`b_copper_window`、`b_copper_servant`、`b_copper_door`、`b_copper_rows`、`b_copper_awake`、`b_copper_sluice`、`b_copper_blackout`、`b_copper_stairs`、`b_copper_bridge`、`b_copper_foot`
- 原创结局：`b_copper_good`、`b_copper_small`、`b_copper_bad`

- village 入口：`b_hill_pass`
- 对话：`b_hill_pass`、`b_tea_stall`、`b_empty_village`、`b_new_recruit`、`b_recruit_master`、`b_recruit_dan`、`b_broken_cart`、`b_well_path`、`b_names_home`、`b_return_water`
- 原创结局：`b_return_good`、`b_return_small`、`b_return_bad`

### island-broadcast / 1783485301039054849

- camp 入口：`b_forest_lunch`
- 对话：`b_forest_lunch`、`b_water_source`、`b_food_box`、`b_radio_gap`、`b_wrong_turn`、`b_wet_fire`、`b_camera_argument`、`b_roof_leak`、`b_first_supper`、`b_after_live`
- 原创结局：`b_camp_good`、`b_camp_small`、`b_camp_bad`

- shore 入口：`b_shore_call`
- 对话：`b_shore_call`、`b_shore_path`、`b_shore_notice`、`b_shore_prop`、`b_radio_denial`、`b_missing_assistant`、`b_shore_steps`、`b_camera_stop`、`b_contract_shore`、`b_depart_shore`
- 原创结局：`b_shore_good`、`b_shore_small`、`b_shore_bad`

### wrong-realm / 1716453753710972928

- judgment 入口：`b_sword_edge`
- 对话：`b_sword_edge`、`b_rule_stone`、`b_steward_realm`、`b_witness_realm`、`b_master_realm`、`b_sword_offer`、`b_coldcase`、`b_verdict`、`b_gate_realm`、`b_medicine_realm`
- 原创结局：`b_judgment_good`、`b_judgment_small`、`b_judgment_bad`

- departure 入口：`b_pack_realm`
- 对话：`b_pack_realm`、`b_outer_disciple`、`b_storage_realm`、`b_mingyuan_path`、`b_seal_gate`、`b_inn_realm`、`b_herbalist`、`b_cooling_realm`、`b_night_realm`、`b_walk_realm`
- 原创结局：`b_depart_good`、`b_depart_small`、`b_depart_bad`

统计合计：338 个已接入节点，其中 264 个可选择的对话节点、74 个明确收束的结局。新增独占对话 160 个、原创结局 50 个；其中新路线 Bad Ends 18 个。表内 Bad Ends 按 dark 色调统计，额外含 hollow-immortals 的一则旧线暗色收场。节点数不等于已完成图片数，本会话完成图片数为 0。

### 构建与当前服务状态

- 本会话运行 `npm run build` 成功，类型检查与 Vite 生产构建均通过；没有提交 Git，也没有启动或重启服务器。
- 只读检查 `GET http://127.0.0.1:4173/api/worlds/2025954672918163637` 返回 HTTP 200，但仍是 `version: 1.0.0`、16 节点。现存共享服务尚未载入这轮 B 源码；请根会话统一发布/重载时再确认 `2.0.0` 与 43 节点。不要把目前的服务响应当作已展示新版。
