# 刘看山活动记录台

## 交付

新增 `src/LiukanActivityDesk.tsx` 与 `src/LiukanActivityDesk.css`，由根组件通过 `onProject`、`onClose` 接入。弹层包含两本记录：

- **制作中的故事**：读取 `/api/workshop/projects`，支持标题/编号搜索和状态筛选。每张卡把文字可玩状态、实际校验计数、错误原因、美术 `approved/total/status` 分开显示。美术未齐时不会显示“已完成插图”。运行中的项目每 8 秒轮询，隐藏或卸载即停止。
- **走过的关卡**：只有传入 `playerId` 才读取 `/api/liukan/memories?playerId=...`；没有玩家 ID 时显示“还没有当前玩家记录”，不会请求所有玩家。搜索会覆盖结局标题、真实场景文本和真实选择；展开后只展示保存的场景，支持浏览器 Blob 导出 Markdown。

可选的 `onReadPost` 仅在需要书袋链接时读取 `/api/liukan/inbox`，没有隐藏生成、模型请求或美术请求。组件使用 inert/focus trap/Escape、桌面双栏与移动分栏视图，并与刘看山现有蓝白手记风格保持一致。

## 纯函数与测试

`src/liukan-activity-view.ts` 集中处理状态标签、真实回忆搜索和 Markdown 导出；`tests/liukan-activity.test.ts` 覆盖文字/美术状态分离、真实场景搜索和选择保留。组件不改服务端数据。

## 未包含

根组件仍负责入口按钮、当前玩家 ID、故事跳转和浏览器验收。本组件不负责启动生成、不提交图片、不制造回忆，也不改变原有游戏保存流程。
