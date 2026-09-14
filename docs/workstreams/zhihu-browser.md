# 游戏内真实知乎浏览器

## 登录后首页回答捕获修复 / 2026-09-12

根线程在已登录的产品浏览器里展开“低魔、中魔、高魔是什么？”后，真实正文出现但旧接口 posts 为 0。本轮没有操作该浏览器、读取它的凭据或重启 4178/PID 47192。

修复两个明确漏项：旧提取器先取 `meta[itemprop=url]`，首页该节点可能是问题 URL，后续即使有回答 URL 也被忽略；旧根节点选择器也遗漏没有 `.AnswerItem` 类的 `.TopstoryItem .ContentItem`。新固定脚本 `ZHIHU_READABLE_POSTS_SCRIPT` 支持这些首页卡片，按实际 DOM 逐一验证回答/文章 URL；在页面只提供问题链接与 `data-zop` 回答 ID 时组合这两个实际标识，并从 JSON 原始数字 token 读取长 ID，防止 JavaScript 大整数截断。标题和作者只来自卡片 DOM 或该卡片自身元数据，缺失时跳过。

正文始终保留选定 `.RichText` 的原始 `innerText`，不混入“阅读全文/收起”等按钮。`ZhihuBrowserPost.visibleScope` 新增 `excerpt | expanded`：首页未展开超过 80 字的可见节选可以选择，但应展示“网页可见节选”；展开项应展示“网页展开正文”，两者均保持来源 `webpage-selection`，不宣称原作完整。根线程需在卡片标签使用该字段，旧前端仍兼容。

6/6 聚焦测试和当前 `npx tsc --noEmit --pretty false` 均通过，其中新的真实 Edge DOM 契约测试覆盖问题 metadata 优先、首页无 AnswerItem、长整数回答 ID、展开精确保留 innerText、未展开范围、隐藏卡片与只有问题身份的内容过滤。该 DOM 是明确的合成夹具，未计为当前知乎正文捕获成功；当前登录页新代码仍待服务持有者载入后的真实验收。

无重启更新建议：由当前服务持有者在安静窗口通过已有的本机调试入口给现存 `ZhihuBrowserService` 原型载入固定 `extract` 与 `snapshot` 方法，保留同一个 context/page/ownerToken；这不是给网页或 API 增加执行任意代码入口。当前代码没有现成热加载器，单纯磁盘写入不会更新运行中的 Node 模块。若持有者没有调试热更新路径，先协调维护窗口再载入后端；独立 profile 的登录状态正常情况下持久保存，但不应为本次修复复制凭据或同时启动第二个相同 profile 的浏览器。本线程未执行任何热更新或关闭动作。

## 工作台整页入口 / 2026-09-12 21:04

当前入口由根线程集成在故事改编工作台，打开后占满工作区，刘看山浮在上方；此前“游戏侧栏”的理解已废止。本服务继续只提供真实浏览器画面与可见正文，不打开用户的新标签页。

本轮后端修复：导航在真实文档提交后返回，避免知乎延迟脚本让每次操作额外等待 25 秒；截图沿用 CDP 当前渲染面，不等待远程字体。并行 `GET /frame` 共用同一次截图，截图失败后可正常重试。配置目录释放按持有令牌合并，部分启动失败会关闭本次创建的浏览器，保留其他服务持有的目录。

聚焦测试 **5/5** 通过：新增双读取合并、截图失败恢复、另一个服务的有效持有记录不得被关闭或删除。测试图片字节为传输夹具，不计为真实页面或插画。未重跑全仓测试，未重启任何共享服务器。

本轮 TypeScript 检查发现并行编辑中的 `server/liukan/answer.ts:20` 缺少嵌套三元表达式的 `: ...` 分支（TS1005）；该文件在看山后端线程范围，本线程未改动它。浏览器代码本轮聚焦测试正常执行。

实际网络验证均使用 `.local/zhihu-browser-validation` 下的独立 profile，未读取或复制用户现有浏览器凭据：

