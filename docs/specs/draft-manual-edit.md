# 稿件手动编辑 — AI 实现规格（不可偏离）

> 跨对话锚点：实现进度见 `task.md` →「稿件手动编辑」。

## 克隆模板（禁止从零发明）

| 层 | 模板 |
|----|------|
| 后端 Service | `article-job-rewrite.service.ts` → `article-job-draft-edit.service.ts` |
| 后端 DTO | `dto/rewrite-article-job.dto.ts` |
| 后端 Controller | rewrite / accept / discard 三个端点 |
| 纯函数测试 | `scripts/ymyl-detect.util.test.mjs` |
| 前端 API | `triggerArticleRewrite` in `article-job.ts` |
| 前端表单 | `ArticleJobRewriteDrawer.vue` |

## API

```
PATCH /api/v1/projects/:projectId/article-jobs/:id/draft
GET   /api/v1/projects/:projectId/article-jobs/:id/draft/history
POST  /api/v1/projects/:projectId/article-jobs/:id/draft/rollback
POST  /api/v1/projects/:projectId/article-jobs/:id/draft/resolve-stale
```

## draftData 扩展（JSON，不改 Prisma 表）

- `contentVersion: number` — 乐观锁，每次保存 +1
- `staleness: DraftStaleness | null` — 当前失效状态
- `manualEditHistory: ManualEditHistoryEntry[]` — 最多 20 条

## 保存后失效规则

| 变更 | localSeo | semrush | paraphrase | ymyl | export | internalLinks | images |
|------|----------|---------|------------|------|--------|---------------|--------|
| 仅 title/meta | ✓ | ✗ | ✗ | ✓ | ✓ | ✗ | ✗ |
| content 任意变化 | ✓ | ✓ | ✓ | ✓ | ✓ | 大改✓/小改警告 | 大改✓/小改警告 |

- COMPLETED + ymyl approved → 编辑后 `humanReviewStatus` 重置 `pending`
- export stale → `outputUrl = null`
- **不**二次触发 `article.completed`

## 互斥（assertEditable）

- `rewritePending` 进行中（未 stale）
- `rewriteCandidate` 未处理
- `semrush.pending` 进行中（未 stale）
- `contentVersion` 不一致 → `DRAFT_VERSION_CONFLICT`

## 可编辑 status 白名单

`DRAFTING | LINKING | ILLUSTRATING | OPTIMIZING | REVIEWING | COMPLETED | FAILED`（须有 content）

## postSaveAction

- `none` — 仅保存 + 失效标记
- `refresh_local` — 保存后调 `refreshLocalSeoScore`
- `rerun_from_optimizing` — 保存后调 `triggerSemrushCheck`

## 禁止

- 富文本编辑使用 `@vueup/vue-quill`（存库仍为 Markdown，经 `draft-content.ts` 转换）
- 改 Prisma schema
- 顺手重构 rewrite/workflow
- `any` / `@ts-ignore`

## 切片交付顺序

1. **A** — PATCH + stale + 前端 textarea 编辑 ✅
2. **B** — postSave `refresh_local` ✅
3. **C** — YMYL 重置 + approve 拦截 + export stale UI ✅
4. **D** — history + rollback ✅
5. **E** — Semrush 重跑 + Banner ✅
6. **F** — E2E `e2e/draft-edit.test.mjs` ✅

## P0 UX（已实现）

- **发布清单** — `ArticleJobDraftPublishChecklist`：详情顶栏 + 稿件 Tab，逐项重算 SEO / Semrush / 导出 / YMYL
- **智能保存默认** — `ArticleJobDraftSaveDialog`：`suggestPostSaveAction` 按变更类型预选 postSaveAction；YMYL 已通过时保存警告
- **编辑入口** — 「稿件正文」Tab 内「预览 | 编辑」分段切换；审核队列 `?tab=draft&edit=1` 直达编辑模式
- **编辑体验** — Quill 所见即所得编辑器（对齐 Semrush 文章编辑）；保存时自动转回 Markdown 存库
- **回滚确认** — `ArticleJobDraftRollbackDialog`：展示变更摘要后再 rollback
- **列表 stale 标签** — `JobListView` 显示 `draftEditStatusLabel`
