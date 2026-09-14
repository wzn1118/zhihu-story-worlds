# 刘看山网页宠物 / 2026-09-12

当前组件为 `src/LiuKanShanPet.tsx`，样式独立在 `src/LiuKanShanPet.css`，避免覆盖现有游戏 CSS；`src/liukan-shan.ts` 提供可测试的位置钳制与面板布局计算。

已收到并解压用户提供的 `C:/Users/10847/Downloads/刘看山动态.zip`、`C:/Users/10847/Downloads/看山三视图.zip`，只读取图片，不执行压缩包内容。原始素材保存在 `output/liukan/user-assets`，文件 SHA-256 清单在该目录 manifest；实际使用的透明 GIF 与减弱动态用 PNG 在 `public/assets/liukan`，该目录 manifest 标明用户提供的来源。

已目视原始三视图、待机及电脑动画中间帧：白色北极狐、黑鼻、黑色四肢与三视图一致。当前宠物直接使用用户透明动画，没有生成替代角色。待机显示 idle，展开显示 greeting，请求直答中显示 computer。提供触摸/鼠标拖动、键盘箭头移动、Enter/Space 开合、Esc 收起；拖动位置和开合状态写入独立 localStorage key。面板位置会随视口重新钳制，减弱动态时显示用户动画的首帧 PNG。

与父线程接线契约：`<LiuKanShanPet progress={LiukanProgressRequest | undefined} worldTitle={string | undefined} isEnding={boolean} reducedMotion={boolean} />`。组件访问 `/api/liukan/memories`、`POST /api/liukan/remember`、`POST /api/liukan/chat`；传递服务器所需的实际路径与阅读位置，显示真实接口错误，发送中禁用重复提交，切换游戏会中止旧请求并清空旧对话。只有达到结局时发送 remember。

目前验证：三个位置/边界/存储命名空间单元测试通过，整仓 `tsc --noEmit` 已通过。父线程负责真实直答、游戏路径、桌面/手机浏览器整体验收。

## 拖入知乎回答与书袋 / 2026-09-12 续接

宠物增加“一起读”和“关卡回忆”两个页签，头部显示服务端保存的篇数与已到达的结局数。`src/liukan-drop.ts` 只从两种专用 MIME 中解析候选 ID 或原网页 post/frame ID；正文、标题等拖入字段全部忽略。原网页对象先由 `/api/zhihu-browser/capture` 核验并取得候选，再通过 `POST /api/liukan/inbox` 保存。触摸入口监听 `redleaf:feed-post`，detail `{candidateId}`；鼠标实际拖放走同一保存函数，并有目标高亮。

已存回答从 `GET /api/liukan/inbox` 恢复，正文按原样保留在阅读面板；原文问答与当前后端对齐为 `/api/liukan/inbox/:id/chat`。每篇回答的问答独立，切换篇目中止旧回答请求。界面称保存和阅读，不声称模型参数训练。

“制作游戏”按钮是唯一生成触发点，通过 `POST /api/liukan/inbox/:id/generate` 返回真实 WorkshopProject，再轮询当前项目进度；重复点击受请求锁限制。失败显示真实返回错误，已有项目保留关联，提供继续制作按钮。新增 `onProject(project)`、`onReadPost(post)` 供父线程接线，不修改 App。

6 项宠物/拖放回归通过；拖放边界覆盖候选、原网页帧、触摸、外来 MIME、畸形 JSON、无效 ID 与超长负载。父线程负责统一真实网页、真实鼠标拖放及服务器完整验收。
