# 看山阅读手记界面

2026-09-13。Owner: reading_ui。本 lane 只新增 `src/LiukanReadingDesk.tsx`、`src/LiukanReadingDesk.css` 与此报告，没有修改 App、Pet、共享类型、后端、其他 lane 的源码或运行服务。

组件导出 `LiukanReadingDesk({ initialPostId?, onClose, onReadPost?, onProject? })`。自身通过 Portal 挂在 body，包含完整固定位置工作台、焦点限制、背景 inert、滚动锁定与 Escape 关闭，root 直接挂载即可，无需额外 overlay。关闭会恢复此前焦点与原有 inert 状态。调用来源阅读器或现有项目回调前先执行 onClose。

蓝白纸页与藏蓝书签的阅读桌：桌面左侧书袋/历史，右侧十种读法、问题与手记；手机用“细读 / 书袋与手记”分栏切换，正文保留易读字号，内部完整原文阅读层。实际使用 `/assets/liukan/computer.png` 与 `idle.png`，没有另造或生成美术。

打开只并发读取 GET `/api/liukan/inbox` 与 `/api/liukan/reading`。只有明确点击“和看山一起读”才 POST `/api/liukan/reading/run`。原文可按标题、作者、全文搜索；对读选择 2–3 篇，其他读法选择一篇。任务和列表来自发布的后端目录，不虚构工具成功。

每个完全相同的任务参数复用 requestId，存放在 sessionStorage 及当前实例 Map 中。中断后“查看这次结果”沿用原任务，服务端决定返回已有结果或保留运行/未知状态。全局活动请求 guard 防连点；更换原文、读法、问题或打开历史都会更新 revision，旧回复只存入历史，不挂到新的阅读选择上。没有自动重发、定时提交或关闭时取消后端任务。

完成的手记包含判断、逐字引文、原文入口、实际模型与保存时间。改编/对白单独标“改编草稿”，来源显示网页选取/搜索节选及保存文字覆盖情况；current=false 明示原文变化。原文以纯文本逐字显示；模型正文和引文都是 React 文本，不执行 HTML 或 Markdown。历史详情通过 GET 验证当前来源状态。

整页可复制 Markdown，失败时展开可选全文，也可由本地 Blob 下载 `.md`。内部源文阅读器可转入 root 的现有来源阅读器；有 projectId 时仅 GET 已有项目并转交 onProject，不启动生成任务。

验证：2026-09-13 `node node_modules/typescript/bin/tsc --noEmit --pretty false` 通过。本 lane 按所有权未启动浏览器或服务器，真实桌面/移动端与实际模型完成结果由 root 集成后验收，不将静态实现计为浏览器或模型成功。

建议 root 验收：首次打开零 POST；对读选源上限；真任务完成及证据回原文；关页再开历史持久化；迟到结果更换选择；网络重送 requestId 相同；390/1440 原文层与焦点、复制/下载、单标签页。
