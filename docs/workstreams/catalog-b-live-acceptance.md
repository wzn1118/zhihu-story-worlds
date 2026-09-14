# B 组真实页面验收

## 本轮边界与当前进度

- 已读协调文件及 `catalog-b.md` 最新交接。根会话已完成共享断言修正、280/280 测试及 4173 刷新；本轮不重复扩写故事，不重启服务。
- 现有 `output/playwright/catalog-gameplay` 是旧版综合抽测；核心故事浏览器脚本还使用过浏览器响应替换，均不作为本轮 B 2.0.0 / 16 路线的真实 HTTP 验收证据。此前没有本文件或完整 B 实玩证据。
- 本轮从真实书库进入八篇故事，复用 `tests/catalog-b-inventory.json` 的已验证结局路径；桌面与窄屏分别检查路线、资源、失败结局、原文返回、保存/载入、回溯与结局重开。
- 不使用 `route.fulfill`、假 world API 或预置游戏存档；只允许隔离浏览器的阅读偏好设置。图片缺失、降级与玩法通过分别记载，不以场景数充当图片数。
- Playwright CLI 因本机 npm 缓存路径错误未启动；改用项目已安装的 Playwright 库驱动真实浏览器，不安装新依赖。

## 验证结果

### 已执行的真实 UI 基线

- `output/playwright/catalog-b-live/baseline/report.json`：100/100 完成，桌面 1440×960 和窄屏 320×740（22px 字号、触摸上下文）。八世界的 16 条路线、50 个新结局分别在两个视口完成；其中 18 个 Bad Ends 各完成两次。路径共 596 次正常选项点击，另有保存/回溯重放点击。
- 32/32 路线与视口组合完成：原作逐字对缓存、定位短引文、返回原手记页、保持剧情段落和资源；真实手动保存、整页刷新后从书库载入、重选上一步及重放。100/100 结局回看和“翻开另一种可能”重开通过。没有页面脚本异常或横向溢出。
- `late-cases/report.json` 另完成 10/10 针对性真实 UI 流程，确认已渡河、已请辞、已入药、已撤离等状态下，旧版共享结局的具体文案矛盾。另验证轻装且没推车时仍出现“重车”选项。路径来自上述已跑完的结局路径，不是生成存档跳转。
- 32 个读原作结果均包含原文哈希与作者，100 个结局均在界面显示“此结局为独立互动改编”。

### 本轮修订及加载进度

- `content/catalog-b-live-prose.ts` 通过 B 导出末尾挂接。修正晚期退让结局倒退事件、选择前先写成已交钥匙、轻装却要求推车、病后突然恢复且时间栏始终“时限内”、无交易却退回车钱、已撤离又补拍却写成首次事故等具体问题。保留原节点、已有选项 IDs、费用、门槛、效果和去向；改词保留 `legacyTexts`。
- **资源穷举发现两项真实缺口**：旧 `island-broadcast / shore`、`wrong-realm / judgment` 从固定初始资源出发，找不到“自然耗尽且行动因此锁定”的状态。`pressure/report.json` 与 `pressure-wrong-realm-chrome/report.json` 保留失败，不算通过。
- 只增加两项现有场景内的选择，未新增场景：`b_shore_notice/escort_route` 消耗精力 2、余刻 3，陪王玥实际辨认蓝绳退路，后续可省接应船补给；`b_sword_offer/read_terms` 消耗余刻 2，请年轻裁判当众重念替战条款，补齐公开裁定的条件，但拖延过久会错过继续保冷的机会。两篇升为 **2.0.1** 并声明兼容 **2.0.0 / 1.0.0**；其余六篇仍为 2.0.0。所有既有选择费用与跳转保持不变。
- `tests/catalog-b-live-prose.test.ts` 使用本轮修改前真实 HTTP / Ink 压缩基线 `tests/fixtures/catalog-b-live-before.json.gz` 验证旧 v2 存档；不是由修改后的图倒造基线。当前 B 专项 **93/93** 通过，覆盖 768 条旧边前后的 1536 个保存位置，每个位置验证 ID / 纯文本历史与再保存；新增两项选择另有耗尽/收益正反例。连同共享全图回放及资源测试，**121/121** 通过。共享可达性断言未放松。
- 本轮末端只读检查发现共享服务监听进程已由 49796 变为 **57008**，不是本会话操作。HTTP 已载入八篇文字修订及潮滩 2.0.1，wrong-realm 仍为 2.0.0、尚缺 `read_terms`。因此继续做已经发布部分的针对性 UI 复验，而不是重复整套基线。

### 美术与发布状态（不混入玩法通过）

- 本轮看到的八篇场景背景均为 `backgroundState.status: unavailable`，请求为各自 `/assets/<worldId>.webp`，实际没有可用背景图。已打开检查桌面玩法、窄屏玩法、原作、回溯与坏结局截图；文字和按钮可用不代表场景插画通过。
- 本会话没有请求或制作图片；不从场景 ID 推算图片交付。**B 组美术视觉验收未通过。**
- 初始 100 次实玩针对根会话此前已发布的真实 2.0.0 图。后续发布状态以 `publication-check.json` 及本文件最后复验段为准；本会话没有启动或重启共享服务，没有改 UI/server，没有提交。

## 最后交接 / 2026-09-06 11:05 中国时间

### 已完成与仍需接手

