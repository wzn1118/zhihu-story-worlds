# Workshop relay checks

本次检查只覆盖工作台中转站配置与 HTTP 传输契约，没有发起付费文本或生图请求。

`tests/workshop-relay.test.ts` 使用临时 `WORKSHOP_CONFIG_PATH`，因此不会读取或改写项目现有中转站配置。配置测试覆盖：

- `setRelayConfig()` 的原子持久化和清除；
- `useEnvironment` 对 `OPENAI_BASE_URL`、`OPENAI_API_KEY`、`OPENAI_MODEL` 的解析；
- Responses 协议和推理强度的公开状态；
- 公开 DTO 不包含 `apiKey`。

HTTP 测试使用本地一次性 mock server，不连接外部服务。它检查 `requestRelay()`：

- 请求路径为 `/responses`，携带 `Bearer` 认证和结构化 JSON schema；
- 分片 SSE 在 JSON 边界和网络 chunk 边界拆开时仍能合并成完整 JSON；
- provider 的流式错误被收敛为安全错误文本；只保留白名单内的错误 code、分类、状态码、事件计数和字符数，绝不持久化上游 message、URL、请求头或完整响应。

验证结果：

```text
node --import tsx --test tests/workshop-relay.test.ts tests/story-workshop.test.ts
37/37 passed
node node_modules/typescript/bin/tsc --noEmit
blocked by unrelated scripts/art-production-unknown-audit-20260912.ts:49,50 (three implicit-any diagnostics)
```

这组测试只证明中转站配置、请求格式、SSE 解析和错误边界；它不代表真实中转站或图片服务已成功生成内容，也不替代前端真实端到端运行记录。
