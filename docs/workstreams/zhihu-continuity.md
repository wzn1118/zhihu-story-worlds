# Zhihu reading continuity / 2026-09-13

Scope: frontend continuity and drag response after the accepted native-document pass. Own ZhihuLivePage, ZhihuWorkspace and the shared frontend drop parser/tests. The existing4178/PID61884 service/profile is reused without a restart;4173/4180 and other reading/generation workers remain separate.

Changes under acceptance: keep the native iframe mounted across reading tabs; refresh saved content when entering the source reader with in-flight request coalescing; send click-to-feed browser identities directly to the pet's existing capture path for immediate pending/error UI; coalesce pointer preview/hit testing through animation frames; support Escape cancellation; keep the mobile selection toolbar height constant.

QA inventory: real signed-in page -> source reader -> same native document/scroll/input; repeated tab changes without extra browser requests; exact source after click-to-feed; pending feedback before capture completes; native/pointer drag still works; Escape cancels without saving; mobile selected/unselected toolbar bounds; touch drag and visible saved post. Each context keeps one page, and no user tab is created. Delayed-transport checks, if used, are separate from normal live response measurements. No model/image requests or story reruns are part of this UI correction.

Resume evidence (2026-09-13): the accepted live artifacts remain `output/playwright/zhihu-smooth/verification.json` and `mobile-verification.json` (desktop 1440/DPR2, mobile 390/DPR3, one page per context, exact 891-character source, native/pointer/touch feed and scroll restore). The 4178 service is still owned by PID 61884 and reports a ready frame with 12 posts and a native document; 4173 and 4180 were left untouched. Focused contract/browser tests reached 13 passing subtests; the five page-document tests were blocked before hooks by a 180-second Chromium launch timeout, so they are not counted as passes. `git diff --check` remains clean. A delayed-capture harness was not accepted as product evidence because its response waiter was registered after the direct inbox request; no claim of delayed-pending coverage is made here.

操作性微调：选择条主按钮统一至少 36px 触控高度，移动端主按钮保持 112px 最小宽度，焦点轮廓更明显，状态文案限制宽度避免挤压正文；阅读页高度同步调整以保留操作区空间。

顺滑微调（续跑）：主按钮增加 hover/active 的轻量反馈，移动端 iframe 使用 `overscroll-behavior: contain`，避免拖选或回弹时把外层工作台一起带动。

触控细节：选择条按钮关闭移动浏览器默认 tap highlight，保留自定义按下反馈，减少快速连续操作时的白色闪屏。

知乎独立页入口：新增 `public/zhihu-liukan-extension/` MV3 扩展，仅匹配知乎域名，在回答卡片注入可拖动/点击的看山入口；内容经扩展后台投递本机受限收件箱，不读取 Cookie 或登录凭据。原工作台功能保持不变。

续跑边界：当前扩展入口已能覆盖知乎回答页的卡片点击；搜索和热榜结果需要统一接入能力面板现有结果渲染器，才能复用相同拖入协议并扩充展示数量。本轮没有伪造“已接通”的结果，避免把尚未接好的页面能力误报为可用。

能力面板已将搜索/热榜等结果请求的单页数量从 5 提升到 20，保留原分页游标；拖入协议仍需在结果卡片渲染层接入后再做真实验收。

扩展入箱验收：新增 `POST /api/liukan/inbox/extension`，它复用 `capturePage` 的知乎 HTTPS、标题、作者和正文校验，再调用既有入箱服务。隔离 4179 用真实 `chrome-extension://…` Origin 发送请求，得到 `201` 和匹配的 `Access-Control-Allow-Origin`；生成的测试候选与收件箱记录已清理。桌面扩展默认直接拖卡片到看山，触屏设备保留显式按钮；纯热榜标题没有正文时不伪造可读来源。

独立知乎页拖拽闭环（续跑）：扩展覆盖回答、文章和信息流卡片，卡片可直接拖到页面看山浮标；浮标会高亮接收并反馈成功/失败。新增受限 `POST /api/liukan/inbox/extension`，服务端复用 `capturePage` 的 HTTPS、标题、作者、正文校验后写入收件箱。扩展后台按 4179、4173、4178 探测本机工作台，不读取 Cookie。隔离 4179 实测健康接口和扩展入箱成功，测试记录随后已清理；4173 未重启。

性能调整：内容脚本不再在每个知乎 DOM 变动时扫描整个页面。它只收集新增节点，并在一帧/空闲回调中批量装配；桌面端直接拖卡片，因此不再为每张信息流卡片插入备用按钮。扩展后台会缓存上一次成功的本机端口，失败端口每次最多等待 4.5 秒后切换，避免拖入时重复慢探测。

性能续跑：新增 `IntersectionObserver` 惰性装配，首屏只处理视口上下 480px 内的卡片，远处卡片进入附近区域后才挂拖拽监听，长热榜/搜索列表初次打开不会一次性绑定全部节点。

继续优化：为已观察节点去重，移除节点时主动取消观察并清理队列；拖拽正文使用 `WeakMap` 缓存，首次指针掠过时在空闲回调预热，真正拖动时不再同步读取大段 RichText。

拖入去重：扩展后台按来源 URL、正文长度和前缀生成短期键，同一内容 30 秒内复用结果；并发拖入共享同一个 Promise，避免重复写入收件箱和重复请求本机服务。

缓存上限：后台去重缓存增加 30 秒 TTL 和 64 条上限，每次新投递时清理过期/最旧条目，长时间浏览不会让扩展后台内存持续增长。

能力入口修复：热榜/知乎搜索/全网搜索单页上限分别扩到 50/30/30，并把 `offset/limit` 真正传给 CLI；此前前端虽然显示 20，后端仍限制搜索 10 且翻页没有携带分页参数，造成点击后看似无响应或下滑重复。能力契约测试现为 9/9 通过。

拖拽协议修复：能力结果卡片此前写入了 `application/x-redleaf-candidate`，看山实际监听的是 `application/x-redleaf-zhihu-candidate`，导致热榜/搜索拖入失效；现已统一复用 `LIUKAN_POST_MIME`。能力与拖拽聚合测试 13/13 通过。

推荐页实时拖动：扩展不再依赖卡片进入视口或先完成卡片监听，改为文档级 `dragstart` 捕获；知乎推荐页动态加载出一条卡片后即可直接拖动，页面自身继续负责无限下拉，扩展不设置条数上限。

最终时序修复：新卡片首次按下时同步设置 `draggable`，即使 MutationObserver 尚未处理这一批 DOM，也能立刻开始拖动；浏览器回归验证动态插入卡片 `draggable=true` 且 payload 当场可读，测试通过。