1. **16 条路线基本实玩已完成**：100 个基线 UI 流程，32 组原文返回/存档刷新载入/回溯，全部结局重开通过。没有 fake API、响应替换或注入游戏存档；`advanceTime` 只加速逐字显示，不改变资源或剧情状态。
2. **已发布的具体文案修订已定点复验**：`corrected-late-cases` 的 8 项通过与 `corrected-wrong-departure` 的 2 项通过，共 10 项；覆盖过河后住仓、请辞后休息、轻装走沟、入药后休养、撤离后补拍。新增潮滩 2.0.1 也完成桌面/窄屏自然耗尽与退让，共 2 项。
3. **自然资源压力目前实时通过 15/16 条路线、30 个路线×视口组合**。源码中 16/16 有自然耗尽且付费行动被锁住的实际路径。唯一未完成实时点验的是 `wrong-realm / judgment` 新选择 `read_terms`：末次 HTTP 仍是 2.0.0，源码为 2.0.1；其余七篇与源码节点逐项相同。
4. **请根会话只加载并复验这一处剩余增量**，不要重跑整套扩写。当前节点仍为 338 个、结局 74 个；选项边从 768 增为 770。没有新增场景 ID。相对于本轮最初 HTTP 的 46 个文字/时间/选项修订节点，逐项列在 `publication-check.json` 的 `contentRevisionChangedNodes`，可用于美术内容版本失效核对，不能当作图片数。
5. **美术未通过**：八个背景资源实际返回 `text/html`，浏览器解码后均为 unavailable；HTTP 200 不是有效图片交付。没有新增付费请求、没有生成图片。

### 可复核证据（本轮新产物）

- [汇总与各世界源码/实时版本](E:/知乎/output/playwright/catalog-b-live/summary.json)
- [末次 HTTP 与修订节点清单](E:/知乎/output/playwright/catalog-b-live/publication-check.json)
- [100 次基线实玩，含逐场正文、资源、锁定、路径和截图](E:/知乎/output/playwright/catalog-b-live/baseline/report.json)
- [旧版五类因果问题的 10 次实玩](E:/知乎/output/playwright/catalog-b-live/late-cases/report.json)
- [修订后定点复验：已通过的前八项](E:/知乎/output/playwright/catalog-b-live/corrected-late-cases/report.json)；[剩余两项重跑通过](E:/知乎/output/playwright/catalog-b-live/corrected-wrong-departure/report.json)
- [潮滩 2.0.1 实时自然耗尽与退让](E:/知乎/output/playwright/catalog-b-live/corrected-shore-pressure/report.json)
- [121 项 B/共享图/资源检查完整日志](E:/知乎/output/playwright/catalog-b-live/focused-and-shared-graphs.log)
- [真实 v2 修改前的压缩基线](E:/知乎/tests/fixtures/catalog-b-live-before.json.gz)
- [窄屏：已过河后入住堤仓，不再写成尚未渡河](E:/知乎/output/playwright/catalog-b-live/corrected-late-cases/red-plum-ferry-b_ferry_small-320.png)
- [窄屏：潮滩余刻归零，扶人路线锁定，接应船及退让仍可用](E:/知乎/output/playwright/catalog-b-live/corrected-shore-pressure/island-broadcast-shore-b_shore_small-320-depletion.png)

### 自动化重试记录

- 两次 Edge 进程非预期退出，失败文件保留；剩余耗尽点用本机 Chrome 重跑通过，没有把被中断的运行计为成功。
- 一次刷新载入后的 RAF 等待超时，失败截图实际已显示正确载入节点。脚本改为每 100ms 轮询**相同条件**，保留全部状态断言后重跑两项通过。这不是放松游戏可达性或存档校验。
- 本轮没有编辑共享 UI/server、其他 catalog、协调文件或共享进程配置。仅 B 内容适配器、B 测试/脚本、B 报告与证据文件；没有提交。

### 根会话剩余的最短复跑

确认真实 `/api/worlds/1716453753710972928` 已返回 2.0.1 且 `b_sword_offer` 含 `read_terms` 后执行：

```powershell
$env:B_LIVE_BROWSER='chrome'
$env:B_LIVE_WORLD='wrong-realm'
$env:B_LIVE_ROUTE='judgment'
$env:B_LIVE_PRESSURE='1'
$env:B_LIVE_OUTPUT='output/playwright/catalog-b-live/corrected-judgment-pressure'
npx tsx tests/catalog-b-live-browser.ts
npx tsx tests/catalog-b-live-summary.ts
```

对应已验证的新路径：`b_enter_judgment → rule → wait → refuse_drug → truth → equal → read_terms → b_withdraw`。在 `b_coldcase` 余刻归零，`cool` 应显示锁定，退让到 `b_judgment_small` 仍可点击。复跑会分别检查 1440 与 320 视口、原文返回、存档/回溯和结局重开。若 API 仍是旧版，脚本会保留失败，不替换响应使其假通过。

收尾补查：再次读取该世界的两次 shell 调用分别在约 12.4 秒和 25.5 秒超时，未取得新的 HTTP 结果。因此本报告的实时版本以 **11:05 的最后成功核验** 为准，不将超时推断为已更新或服务已停止。根会话接手时先确认接口可响应，再检查 `read_terms`；本会话未做进程干预。最终代码再次运行上述聚焦套件为 **121/121**，随后 `tsc --noEmit` 通过。
