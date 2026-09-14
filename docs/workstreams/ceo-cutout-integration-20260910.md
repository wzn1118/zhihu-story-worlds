# 赤页人物素材接入与持续发布

本轮由统筹直接完成素材展示补充和实际页面验收，同时保留抠图、运行时接入、独立验收三条现有路线。

- 抠图与审核：`01a079d0-9cbe-7ce0-a890-6ae1fda93517`，沿用已有四路修边/审核任务与唯一透明图 publisher；父子 Python 进程属于同一发布树。
- 运行时接入：`01a08a9b-0936-7d43-a9d0-01741dcad791`，负责美术清单更新、状态保护、图片版本缓存与编译。
- 独立验收：`01a08b75-c3af-75c1-822e-67695e153128`，仅验证两例非开场场景，产物写入 `fork-qa`。
- 统筹：负责所有类型覆盖统计、人物资料中的合格立绘入口、三个新增开场与四种资料姿态的真实浏览器验证。

每批最多四张，交接传计数、身份与本地路径；不用完整历史或大图串接上下文，不新增重复抠图 writer，也不借本轮接入任务重启付费生成。

## 已落地的展示

人物资料保留人物原图与表情参考，同时增加通过当前审核的“立绘”和“立绘表情”切换；相同图片去重，手机按钮换行。完整场景图覆盖的备用人物素材也能在对应人物资料中查看，剧情场景仍按当前台词与同场依据选择人物。

立绘链接附带当前 SHA 参数，修边后即使文件路径相同也请求新像素。图片加载成功和失败均按带版本的地址记录，防止旧失败状态阻止新图显示。

当前已验证的正式快照：`output/coordination/cutout-game-integration-20260910/ceo-final-coverage.json`。22:24 的快照有 134 张批准透明图，全部绑定；19 个故事的 138 个节点首段可显示，包含 8 个开场。此处节点计数不等于不同立绘数，首段实际选用 48 张，其余包含反应备用与完整 CG 覆盖。

此前正式原图保持 286 张场景 CG、28 张实际使用环境图、4 张改编封面、188 张人物原图、138 张反应原图；另 22 张环境图的对应位置由完整 CG 优先显示。

游戏运行时每 60 秒只在可见、实际游玩且未打开弹窗时检查两份发布清单的响应头，版本改变后重新绑定。更新只替换画面资料，保留最新节点、段落、Ink 引擎、资源、历史、回溯次数；不会为美术刷新写入自动存档，旧会话的异步结果也无法覆盖新会话。

## 真实页面证据

- `output/coordination/ceo-cutout-integration-20260910/new-starts-report.json`：方诺、王承恩、逍遥宗师父三个新开场，桌面/手机，PNG SHA、解码尺寸和挑战模式验证通过。
- `output/coordination/ceo-cutout-integration-20260910/overview/report.json`：蓝血培训师两种立绘、未来岛两个备用人物，共四次切换；原图保留、PNG SHA/尺寸、无横向溢出、开始故事均通过。
- `output/coordination/ceo-cutout-integration-20260910/fork-qa/report.json`：`velvet-alibi/v_mic` 独立反应立绘与 `blue-blood/station` 同场人物回退；合法路线存档和真实页面共两例通过。
- `output/coordination/ceo-cutout-integration-20260910/acceptance-contact.jpg`：已检查的资料切换、非开场场景与技能客户端截图。
- `output/coordination/ceo-cutout-integration-20260910/skill-client`：技能自带客户端冒烟检查；只覆盖引导界面，具体游戏验收由以上真实场景报告提供。
- `output/playwright/live-art-refresh-20260910/verification.json`：桌面与手机的 60 秒美术更新、自动存档字节保持、继续选择和刷新续读均通过；测试在独立浏览器中用历史正式清单模拟旧页面，再切换为实收的当前清单与真实 PNG，未修改公开素材。
- `output/coordination/art-all-placement-20260910/live-refresh-tests.txt`：22 项定向检查通过，覆盖响应头、会话保护与已有立绘绑定；TypeScript 与编译通过。
- `output/coordination/ceo-cutout-integration-20260910/version-retry/report.json`：独立测试副本模拟旧版本 503、同路径新 SHA；两次实际图片请求后恢复显示，并通过 canvas 读取变更像素，进度与存档均未改写。该副本仅修改一个角落像素用于验证缓存，不属于批准素材，未写入公开资源。