- 修改导航等待前，Chromium 主页 31,114 ms 返回真实 HTTP 200 登录页，滚动与 Tab 后 frameId 更新；截图已查看。证据 `output/playwright/zhihu-browser/2026-09-12T12-57-05-578Z/results.json`。
- 修改后，实际已保存文章 `https://zhuanlan.zhihu.com/p/2073475717396951749` 在 5,328 ms 返回 HTTP 403，实际画面显示知乎限制访问信息，可选帖子为 0；滚动与 Tab 正常，未伪装成正文。截图已查看。证据 `output/playwright/zhihu-browser/2026-09-12T13-00-40-826Z/results.json`。
- 修改后，默认 Edge 主页 10,379 ms 返回真实 HTTP 200 登录页，滚动与 Tab 后 frameId 更新，前后截图均已查看；证据 `output/playwright/zhihu-browser/2026-09-12T13-02-24-283Z/results.json`。本轮未登录，原生网页正文捕获仍待用户在该页面完成登录后验收。这项限制与已完成的官方接口节选阅读、看山问答分开记录。

根线程仍需完成最终产品 URL、桌面与移动端整页入口及拖给看山的验收；本后端检查不替代该前端验收。

2026-09-12：后端接口已固定，根线程可同步开发前端。

挂载 `app.use('/api/zhihu-browser', createZhihuBrowserRouter(discovery))`。`discovery` 为现有 `ZhihuDiscoveryService`，选篇调用其 `capturePage`，保持 `webpage-selection` 来源与真实原文链接。

- `POST /open { url?, width?, height?, channel? }`：用户明确打开时才创建独立持久浏览器，默认首页，返回真实截图与可选文章。
- `GET /frame`：当前截图，未开启时返回 `status: closed`，不会启动浏览器。
- `POST /action`：`navigate/back/reload/click/scroll/text/key`，详细联合类型在 `shared/zhihu-browser.ts`。
- `POST /capture { postId, frameId }`：只接收当前真实页面抽取的帖子 ID，正文来自后端浏览器，返回 `ZhihuCandidate`。
- `POST /close {}`：只关闭本服务的独立浏览器。

截图为 JPEG data URL，尺寸为浏览器 CSS 像素；点击坐标按 frame.width/frame.height 换算。拖拽 MIME 为 `application/x-redleaf-zhihu-browser-post`，payload `{ postId, frameId }`，拖到宠物后调用 capture。前端不要把远程 DOM/JS 注入游戏页面。

状态包括 `closed/ready/login-required/blocked/error`，保留真实登录或拦截画面。没有自动打开外部页面或复制现有浏览器凭据；profile 独立存于 `.local/zhihu-browser`，服务惰性启动并串行操作。默认使用本机 Edge；`channel: chromium/chrome/msedge` 可在显式打开时选择，切换前应调用 close。

## 首轮实际网络结果

`tests/zhihu-browser-live.ts` 用三个完全独立的验证 profile 分别试用浏览器，不占用产品 profile。Chromium、系统 Edge、系统 Chrome 均真实呈现知乎验证码/密码/扫码登录页面（HTTP 200），不是重画的静态页面；目录 `output/playwright/zhihu-browser/2026-09-12T11-11-02-981Z/` 的三张 JPG 均已人工查看。截图中的账号输入均为空。当前没有登录，因此可选文章数量为 0；没有将登录页当作帖子。首轮首次打开含本机浏览器冷启动分别 185727 / 376030 / 84399 ms；这些耗时达不到迅速要求，后续复用与端到端速度仍待验收。

首轮运行在 frame 元数据修复之前：标题和 URL 抓取过早显示 about:blank，但截图是实际知乎登录页。现已将标题/URL读取移动到截图之后，后续请求会返回稳定后的当前地址；没有把这份首轮 metadata 声称为完整导航验收。

聚焦测试 3/3 通过：HTTPS Zhihu 顶层地址限制、原文及 canonical identity 保留、GET frame 和 close 不触发浏览器启动。当前 TypeScript 检查通过。真实文章可读性、capture 与整合 UI 结果继续补充。

跟进读取本地真实搜索记录的首篇链接时，Chrome 截图遇到 10 秒渲染超时，尚未取得可拖拽正文；已把截图等待调整到 20 秒并加入明确的 `BROWSER_FRAME_TIMEOUT`，前端可点击更新画面继续，无自动重发或换用伪造页面。异常路径验证所用数字示例链接返回 403，仅验证状态处理，不计为真实帖子证据。
