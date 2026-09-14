# 官网部署与验收

正式域名：`https://zhihu.hegelsalon.com/`。

## 服务

- systemd：`zhihu-redleaf.service`，已启用开机启动，失败自动重启。
- 发布目录：`/data/zhihu-project/releases/relay-domain-20260914`；以 systemd 的 `WorkingDirectory` 为准。中转自动检测发布由 `50-relay-domain.conf` 指定，保留收藏发布内容，并沿用 `30-liukan-login.conf` 的加密会话配置。
- 应用监听：`127.0.0.1:18080`。
- 启动入口：本目录的 `start.mjs`，先读取 `shared/config/runtime.json` 再导入应用。
- 账号存储沿用 `shared/snapshot-20260914-1300/.local/auth/users.json`。
- `runtime.json` 包含私密配置，不输出或复制到公开目录。
- OAuth 会话加密保存在 `shared/.private/zhihu-oauth-sessions.enc.json`，沿用持久 `SESSION_SECRET`；有效会话在服务重启后恢复。对应 systemd 配置为 `30-liukan-login.conf`。

## Cloudflare

官网模型自动检测的发布与回滚说明见 [官网模型自动检测发布](relay-domain-release.md)。IP 地址的公共服务是独立入口，官网发布必须验收本页顶部的 HTTPS 域名。

当前运行的连接器容器是 `ocean-intelligence-cloudflared-1`，使用 host 网络。
隧道编号为 `90c03910-c7c2-4b69-979e-e78f6552c5ee`，活动配置为
`/opt/ocean-intelligence/deploy/cloudflared.yml`。
官网规则已指向 `http://127.0.0.1:18080`，Ocean 和其他域名原有目标保留。

配置文件修改后只重启连接器，避免重建其他应用：

```bash
docker restart ocean-intelligence-cloudflared-1
```

Compose 文件或容器挂载发生变化时，显式指定生产文件且不重建依赖：

```bash
docker compose --project-directory /opt/ocean-intelligence \
  --env-file /opt/ocean-intelligence/deploy/production.env \
  -f /opt/ocean-intelligence/compose.prod.yaml --profile tunnel \
  up -d --no-deps --force-recreate cloudflared
```

本地 ingress 只配置转发，不能修改 Cloudflare DNS。若使用这条已连接的隧道，
Cloudflare DNS 中 `zhihu` 的 CNAME 目标应为
`90c03910-c7c2-4b69-979e-e78f6552c5ee.cfargotunnel.com`，代理开启。

## 验收与当前状态（2026-09-14 UTC）

```bash
node /data/zhihu-project/deploy/verify.mjs http://127.0.0.1:18080
node /data/zhihu-project/deploy/verify.mjs https://zhihu.hegelsalon.com
```

检查包括健康响应、实际前端 JS/CSS、公开图片、登录入口与跨域拒绝。
脚本不会注册账号、修改内容或调用付费生成。


公网验收已通过（2026-09-14T08:53:05+00:00）：用户修正 DNS 后，通过 HTTPS 检查首页、全部入口 JS/CSS、封面图片、健康接口及当前账号接口均返回 200；未登录的受保护接口与无效登录返回 401，跨来源登录返回 403。Cloudflare 1033 已消失。此次检查未注册账号或调用生成接口。

## 2026-09-14 人物美术加载优化

《重生周》已发布 WebP 交付图、当前人物优先加载和后续人物预加载。218 张审核图共减少 92.45% 传输体积，保留原始 PNG 回退；文件名含内容 hash 的 WebP 使用一年缓存，游戏页面和代码重新验证。实现、限速对比、验证记录及回滚说明见 [美术加载优化](../docs/redrain-art-performance.md)。当前服务目录以 systemd 的 `WorkingDirectory` 为准；已将缓存中间件同步至 `releases/oauth-20260914`。

## 2026-09-14 性能升级 v2

已在 WebP 优化上继续发布依赖图裁剪、单包脚本、Brotli 11 预压缩、按显示像素选图和 EWMA 自适应预加载。相同限速三轮中位数：本机首显 8.01→2.72 秒，缓存后 1.41→0.36 秒；公网单独验收首显 4.75 秒。40 项针对性测试通过。实现、基准、构建和回滚说明见 [性能升级 v2](../docs/redrain-performance-v2.md)。游戏源文件改动后需额外运行 `scripts/build-redrain-delivery.mjs` 并发布带 hash 的游戏交付包。

## 2026-09-14 叙事生成改善

当前服务已切至 `releases/narrative-quality-final-20260914`，在 question-answers 发布上定向合入人物利害、分支前提检查和完整路线写作上下文；正常模型调用次数、输出上限及时间预算沿用原值。正式域名验收通过。实现、真实样本限制及回滚记录见 [叙事生成说明](../docs/narrative-quality-20260914.md)。
