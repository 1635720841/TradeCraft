# 项目当前状态

> AI 跨对话必读：以本文件 + 仓库代码为准，不凭记忆。  
> 任务勾选见 `task.md`；架构细则见 `.cursor/skills/seo-saas-platform/`。

## 阶段

**Phase 4 进行中 — 产品壳 + 企业配额 + 关键词池 + QuillBot 润色已接入**

## 已完成

### 平台与基建

- [x] Monorepo（pnpm workspace）+ `packages/`（shared-core、platform-sdk、provider-interfaces）
- [x] NestJS API + Prisma + Core（guards、exceptions、logger、redis、queue、storage、**按 org 限流**）
- [x] Prisma migration 历史已与 schema 对齐（`20260614120000_sync_quota_prompt_keyword_cms`，共 8 条）
- [x] 对象存储：`S3_BUCKET` 配置后走 S3/MinIO，否则 `.data/exports` 本地 fallback
- [x] E2E 冒烟：`e2e/article-job-smoke.test.mjs` + **`e2e/draft-edit.test.mjs`**（编辑 / stale / 回滚）
- [x] 开发种子 `pnpm db:seed`；单元测试 **85** 项（`pnpm test`）；E2E `pnpm test:e2e`
- [x] Auth：自建 JWT 登录/刷新 + **Logto OIDC 回调**（可选）+ `AuthGuard` + `@ReqCtx()` + RBAC（ADMIN / MEMBER）
- [x] 项目 CRUD（org 隔离）+ 前端真实登录 / 401 跳转 / 项目创建
- [x] 计费：`article.completed` 事件 → CreditUsage + 用量 API + 前端 `/platform/billing`
- [x] **BILL-005** 配额：`Organization.monthlyArticleQuota` + `BillingService.assertArticleQuota()`（创建/批量任务前）
- [x] 组织管理：`modules/organization/` + 前端 `/platform/organization`（套餐名、月配额、成员 CRUD，ADMIN）
- [x] M12 Prompt：DB + Redis 1h + CRUD + 前端 `/platform/prompts`（ADMIN）

### seo-factory 引擎（M1–M12 编排）

- [x] Serper + Redis 24h 缓存 → Brief + 初稿（Prompt 外置 / DB 热更新）；**竞品页面正文**写入 `serpData.organic[].scraped`
- [x] M6 Semrush：RPA + **Playwright 专用队列** + **浏览器池复用** + 本地预检循环 + AI 优化（门槛 **9.0**）
- [x] M8 内链：`SitePage` 页面库 + sitemap 同步 + `linking` 步骤
- [x] M9 配图：BFL Provider + `images` 步骤
- [x] **QuillBot 润色**：工作流 `paraphrasing` 步骤 + `modules/paraphrase/` + Prompt `seo_quillbot_v1`；`QUILLBOT_DISABLED=true` 可跳过
- [x] YMYL：`content-review` + `ymyl` 步骤 + 前端警告 + **待审核队列** `/reviews`
- [x] M10 导出：HTML / JSON-LD 本地存储 + API 下载 + **zip 资产包**（HTML + images/ + meta.txt）
- [x] article-job：202 入队、批量创建、失败续跑、手动 Semrush、AI 改写、**稿件手动编辑**
- [x] 站点：CRUD + 页面库 sync/list（供内链）

### 产品壳（前端）

- [x] 工作台：`SeoFactoryLayout` + Tab 壳（概览 / 文章任务 / 关键词池 / 站点 / 待审核）
- [x] `SiteManageView` 站点 CRUD + 页面库
- [x] `KeywordPoolView` 关键词池（CRUD、导入、优先级、AI 种子、Semrush 指标回填、一键建任务、**批量入队**）
- [x] `ReviewQueueView` YMYL 人工审核
- [x] `OrganizationSettingsView` 企业设置

### WordPress CMS（刻意延后产品化）

- [x] **后端**：`Site.cmsType` / `cmsConfig`、`CmsPublishService`、`POST .../publish`
- [ ] **前端 UI**：已通过 `WORDPRESS_CMS_UI_ENABLED = false` 隐藏（站点 WordPress 配置、任务详情「推送到 WordPress」）
- 启用方式：改 `apps/platform/web/src/constants/feature-flags.ts` 为 `true`

## 未实现 / 进行中

| 项 | 说明 |
|----|------|
| WordPress 产品 UI | 后端就绪，前端 feature flag 关闭（**刻意延后**） |

## 工作流现状（代码真实顺序）

