# 重生周性能升级 v2（2026-09-14）

用户选择“画质与速度均衡”。本次在已上线的 WebP 与人物预加载基础上继续优化，已发布到公网游戏。方法按实际资源、浏览器行为及相同网络条件验证，不对算法作缺少基准支持的“全球最佳”排名。

## 实现

1. **依赖图裁剪与构建期压缩**：将游戏的模块依赖合并成单个内容哈希 JS；提取本地固定版本 Lucide 的官方 DOM 实现，只保留实际使用的 15 个图标及 ISC 许可。图标代码由 357,796 B 降至 7,960 B。合并三份 CSS，修正图片相对地址。静态资源在构建时执行 Brotli quality 11 和 gzip level 9，请求时无需实时压缩。
2. **按像素约束选择最小传输体积**：使用预乘透明通道的 Lanczos 重采样，生成 512/768 宽的 WebP q86 副本；客户端根据 CSS cover/contain、显示区域和设备像素比，选择像素数足够的最小文件。高分辨率显示需要时使用原尺寸 WebP；失败仍回退原 PNG。横竖屏与窗口变化会重新选图，升级期间保留当前人物。
3. **EWMA 自适应预取**：以实际下载速率的指数加权移动平均（新样本权重 0.35）、可用的网络提示和设备内存调整调度。慢网及未知网络优先完成当前人物；快网最多同时下载当前人物和一张预取图。省流量模式关闭预取。
4. **按剧情顺序和内存成本保留缓存**：优先保留当前人物和最近要出现的人物，过期资源先按 LRU 淘汰；缓存同时受图片数与解码字节约束。选择结果确定后只预取实际下一章，不遍历未选择的剧情分支。最多准备两个后续人物。

服务器使用 `Vary: Accept-Encoding`、按压缩表示区分的 ETag，并保留 HEAD、Range、条件请求、缺图 404。带内容 hash 的 JS/CSS/图片可缓存一年，入口 HTML 重新验证。

AVIF 仅做候选基准：本机 Pillow/libavif 使用 q85、4:4:4 时，部分透明人物与参考 alpha 的像素差达到 9–13，所测背景也比 WebP 更大；该参数组合未进入交付。这不代表 AVIF 在其他图片或编码参数下普遍更差。评审图和指标在 `output/redrain-performance-v2/codec-review/` 与 `codec-benchmark.json`。

## 三轮可比实测

Chromium，1440×960、DPR 1，下载 200,000 B/s、延迟 120 ms，独立冷缓存上下文，从第一章第 4 段读档进入。阅读当前段落 4 秒后切到下一位发言者。下表时间取三轮中位数，上一版与新版均从本机测试服务器读取，避免公网边缘节点波动混入对比。

| 指标 | 上一版 v1 | 本次 v2 |
| --- | ---: | ---: |
| 首次人物就绪（含页面启动） | 8.010 秒 | 2.715 秒 |
| 缓存后的再次进入 | 1.409 秒 | 0.355 秒 |
| 后续人物就绪并进入下一帧 | 70 ms | 27 ms |
| 截图人物解码内存 | 6,291,456 B | 3,538,944 B |
| 冷启动脚本传输（第一轮） | 829,856 B / 21 个请求 | 132,388 B / 1 个请求 |
| CSS 传输 | 90,599 B | 13,328 B |

首次就绪时间减少约 66%，再次进入减少约 75%，当前人物解码内存减少 43.75%。这套像素策略会按设备/窗口选择不同版本，手机并非始终固定读取最低分辨率。

**公网单独验收**：同等限速、三轮中位数为首显 4.752 秒、再次进入 1.165 秒、后续人物 28 ms；公网 HTML/TLS/隧道响应时间与本机不同，因此不把它混入上表的成对对比。用户实际速度仍取决于网络和缓存。

完整三轮记录：`output/redrain-performance-v2/v1-baseline-benchmark.json`、`v2-optimized-benchmark.json`、`v2-public-benchmark.json`。

## 资源与验证

218 张审核图新增 436 个响应式副本，原 PNG 和原尺寸 WebP 保留。所有透明副本的 alpha 与各自尺寸的重采样参考一致，316 个含透明通道的新副本已逐像素验证。原 PNG SHA256 未改变。

- 40 项针对性测试通过：预加载、像素预算、剧情存档、压缩协商、缓存、缺图及条件/分段请求。
- `npm run build` 通过。
- 浏览器确认 WebP 失败回退正确角色 PNG，延迟回包不能覆盖新发言者，手机选择/反应立绘/刷新读档正确。
- DPR 2 手机横竖屏及大窗口验证尺寸升级，原发言者与阅读内容保持一致。
- 内嵌游戏恢复、保存确认、退出、重载与桌面/手机版面检查通过；零 JavaScript 错误。
- 公网确认 `Content-Encoding: br`、`Vary: Accept-Encoding`、一年缓存及健康接口。

## 再构建与发布

```bash
python3 scripts/build-redrain-responsive-art.py --skip-benchmark
node scripts/build-redrain-delivery.mjs --game-dir output/redrain-performance-v2/staging
node --import tsx --test tests/redrain-state.test.ts tests/redrain-art-preload.test.ts tests/redrain-art-resolution.test.ts tests/redrain-static.test.ts
node scripts/benchmark-redrain-delivery.mjs https://zhihu.hegelsalon.com/games/redrain v2-public
node scripts/verify-redrain-art-v2-behavior.mjs http://127.0.0.1:18080/games/redrain
```

游戏源模块保留在 `public/games/redrain/src`；页面通过生成的 `build/game.<hash>.js` 运行。修改源模块后必须重新构建游戏交付包，然后先发布新源模块、带哈希的产物及其 `.br`/`.gz` 文件，最后更新入口 HTML。普通主站 `npm run build` 不替代这一步。

当前发布入口及校验数据见 `output/redrain-performance-v2/deployment.json` 和共享游戏目录 `build/delivery-manifest.json`。运行时只补充了当前 `releases/oauth-20260914/server/redrain-static.ts`；保留同期 OAuth 功能。

本次文件备份在 `shared/backups/redrain-performance-v2-20260914/`。回滚时恢复该备份内的游戏源文件和入口 HTML、缓存中间件；新增 hash 资源可保留。操作服务目录前重新读取 systemd 的 WorkingDirectory，避免覆盖另一项发布。