验收脚本曾因带 SHA 的图片地址和改编/原作标题不同而等待超时；已分别按 URL 路径加 SHA、书籍 ID 修正验收定位，针对原案例复跑通过。

## 未完成范围

透明图仍有待审与退回修边的素材。另有 104 个当前原图 SHA 匹配但依赖已变化的旧批准候选，以及尚无可用背景的位置，已交美术所有者按源图依赖逐批核对；没有绕过 stale 或审核条件，也没有把这些候选计为已接入。

22:35 补查了这 104 张原图的当前审核侧车：104 个 SHA 仍匹配，但没有一项记录 `nativeDetailViewed: true`，因此还需真实原尺寸检查，不能仅解除 stale 后计为完整审核。只读证据为 `output/coordination/ceo-cutout-integration-20260910/stale-native-proof-audit.json`；同目录 `stale-priority-batch-01.json` 列出交给原美术所有者的首批四张，优先 `future-island/coin` 开场。没有新增审核 writer，也未修改原审核决定。

22:24 透明清单需求共 326 张：134 批准、62 待审、130 退回。独立验收确认 `velvet-alibi/v_mic` 背景缺失；该世界 13 张环境图在正式清单中均退回，当前无该节点的合格 CG，因此保留缺口，未借用其他场景图掩盖。人物本身正常显示，背景缺口已定点交给美术所有者。

运行入口为 `http://127.0.0.1:4173/`，使用 `output/coordination/cutout-followup-20260910/compiled-game` 的隔离编译产物，持续发布的 PNG 和清单由同一服务实时读取。

本次已编译 JS 为 `index-Cc8aN3Fe.js`，CSS 为 `index-BbsXt4GA.css`。已有页面需刷新一次加载功能；此后合格素材按上述 60 秒周期自动更新，无需重开故事。

## 22:46 主控交接增量

110 张的主控交接对应较早快照；当前发布 138/326，全部通过运行时绑定，20 个故事共 149 个首段可显示节点、8 个开场。新增四项是方诺主立绘、未来岛闻澄主立绘、黑洪执事反应、杀仙成道木匠反应；保留现有唯一透明 publisher 进程树，4173 实际健康接口正常。

精确增量身份、当前 SHA 与 HTTP 检查保存在 `output/coordination/ceo-cutout-integration-20260910/latest-handoff-check.json`，映射快照为 `output/coordination/cutout-game-integration-20260910/ceo-handoff-2242-coverage.json`。新批次的浏览器增量已交原接入线程，最多两例，优先未来岛；此前 12 项浏览器结果不重复计为这四张新增图片的验收。

## 23:01 增量验收回执

指定的两例新增页面已通过，报告为 `output/coordination/ceo-cutout-integration-20260910/approved-138-delta/report.json`：手机蓝血开场方诺主立绘，以及真实点击 `save_rule`、`reserve_transport` 后到达的 `future-island/depot` 闻澄主立绘。浏览器实际 PNG 响应 SHA、解码尺寸、可见状态均匹配，没有脚本错误或横向溢出，接入线程已查看截图。

该验收使用经典模式合法路线，只覆盖 134→138 批次中指定的两张，不将验收时已发布的 142 张全部计为浏览器通过。最新 142 张的绑定统计另外保存在 `output/coordination/cutout-game-integration-20260910/ceo-receipt-142-coverage.json`。

另确认 `future-island/depot` 所用 `/assets/future-island.webp` 背景缺失，人物正常；缺口与 `velvet-alibi/v_mic` 一起保留，等美术所有者提供对应的真实批准资源，不借用无依据背景填充。
