# 星航第一轮修订稿只读审读

## 状态与范围

- 审读对象：项目 `import-32bcca2e-c8e9-47bb-91b1-ee567f3cbe2f` 的未发布第一轮修订快照；不是当前独立模型复审的最终结果，也不是发布或插图验收。
- 精确快照：[round-1.draft.json](../../.local/story-workshop/projects/import-32bcca2e-c8e9-47bb-91b1-ee567f3cbe2f/r1/editorial/run-2-f19cac522480/workshop-editorial-v1-9bb74769090a9eb465627bea/round-1.draft.json)。下文的 JSON Pointer 全部相对此文件；原文件只有第 1 行，故用场景 ID、选项 ID 和 JSON Pointer 定位。
- 对照来源：[source.json](../../.local/story-workshop/projects/import-32bcca2e-c8e9-47bb-91b1-ee567f3cbe2f/source.json)。它保存的是《星航》官方搜索节选，不是已取得完整原文；改编中的事故原因和后续结局不视作来源已有事实。
- 对照初审：[review-r0-4fd3ca5422070154bf7aa007-a1.accepted.json](../../.local/story-workshop/projects/import-32bcca2e-c8e9-47bb-91b1-ee567f3cbe2f/r1/editorial/run-2-f19cac522480/workshop-editorial-v1-9bb74769090a9eb465627bea/review-r0-4fd3ca5422070154bf7aa007-a1.accepted.json)。读取了修订开场、三条路线全部正文、选项与 9 个结局；未把初审中已经修正的问题重新计为发现。
- 最后一次无写入验证时间：`2026-09-06T06:57:39.299Z`，北京时间 `2026-09-06 14:57:39`。报告名中的 `1450` 为本次审读任务标识。
- 本轮仅新增本报告。没有修改生产模块、源文、草稿、审批记录或其他工作流笔记，没有启动模型、图片、浏览器、服务，也没有干预现有 worker。

原始 UTF-8 文件 SHA-256：

| 文件 | SHA-256 |
| --- | --- |
| `round-1.draft.json` | `719b89e123160988292f71c6268f83ef6562fdb045af6cd14cbf56f052b2f266` |
| `source.json` | `94593ec4cf978499370b98373995ba5ce9389f074e02fba16cbb40bc2817194f` |

这些是读取文件字节得到的摘要，不是模型检查点的 `inputHash` 或 `outputHash`。任何后续稿变化均须重新比对，以下问题可能已被后续修复，不能自动套用于最终稿。

## 发现

### 1. P2：返航检查缺项会强制玩家主动关闭仍有储备的呼吸盒

位置：`return_home_descent`，`/routes/1/scenes/11`；相关选项是 `return_home_descent_weather`、`return_home_descent_radar`、`return_home_descent_cabin_air`。前一场的 `return_home_cabin_check_seated` 位于 `/routes/1/scenes/10/choices/3`；结局为 `return_home_entry_bad`，`/routes/1/scenes/14`。

可复现合法路径及选择后的供氧：

| 顺序 | choice ID | 供氧 |
| --- | --- | --- |
| 1 | `return_home_departure_now` | 17 |
| 2 | `return_home_plume_pressure` | 17 |
| 3 | `return_home_seal_find_oxygen` | 17 |
| 4 | `return_home_oxygen_connect` | 20 |
| 5 | `return_home_uplink_weather` | 19 |
| 6 | `return_home_burn_horizon` | 17 |
| 7 | `return_home_separation_manual_start` | 17 |
| 8 | `return_home_manual_release_defer` | 17 |
| 9 | `return_home_cabin_check_seated` | 17 |

到达 `return_home_descent` 时，有天气、正确下轨和姿态校准记录，也有备用瓶，供氧为 17；但没有“乘员舱密封”和“服务段已分离”。两项正常着陆动作因此均被禁用，唯一可选动作是：

> 关闭呼吸盒，靠舱内空气下降，把氧气留到落海

选择后的反馈明确写“呼吸盒的供气声停了”，结局又把停止供气写成死亡记录。之前的 `return_home_cabin_check_seated` 只选择扣紧束带、不维修，并没有选择停掉呼吸设备。

这不是要求遗漏检查仍能获救。未密封或未分离导致坏结局有合理伏笔；问题是已有故障必须经过一次新的主动断氧行为，才允许故事继续，最后又用这次被强制选择的行为解释死亡。17 点储备使其也不是“资源已耗尽”的自然结果。失败应由实际遗漏兑现，不应靠唯一继续按钮强迫玩家另作一次相反于求生目的的动作。

### 2. P2：缺少稳定冷却时，样本线把封舱或放弃样本的决定锁成主动制造致命事故

