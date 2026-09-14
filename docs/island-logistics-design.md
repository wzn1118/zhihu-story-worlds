# 未来岛四格配载支线

实现文件：`content/island-logistics.ts`。接入点为 `withIslandLogistics(withCoreInvestigation(world))`，只处理 `future-island`，已经扩展过的世界直接原样返回。版本为 `1.2.0`，兼容 `1.1.0`、`1.0.0` 及输入世界已有兼容版本。

## 来源与改编边界

依据本地真实来源缓存 `.local/zhihu-cache/story-1831621186162937856.json`，作品为苏青瓷《末世我靠钞能力躺赢》，接口节选截断于洪水发生后女主看直播、吃火锅的场景。节选明确提供三百名玩家、金币与无穷财富、一年准备期、太平洋未来岛、分仓、供水设备、旧同学姓名与能力、洪水，以及原作集中销毁飞机轮船的行动。成年角色身份是游戏设定。

新增的受限工作艇、站点需求、三类库存、段铎与闻澄参与的调度、四格容量、出航与误潮、签收和试机、所有新增对白与维护合作结局均为**游戏原创**。采用保留一艘受限工作艇的改编分歧，不能把这一航次说成原作销毁交通工具之后发生的真实剧情。该说明已追加到 `adaptation.note`，不修改来源缓存和原文。

支线复用现有成年角色和现有未来岛图片。没有生成或更改美术，不增加人物肖像。

## 资源规则

新增 `cargo`：本班剩余货位，初始 4，下限 0，上限 4。沿用核心调查的 `focus`（值守精力，初始 3）和 `reserve`（应急配额，初始 2）。不增加货位恢复的可重复操作。

| 项目 | 成本 | 前置 | 可获得的实际结果 |
| --- | --- | --- | --- |
| 本班库存复点 | 无额外资源成本 | 到库口核对并确认 | 仅库存来源线索，不发货 |
| 饮水站点核验 | 1 精力 | 双向核对余水、接收人、窗口 | 饮水需求已核实 |
| 备件站点核验 | 1 精力 | 型号、现场操作人、试机条件 | 备件适配已核实 |
| 转移核验 | 1 精力 | 本人意愿、核定目的地、接收名额 | 转移申请已核实 |
| 饮水装船 | 2 货位 | 库存和饮水核验 | 本班饮水装船凭据 |
| 成套备件装船 | 3 货位 | 库存和机组型号核验 | 本班备件装船凭据 |
| 转移模块装船 | 2 货位 | 库存、转移核验、收货退出条款 | 本班载客空间与物资 |
| 一次值守轮休 | 1 应急配额 | 未轮休且精力不高于 3 | 恢复 2 精力，仅一次 |
| 出航 | 1 应急配额 | 船坞转运配额、库存、条款、至少一类已装货 | 本班出航记录 |
| 误潮后的重约 | 1 精力和 1 应急配额 | 先承诺未经核验的加站并误潮 | 仅恢复原已核站点窗口 |
| 机组试机复核 | 1 精力 | 本班实际备件装船和签收 | 独立试机回单 |

备件 3 格与饮水 2 格、转移模块 2 格分别互斥；饮水和转移可以恰好用完四格。封舱后本班不能拆货重配。所有未装、未核、未实收项目均不会获得签收或长期合作凭据。成功或撤回航次核销后货位恢复为 4，但“配载支线已收束”禁止再次进入，不能循环刷货、精力或信任。

库存线索与实际装货分开。本班饮水明确从个人封存用量划出，返工备件与转移模块独立复点；已经在旧主线交付的“独立补给批次”不会再次充作本班的来源。转移目的地是大陆侧接驳码头，不能代替岛上稳定净水和长期接纳资格。

## 场景与结果

共新增 25 个场景，包含调度、库存、三类联系人核验、条款交锋、三类装载、轮休、舱单、出航、误潮、三类交接、试机、返航、两种撤回场景和一个长期结局。只为既有 `dock`、`last_decision` 追加入口，既有节点正文、选项、效果与连线保持原值。

成功饮水交付回到 `council`；成功转移可回 `archive`；备件交付并试机可回 `council`，仅签收未试机可回 `archive`；离泊前撤回回 `dock`；误潮无力重约或拒绝无回执交货时原货返岛，回 `archive`。所有耗尽状态仍有无资源成本的返回或收束操作。

新增结局 `ending_maintenance_pact` 由原 `last_decision` 的 `choose_maintenance_pact` 进入，同时要求库存、机组型号、收货条款、备件装船、备件签收、试机回单及返航核销七类线索。旧主线的账本、第一批交接、净水配额均不能代替这些条件。结局只说明完成过的单台机组维护和小规模后续约定，不宣称无限供水或全员得救。

循环导航使用 `Choice.repeatable: true` 对应 Ink sticky 选项。可领奖操作同时用 `noneClues` 排除已完成状态；库存和条款的“先返回再考虑”导航也保持可重复。只单次执行的装货、核验、轮休和签收不会重复奖励。

## 可复跑路线

下列路线均为选择 ID 序列。公共起点到调度台：

