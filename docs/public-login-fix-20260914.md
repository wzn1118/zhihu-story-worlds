# 公网登录修复验收（2026-09-14）

验收地址：http://103.236.94.87:18080/

问题是生产环境登录 Cookie 固定启用 Secure，浏览器通过 HTTP 访问时无法保存会话。密码校验成功后，旧界面直接进入书库，后续请求仍返回 401。

当前发布目录为 `/data/zhihu-project/releases/authfix-20260914-1`。HTTP 实例显式配置 `SESSION_COOKIE_SECURE=0`，保留 HttpOnly 与 SameSite=Lax；登录/注册完成后再次调用 `/api/auth/me`，确认会话有效才进入书库。静态资源从发布包的 `dist` 和 `public` 提供，书库预加载实际显示的封面。

公网实例由 `zhihu-redleaf-public.service` 管理，监听 `172.16.0.153:18080`，启用自动重启与开机启动。启动器为 `/data/zhihu-project/shared/run-public.mjs`，从持久运行配置读取原会话密钥和原账号库。域名实例使用独立的 loopback 监听地址。

验证结果：

- 发布目录 TypeScript 检查及 Vite 构建通过。
- 在真实 Chromium 中通过公网地址完成注册、退出、密码登录和刷新页面；HTTP Cookie 正确保存。
- 重启公网 systemd 服务后，已有会话仍有效。
- 书库接口返回 20 篇原作，20 个对应故事世界接口均为 HTTP 200。
- 从书库进入《蓝血》，完成翻页及一次分支选择。
- 最终浏览器验收无脚本错误，无本站资源请求失败。
- 临时验收账号与临时浏览器凭据已删除，原有账号保留。

记录和截图位于 `/data/zhihu-project/shared/public-verification/`，其中 `login-result.json`、`play-result.json`、`cleanup-result.json` 为验证结果。

该 HTTP 实例的 Cookie 覆盖配置仅用于现有 IP 地址入口；HTTPS 实例保留默认 Secure 设置。
