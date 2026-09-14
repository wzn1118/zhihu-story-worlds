# 现有美术接入游戏

已核对 2026-09-10 18:54 的正式发布清单，并在 4173 的实际页面完成验收。

| 资源 | 实际位置 |
| --- | --- |
| 286 张完整场景图 | 对应的剧情与结局节点背景 |
| 28 张环境图 | 39 个没有完整场景图的剧情位置；本次新增 32 个位置 |
| 4 张改编封面 | 各自世界序章，保留原作封面与原作链接的标识 |
| 188 张人物设定、138 张表情图 | 对应世界的人物资料，可切换表情，图片懒加载 |
| 33 张已批准透明人物图 | 全部绑定对应角色；当前 13 个故事、62 个节点可显示，包含 blue-blood 与 red-plum 开场 |

另外 22 张已批准环境图的对应位置已有完整场景图，作为该场景图撤销后的回退资源；没有按名字猜测场地或重复叠图。待审、拒收和旧 SHA 的透明版本继续不发布。

人物选择以当前段落、台词者和明确同场名单为依据，保留剧情原角色字段。独立批准的透明表情姿态可以用于该角色，主图缺失不再使整张合格素材被忽略。完整场景图保持原有构图，人物立绘不额外覆盖其人物。

并行贡献：Halley 完成人物绑定和选择 helper；Socrates 完成界面选择接入；全类型位置线程完成环境运行时和支持角色保留；精简发布恢复线程补齐 source-book 环境映射并修复只改审核侧车时不刷新的 watcher；root 完成 helper 合并、独立表情回退、人物资料与封面位置、覆盖统计和实际浏览器验收。

原总控遇到 40MB 请求超限后，root 验明并停止原图 publisher 9668，交由精简恢复线程接管；当前唯一原图 publisher 为 PID 4084。透明 publisher 的既有父子进程树未改动。游戏仍由 4173 的隔离编译预览提供，修改源码后需要重编译，现已编入本次功能。

验证：全量 846 项通过；随后新增环境映射相关 14 项针对性检查通过。桌面和手机均实际验证透明人物、资料表情切换、选项推进与自动存档续读；另外通过有效路线存档验证 rotten-pilgrimage、ming-whisper、hollow-immortals 的新增环境，以及 happy-home 完整场景不叠人物。六个实际浏览器案例均无页面异常，截图已查看；浏览器抽查没有覆盖全部 286 个场景。

证据：

- `output/coordination/cutout-game-integration-20260910/final-coverage.json`：逐资源绑定与所有类型计数。
- `output/coordination/art-all-placement-20260910/after-coverage.json`：环境 50 张的逐图去向，未解释遗漏为零。
- `output/coordination/art-in-game-20260910/report.json`：桌面/手机人物与续读。
- `output/coordination/art-in-game-20260910/environments/report.json`：3 个新增环境和 1 个完整场景。
- `output/coordination/art-in-game-20260910/environments/contact-sheet.jpg`：抽查场景截图。
- `output/coordination/art-in-game-20260910/full-tests.log`、`publication-tests.log`：测试输出。

打开现有页面后刷新一次可载入本次编译；既有存档继续可用。后续新增已审核素材由唯一 publisher 更新清单，重新进入故事时读取。
