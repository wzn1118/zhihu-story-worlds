# 知乎内容阅读搜索修复（2026-09-14）

线上搜索路由存在。服务器已安装 Linux CLI，但没有开放平台 Access Secret，CLI 实测返回 `KEYCHAIN_UNAVAILABLE`（退出码 7）；原搜索服务把它统一变成 HTTP 502。前端直接调用 `response.json()`，收到 HTML 错误页时出现 `Unexpected token`。未复现截图中 HTML 的具体来源，不将其认定为缺少路由。

修复：

- 两个知乎阅读界面共用响应解析，非 JSON、网络失败、超时均显示可读提示，保留已保存的阅读内容并允许手动重试。
- 搜索服务解析 CLI 非零退出时的 JSON，区分凭据未配置、认证失败、频率和配额错误，使用固定安全文案，不回传上游消息。
- 前端搜索超时为 60 秒，晚于服务器 45 秒截止时间；不会自动重发搜索。

验证：浏览器实际点击两个阅读组件，覆盖 HTML 502/404/200/401/504、损坏 JSON、JSON 业务错误、网络断开、超时和手动恢复；搜索服务 10 项回归测试通过，含真实子进程退出路径与 HTTP JSON 响应，发布包 TypeScript 检查及 Vite 构建通过。

OAuth 与搜索凭据：已核对官方 Skill 0.7.2-beta.20260911131715 的 `hackathon-oauth.md`、`oauth.md` 与 `http-api.md`。OAuth 返回用户 access_token，官方没有公开通过它换取 Access Secret 的接口。公共搜索要求站点的 Access Secret；站点配置一次后，已登录用户可自助搜索，无需每个用户领取密钥，调用额度归站点配置的开放平台账号。用户数据列表还需要相应用户的 OAuth Token。

官方资料包：[知乎官方 Skill](https://developer-cdn.zhihu.com/zhihu-cli/releases/beta/skill/0.7.2-beta.20260911131715/zhihu-cli-skill-0.7.2-beta.20260911131715.zip)。本次下载的参考文档位于 `/data/zhihu-project/shared/search-verification-20260914/reference/`。

本次提供的候选凭据与已有 OAuth App Key 相同，搜索返回业务码 20001（鉴权失败），已撤销该无效搜索配置，原 OAuth 配置保留。实际搜索仍需有效 Access Secret；不可将模拟结果或错误提示修复称为真实搜索成功。

部署：2026-09-14 10:52 UTC 已将修复同步到活动目录 `/data/zhihu-project/releases/oauth-20260914` 并重启 `zhihu-redleaf.service`。备份位于 `/data/zhihu-project/shared/backups/search-fix-20260914`，没有覆盖其他服务源码。10:58 UTC 公网检查通过：首页引用新构建，三个搜索相关 JS 资源的 SHA-256 与发布包一致，健康接口和账号入口正常，未登录搜索返回 401 JSON。线上已登录的真实搜索因缺少有效 Access Secret 尚未验收。记录：`/data/zhihu-project/shared/search-verification-20260914/deployment.json`。

2026-09-14 11:06 UTC：收到新的 Access Secret 后，通过隐藏标准输入临时注入 CLI，真实搜索“悬疑故事 已完结”在 671 ms 返回 5 条结果，非缓存；验证通过后才原子保存到私密运行配置（0600）。凭据没有写入源码、前端产物或公开输出。服务已切换至 `/data/zhihu-project/releases/oauth-multiuser-20260914`；本次恢复了该目录中遗漏的后端搜索错误分类，保留已有账号隔离，并通过 10 项搜索回归测试后重启生效。健康、登录与 OAuth 状态接口检查通过，`userDataConfigured` 为 true。真实后端搜索记录位于 `/data/zhihu-project/shared/search-verification-20260914/live-search.json`。已登录公网用户按钮尚未代替用户完成验收，重启后用户需重新登录。此前“缺少有效搜索凭据”的阻塞已解除。