```
SERP → Brief → 初稿 → 内链 → 配图 → Semrush 优化 → QuillBot 润色 → YMYL → 导出 → COMPLETED → 计费入账
```

| 步骤 | workflow key | 状态 |
|------|--------------|------|
| M1–M3 SERP | `serp` | ✅ |
| M4 Brief | `brief` | ✅ |
| M5 初稿 | `draft` | ✅ |
| M8 内链 | `linking` | ✅ |
| M9 配图 | `images` | ✅ |
| M6 Semrush | `optimizing` | ✅（≥9.0） |
| QuillBot | `paraphrasing` | ✅（可 env 跳过） |
| YMYL | `ymyl` | ✅ |
| M10 导出 | export 模块 | ✅（本地 + 单文件下载 + zip 资产包） |
| M11 计费 | `article.completed` | ✅ |
| M12 Prompt | DB 热更新 | ✅ |
| **稿件手动编辑** | PATCH draft + stale + history + rollback | ✅ |

编排常量：`project-types/seo-factory/constants/workflow-resume.ts`

## 稿件手动编辑（M 扩展）

| 能力 | 说明 |
|------|------|
| API | `PATCH .../draft`、`GET .../draft/history`、`POST .../draft/rollback`、`POST .../draft/resolve-stale` |
| 可编辑字段 | 标题、Meta Description、正文 Markdown（**分屏实时预览**） |
| 乐观锁 | `draftData.contentVersion`，冲突 → 409 `DRAFT_VERSION_CONFLICT` |
| 失效联动 | 保存后按 staleness 矩阵清空 SEO 分 / outputUrl / 重置 YMYL pending |
| postSave | `none` \| `refresh_local`（默认）\| `rerun_from_optimizing` |
| 前端入口 | 任务详情「初稿预览」预览/编辑；YMYL 队列「编辑后再审」 |
| 规格 | [`docs/specs/draft-manual-edit.md`](specs/draft-manual-edit.md) |
| 后端 | `article-job-draft-edit.service.ts`、`draft-edit.util.ts` |
| 测试 | `pnpm test:draft-edit`；E2E `e2e/draft-edit.test.mjs` |

## 关键路径

| 能力 | 位置 |
|------|------|
| 开发任务清单 | `task.md` |
| 工作流编排 | `project-types/seo-factory/modules/workflow/` |
| QuillBot 润色 | `project-types/seo-factory/modules/paraphrase/` |
| 关键词池 | `project-types/seo-factory/modules/keyword-pool/` |
| 组织/配额 | `modules/organization/`、`modules/billing/` |
| WordPress 发布（API） | `project-types/seo-factory/modules/export/cms-publish.service.ts` |
| 前端功能开关 | `apps/platform/web/src/constants/feature-flags.ts` |
| 工作台路由 | `apps/platform/web/src/router/modules/remaining.ts` |
| 单元测试 | `apps/platform/api/scripts/*.test.mjs`（含 `draft-edit.util.test.mjs`） |
| 稿件手动编辑 | `project-types/seo-factory/modules/article-job/article-job-draft-edit.service.ts` |
| E2E | `apps/platform/api/e2e/` |
| Prisma migrations | `apps/platform/api/prisma/migrations/`（`pnpm db:deploy`） |
| 对象存储 | `core/storage/`（`S3_BUCKET` → S3，否则本地） |

## 本地验证

```bash
pnpm docker:up
pnpm db:deploy   # 生产/空库；开发见 docs/SETUP.md 漂移修复
pnpm db:seed
pnpm dev:api
pnpm dev:web

# 单元测试
cd apps/platform/api && pnpm test

# 前端类型检查
cd apps/platform/web && pnpm exec vue-tsc --noEmit

# E2E 冒烟（需 API + Postgres + Redis + seed）
pnpm test:e2e
```

## 开发账号（seed）

| 角色 | 邮箱 | 密码 |
|------|------|------|
| ADMIN | admin@dev.local | admin123 |
| MEMBER | member@dev.local | member123 |

## 本地环境

安装与启动详见 **[docs/SETUP.md](SETUP.md)**。  
基础设施：Docker PostgreSQL 16（5432）+ Redis 7（6379）。

## 文档维护约定

| 事件 | 动作 |
|------|------|
| 完成功能 | 更新本文件 + `task.md` 对应 `[x]` |
| 暂缓/隐藏功能 | 在本文件「未实现」写明原因与开关位置 |
| 工作流变更 | 同步 `workflow-resume.ts` 与本节表格 |
| 架构决策 | 可选 `docs/adr/ADR-NNN-标题.md` |

*最后更新：2026-06-14*
