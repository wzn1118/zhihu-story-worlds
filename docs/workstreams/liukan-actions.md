# 刘看山动作目录

2026-09-12：动作目录、播放器和动作展台已完成；动作验收线程接管后修复了播放结束的重复回调，并完成独立组件浏览器验证，根线程负责整体宠物与引导验收。

## 接口

- `src/liukan-actions.ts`：`LIUKAN_ACTIONS` 含 56 个具名动作，7 组各 8 个；`LiukanActionId` 为 ID 联合类型。
- `performLiukanAction(action, target = 'pet')`：派发 `liukan:action`，消息为 `{ action, target }`；接收端校验 ID。
- `LiuKanShanAvatar`：`action?: LiukanActionId`、`eventTarget?: string`、`size?: number`、`reducedMotion?: boolean`、`playKey?: string | number`、`onComplete?: (action: LiukanActionId) => void`、`className?: string`、`label?: string`、`showAccent?: boolean`。
- 现有宠物接入建议：把原头像替换为 `<LiuKanShanAvatar action={busy ? 'make-game' : open ? 'hello' : 'listen'} eventTarget="pet" size={100} />`。
- `LiukanActionGallery`：`onClose?: () => void`、`onAction?: (action: LiukanActionId) => void`、`reducedMotion?: boolean`；嵌入式动作展台，不打开页面或标签。

来源为用户提供的 6 份透明 GIF 与对应静态 PNG，新增的是各自独立的位置、倾斜、缩放与节奏编排；不宣称存在 56 份独立绘制的 GIF。动作持续 1.4 至 4.2 秒，播放完返回初始位置；减少动态效果时使用 PNG 并停用编排。

同一个动作可通过再次派发事件或改变 `playKey` 重播；新的动作会中止旧的动作，只有完成的那次播放回调。事件动作结束后保留该动作的静态图，不会自动再播放默认动作。操作系统减少动态效果或传入 `reducedMotion` 都会停用编排和 GIF；关闭减少动态效果时不会重播已完成的动作。组件卸载会清理事件监听、动画和完成定时器。

展台中的“静止观看”切换到静态 PNG，“播放动作”从头播放；按钮没有声称能够暂停 GIF 后原位续播。

## 验证

- `node --import tsx --test tests/liukan-actions.test.ts`：5/5 通过，覆盖 56 个独立编排、7 组各 8 个、位移/倾斜/缩放幅度、有限持续时间、回到原位、事件 ID/目的地验证、6 个 GIF 哈希和 320×320 PNG。
- 对用户原始 `C:/Users/10847/Downloads/刘看山动态.zip` 直接读取 GIF 字节进行 SHA-256 比对：6/6 公共素材与压缩包内原文件完全一致；压缩包共 12 个不同 GIF。该检查没有修改原始压缩包或公共素材。
- `node --import tsx scripts/verify-liukan-actions.ts`：独立 Chromium 真实组件页面 11/11 检查通过，逐个触发 56 个动作并验证 GIF 解码 320×320、浏览器动画运行；覆盖同一事件连续重播、受控 `playKey`、结束回调仅一次、非法事件、目标隔离、卸载清理、减少动态效果、搜索筛选、展台发送到宠物、390px 布局和播放按钮。
- 动作模块、组件、测试和浏览器脚本的独立 TypeScript 检查通过；同期全仓 TypeScript 被 API 线程正在编辑的 `server/liukan/answer.ts:20` 语法错误暂时阻断，动作线程未修改它。
- 实际截图已检查：`output/playwright/liukan-actions/desktop.png`（1440×1000）和 `mobile.png`（390×844 视口的整页截图）；目录无横向溢出，原版宠物正确显示。手机截图的测试宠物位于右下方，最终应用需由根线程验收其可拖动位置和遮挡关系。
- 机器可读证据：`output/playwright/liukan-actions/report.json` 与原始压缩包比对 `provenance.json`。这是独立动作组件验收，未将它计作整体游戏生成、真实知乎页面或模型问答验收；没有启动、重启共享服务或打开用户标签页。