第一处：`save_sample_probe`，`/routes/2/scenes/10`；相关选项 `save_sample_probe_calculated`、`save_sample_probe_measure`、`save_sample_probe_shell`。其上游 `save_sample_contacts_cut` 位于 `/routes/2/scenes/8/choices/1`。

合法路径：

| 顺序 | choice ID | 供氧 |
| --- | --- | --- |
| 1 | `save_sample_battery_start` | 18 |
| 2 | `save_sample_records_clip` | 18 |
| 3 | `save_sample_valve_arm` | 15 |
| 4 | `save_sample_bottle_connect` | 18 |
| 5 | `save_sample_fire_suppress` | 18 |
| 6 | `save_sample_contacts_cut` | 18 |

此时燃料和危险回流均已切断，火已压住，备用瓶已接入；仅没有“冷却稳定”。在 `save_sample_probe`，两项实测后封罐动作都要求该条件，因此唯一出口是 `save_sample_probe_shell`：无视仍高于限值的内层读数，合上罐盖，再把热样本搬进隔间。`save_sample_c_bad_heat` 随后明确以这次提前合盖造成罐体烧裂、隔间失密和两人死亡。

这条路径没有选择或不可逆地承诺提前合盖。断线器选择只说冷却保持原状；到最后才因一项冷却缺失，把下一步强制变成已明确警告会伤及两人的热封罐。18 点供氧和已备好的避难隔间也没有被物理事件移除。前序冷却遗漏可以导致样本失败，不等于必须主动把它变成乘员死亡。

第二处是同一问题的封门版本：`save_sample_seal`，`/routes/2/scenes/11`。合法路径为 `save_sample_battery_start` → `save_sample_records_clip` → `save_sample_valve_arm` → `save_sample_bottle_connect` → `save_sample_fire_vent` → `save_sample_account_cut` → `save_sample_archive_carry`。到达时供氧为 16，沈砚已在隔间内，明文表示关门即可单独供气；仍仅因没有“冷却稳定”，两项正常处理选项均禁用，唯一选择 `save_sample_seal_stay` 要求玩家留在敞开的漏气连接舱守着样本，转入 `save_sample_c_bad_wait`。

此处的样本处理门槛实际同时剥夺了独立的乘员封舱决定。保留前序错误的代价与 Bad End 并不需要把“样本尚未安全处理”写成“只能主动不关门”。

## 验证与未发现的问题

使用现有 `buildGeneratedWorld(id, 1, source, draft)` 在单次 Node 进程内编译和验证，未写输出文件，返回成功：

```json
{"scenes":46,"decisions":37,"endings":9,"badEnds":5,"routes":3,"states":7293}
```

另按实际 `needs`、资源成本、获得线索及资源上限做了内存中的可达状态遍历。三条路线状态数为 486、6067、739，加公共入口共 7293；与构建器结果一致。上述复现路径逐步满足实际条件，不是只沿 `next` 忽略门槛的静态路径。

四个获救结局的最小可达供氧如下；这里是最后选择结算后的资源值，不把纯结局正文时间自动换算成资源扣除。

| 结局 scene ID | 最小可达供氧 | 本次判断 |
| --- | --- | --- |
| `save_habitat_rescued_small` | 3 | 没有发现零氧进入数小时候救的路径 |
| `save_habitat_rescued_ward` | 4 | 没有发现零氧进入数小时候救的路径 |
| `return_home_good` | 0 | 最后成本明确覆盖整个再入，触水后接救援供气；不重复初审已修正的旧剩余量问题 |
| `save_sample_c_good` | 2 | 没有发现零氧进入数小时候救的路径 |

本次没有额外确定的来源事实矛盾、凭缺失数据直接授予计算结果，或遗漏人物及事件最终交代的问题。尤其是：

- `save_sample_account_compare` 现在实际补读连续电输出、冷却测量和内层温度，再用手写时刻对齐；并非仅用时刻补造读数。`save_sample_cooling_read_records` 也为先检查伤势的路径提供了实际读档动作。
- `save_habitat_refuge` 的当前实际封舱选项已不再要求无线电回读；`save_habitat_rescued_small` 补写了救援船抵近后收报和核验位置的过程。不重复初审 `finding_03`。
- 9 个结局均可达；失败结局存在本身不是缺陷。上面的两项发现针对的是到达某些状态后被强制新增的具体有害动作，而非要求所有状态都保留好结局。

结构编译通过只证明模式、图和条件可达性；它不证明唯一免费出口的叙事动机成立。未重跑模型复审，未进行实际浏览器验收，也未把待制作插图计为故事缺陷。
