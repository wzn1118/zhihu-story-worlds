# 官网模型自动检测发布

目标为 https://zhihu.hegelsalon.com/，服务为 `zhihu-redleaf.service`，监听 `127.0.0.1:18080`。
IP 地址的 `zhihu-redleaf-public.service` 是独立入口，不能作为官网发布验收结果。

发布目录：`/data/zhihu-project/releases/relay-domain-20260914`。
基线：官网已上线的 `favorites-20260914`，保留知乎 OAuth 登录、账号隔离、收藏导入与来源标注。

用户登录后可在新故事工作台展开“配置创作中转站”。填写地址和密钥自动获取模型列表并检测连接，支持自动识别 Responses / Chat Completions；只有检测通过才可保存。没有手动模型名或推理强度输入。

个人配置按账号隔离保存在工作台私有存储中，服务端保存密钥，浏览器响应不返回密钥。空密钥重检仅使用该账号明确保存的凭据。未配置或清除个人配置时恢复站点默认，文本与简洁插图子进程继承对应账号的配置路径。

部署使用 `50-relay-domain.conf` 覆盖工作目录，沿用现有启动器、运行时配置、共享文件和 OAuth 会话存储。切换前须确认当前官网目录仍为预期基线，并检查服务 cgroup 中的后台生成进程。

验收命令：

```sh
node --network-family-autoselection-attempt-timeout=2500 --dns-result-order=ipv4first /data/zhihu-project/deploy/verify-relay-live.mjs https://zhihu.hegelsalon.com /data/zhihu-project/shared/relay-domain-deployment-20260914
node --network-family-autoselection-attempt-timeout=2500 --dns-result-order=ipv4first /data/zhihu-project/deploy/verify.mjs https://zhihu.hegelsalon.com
```

前一脚本核对 release 标记、首页与资源哈希、模型选择界面、未登录和跨域接口保护；后一脚本验证现有登录和公开内容入口。浏览器完整检测与保存流程使用隔离会话及模拟中转验证。

2026-09-14 11:45 UTC 官网 HTTPS 验收通过，健康接口返回 `relay-domain-20260914`，首页和资源哈希与本次发布包一致。隔离浏览器完整流程 14 项通过，验收记录保存在 `shared/relay-domain-deployment-20260914/public-verification.json` 与 `shared/relay-deployment-verification/domain-browser-verification.json`。

回滚时移走本次安装的 `/etc/systemd/system/zhihu-redleaf.service.d/50-relay-domain.conf` 并执行 `systemctl daemon-reload`、`systemctl restart zhihu-redleaf.service`，即可恢复既有 `40-favorites-release.conf` 指向的发布目录。回滚前同样检查后台生成进程。
