# Factory First-Round Repair Review

## Scope and Status

本报告只审查项目 `import-0b3ce5e1-1f96-474d-871d-5e2a2a541713` 的**未发布第一轮修订稿**：第 0 轮独立审稿后，已接受的 outline repair 和三条 route repair 合成的 `round-1.draft.json`。

**这不是当前模型复审的最终结果，也不是对最终发布版本的拒绝或验收。** 本次审读受委派时，独立全稿复审仍在进行；后续修订可能已经解决下面的问题。使用本报告时应先核对最新稿件、修订版本和哈希，不得把旧快照的问题直接当成最终稿仍有的问题。

仅写入本报告。未修改生产模块、稿件、notes、审批记录或其他项目；未启动模型、浏览器、服务或图片任务，未干预运行进程。美术完成情况不在本报告的故事缺陷范围内。

## Exact Inputs

项目目录：`E:/知乎/.local/story-workshop/projects/import-0b3ce5e1-1f96-474d-871d-5e2a2a541713`。

审校目录（以下检查点均相对此目录）：

```text
r1/editorial/run-2-2fcb28e0ad75/workshop-editorial-v1-30b2c0734125f16dc330efcb
```

- 原文：项目目录下 `source.json`，知乎回答 ID `2074553198715592769`，`contentScope=search-excerpt`；没有将改编续写当成原文事实。
- 初始审稿：`review-r0-4b7fce3e8b7f8a95a00cfa61-a1.accepted.json`。
- 大纲修订：`outline-repair-r0-a5cbcb5ae9920270b75668c3-a1.accepted.json`。
- 罗莉路线：`route-repair-r0-8bf2c58588395d957dc047f7-a1.accepted.json`，`routeId=return_with_luoli`。
- 死者路线：`route-repair-r0-972558c07a207b1a9ebff3de-a1.accepted.json`，`routeId=name_the_dead`。
- 公开路线：`route-repair-r0-dbdcefc852570a411013b2e8-a1.accepted.json`，`routeId=speak_in_public`。
- 合成修订快照：`round-1.draft.json`，三条路线各 15 场。

## One Read-Only Structural Check

于 `2026-09-06T06:41:59.590Z`，即北京时间 `2026-09-06 14:41:59.590`，从指定文件读取原文与快照，仅在内存调用一次：

```typescript
buildGeneratedWorld('import-0b3ce5e1-1f96-474d-871d-5e2a2a541713', 1, source, draft);
```

实际返回的错误：

```text
name_the_dead_separate_interview 耗尽资源时缺少有叙事后果的免费出口
```

输入文件 SHA-256：

```text
source.json:        02708f730f2db7c644ee4f32094751f1ac6378e336b9a6941ab874c1c3c09f58
round-1.draft.json: 827ddb412b7fec541c9413f2475d652f7261ea467a1255d1443b2866ced264a2
```

这是文件内容的 SHA-256，不是 `editorialHash`。校验在局部场景出口检查处停止，尚未完成后续全状态可达检查和 Ink 编译；本报告不声称它们通过，也不把这次契约错误等同于已经观察到的玩家状态死锁。

## Remaining Findings

### P1: No Ungated Free Exit at the Separate Interview

位置：死者路线已接受修订稿，场景 `name_the_dead_separate_interview`。

该场四个选项都带非空 `needs`：

| Choice ID | Required Evidence |
| --- | --- |
| `name_the_dead_separate_interview_original` | 双日期原件对应、未受动作演示影响的目击范围、二〇〇二年门向与视线 |
| `name_the_dead_separate_interview_first` | 未作动作提问登记 |
| `name_the_dead_separate_interview_stop` | 未受动作演示影响的目击范围 |
| `name_the_dead_separate_interview_submit_demonstr` | 动作演示被录下 |

即便这些门槛可能覆盖该场实际到达状态，它们也没有提供当前 `server/workshop-compiler.ts` 所要求的 `needs=[]` 且所有资源变化非负的免费出口。上面的单次真实结构校验已经确认，这份快照会因此停止发布流程。

此处源自对初始审稿 `finding_04` 的分状态修订。修复时仍须保留其纠正目标：干净证言的如实交件不应不分状态落入证据不足结局。

### P2: Final Submission Forces an Additional Fabrication

位置：死者路线已接受修订稿，`name_the_dead_version_table` 到 `name_the_dead_final_submission` 的路径。

下面的合法选择序列先保全原件、取得未诱导目击范围，并核齐两张日期和旧门视线，随后选择把经过整理成连贯稿：

```text
enter_name_the_dead
name_the_dead_handover_explain
name_the_dead_mothers_name_listen
name_the_dead_unsorted_bag_preserve
name_the_dead_dispatch_numbers_verify
name_the_dead_stair_landing_stay
name_the_dead_witness_sketch_open
name_the_dead_changed_door_verify
name_the_dead_du_statement_separate
name_the_dead_version_table_smooth
```

`name_the_dead_version_table_smooth` 的动作是“删成一份连贯经过，先拿去给秀梅核对”。反馈明确说“原稿仍由警方保留”，秀梅先追问哪些句子由老陈接上，并且“独立复问尚未安排”。随后直接进入 `name_the_dead_final_submission`。

到达此场时，玩家缺少 `提问及整理经过全页`、`独立复问约定` 和 `罗莉的亲历范围`，因此 `name_the_dead_final_submission_complete` 被锁住。该场只有另一个选项：

```text
name_the_dead_final_submission_rewrite
动作：先让秀梅照我的整理稿讲，把存疑页留在手里
去向：name_the_dead_compiled_bad
```

但该场正文同时写着“民警准备按原始材料逐项问”，且原始记录仍在警方手中。游戏没有提供如实交件、停止私人干预并承担此前整理行为后果的动作，而是强迫玩家先实施一次新的照稿复述和扣留存疑页，随后才进入坏结局。

问题不是坏结局本身，也不是要求既往污染自动恢复；问题是当前交互把“先整理给她核对”强制延伸成尚未由玩家选择的进一步造假。这是基于该快照的选项门槛和去向所作的静态路径核对，未启动实际游戏或生成进程。

## Later-Version Boundary

两项发现仅适用于上述哈希的 `round-1.draft.json` 及列出的已接受第一轮修订检查点。最终复审、后续 route repair 或新修订版本可能已经改变相应选项和去向。后续接手者应读取最新稿件重新确认，不应据本报告改写历史检查点或停止仍在运行的复审任务。
