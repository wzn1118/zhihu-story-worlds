# 刘看山阅读手记 V2 UI

## 本次交付

- 阅读能力拆成两组：`读懂故事` 与 `动笔改编`。六项新增能力（接着问看山、设计几个选择、把结局写完整、安排场景节奏、整理制作提纲、让这段更好读）与原有十项共用后端能力清单；桌面显示分组导航，手机使用两列可读按钮，不再堆成一面细小按钮。
- `接着问看山` 要求明确问题；继续阅读从已保存手记带入 `parentNoteId`，服务端重新核对父手记和当前原文，客户端不发送父手记正文。切换来源会解除父手记关系，避免跨故事串联。
- 已完成手记会显示续读关系、上一页标题、用户问题，以及“继续聊这一页”入口。父手记只是讨论背景，证据引用仍来自本页保存的原文。Markdown 导出同步保留问题与父手记编号。
- 父手记缺失、过期、来源变更或达到四层深度时，界面显示可理解的错误，并提供从原文独立开始的按钮；没有伪造续读结果。
- 保留原有焦点陷阱、Escape 返回来源预览、移动端切换、结果自动滚动、原文预览和下载能力。

## 验证

- `node --import tsx --test tests/liukan-reading-view.test.ts`：3/3 通过，覆盖独立请求指纹、续读 Markdown 与过期来源标记。
- `npm exec tsc -- --noEmit`：通过。
- 一次并行 `npm run build` 遇到其他工作线程正在写入 `src/workshop-input.ts` 的瞬时截断（esbuild 报 `rawOffse` 文件末尾）；该文件随后读取完整，本 UI 文件未产生构建错误。请根集成窗口重新执行一次构建。

## 文件

- `src/LiukanReadingDesk.tsx`
- `src/LiukanReadingDesk.css`
- `src/liukan-reading-view.ts`
- `tests/liukan-reading-view.test.ts`

没有重启服务、调用模型、提交付费美术请求或修改 authored worlds/art-service 文件。
