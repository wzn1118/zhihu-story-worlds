# 赤页 / RED LEAF

从真实知乎故事进入分支文字冒险。当前开发方向以悬疑与科幻为主。

## 运行

环境：Node.js 22 或更新版本。

```powershell
npm install
npm run dev
```

服务仅绑定本机。最终端口以启动日志为准；工作目录为 `E:\知乎`。

```powershell
npm run build
npm run start
```

公网版使用知乎 OAuth 登录。部署前需要配置 App ID、App Key，
并将公网 HTTPS 回调登记到知乎平台。完整配置和验收状态见 [OAuth 接入说明](docs/oauth-setup.md)。
现有部署由 `deploy/start.mjs` 从私有运行配置注入凭据；凭据不进入源码或前端构建。
基础登录不需要 Access Secret；搜索和授权用户创作、关注、收藏等附加功能才需要它。

首次部署使用外部 HTTPS 反向代理，并为每个实例固定 `SESSION_SECRET`：

```powershell
$env:PUBLIC_MODE="1"
$env:HOST="0.0.0.0"
$env:SESSION_SECRET="随机生成的长字符串"
npm run start -- --production
```

本地邮箱账号数据默认写入 `.local/auth/users.json`。公网模式不接受邮箱密码或旧本地会话；
知乎授权保存在服务端内存，退出、过期或重启后需要重新登录。工作台内容应使用持久化磁盘并定期备份。

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
生成图的公开交付目录是 `public/assets/`；私有恢复文件与签名链接不进入该目录。

## 当前边界

这是仍在推进的本地工程。活动专用内容接口的未来可用性取决于知乎；服务显示
实时来源或缓存时间，并在失败时返回真实错误。OpenQI 使用已有独立私有配置，
游戏服务不导入或暴露该凭据。

人物当前按用户最新两张角色参考及更强的面部硬边阴影制作，环境沿用哥特动画
参考。已接入《蓝血》开场的方诺主表情、反应表情和独立背景；其余场景与人物
尚未完成。当前资产记录见 `docs/art/current-delivery.json`。OpenQI 的后续张薇
请求返回余额不足（HTTP 402），没有产出新图，生成暂时等待额度恢复。
