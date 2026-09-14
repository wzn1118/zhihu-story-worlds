# GitHub 首次发布（2026-09-14）

仓库：https://github.com/wzn1118/zhihu-story-worlds

源码、故事内容、公开美术目录、游戏资源、脚本和测试均纳入版本控制。
PNG、JPEG、WebP、GIF、音频和大型内嵌图片文档使用 Git LFS。
资源目录明细及 SHA-256 见 `docs/public-assets-manifest.json`。

不包含本机依赖、编译输出、缓存、账号库、浏览器会话、密钥、个人工坊数据和临时文件。
仓库中的项目内容是发布时工作区快照，不表示所有美术已经审核或所有测试已经通过。

完整测试：1,139 项，1,125 通过，14 失败，0 跳过。
测试状态来自首次发布准备阶段的 `npm test` 完整执行。
发布过程中修复了 `server/auth.ts` 的 Express 请求头类型兼容问题。
修复后 `npm run build` 通过（TypeScript 检查及 Vite 生产构建）。
部分开发验证脚本需要本机生产记录或外部服务；请按 README 克隆资源并安装依赖后运行。
