# OAuth 收藏接入新故事工作台

在「新故事工作台 → 我的知乎收藏」查看已登录知乎账号的近期收藏和公开收藏夹，选择回答或文章摘要后，可以直接生成故事或仅保存素材。收藏夹内容支持分页；近期收藏和收藏夹列表遵循平台接口的范围限制，不承诺显示完整历史或私密收藏。

每条素材保留平台提供的摘要、作者和原文链接，来源标记为「知乎收藏摘要」。生成器与阅读页都明确说明这不是完整原作，新增角色、剧情和结局属于 AI 改编。摘要不足 80 个有效字符时，可以带入摘要和链接后补充正文。

服务端使用 runtime.json 中的 ZHIHU_ACCESS_SECRET 鉴权平台调用方，同时通过当前登录会话的 X-OAuth-Token 指定用户。访客只需完成自己的 OAuth 授权，不需要填写 Access Secret。未授权、账号变化或授权失效时停止读取，不回退到调用方账号。收藏浏览缓存不持久化；只有用户选择的素材进入其改编项目。

接口：

- GET /api/workshop/favorites/recent
- GET /api/workshop/favorites/lists
- GET /api/workshop/favorites/lists/:id/items
- POST /api/workshop/favorites/import

发布目录以 systemd 的 WorkingDirectory 为准；本次从 liukan-session-20260914 的线上基线构建 favorites-20260914，保留持久 OAuth 会话及开篇视频。40-favorites-release.conf 指向新目录；撤除该配置并重启即可回到上一发布，已有项目素材继续保留在共享存储。

验证：生产构建、46 项收藏/OAuth/账号隔离测试和正式构建的 10 个浏览器场景通过；新 Access Secret 的一次平台调用返回 HTTP 200 / Code 0。本机和公网均已确认加载收藏功能资源、OAuth 配置可用，并拒绝未登录的收藏读取和导入。浏览器中的收藏响应为受控测试数据，尚未通过真人 OAuth 浏览器会话验收真实收藏。记录位于 output/favorites-integration/production-build/browser-report.json、live-verification.json 和 deployment.json。更广的回归检查中，4 个既有快写测试因 fixture 与当前校验/提示不一致失败，见 output/favorites-integration/regression-check.txt。