```text
save_rule, reserve_transport, reserve_relief, close_contracts,
answer_logistics, verify_capacity, one_verified_contact, separate_logistics,
plan_limited_manifest, open_logistics_table,
check_logistics_stock, confirm_logistics_stock,
open_logistics_terms, confirm_logistics_terms
```

维护合作结局：公共段后继续：

```text
open_logistics_contacts, call_logistics_spares, verify_logistics_spares,
leave_logistics_contacts, open_logistics_cargo, load_logistics_spares,
return_logistics_loaded_spares, leave_logistics_cargo,
review_logistics_manifest, sail_logistics_manifest, keep_logistics_schedule,
deliver_logistics_spares, return_logistics_spare_delivery,
trial_logistics_pump, return_logistics_pump_trial, finish_logistics_handover,
close_logistics_maintenance, publish_small_ledger, keep_partial_archive,
choose_maintenance_pact
```

饮水加转移，回议事频道：公共段后继续：

```text
open_logistics_contacts, call_logistics_water, verify_logistics_water,
call_logistics_rescue, verify_logistics_rescue, leave_logistics_contacts,
open_logistics_cargo, load_logistics_water, return_logistics_loaded_water,
load_logistics_rescue, return_logistics_loaded_rescue, leave_logistics_cargo,
review_logistics_manifest, sail_logistics_manifest, keep_logistics_schedule,
deliver_logistics_water, return_logistics_water_delivery,
deliver_logistics_rescue, return_logistics_rescue_delivery,
finish_logistics_handover, close_logistics_water
```

单独转移回档案室：公共段后仅核验并装 `rescue`，到交接台选择 `deliver_logistics_rescue`、`return_logistics_rescue_delivery`、`finish_logistics_handover`、`close_logistics_rescue`。

未核验的临时承诺导致原货返岛：在任一合法装货与出航路线后，选择：

```text
promise_logistics_detour, return_logistics_undelivered, close_logistics_failed
```

这条路线不能取得任意本班签收或维护结局。若仍有 1 精力和 1 应急配额，`repair_logistics_schedule` 可以重约原站点，但不会新增载货或陌生站点转移资格。

## 需要特别验证的陷阱

- 核验三种站点会耗尽初始精力，但货位不允许装全；“全看全选”无法全赢。
- 三格备件加载后，即使核验过饮水或转移，两个两格项目也必须被阻止。
- 两格饮水加载后再装两格转移，货位为零；卸水不恢复本班可追加名额。
- 只有备件签收而没有试机回单时，维护结局必须锁定；精力用完仍可如实回档案室。
- 轮休用掉应急余量会限制误潮重约；有货有收货人也不代表有足够应急配额离泊。
- 缺少旧主线 `船坞转运配额` 时可清点和撤回，不能将私人撤离能力当作往返验收。
- 回到循环台不能重复核验、装货、轮休、签收，关闭支线后不能再次装船。
- 不进入新支线的旧存档应重放到原节点，保持原剧情、选择历史和线索，新增货位从 4 开始。

## 验证记录

2026-09-06 在本工作区实际执行，使用 `compileWorld`、`startSession`、`choose`、`saveSession`、`restoreSession`，每一步按真实 Ink 返回的可用选择推进：

| 检查 | 实际结果 |
| --- | --- |
| `npx tsc --noEmit` | 通过 |
| 完整世界 Ink 编译 | 通过，原有 26 场景加新增 25 场景，共 51 场景、6 结局 |
| 维护合作完整路线 | 34 次选择抵达 `ending_maintenance_pact`；精力 1、应急 1、核销后货位 4 |
| 饮水加转移路线 | 35 次选择回 `council`；精力 1、应急 1、核销后货位 4 |
| 单独转移 | 完成本班交接后回 `archive` |
| 核验三项再装备件 | 精力 0、货位 1；重复备件、饮水、转移全部不可选 |
| 精力耗尽后误潮 | 重约不可选；原货返岛回 `archive`，没有签收或试机线索 |
| 误潮重约后完成维护 | 35 次选择抵达新增结局；精力 0、应急 0，补救真实耗尽余量 |
| 备件已签收但精力耗尽 | 试机不可选；如实回档案室，再到最终决定时维护结局仍锁定 |
| 缺少船坞转运配额 | 有货仍无法离泊，可撤回到 `dock`，货位恢复但再次进入支线被阻止 |
| 循环导航 | 库存、条款、站点、货位台均可先返回后重进；不会重复装货或签收 |
| 轮休 | 精力从 3 到 5，应急从 2 到 1；第二次轮休不可选 |
| 新存档保存与恢复 | 维护结局和饮水加转移路线的资源恢复一致 |
| `1.0.0`、`1.1.0` 存档迁移 | 两版到 `dock` 的旧路线均恢复；原节点、历史与线索不变，货位初始为 4 |
| 旧节点深比较 | 26 个原有节点全部保持原正文、原选择及效果；只允许两处新增选项 |
| 重复应用装饰器 | 返回同一个已扩展对象，避免重复资源和入口 |

这里只改了支线模块与本文档；公共规则、世界注册表和正式测试由主代理接入。验证未读取凭据、调用来源接口或改变原文缓存。
