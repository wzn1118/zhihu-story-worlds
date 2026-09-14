# 重生周公网美术加载优化（2026-09-14）

人物原图按台词出现才开始下载，切页时立即清空人物容器，PNG 下载和解码期间人物为空。首章还会请求随后被替换的 2 MB 旧背景；背景、道具和隐藏图标竞争带宽。

现在使用保持原尺寸、逐像素保留透明通道的 WebP 副本。当前人物优先下载，预先准备接下来两张不同人物/姿态图；最多并行一个当前人物和一个低优先级预取，解码缓存最多四张或 24 MiB。快速翻页会取消过期工作，加载回调不能显示旧发言者。WebP 下载或人物解码失败时仍使用原 PNG 和原有同角色候选。

图片文件名含内容 hash，浏览器和 Cloudflare 可缓存一年；HTML、JS、CSS 需要重新验证，入口 game.js 带内容版本查询参数。空图片地址返回 404。正文、选择、结局和存档格式没有修改。

## 实测

218 张审核资源共 452,679,608 → 34,167,082 字节，减少 92.45%。其中 104 张人物资源共 175,840,474 → 15,143,880 字节。全部保持尺寸，158 张含透明通道的资源已验证 alpha 完全一致，原图 SHA256 未改变。

截图中的崔语心（d08/portrait-main.png）由 1,127,720 降至 74,834 字节。生产原始 PNG 单图曾测得 13.85 秒，新 WebP 单图测得 1.75 秒；不同请求的公网状态有波动。

本机 Chromium 使用相同限速：下载 200,000 B/s，延迟 120 ms；以第一章第 4 段读档进入，等待当前段落 7 秒后切到下一发言者：

| 指标 | 原版 | 优化版 |
| --- | ---: | ---: |
| 首次显示当前人物（包含页面启动） | 59.62 秒 | 7.85 秒 |
| 下一位人物显示 | 15.29 秒 | 0.172 秒 |
| 当前人物首次就绪时已完成资源体积 | 10,380,428 B | 995,289 B |

相同限速的公网独立复测为 9.40 秒和 0.130 秒。公网与本机代码资源存在传输压缩差异，因此只把本机两组作为前后对比。预加载依赖读当前段落所提供的下载时间，连续快速翻页仍可能需要短暂等待。

## 验证与交付

- 21 项针对性测试通过：剧情/存档 15 项、预加载调度 5 项、缓存/缺图响应 1 项。
- 生产构建通过。
- 桌面 Chromium 核实五段发言者对应，强制阻断 WebP 时回退 PNG，延迟图片不能覆盖新发言者。
- 手机选择、反应立绘、刷新后的路线和阅读位置检查通过。
- 公网浏览器运行无 JavaScript 错误；生产健康、前端资源、OAuth 账号元数据、版本化游戏入口和图片缓存响应检查通过。

原始记录与截图：`output/redrain-art-speed/`，包含 `assets-report.json`、`baseline-browser-report.json`、`optimized-browser-report.json`、`public-browser-report.json`、`behavior-report.json`、`deployment.json`。

```bash
node --import tsx --test tests/redrain-state.test.ts tests/redrain-art-preload.test.ts tests/redrain-static.test.ts
npm run build
node scripts/verify-redrain-art-speed.mjs https://zhihu.hegelsalon.com/games/redrain public
node scripts/verify-redrain-art-behavior.mjs http://127.0.0.1:18080/games/redrain
```

可复用压缩脚本（Python + Pillow，需支持 WebP）：

```bash
python3 scripts/optimize-redrain-assets.py
```

脚本只读取审核模块列出的源图，新增带内容 hash 的图片，生成到 `output/redrain-art-speed/staging/src/optimized-assets.js` 的映射在发布前不会影响客户端。新增/更新资源后，应验证并发布新映射，同时更新游戏入口版本，原图保留作回退。

游戏交付目录由 `public/games/redrain` 指向共享目录。运行中的 server 发布目录应每次读取 `systemctl show zhihu-redleaf.service -p WorkingDirectory --value` 后确认；本次过程中另一项 OAuth 发布切换到了 `releases/oauth-20260914`，缓存中间件已同步到这个当前版本，保留其 OAuth 变更。

本次替换文件备份在 `shared/backups/redrain-art-speed-20260914/`。回滚游戏只需恢复备份中的 `game/src/game.js` 和 `game/index.html`；新增 WebP 不会影响旧入口。服务端回滚应仅移除 `redrainStatic` 挂载和导入，避免覆盖同期的其他服务器变更。
