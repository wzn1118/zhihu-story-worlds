# 知乎 OAuth 公网接入

当前应用为赤页，App ID 为 `580`，预期回调为
`https://zhihu.hegelsalon.com/auth/callback`。必须与知乎平台登记值完全一致。

## 官方资料核查（2026-09-14）

安装包内官方 Skill 0.2.1 的 OAuth 说明已落后于黑客松补充资料。实现依据官方
[Skill 0.7.2-beta.20260911131715](https://developer-cdn.zhihu.com/zhihu-cli/releases/beta/skill/0.7.2-beta.20260911131715/zhihu-cli-skill-0.7.2-beta.20260911131715.zip)
中的 `references/hackathon-oauth.md` 与 `references/hackathon-user-profile-api.md`：

- 基础登录与 `/user` 不需要 Access Secret；请求头只传 OAuth Token 的 Bearer 鉴权。
- 黑客松 OAuth 已支持 `state` 原样回传，必须严格校验并一次性消费。
- 基础资料字段为 `hash_id`、`uid`、`fullname`、`avatar_path`；数字 `uid` 无损解析。
- 创作、关注与收藏列表仍需 Access Secret 和 OAuth Token 两项凭据。

仅查阅新版资料，未改动用户指定安装包及其官方 Skill 快照。新版参考包 SHA-256：
`7408ea4cb339c27294c3d664ac2f8c14b21b30c24b2bfb82dc0bd86d78443fb2`。

[赛事页面](https://www.zhihu.com/hackathon?activity_code=zhihu_hackathon_2026_p2)
的「编辑项目信息」包含「知乎登录回调地址」；留空时使用「作品链接」。
2026-09-14 本人已确认该字段为 `https://zhihu.hegelsalon.com/auth/callback`，
与运行中的配置一致；真实授权仍需回调成功后才能验收。

## 已安装资源

- Hackathon Skill：`/root/.codex/skills/zhihu-hackathon/SKILL.md`。
- 官方知乎 Skill：项目 `.codex/skills/zhihu`，保留随包内容，未修改。
- 官方生成器创建的独立联调项目：`tools/zhihu-oauth-demo`。
- 当前应用公开配置：`hackathon.config.json`，不包含密钥。

官方 ZIP 的 SHA-256 为
`be08e10bbd8f7c554456599e1bdf9e4a4f9216a7624d0b29218e9e4dc1c2f9f3`。
随包安装脚本只支持 macOS/Windows；服务器复用已安装且状态检查兼容的 Linux CLI：
`/data/zhihu-project/shared/tools/zhihu-cli/current/zhihu-cli`。

## 服务器配置

`deploy/start.mjs` 在载入应用前读取权限为 0600 的
`/data/zhihu-project/shared/config/runtime.json` 并注入环境变量。不要将该文件放入代码包。

| 变量 | 用途 |
| --- | --- |
| `PUBLIC_MODE=1` | 强制知乎登录，关闭本机共享浏览器 |
| `ZHIHU_OAUTH_APP_ID=580` | OAuth 应用编号 |
| `ZHIHU_OAUTH_APP_KEY` | 后端交换授权码的应用密钥 |
| `ZHIHU_OAUTH_REDIRECT_URI` | 已登记的公网 HTTPS 回调 |
| `ZHIHU_ACCESS_SECRET` | 可选，仅创作、关注、收藏列表及平台搜索需要 |
| `ZHIHU_CLI_HOME` | 已安装的 CLI 根目录 |

App Key 已通过隐藏标准输入配置。仅需要附加列表或搜索功能时，才在
[知乎开放平台个人页](https://developer.zhihu.com/profile) 生成并配置 Access Secret。

## 登录与阅读行为

公网登录入口为 `/api/oauth/start`，授权回调为 `/auth/callback`；
状态端点为 `/api/oauth/status`，应用账号端点为 `/api/auth/me`。
公网模式拒绝旧邮箱密码登录及旧本地会话。配置 `ZHIHU_OAUTH_SESSION_STORE` 后，
OAuth 会话使用持久 `SESSION_SECRET` 加密保存在服务端私有文件中；未过期会话可在
服务重启后恢复。未配置持久存储的开发实例仍只保留内存会话。授权过期或退出后需要重新授权。

域名版存储路径为 `/data/zhihu-project/shared/.private/zhihu-oauth-sessions.enc.json`，
目录权限为 0700、文件权限为 0600，不能放入静态资源目录。每个存储文件仅供一个应用进程使用。
更换发布目录时须沿用同一文件和密钥；损坏或密钥不匹配时启动失败，不接受无法验证的会话。
工作台收到 `AUTH_REQUIRED` 或 `ACCOUNT_CHANGED` 后重新检查当前账号，失效时返回登录页。

回调同时兼容 `authorization_code` 和 `code`，严格要求有效的 `state` 与发起浏览器关联。
黑客松当前协议支持回传 `state`；不适用旧版通用文档中未回传的历史例外。
使用官方 `hash_id` 或无损 `uid` 识别用户；没有稳定身份时不建立应用账号会话。

OAuth 不会提供知乎网站登录 Cookie。公网选篇使用官方内容阅读入口，并在用户浏览器
的新标签页打开原文，不启动服务器上的 Edge。

## 验收

生成器 Demo 的 `npm test`、`npm run check`、`/api/health`、`/api/oauth/status`
已通过本地检查。旧版 Skill doctor 确认 App Key 与公网回调已配置、CLI 可用，
但会因为未配置 Access Secret 报 `readyForOAuth=false`；这一模板条件不适用于新版基础登录。
主应用分别报告 `configured`（登录）与 `userDataConfigured`（附加列表）。

主应用和候选发布版本构建通过。OAuth 和公网认证测试 21 项通过，相关回归测试
58 项通过；桌面 1280px 与手机 390px 的登录、配置错误、会话失败、退出、选篇入口均通过浏览器检查。
全量测试为 1084 通过、60 失败、8 跳过；失败主要涉及缺失美术验收资源、历史内容与浏览器测试，
不能声称全量测试通过。浏览器截图在 `output/oauth-ui/`。

真实授权需用户亲自在知乎页面点击最终确认。随后使用 `/api/oauth/run-all`
最小读取创作、关注、收藏夹、首个收藏夹内容、近期收藏各一条。
没有收藏夹记为空；鉴权失败立即停止，不退回开发者账号。未完成真实授权前，
这些接口的线上验收状态均为待验证。

## 公网发布

当前服务已发布到 `https://zhihu.hegelsalon.com/`，运行目录为 `releases/oauth-20260914`。
真实公网检查确认健康接口 200、OAuth 发起接口 302、未登录工作台接口 401；
浏览器已从站内按钮到达知乎 `/signin`，没有代用户完成最终授权。
完整机器记录见 `oauth-verification.json`。

## 授权确认页报错排查（2026-09-14 10:15 UTC）

用户在知乎确认授权页遇到「出错了！请稍后再试。」。公网真实浏览器检查确认
首页与静态资源正常，登录按钮到 `/api/oauth/start` 返回 302，后续到知乎登录页时
`app_id=580`、回调地址、`response_type=code` 和 32 字符 `state` 均完整保留。
认证回归检查 30 项通过；这些检查不能替代真实用户授权。

知乎匿名 `/authorize` 会把 `/signin` 的 `next` 写成 HTTP，尽管发起地址是 HTTPS；
同时其响应带 HSTS，尚不能把 HTTP 字符串认定为当前报错原因。
服务未记录成功的授权码交换。唯一已记录的缺少 `state` 回调不能证明来自
该次确认授权操作，直接打开回调地址也会产生这个结果。

下一步需要用户报错时授权页的实际网址；如参数仍完整，则继续检查本人点击
确认授权时失败请求的状态与脱敏错误信息。不能根据可达性或 Mock 测试宣布已修复。
`deploy/verify.mjs` 已改为检查当前 OAuth 登录契约及 Cookie；其成功只代表站内链路通过。
