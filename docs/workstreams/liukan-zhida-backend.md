# 刘看山直答与关卡回忆后端

## 进度

2026-09-12：新增 `shared/liukan.ts`、`server/liukan/zhida.ts`、`server/liukan/memory.ts`、`server/liukan/router.ts`。`LiukanZhidaService.recall()` 先用现有游戏引擎从起点重放客户端提交的 `nodeId/choiceId`，核对故事 ID、世界 ID、版本、难度和当前阅读段落，只把已访问章节、已见线索和当前资源送入知乎官方 CLI 的 `answer` 命令。路径不一致或选择当时不可用时直接失败；当前章节尚未阅读的段落不进入请求。`remember()` 必须通过同一条重放验证并到达结局，才将结局和最近 12 个已验证场景片段原子写入 `.local/liukan-memory/<player>.json`，去重并限制最近 50 条。

## 挂载契约

```ts
app.use('/api/liukan', createLiukanRouter((storyId, worldVersion) => loadWorld(storyId, worldVersion)));
// POST /api/liukan/chat
{ storyId, worldId, worldVersion, difficulty, question, history, currentParagraphIndex, conversation, playerId, requestId }
// POST /api/liukan/remember: same progress fields, no question or client ending title
// GET /api/liukan/memories?playerId=...
```

`loadWorld(storyId, worldVersion?)` 应调用与游戏相同的世界读取路径。导入故事传项目 ID 及版本，原有书库传真实 storyId；worldId 单独核对，不能把作者作品 slug 当 API storyId。router 自带 `LiukanError` 的 400/409/429/502/503/504 JSON 映射，挂在全局 JSON parser 与本机 Origin guard 后。服务不会读取或打印凭据。直答使用本机已认证 `ZhihuCLI`，模型默认为 `zhida-fast-1p5`，单次问题上限 1000 字、请求最多 8 轮对话，实际 prompt 裁为最近 6 轮。相同 requestId 的同时请求合并，已返回结果保留 5 分钟；全局最多 2 个直答请求在途。失败不会自动重发。

## 边界

这条线没有伪造回答或把未访问节点拼进 prompt。真实直答调用需要本机 CLI 认证和剩余额度；测试使用注入 answerer，只验证路径重放、上下文裁剪和记忆持久化，不计为真实回答。模型仍可能出现推测或措辞偏差，所以客户端应保留“知乎直答”来源标记与本地验证过的回忆卡片。

## 实际验收

- `tests/liukan-zhida.test.ts`：7 个聚焦测试通过，包含未访问场景隔离、无效选择拒绝、到达结局才记忆、并发去重、reasoning 字段不外露、不完整响应拒绝、当前未读段落与资源耗尽选项排除，以及实际 HTTP router 的错误状态和成功返回契约。
- `scripts/verify-liukan-zhida.ts`：在现有真实样例 `import-6febc2f6-3a12-41ac-bae5-6d05ebc68c10` 的 r1 世界中实际重放“接上电池，先把韩穗救出来”，调用官方知乎直答成功，模型 `zhida-fast-1p5`，接口阶段耗时 4184 ms，返回了与两个已访问章节吻合的中文回忆。
- 证据 `output/liukan/real-zhida.json` 保存来源、模型、真实回答、经过验证的节点、选择与时间，不包含凭据。该调用由后端实际发起，前端完整点击验收由 root 负责。
