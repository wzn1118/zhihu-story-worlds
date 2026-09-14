# 赤页 / RED LEAF

从真实知乎故事进入分支文字冒险。当前开发方向以悬疑与科幻为主。

## 运行

环境：Node.js 22 或更新版本，以及 Git LFS。

```powershell
git lfs install
git clone https://github.com/wzn1118/zhihu-story-worlds.git
cd zhihu-story-worlds
git lfs pull
```

仓库包含 `public/generated-art/`、`public/assets/`、`public/games/` 和
`public/intro/` 中的美术、游戏与演示资源，资源体积约 8.75 GiB。
图片、音频和包含内嵌图片的大型文档通过 Git LFS 保存原始内容。
请使用上述命令完整克隆；仅下载源码 ZIP 可能得到 LFS 指针文件。
账号、浏览器登录状态、密钥和个人工坊数据保留在本机 `.local/`，不随仓库发布。

```powershell
npm install
npm run dev
```

服务仅绑定本机。最终端口以启动日志为准；请在克隆后的项目根目录运行。

```powershell
npm run build
npm run start
```

公网模式需要先配置会话密钥。首次部署建议使用外部 HTTPS 反向代理，并为每个实例固定 `SESSION_SECRET`：

```powershell
$env:PUBLIC_MODE="1"
$env:HOST="0.0.0.0"
$env:SESSION_SECRET="随机生成的长字符串"
npm run start -- --production
```

账号数据默认写入 `.local/auth/users.json`，该目录不应提交到 Git；生产环境应挂载持久化磁盘并定期备份。

## 故事数据

本项目使用安装包内的知乎黑客松故事 API。官方 CLI 当前没有故事子命令；
项目本地的 `node scripts/story-cli.mjs --help` 提供文档所述内容能力的命令行入口。
故事接口不要求凭据，前端无需密钥。

```powershell
node scripts/story-cli.mjs list --genre 科幻 --limit 3
node scripts/story-cli.mjs list --genre 悬疑 --query 蓝血
node scripts/story-cli.mjs get 2025684191967294692
```

列表支持题材、标题/简介/作者关键词与数量筛选，保留真实来源、作者、获取时间及
缓存状态。Windows 也可使用 `npm.cmd run stories -- list --genre 科幻`，避免部分
PowerShell 的 `npm.ps1` 转发参数时丢失双横线选项。

已选的首批改编作品：

| 原作 | 作者 | 世界 |
| --- | --- | --- |
| 蓝血 | 桃花先生 | `blue-blood` |
| 李冬原著：同时被两个精神病追杀 | 写小说的秃头老张 | `double-pursuit` |
| 史密斯装穷夫妇 | 年年 | `velvet-alibi` |
| 末世我靠钞能力躺赢 | 苏青瓷 | `future-island` |

接口提供的是节选。所有分支与结局均标明游戏改编，保留原作作者和真实来源。
当前书库 20 篇均已接入原作节选和可玩的改编。行动结果显示实际资源得失与新线索，
推理会给出判断反馈；工具栏可重选上一步，手记的剧情回看可返回更早的选择。
回溯会更新自动进度，保留手动存档和已收集结局。

## 开发资料

- `docs/art-direction.md`：用户完整美术约束。
- `docs/installation.md`：本次 Skill 和 CLI 安装验收。
- `docs/development-plan.md`：至少 24 小时推进计划与验收。
- `progress.md`：持续更新的进展与接续信息。
- `content/CONTRACT.md`：故事、剧情图与 Ink 引擎契约。
- `docs/choice-outcomes-and-rewind.md`：最新行动反馈、回溯和分支承接验收。

## 验证

```powershell
npm test
npm run build
```

浏览器截图和运行证据保存在 `output/`，不包含密钥。
美术交付目录包括 `public/assets/` 和 `public/generated-art/`；私有恢复文件与凭据不进入仓库。

## 当前边界

这是仍在推进的本地工程。活动专用内容接口的未来可用性取决于知乎；服务显示
实时来源或缓存时间，并在失败时返回真实错误。OpenQI 使用已有独立私有配置，
游戏服务不导入或暴露该凭据。

人物使用硬边面部阴影，环境沿用哥特动画方向。当前美术绑定与透明人物资源以
`public/generated-art/production-manifest.json` 和
`public/generated-art/character-cutouts.json` 为准；仓库保留现有原图及派生资源。
本次发布的验证状态见 `docs/github-publication.md`。
